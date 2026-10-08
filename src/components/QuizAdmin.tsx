import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ClipboardEvent,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Clock3,
  Copy,
  Eye,
  FileText,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { subjects, getSubject } from "@/lib/subjects";
import {
  quizApi,
  quizHref,
  newQuiz,
  newQuestion,
  uploadQuizFile,
  type Quiz,
  type Question,
  type QuestionType,
  type QuizSummary,
  type Attempt,
} from "@/lib/quizzes";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import QuizFile from "./QuizFile";
import QuizQuestions from "./QuizQuestions";
import QuizResultView from "./QuizResultView";
import QuizImageInput from "./QuizImageInput";
import QuizPointsInput from "./QuizPointsInput";
import QuizManualGrader from "./QuizManualGrader";
import QuizScheduleInfo from "./QuizScheduleInfo";
import QuizShareLink from "./QuizShareLink";
import QuizAdminCatalog, {
  defaultQuizCatalogFilters,
} from "./QuizAdminCatalog";
import { scheduleInputValue, scheduleTimestamp } from "@/lib/quiz-schedule";
import { clipboardImage, prepareQuizImage } from "@/lib/quiz-images";
import {
  fixedQuizForms,
  getFixedQuizForm,
  fixedQuizFormQuestions,
  prepareFixedQuizForm,
  hasQuestionContent,
  customQuizQuestions,
  restoreCustomQuizDraft,
  type FixedQuizFormId,
} from "@/lib/quiz-forms";
type ImagePurpose = "question" | "explanation" | "choice" | "statement";

const types: [QuestionType, string][] = [
  ["single", "Chọn A/B/C/D"],
  ["truefalse", "Đúng / Sai (4 ý)"],
  ["short", "Trả lời ngắn"],
  ["essay", "Tự luận"],
];
const statusLabels = {
  draft: "Bản nháp",
  published: "Đã xuất bản",
  hidden: "Đã ẩn",
};
export default function QuizAdmin({ uid }: { uid: string }) {
  const cacheKey = `phq-quiz-editor:${uid}`;
  const [quiz, setQuiz] = useState<Quiz>(() => {
    try {
      const q = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
      if (
        q &&
        Array.isArray(q.questions) &&
        (q.questions.length ||
          (q.gradingMode === "manual" && q.mode === "document"))
      ) {
        delete q.accessCode;
        delete q.requiresAccessCode;
        return restoreCustomQuizDraft(q);
      }
    } catch {
      /* new draft */
    }
    return newQuiz();
  });
  const [view, setView] = useState<"edit" | "list" | "results">("edit");
  const [list, setList] = useState<QuizSummary[]>([]);
  const [catalogFilters, setCatalogFilters] = useState({
    ...defaultQuizCatalogFilters,
  });
  const [busy, setBusy] = useState(false);
  const actionInProgress = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [resultQuiz, setResultQuiz] = useState<QuizSummary | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [selected, setSelected] = useState<Attempt | null>(null);
  const [addType, setAddType] = useState<QuestionType>("single");
  useEffect(() => {
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(quiz));
    } catch {
      /* storage unavailable */
    }
  }, [quiz, cacheKey]);
  function update(patch: Partial<Quiz>) {
    setQuiz((q) => ({ ...q, ...patch }));
    setMessage("");
  }
  function updateQuestion(id: string, patch: Partial<Question>) {
    setQuiz((q) => {
      const form =
        q.gradingMode === "manual" ? undefined : getFixedQuizForm(q.fixedForm);
      const rules = form ? fixedQuizFormQuestions(form) : [];
      return {
        ...q,
        questions: q.questions.map((item, index) =>
          item.id === id ? { ...item, ...patch, ...rules[index] } : item,
        ),
      };
    });
    setMessage("");
  }
  async function run(action: () => Promise<void>) {
    if (actionInProgress.current) return;
    actionInProgress.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Thao tác chưa hoàn tất.");
    } finally {
      actionInProgress.current = false;
      setBusy(false);
    }
  }
  async function loadList() {
    await run(async () => {
      const data = await quizApi<{ quizzes: QuizSummary[] }>("listAdmin");
      setList(data.quizzes);
      setView("list");
    });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const status =
      ((event.nativeEvent as SubmitEvent).submitter?.getAttribute(
        "data-status",
      ) as Quiz["status"]) || "draft";
    await run(async () => {
      const data = await quizApi<{ quiz: QuizSummary }>("save", {
        id: quiz.id,
        revision: quiz.revision,
        quiz: { ...quiz, status },
      });
      setQuiz((q) => ({
        ...q,
        id: data.quiz.id,
        revision: data.quiz.revision,
        status: data.quiz.status,
      }));
      setMessage(
        status === "published"
          ? "Đã xuất bản! Sao chép liên kết gửi học sinh bên dưới để các em mở thẳng đề này."
          : "Đã lưu bản nháp lên máy chủ.",
      );
    });
  }
  async function upload(
    file: File | undefined,
    questionId?: string,
    purpose: ImagePurpose = "question",
    partIndex = 0,
  ) {
    if (!file) return;
    const selectedFile = file;
    await run(async () => {
      const ready = questionId
        ? await prepareQuizImage(selectedFile)
        : selectedFile;
      const saved = await uploadQuizFile(ready);
      setQuiz((current) =>
        questionId
          ? {
              ...current,
              questions: current.questions.map((item) => {
                if (item.id !== questionId) return item;
                if (purpose === "choice" || purpose === "statement") {
                  const field =
                    purpose === "choice"
                      ? "choiceImageIds"
                      : "statementImageIds";
                  return {
                    ...item,
                    [field]: Array.from({ length: 4 }, (_, i) =>
                      i === partIndex ? saved.id : item[field]?.[i] || "",
                    ),
                  };
                }
                return purpose === "explanation"
                  ? { ...item, explanationImageId: saved.id }
                  : { ...item, imageId: saved.id };
              }),
            }
          : { ...current, documentIds: [...current.documentIds, saved.id] },
      );
      setMessage(
        questionId
          ? `Đã gắn ảnh ${purpose === "explanation" ? "đáp án / lời giải" : purpose === "choice" ? `lựa chọn ${"ABCD"[partIndex]}` : purpose === "statement" ? `ý ${"abcd"[partIndex]}` : "câu hỏi"}. Hãy lưu nháp hoặc xuất bản để lưu vào đề.`
          : `Đã tải ${saved.name}. Hãy lưu đề để gắn tệp vào bài tập.`,
      );
    });
  }
  function pasteImage(
    event: ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>,
    questionId: string,
    purpose: ImagePurpose,
    partIndex = 0,
  ) {
    const file = clipboardImage(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    void upload(file, questionId, purpose, partIndex);
  }
  async function openResults(item: QuizSummary) {
    await run(async () => {
      const data = await quizApi<{ attempts: Attempt[] }>("results", {
        id: item.id,
      });
      setResultQuiz(item);
      setAttempts(data.attempts);
      setSelected(null);
      setView("results");
    });
  }
  async function deleteQuiz(item: QuizSummary) {
    if (
      !window.confirm(
        `Xóa vĩnh viễn đề “${item.title}”?\n\nĐề, toàn bộ lượt làm và kết quả học sinh của đề này sẽ bị xóa. Các lượt đang làm cũng sẽ kết thúc. Thao tác không thể hoàn tác.`,
      )
    )
      return;
    await run(async () => {
      await quizApi("deleteQuiz", { id: item.id, revision: item.revision });
      setList((items) => items.filter((q) => q.id !== item.id));
      if (quiz.id === item.id) setQuiz(newQuiz());
      if (resultQuiz?.id === item.id) {
        setResultQuiz(null);
        setAttempts([]);
        setSelected(null);
      }
      setView("list");
      setMessage("Đã xóa vĩnh viễn đề và các lượt làm của đề này.");
    });
  }
  async function allowRetake(attempt: Attempt) {
    if (!resultQuiz) return;
    const name = attempt.displayName || attempt.username || "tài khoản này";
    if (
      !window.confirm(
        `Cho phép ${name} làm lại đề này?\n\nLượt cũ, đáp án, điểm và ảnh bài nộp sẽ được xóa. Lượt mới bắt đầu với đáp án trống khi học sinh bấm “Bắt đầu làm bài”, theo thời gian làm bài và lịch mở / đóng đề hiện tại.`,
      )
    )
      return;
    const quizId = resultQuiz.id;
    await run(async () => {
      await quizApi("allowRetake", { id: attempt.id });
      const data = await quizApi<{ attempts: Attempt[] }>("results", {
        id: quizId,
      });
      setAttempts(data.attempts);
      setSelected(null);
      setMessage(
        `Đã xóa lượt cũ và cho phép ${name} làm lại. Học sinh tải lại trang đề rồi bấm “Bắt đầu làm bài”.`,
      );
    });
  }
  const subject = getSubject(quiz.subject);
  const manual = quiz.gradingMode === "manual";
  const fixedForm = manual ? undefined : getFixedQuizForm(quiz.fixedForm);
  const availableTypes = types.filter(([type]) =>
    manual ? type === "essay" : type !== "essay",
  );
  function changeFormat(gradingMode: "auto" | "manual", mode: Quiz["mode"]) {
    if (
      gradingMode === "manual" &&
      mode === "document" &&
      quiz.questions.length &&
      !window.confirm(
        "Đề tự luận dạng tệp chỉ có phần nộp bài chung. Bỏ danh sách câu đang soạn để chuyển sang dạng này?",
      )
    )
      return;
    update({
      gradingMode,
      fixedForm: gradingMode === "auto" ? quiz.fixedForm || "" : "",
      mode,
      questions:
        gradingMode === "manual" && mode === "document"
          ? []
          : (quiz.questions.length
              ? quiz.questions
              : [
                  newQuestion(
                    gradingMode === "manual" ? "essay" : "single",
                    mode === "document",
                  ),
                ]
            ).map((q) =>
              gradingMode === "manual"
                ? { ...q, type: "essay" }
                : q.type === "essay"
                  ? {
                      ...newQuestion("single", mode === "document"),
                      id: q.id,
                      prompt: q.prompt,
                      imageId: q.imageId,
                      points: q.points,
                    }
                  : q,
            ),
    });
    setAddType(gradingMode === "manual" ? "essay" : "single");
  }
  function changeFixedForm(id: FixedQuizFormId | "") {
    if (!id) {
      update({
        fixedForm: "",
        questions: fixedForm ? customQuizQuestions(quiz) : quiz.questions,
      });
      return;
    }
    const next = prepareFixedQuizForm(quiz, id);
    const discarded = next.discarded.filter((question) =>
      hasQuestionContent(question, quiz.mode === "document"),
    );
    if (
      discarded.length &&
      !window.confirm(
        `Form đã chọn không có chỗ cho ${discarded.length} câu đang có nội dung. Bỏ những câu vượt cấu trúc để áp dụng form này?`,
      )
    )
      return;
    update({ fixedForm: id, questions: next.questions });
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Quản lý bài tập</h2>
          <p className="mt-1 text-sm text-slate-600">
            Tạo đề trắc nghiệm hoặc tự luận, chấm tự động và chấm thủ công.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="account-button-secondary"
            disabled={busy}
            onClick={() => {
              setView("edit");
              setError("");
            }}
          >
            Đang soạn
          </button>
          <button
            type="button"
            className="account-button-secondary"
            disabled={busy}
            onClick={() => void loadList()}
          >
            <FileText className="size-4" />
            Danh sách đề
          </button>
          <button
            type="button"
            className="account-button"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "Tạo đề mới? Hãy lưu đề đang soạn trước khi tiếp tục.",
                )
              ) {
                setQuiz(newQuiz());
                setView("edit");
                setError("");
                setMessage("");
              }
            }}
          >
            <Plus className="size-4" />
            Tạo đề mới
          </button>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          {message}
        </p>
      )}
      {view === "edit" && (
        <form onSubmit={save} className="space-y-6">
          <fieldset disabled={busy} className="space-y-6">
            {quiz.id && quiz.status === "published" && (
              <QuizShareLink
                quiz={{ id: quiz.id, subject: quiz.subject, title: quiz.title }}
                disabled={busy}
              />
            )}
            <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold">1. Thông tin đề</h3>
                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-900">
                  {quiz.id ? statusLabels[quiz.status] : "Đề mới"}
                </span>
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <label className="account-label sm:col-span-2">
                  Tên bài tập / đề thi
                  <input
                    className="account-input"
                    value={quiz.title}
                    onChange={(e) => update({ title: e.target.value })}
                    placeholder="Ví dụ: Ôn tập hàm số — Toán 12"
                    maxLength={160}
                    required
                  />
                </label>
                <label className="account-label">
                  Môn học
                  <select
                    className="account-input"
                    value={quiz.subject}
                    onChange={(e) => {
                      const item = getSubject(e.target.value);
                      update({
                        subject: item.id,
                        category: item.categories[0],
                      });
                    }}
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="account-label">
                  Danh mục
                  <select
                    className="account-input"
                    value={quiz.category}
                    onChange={(e) => update({ category: e.target.value })}
                  >
                    {subject.categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="account-label">
                  <span className="flex items-center gap-2">
                    <Clock3 className="size-4" />
                    Thời gian làm bài (phút)
                  </span>
                  <input
                    type="number"
                    className="account-input"
                    min={1}
                    max={360}
                    step={1}
                    value={quiz.durationMinutes}
                    onChange={(e) =>
                      update({ durationMinutes: Number(e.target.value) })
                    }
                    required
                  />
                </label>
                <label className="account-label">
                  Loại bài tập
                  <select
                    className="account-input"
                    value={quiz.gradingMode || "auto"}
                    disabled={busy}
                    onChange={(e) =>
                      changeFormat(
                        e.target.value as "auto" | "manual",
                        quiz.mode,
                      )
                    }
                  >
                    <option value="auto">Trắc nghiệm · Chấm tự động</option>
                    <option value="manual">
                      Tự luận · Gia sư chấm thủ công
                    </option>
                  </select>
                </label>
                <label className="account-label">
                  Cách đưa đề lên
                  <select
                    className="account-input"
                    value={quiz.mode}
                    onChange={(e) =>
                      changeFormat(
                        quiz.gradingMode || "auto",
                        e.target.value as Quiz["mode"],
                      )
                    }
                  >
                    <option value="inline">
                      {manual
                        ? "Dán ảnh / soạn từng câu tự luận"
                        : "Soạn từng câu trực tiếp"}
                    </option>
                    <option value="document">
                      {manual
                        ? "Tệp đề PDF / Word / ảnh · Nộp bài chung"
                        : "PDF / Word / ảnh + phiếu trả lời"}
                    </option>
                  </select>
                </label>
                {!manual && (
                  <label className="account-label min-w-0">
                    Form đề cố định
                    <select
                      className="account-input min-w-0"
                      aria-label="Form đề cố định"
                      value={quiz.fixedForm || ""}
                      onChange={(event) =>
                        changeFixedForm(
                          event.target.value as FixedQuizFormId | "",
                        )
                      }
                    >
                      <option value="">
                        Tự thiết kế · Tùy chỉnh số câu và điểm
                      </option>
                      {fixedQuizForms.map((form) => (
                        <option key={form.id} value={form.id}>
                          {form.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {fixedForm && (
                  <div className="min-w-0 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 sm:col-span-2">
                    <p className="font-semibold">
                      Cấu trúc cố định · Tổng 10 điểm
                    </p>
                    <ul className="mt-2 space-y-1">
                      {fixedForm.sections.map((section) => (
                        <li key={section.type}>
                          {section.count} câu{" "}
                          {section.label.toLocaleLowerCase("vi")} ×{" "}
                          {section.points.toLocaleString("vi-VN")} điểm
                        </li>
                      ))}
                    </ul>
                    {fixedForm.sections.some(
                      (section) => section.scoring === "exam",
                    ) && (
                      <p className="mt-2">
                        Đúng 1/2/3/4 ý: 0,1 / 0,25 / 0,5 / 1 điểm mỗi câu
                        Đúng/Sai.
                      </p>
                    )}
                    <p className="mt-2 text-xs leading-relaxed">
                      Số câu, dạng câu và điểm đã khóa theo form. Bạn soạn nội
                      dung, đáp án và lời giải; có thể đổi vị trí trong cùng
                      dạng câu. Chọn “Tự thiết kế” để tùy chỉnh lại.
                    </p>
                  </div>
                )}
                <label className="account-label sm:col-span-2">
                  Hướng dẫn làm bài
                  <textarea
                    className="account-input min-h-24 resize-y"
                    maxLength={5000}
                    value={quiz.instructions}
                    onChange={(e) => update({ instructions: e.target.value })}
                    placeholder="Những lưu ý dành cho học sinh trước khi bắt đầu…"
                  />
                </label>
              </div>
              <div className="mt-5 rounded-xl border border-slate-200 p-4">
                <h4 className="mb-3 text-sm font-semibold">
                  Giới hạn giờ mở / đóng đề (tùy chọn)
                </h4>
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <label className="account-label min-w-0">
                    Giờ mở đề (tùy chọn)
                    <input
                      className="account-input min-w-0"
                      type="datetime-local"
                      max="9999-12-31T23:59"
                      step={60}
                      aria-label="Giờ mở đề (tùy chọn)"
                      value={scheduleInputValue(quiz.opensAt)}
                      onChange={(e) =>
                        update({ opensAt: scheduleTimestamp(e.target.value) })
                      }
                    />
                  </label>
                  <label className="account-label min-w-0">
                    Giờ đóng đề (tùy chọn)
                    <input
                      className="account-input min-w-0"
                      type="datetime-local"
                      max="9999-12-31T23:59"
                      step={60}
                      aria-label="Giờ đóng đề (tùy chọn)"
                      value={scheduleInputValue(quiz.closesAt)}
                      onChange={(e) =>
                        update({ closesAt: scheduleTimestamp(e.target.value) })
                      }
                    />
                  </label>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  Giờ Việt Nam (UTC+7). Để trống cả hai ô để không giới hạn
                  lịch. Có thể chỉ đặt giờ mở hoặc giờ đóng. Lượt làm kết thúc
                  khi hết thời gian riêng hoặc đến giờ đóng, tùy mốc nào sớm
                  hơn. Sửa lịch chỉ áp dụng cho lượt bắt đầu sau khi lưu.
                </p>
                {(quiz.opensAt || quiz.closesAt) && (
                  <button
                    type="button"
                    className="account-button-secondary mt-3 text-xs"
                    onClick={() => update({ opensAt: null, closesAt: null })}
                  >
                    Bỏ giới hạn giờ
                  </button>
                )}
              </div>
              {!manual && (
                <label className="mt-5 flex items-start gap-3 text-sm">
                  <input
                    className="mt-0.5 size-4 accent-blue-700"
                    type="checkbox"
                    checked={quiz.revealAnswers}
                    onChange={(e) =>
                      update({ revealAnswers: e.target.checked })
                    }
                  />
                  <span>
                    Hiện đáp án và lời giải ngay sau khi nộp
                    <p className="mt-1 text-xs text-slate-500">
                      Bỏ chọn để học sinh chỉ thấy điểm và câu trả lời của mình.
                    </p>
                  </span>
                </label>
              )}
              {manual && (
                <p className="mt-5 text-sm text-slate-600">
                  Học sinh nộp ảnh bài làm và có thể nhập lời giải. Bạn nhập
                  điểm thang 10 và nhận xét tại “Kết quả học sinh”.
                </p>
              )}
              <p className="mt-5 text-xs leading-relaxed text-slate-600">
                Bản này giao đề cho tất cả tài khoản đang hoạt động. Mỗi tài
                khoản có một lượt ban đầu cho mỗi đề; bạn có thể cấp lượt làm
                lại tại “Kết quả học sinh”. Đồng hồ bắt đầu khi bấm “Bắt đầu làm
                bài”. Tải lại trang vẫn giữ thời hạn. Lượt quản trị được ghi
                riêng là “Làm thử”.
              </p>
            </section>
            {quiz.mode === "document" && (
              <section className="rounded-2xl border border-slate-200 p-4 sm:p-6">
                <h3 className="mb-2 font-semibold">
                  2. Tệp đề PDF / Word / ảnh
                </h3>
                <p className="mb-4 text-sm text-slate-600">
                  Tải tối đa 8 tệp, mỗi tệp dưới 1,8 MB (PDF, Word .doc/.docx,
                  PNG, JPG, WebP).
                  {manual
                    ? "Học sinh nộp bài chung cho cả đề; không cần khai báo từng câu trả lời."
                    : "Bên dưới, khai báo các câu theo đúng thứ tự trong tệp."}
                </p>
                <label className="account-label">
                  Chọn tệp đề
                  <input
                    type="file"
                    className="account-input"
                    accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,image/png,image/jpeg,image/webp"
                    disabled={busy || quiz.documentIds.length >= 8}
                    onChange={(e) => {
                      void upload(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <div className="mt-4 space-y-3">
                  {quiz.documentIds.map((id, i) => (
                    <div
                      key={id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
                    >
                      <span className="text-sm">
                        Tệp đề {i + 1} · Đã tải lên
                      </span>
                      <button
                        type="button"
                        className="account-button-secondary text-xs"
                        onClick={() =>
                          update({
                            documentIds: quiz.documentIds.filter(
                              (x) => x !== id,
                            ),
                          })
                        }
                      >
                        <Trash2 className="size-4" />
                        Bỏ tệp khỏi đề
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {!(manual && quiz.mode === "document") && (
              <section>
                <div className="mb-4 flex flex-wrap justify-between gap-3">
                  <h3 className="font-semibold">
                    {quiz.mode === "document" ? "3" : "2"}.{" "}
                    {manual ? "Câu hỏi tự luận" : "Câu hỏi và đáp án"} (
                    {quiz.questions.length})
                  </h3>
                  {!manual && (
                    <span className="text-xs text-slate-600">
                      {fixedForm ? "Tổng điểm: " : "Tổng trọng số: "}
                      {quiz.questions.reduce(
                        (n, q) => n + (q.points || 0),
                        0,
                      )}{" "}
                      {fixedForm ? "· Form cố định" : "· Quy đổi về 10 điểm"}
                    </span>
                  )}
                </div>
                <p className="mb-4 text-sm text-slate-600">
                  {manual ? (
                    "Dán ảnh câu hỏi bằng Ctrl + V vào vùng “Ảnh câu hỏi” hoặc nhập nội dung. Học sinh có vùng trả lời và tải ảnh bài làm riêng cho từng câu."
                  ) : (
                    <>
                      Chụp cả câu hỏi và các lựa chọn rồi dán bằng Ctrl + V vào
                      vùng “Ảnh câu hỏi”. Không cần gõ lại phần đã có trong ảnh.
                      Chọn đáp án đúng bên dưới để chấm tự động; ảnh đáp án /
                      lời giải dùng để học sinh xem sau khi nộp.{" "}
                      {fixedForm
                        ? "Điểm từng câu đã cố định theo form được chọn."
                        : "Điểm là trọng số của mỗi câu."}
                    </>
                  )}
                </p>
                <div className="space-y-5">
                  {quiz.questions.map((q, index) => (
                    <article
                      key={q.id}
                      className="rounded-2xl border border-slate-200 p-4 sm:p-6"
                    >
                      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                        <h4 className="font-semibold">Câu {index + 1}</h4>
                        <div className="flex gap-1">
                          {([-1, 1] as const).map((step) => (
                            <button
                              key={step}
                              type="button"
                              title={
                                step === -1 ? "Chuyển lên" : "Chuyển xuống"
                              }
                              aria-label={`${step === -1 ? "Chuyển lên" : "Chuyển xuống"} câu ${index + 1}`}
                              disabled={
                                busy ||
                                index + step < 0 ||
                                index + step >= quiz.questions.length ||
                                Boolean(
                                  fixedForm &&
                                  quiz.questions[index + step]?.type !== q.type,
                                )
                              }
                              className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30"
                              onClick={() => {
                                const arr = [...quiz.questions];
                                [arr[index], arr[index + step]] = [
                                  arr[index + step],
                                  arr[index],
                                ];
                                update({ questions: arr });
                              }}
                            >
                              {step === -1 ? (
                                <ArrowUp className="size-4" />
                              ) : (
                                <ArrowDown className="size-4" />
                              )}
                            </button>
                          ))}
                          <button
                            type="button"
                            aria-label={`Nhân bản câu ${index + 1}`}
                            disabled={
                              busy ||
                              Boolean(fixedForm) ||
                              quiz.questions.length >= 100
                            }
                            className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30"
                            onClick={() => {
                              const arr = [...quiz.questions];
                              arr.splice(index + 1, 0, {
                                ...structuredClone(q),
                                id: crypto.randomUUID(),
                              });
                              update({ questions: arr });
                            }}
                          >
                            <Copy className="size-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Xóa câu ${index + 1}`}
                            disabled={
                              busy ||
                              Boolean(fixedForm) ||
                              quiz.questions.length <= 1
                            }
                            className="rounded-lg p-2 text-red-700 hover:bg-red-50 disabled:opacity-30"
                            onClick={() => {
                              if (window.confirm(`Xóa câu ${index + 1}?`))
                                update({
                                  questions: quiz.questions.filter(
                                    (item) => item.id !== q.id,
                                  ),
                                });
                            }}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
                        <label className="account-label">
                          Dạng câu hỏi
                          <select
                            className="account-input"
                            value={q.type}
                            disabled={Boolean(fixedForm)}
                            onChange={(e) => {
                              const next = newQuestion(
                                e.target.value as QuestionType,
                                quiz.mode === "document",
                              );
                              updateQuestion(q.id, {
                                ...next,
                                id: q.id,
                                prompt: q.prompt,
                                imageId: q.imageId,
                                explanation: q.explanation,
                                explanationImageId: q.explanationImageId,
                                points: q.points,
                              });
                            }}
                          >
                            {availableTypes.map(([t, label]) => (
                              <option value={t} key={t}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {!manual && (
                          <label className="account-label">
                            {fixedForm ? "Điểm cố định" : "Điểm trọng số"}
                            <QuizPointsInput
                              value={q.points}
                              readOnly={Boolean(fixedForm)}
                              ariaLabel={`${fixedForm ? "Điểm cố định" : "Điểm trọng số"} câu ${index + 1}`}
                              onChange={(points) =>
                                updateQuestion(q.id, {
                                  points,
                                })
                              }
                            />
                          </label>
                        )}
                      </div>
                      <label className="account-label mt-4">
                        {quiz.mode === "document"
                          ? "Nội dung / ghi chú câu (tùy chọn)"
                          : "Nội dung câu hỏi"}
                        <textarea
                          className="account-input min-h-24 resize-y"
                          required={quiz.mode === "inline" && !q.imageId}
                          maxLength={5000}
                          value={q.prompt}
                          onChange={(e) =>
                            updateQuestion(q.id, { prompt: e.target.value })
                          }
                          onPaste={(event) =>
                            pasteImage(event, q.id, "question")
                          }
                          placeholder={
                            quiz.mode === "document"
                              ? "Có thể để trống khi đề đã có trong PDF/ảnh"
                              : "Gõ nội dung hoặc Ctrl + V để dán ảnh câu hỏi; có ảnh thì không cần gõ lại…"
                          }
                        />
                      </label>
                      <QuizImageInput
                        label="Ảnh câu hỏi"
                        imageId={q.imageId}
                        disabled={busy}
                        onUpload={(file) => upload(file, q.id)}
                        onRemove={() => updateQuestion(q.id, { imageId: "" })}
                      />
                      {q.type === "single" && (
                        <div className="mt-5 space-y-3">
                          <p className="text-sm font-semibold">
                            Các lựa chọn — tích đáp án đúng
                          </p>
                          {q.choices?.map((choice, i) => (
                            <div
                              key={i}
                              className="min-w-0 rounded-xl border border-slate-200 p-3"
                            >
                              <label className="flex items-center gap-3">
                                <input
                                  type="radio"
                                  name={`correct-${q.id}`}
                                  aria-label={`Đáp án đúng ${"ABCD"[i]} câu ${index + 1}`}
                                  className="size-4 shrink-0 accent-blue-700"
                                  checked={q.answer === "ABCD"[i]}
                                  onChange={() =>
                                    updateQuestion(q.id, { answer: "ABCD"[i] })
                                  }
                                />
                                <span className="text-sm font-semibold">
                                  {"ABCD"[i]}.
                                </span>
                                <input
                                  aria-label={`Lựa chọn ${"ABCD"[i]} câu ${index + 1}`}
                                  className="account-input"
                                  required={
                                    quiz.mode === "inline" &&
                                    !q.imageId &&
                                    !q.choiceImageIds?.[i]
                                  }
                                  maxLength={2000}
                                  value={choice}
                                  placeholder={`Nội dung lựa chọn ${"ABCD"[i]}`}
                                  onPaste={(event) =>
                                    pasteImage(event, q.id, "choice", i)
                                  }
                                  onChange={(e) =>
                                    updateQuestion(q.id, {
                                      choices: q.choices?.map((v, j) =>
                                        i === j ? e.target.value : v,
                                      ),
                                    })
                                  }
                                />
                              </label>
                              <QuizImageInput
                                label={`Ảnh lựa chọn ${"ABCD"[i]} · Câu ${index + 1}`}
                                imageId={q.choiceImageIds?.[i]}
                                disabled={busy}
                                compact
                                onUpload={(file) =>
                                  upload(file, q.id, "choice", i)
                                }
                                onRemove={() =>
                                  updateQuestion(q.id, {
                                    choiceImageIds: Array.from(
                                      { length: 4 },
                                      (_, j) =>
                                        i === j
                                          ? ""
                                          : q.choiceImageIds?.[j] || "",
                                    ),
                                  })
                                }
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      {q.type === "truefalse" && (
                        <div className="mt-5 space-y-4">
                          <p className="text-sm font-semibold">
                            Bốn ý và đáp án
                          </p>
                          {q.statements?.map((s, i) => (
                            <div
                              key={i}
                              className="min-w-0 rounded-xl border border-slate-200 p-3"
                            >
                              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px]">
                                <label className="account-label">
                                  Ý {"abcd"[i]}
                                  <input
                                    className="account-input"
                                    required={
                                      quiz.mode === "inline" &&
                                      !q.imageId &&
                                      !q.statementImageIds?.[i]
                                    }
                                    maxLength={2000}
                                    value={s}
                                    onPaste={(event) =>
                                      pasteImage(event, q.id, "statement", i)
                                    }
                                    onChange={(e) =>
                                      updateQuestion(q.id, {
                                        statements: q.statements?.map((v, j) =>
                                          i === j ? e.target.value : v,
                                        ),
                                      })
                                    }
                                  />
                                </label>
                                <label className="account-label">
                                  Đáp án
                                  <select
                                    className="account-input"
                                    value={String((q.answer as boolean[])[i])}
                                    onChange={(e) =>
                                      updateQuestion(q.id, {
                                        answer: (q.answer as boolean[]).map(
                                          (v, j) =>
                                            i === j
                                              ? e.target.value === "true"
                                              : v,
                                        ),
                                      })
                                    }
                                  >
                                    <option value="true">Đúng</option>
                                    <option value="false">Sai</option>
                                  </select>
                                </label>
                              </div>
                              <QuizImageInput
                                label={`Ảnh ý ${"abcd"[i]} · Câu ${index + 1}`}
                                imageId={q.statementImageIds?.[i]}
                                disabled={busy}
                                compact
                                onUpload={(file) =>
                                  upload(file, q.id, "statement", i)
                                }
                                onRemove={() =>
                                  updateQuestion(q.id, {
                                    statementImageIds: Array.from(
                                      { length: 4 },
                                      (_, j) =>
                                        i === j
                                          ? ""
                                          : q.statementImageIds?.[j] || "",
                                    ),
                                  })
                                }
                              />
                            </div>
                          ))}
                          <label className="account-label">
                            Cách tính điểm Đúng/Sai
                            <select
                              className="account-input"
                              value={q.scoring}
                              disabled={Boolean(fixedForm)}
                              onChange={(e) =>
                                updateQuestion(q.id, {
                                  scoring: e.target
                                    .value as Question["scoring"],
                                })
                              }
                            >
                              <option value="equal">
                                Chia đều: mỗi ý đúng được 25% điểm câu
                              </option>
                              <option value="exam">
                                Đúng 1/2/3/4 ý → 10% / 25% / 50% / 100% điểm câu
                              </option>
                            </select>
                          </label>
                        </div>
                      )}
                      {q.type === "short" && (
                        <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
                          <label className="account-label">
                            Đáp án được chấp nhận (mỗi dòng một đáp án)
                            <textarea
                              className="account-input min-h-24"
                              required
                              value={q.acceptedAnswers?.join("\n")}
                              onChange={(e) =>
                                updateQuestion(q.id, {
                                  acceptedAnswers: e.target.value.split("\n"),
                                })
                              }
                              placeholder="0,5"
                            />
                            <span className="text-xs font-normal text-slate-500">
                              Tự nhận diện 0,5 = 0.5 = 1/2. Tối đa 10 đáp án.
                            </span>
                          </label>
                          <label className="account-label">
                            Sai số số học
                            <input
                              className="account-input"
                              type="number"
                              min={0}
                              max={100}
                              step="any"
                              value={q.tolerance}
                              onChange={(e) =>
                                updateQuestion(q.id, {
                                  tolerance: Number(e.target.value),
                                })
                              }
                            />
                            <span className="text-xs font-normal text-slate-500">
                              0 = khớp chính xác
                            </span>
                          </label>
                        </div>
                      )}
                      <label className="account-label mt-5">
                        Lời giải (tùy chọn)
                        <textarea
                          className="account-input min-h-20"
                          maxLength={5000}
                          value={q.explanation || ""}
                          onChange={(e) =>
                            updateQuestion(q.id, {
                              explanation: e.target.value,
                            })
                          }
                          onPaste={(event) =>
                            pasteImage(event, q.id, "explanation")
                          }
                          placeholder="Gõ lời giải hoặc Ctrl + V để dán ảnh đáp án / lời giải…"
                        />
                      </label>
                      <QuizImageInput
                        label="Ảnh đáp án / lời giải"
                        imageId={q.explanationImageId}
                        disabled={busy}
                        onUpload={(file) => upload(file, q.id, "explanation")}
                        onRemove={() =>
                          updateQuestion(q.id, { explanationImageId: "" })
                        }
                      />
                    </article>
                  ))}
                </div>
                {!fixedForm && (
                  <div className="mt-5 flex flex-wrap gap-3">
                    <select
                      aria-label="Dạng câu cần thêm"
                      className="account-input w-full sm:w-auto"
                      value={
                        manual
                          ? "essay"
                          : addType === "essay"
                            ? "single"
                            : addType
                      }
                      onChange={(e) =>
                        setAddType(e.target.value as QuestionType)
                      }
                    >
                      {availableTypes.map(([type, label]) => (
                        <option key={type} value={type}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="account-button-secondary"
                      disabled={busy || quiz.questions.length >= 100}
                      onClick={() =>
                        update({
                          questions: [
                            ...quiz.questions,
                            newQuestion(
                              manual
                                ? "essay"
                                : addType === "essay"
                                  ? "single"
                                  : addType,
                              quiz.mode === "document",
                            ),
                          ],
                        })
                      }
                    >
                      <Plus className="size-4" />
                      Thêm câu hỏi
                    </button>
                  </div>
                )}
              </section>
            )}
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <p className="mb-4 text-xs text-blue-900">
                Nội dung đang soạn được giữ trong tab này. “Lưu nháp” lưu lên
                máy chủ; “Xuất bản” đưa bài vào kho học sinh. Khi sửa đề, lượt
                làm đã bắt đầu giữ nguyên phiên bản cũ.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="account-button-secondary"
                  onClick={() => setPreview(true)}
                >
                  <Eye className="size-4" />
                  Xem trước
                </button>
                <button
                  type="submit"
                  data-status="draft"
                  className="account-button-secondary"
                >
                  <Save className="size-4" />
                  Lưu nháp
                </button>
                <button
                  type="submit"
                  data-status="published"
                  className="account-button"
                >
                  {busy ? "Đang lưu…" : "Xuất bản đề"}
                </button>
                {quiz.id && quiz.status === "published" && (
                  <a
                    className="account-button-secondary"
                    href={quizHref({ id: quiz.id, subject: quiz.subject })}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Mở bài để làm thử ↗
                  </a>
                )}
              </div>
            </div>
          </fieldset>
        </form>
      )}
      {view === "list" && (
        <QuizAdminCatalog
          quizzes={list}
          filters={catalogFilters}
          onFiltersChange={setCatalogFilters}
          busy={busy}
          renderQuiz={(item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-slate-200 p-5"
            >
              <div className="flex flex-wrap justify-between gap-3">
                <div className="min-w-0">
                  <h6 className="break-words font-semibold">{item.title}</h6>
                  <p className="mt-2 text-sm text-slate-500">
                    {getSubject(item.subject).label} · {item.category} ·{" "}
                    {item.gradingMode === "manual" && item.questionCount === 0
                      ? "Tự luận · Tệp đề"
                      : `${item.questionCount} câu`}{" "}
                    · {item.durationMinutes} phút
                  </p>
                  <QuizScheduleInfo
                    quiz={item}
                    className="mt-2 text-slate-500"
                  />
                </div>
                <span
                  className={`h-fit rounded-full px-3 py-1 text-xs ${item.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
                >
                  {statusLabels[item.status]}
                </span>
              </div>
              {item.status === "published" && (
                <QuizShareLink quiz={item} disabled={busy} />
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  disabled={busy}
                  className="account-button-secondary text-xs"
                  onClick={() =>
                    void run(async () => {
                      const data = await quizApi<{ quiz: Quiz }>(
                        "adminDetail",
                        { id: item.id },
                      );
                      setQuiz(data.quiz);
                      setView("edit");
                    })
                  }
                >
                  Chỉnh sửa
                </button>
                <button
                  disabled={busy}
                  className="account-button-secondary text-xs"
                  onClick={() => void openResults(item)}
                >
                  Kết quả học sinh
                </button>
                {item.status === "published" && (
                  <>
                    <a
                      href={quizHref(item)}
                      target="_blank"
                      rel="noreferrer"
                      className="account-button-secondary text-xs"
                    >
                      Mở bài ↗
                    </a>
                    <button
                      disabled={busy}
                      className="account-button-secondary text-xs"
                      onClick={() =>
                        void run(async () => {
                          await quizApi("hide", { id: item.id });
                          const data = await quizApi<{
                            quizzes: QuizSummary[];
                          }>("listAdmin");
                          setList(data.quizzes);
                          setMessage("Đã ẩn đề khỏi kho bài tập.");
                        })
                      }
                    >
                      Ẩn đề
                    </button>
                  </>
                )}
                {item.status === "hidden" && (
                  <button
                    type="button"
                    disabled={busy}
                    className="account-button-secondary text-xs"
                    onClick={() =>
                      void run(async () => {
                        const data = await quizApi<{ quiz: QuizSummary }>(
                          "unhide",
                          { id: item.id, revision: item.revision },
                        );
                        setList((items) =>
                          items.map((q) => (q.id === item.id ? data.quiz : q)),
                        );
                        setMessage(
                          "Đã bỏ ẩn đề. Học sinh có thể mở lại đề trong kho bài tập.",
                        );
                      })
                    }
                  >
                    <Eye className="size-4" />
                    Bỏ ẩn
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  className="account-button-secondary text-xs text-red-700"
                  onClick={() => void deleteQuiz(item)}
                >
                  <Trash2 className="size-4" />
                  Xóa đề
                </button>
              </div>
            </article>
          )}
        />
      )}
      {view === "results" && resultQuiz && (
        <section>
          <div className="mb-5 flex flex-wrap justify-between gap-3">
            <div>
              <h3 className="font-semibold">Kết quả: {resultQuiz.title}</h3>
              <p className="mt-1 text-xs text-slate-500">
                Tối đa 200 lượt gần nhất · Cấp lượt làm lại sẽ xóa kết quả cũ
              </p>
            </div>
            <button
              disabled={busy}
              className="account-button-secondary"
              onClick={() => void openResults(resultQuiz)}
            >
              Tải lại kết quả
            </button>
          </div>
          {!attempts.length && (
            <p className="text-sm text-slate-600">Chưa có ai bắt đầu đề này.</p>
          )}
          <div className="space-y-3">
            {attempts.map((a) => (
              <article
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
              >
                <div>
                  <h4 className="font-semibold">
                    {a.displayName}{" "}
                    {a.role === "admin" && (
                      <span className="text-xs text-amber-700">(Làm thử)</span>
                    )}
                  </h4>
                  <p className="mt-1 text-xs text-slate-500">
                    @{a.username} · Lượt {a.attemptNumber || 1} ·{" "}
                    {a.submittedAt
                      ? `Nộp ${new Date(a.submittedAt).toLocaleString("vi-VN")}`
                      : "Đang làm bài"}
                  </p>
                  {a.isCurrent === false && (
                    <p className="mt-1 text-xs text-sky-700">
                      Lượt cũ · Đã cho phép làm lại
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <strong>
                    {a.result?.manual && a.result.status === "pending"
                      ? "Chờ chấm"
                      : a.result
                        ? `${a.result.score.toLocaleString("vi-VN")} / 10`
                        : "—"}
                  </strong>
                  {a.result && (
                    <button
                      className="account-button-secondary text-xs"
                      onClick={() => setSelected(a)}
                    >
                      {a.result.manual
                        ? "Xem bài và chấm điểm"
                        : "Xem chi tiết"}
                    </button>
                  )}
                  {a.isCurrent !== false && (
                    <button
                      type="button"
                      disabled={busy || resultQuiz.status !== "published"}
                      title={
                        resultQuiz.status !== "published"
                          ? "Xuất bản đề trước khi cho phép làm lại"
                          : undefined
                      }
                      className="account-button-secondary text-xs"
                      onClick={() => void allowRetake(a)}
                    >
                      <RotateCcw className="size-4" />
                      Cho phép làm lại
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="exercise-page max-h-[90svh] max-w-4xl overflow-y-auto">
          <DialogTitle>
            Xem trước: {quiz.title || "Đề chưa đặt tên"}
          </DialogTitle>
          <DialogDescription className="text-slate-300">
            {quiz.durationMinutes} phút · {quiz.questions.length} câu · Chế độ
            xem trước
          </DialogDescription>
          <p className="whitespace-pre-wrap text-sm">{quiz.instructions}</p>
          {quiz.mode === "document" &&
            quiz.documentIds.map((id) => <QuizFile key={id} id={id} />)}
          <QuizQuestions
            questions={quiz.questions}
            answers={{}}
            flagged={[]}
            onAnswer={() => {}}
            onFlag={() => {}}
            disabled
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="account-page max-h-[90svh] max-w-2xl overflow-y-auto">
          <DialogTitle>Bài nộp của {selected?.displayName}</DialogTitle>
          <DialogDescription>{resultQuiz?.title}</DialogDescription>
          {selected?.result &&
            (selected.result.manual ? (
              <QuizManualGrader
                key={selected.id}
                attempt={selected}
                onSaved={(updated) => {
                  setSelected(updated);
                  setAttempts((items) =>
                    items.map((item) =>
                      item.id === updated.id ? updated : item,
                    ),
                  );
                }}
              />
            ) : (
              <QuizResultView result={selected.result} />
            ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
