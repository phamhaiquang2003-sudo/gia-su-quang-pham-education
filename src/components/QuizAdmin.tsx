import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Clock3,
  Copy,
  Eye,
  FileText,
  Plus,
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

const types: [QuestionType, string][] = [
  ["single", "Chọn A/B/C/D"],
  ["truefalse", "Đúng / Sai (4 ý)"],
  ["short", "Trả lời ngắn"],
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
      if (q && Array.isArray(q.questions) && q.questions.length) return q;
    } catch {
      /* new draft */
    }
    return newQuiz();
  });
  const [view, setView] = useState<"edit" | "list" | "results">("edit");
  const [list, setList] = useState<QuizSummary[]>([]);
  const [busy, setBusy] = useState(false);
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
    setQuiz((q) => ({
      ...q,
      questions: q.questions.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
    setMessage("");
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Thao tác chưa hoàn tất.");
    } finally {
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
          ? "Đã xuất bản! Học sinh có thể mở bài trong kho môn học. Bạn cũng có thể bấm “Mở bài để làm thử”."
          : "Đã lưu bản nháp lên máy chủ.",
      );
    });
  }
  async function upload(file: File | undefined, questionId?: string) {
    if (!file) return;
    await run(async () => {
      if (questionId && !file.type.startsWith("image/"))
        throw new Error("Hình minh họa câu hỏi cần là PNG, JPG hoặc WebP.");
      const saved = await uploadQuizFile(file);
      if (questionId) updateQuestion(questionId, { imageId: saved.id });
      else update({ documentIds: [...quiz.documentIds, saved.id] });
      setMessage(`Đã tải ${saved.name}. Hãy lưu đề để gắn tệp vào bài tập.`);
    });
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
  const subject = getSubject(quiz.subject);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Quản lý bài tập</h2>
          <p className="mt-1 text-sm text-slate-600">
            Tạo đề, đặt thời gian và chấm tự động theo thang 10.
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
            <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold">1. Thông tin đề</h3>
                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-900">
                  {quiz.id ? statusLabels[quiz.status] : "Đề mới"}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
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
                  Cách đưa đề lên
                  <select
                    className="account-input"
                    value={quiz.mode}
                    onChange={(e) =>
                      update({ mode: e.target.value as Quiz["mode"] })
                    }
                  >
                    <option value="inline">Soạn từng câu trực tiếp</option>
                    <option value="document">PDF / ảnh + phiếu trả lời</option>
                  </select>
                </label>
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
              <label className="mt-5 flex items-start gap-3 text-sm">
                <input
                  className="mt-0.5 size-4 accent-blue-700"
                  type="checkbox"
                  checked={quiz.revealAnswers}
                  onChange={(e) => update({ revealAnswers: e.target.checked })}
                />
                <span>
                  Hiện đáp án và lời giải ngay sau khi nộp
                  <p className="mt-1 text-xs text-slate-500">
                    Bỏ chọn để học sinh chỉ thấy điểm và câu trả lời của mình.
                  </p>
                </span>
              </label>
              <p className="mt-5 text-xs leading-relaxed text-slate-600">
                Bản này giao đề cho tất cả tài khoản đang hoạt động. Mỗi tài
                khoản có một lượt làm cho mỗi đề, đồng hồ bắt đầu khi bấm “Bắt
                đầu làm bài”. Tải lại trang vẫn giữ thời hạn. Lượt quản trị được
                ghi riêng là “Làm thử”.
              </p>
            </section>
            {quiz.mode === "document" && (
              <section className="rounded-2xl border border-slate-200 p-4 sm:p-6">
                <h3 className="mb-2 font-semibold">2. Tệp đề PDF / ảnh</h3>
                <p className="mb-4 text-sm text-slate-600">
                  Tải tối đa 8 tệp, mỗi tệp dưới 1,8 MB (PDF, PNG, JPG, WebP).
                  Bên dưới, khai báo các câu theo đúng thứ tự trong tệp.
                </p>
                <label className="account-label">
                  Chọn tệp đề
                  <input
                    type="file"
                    className="account-input"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
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
            <section>
              <div className="mb-4 flex flex-wrap justify-between gap-3">
                <h3 className="font-semibold">
                  {quiz.mode === "document" ? "3" : "2"}. Câu hỏi và đáp án (
                  {quiz.questions.length})
                </h3>
                <span className="text-xs text-slate-600">
                  Tổng trọng số:{" "}
                  {quiz.questions.reduce((n, q) => n + (q.points || 0), 0)} ·
                  Quy đổi về 10 điểm
                </span>
              </div>
              <p className="mb-4 text-sm text-slate-600">
                Chọn đáp án đúng cho từng câu. Điểm là trọng số: ví dụ các câu
                đều 1 điểm sẽ có giá trị bằng nhau.
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
                            title={step === -1 ? "Chuyển lên" : "Chuyển xuống"}
                            aria-label={`${step === -1 ? "Chuyển lên" : "Chuyển xuống"} câu ${index + 1}`}
                            disabled={
                              busy ||
                              index + step < 0 ||
                              index + step >= quiz.questions.length
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
                          disabled={busy || quiz.questions.length >= 100}
                          className="rounded-lg p-2 hover:bg-slate-100"
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
                          disabled={busy || quiz.questions.length <= 1}
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
                          onChange={(e) =>
                            updateQuestion(q.id, {
                              ...newQuestion(
                                e.target.value as QuestionType,
                                quiz.mode === "document",
                              ),
                              id: q.id,
                              prompt: q.prompt,
                              imageId: q.imageId,
                              points: q.points,
                            })
                          }
                        >
                          {types.map(([t, label]) => (
                            <option value={t} key={t}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="account-label">
                        Điểm trọng số
                        <input
                          className="account-input"
                          type="number"
                          min={0.01}
                          max={100}
                          step={0.01}
                          value={q.points}
                          required
                          onChange={(e) =>
                            updateQuestion(q.id, {
                              points: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                    <label className="account-label mt-4">
                      {quiz.mode === "document"
                        ? "Nội dung / ghi chú câu (tùy chọn)"
                        : "Nội dung câu hỏi"}
                      <textarea
                        className="account-input min-h-24 resize-y"
                        required={quiz.mode === "inline"}
                        maxLength={5000}
                        value={q.prompt}
                        onChange={(e) =>
                          updateQuestion(q.id, { prompt: e.target.value })
                        }
                        placeholder={
                          quiz.mode === "document"
                            ? "Có thể để trống khi đề đã có trong PDF/ảnh"
                            : "Nhập nội dung; có thể dùng ảnh cho công thức toán…"
                        }
                      />
                    </label>
                    <label className="account-label mt-4">
                      Ảnh minh họa (tùy chọn, dưới 1,8 MB)
                      <input
                        type="file"
                        className="account-input text-xs"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                          void upload(e.target.files?.[0], q.id);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {q.imageId && (
                      <div className="mt-3">
                        <p className="text-xs text-emerald-700">
                          Đã gắn ảnh minh họa.
                        </p>
                        <button
                          type="button"
                          className="mt-2 text-xs text-red-700 underline"
                          onClick={() => updateQuestion(q.id, { imageId: "" })}
                        >
                          Bỏ ảnh
                        </button>
                      </div>
                    )}
                    {q.type === "single" && (
                      <div className="mt-5 space-y-3">
                        <p className="text-sm font-semibold">
                          Các lựa chọn — tích đáp án đúng
                        </p>
                        {q.choices?.map((choice, i) => (
                          <label key={i} className="flex items-center gap-3">
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
                              required
                              maxLength={2000}
                              value={choice}
                              placeholder={`Nội dung lựa chọn ${"ABCD"[i]}`}
                              onChange={(e) =>
                                updateQuestion(q.id, {
                                  choices: q.choices?.map((v, j) =>
                                    i === j ? e.target.value : v,
                                  ),
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>
                    )}
                    {q.type === "truefalse" && (
                      <div className="mt-5 space-y-4">
                        <p className="text-sm font-semibold">Bốn ý và đáp án</p>
                        {q.statements?.map((s, i) => (
                          <div
                            key={i}
                            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px]"
                          >
                            <label className="account-label">
                              Ý {"abcd"[i]}
                              <input
                                className="account-input"
                                required
                                maxLength={2000}
                                value={s}
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
                                        i === j ? e.target.value === "true" : v,
                                    ),
                                  })
                                }
                              >
                                <option value="true">Đúng</option>
                                <option value="false">Sai</option>
                              </select>
                            </label>
                          </div>
                        ))}
                        <label className="account-label">
                          Cách tính điểm Đúng/Sai
                          <select
                            className="account-input"
                            value={q.scoring}
                            onChange={(e) =>
                              updateQuestion(q.id, {
                                scoring: e.target.value as Question["scoring"],
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
                          updateQuestion(q.id, { explanation: e.target.value })
                        }
                      />
                    </label>
                  </article>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <select
                  aria-label="Dạng câu cần thêm"
                  className="account-input w-full sm:w-auto"
                  value={addType}
                  onChange={(e) => setAddType(e.target.value as QuestionType)}
                >
                  {types.map(([type, label]) => (
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
                        newQuestion(addType, quiz.mode === "document"),
                      ],
                    })
                  }
                >
                  <Plus className="size-4" />
                  Thêm câu hỏi
                </button>
              </div>
            </section>
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
        <div className="space-y-4">
          {!list.length && (
            <p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-600">
              Chưa có đề. Bấm “Tạo đề mới” để bắt đầu.
            </p>
          )}
          {list.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-slate-200 p-5"
            >
              <div className="flex flex-wrap justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-slate-500">
                    {getSubject(item.subject).label} · {item.category} ·{" "}
                    {item.questionCount} câu · {item.durationMinutes} phút
                  </p>
                </div>
                <span
                  className={`h-fit rounded-full px-3 py-1 text-xs ${item.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
                >
                  {statusLabels[item.status]}
                </span>
              </div>
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
                          setList((items) =>
                            items.map((q) =>
                              q.id === item.id ? { ...q, status: "hidden" } : q,
                            ),
                          );
                          setMessage("Đã ẩn đề khỏi kho bài tập.");
                        })
                      }
                    >
                      Ẩn đề
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {view === "results" && resultQuiz && (
        <section>
          <div className="mb-5 flex flex-wrap justify-between gap-3">
            <div>
              <h3 className="font-semibold">Kết quả: {resultQuiz.title}</h3>
              <p className="mt-1 text-xs text-slate-500">
                Tối đa 200 lượt gần nhất · Học sinh và lượt làm thử quản trị
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
                    @{a.username} ·{" "}
                    {a.submittedAt
                      ? `Nộp ${new Date(a.submittedAt).toLocaleString("vi-VN")}`
                      : "Đang làm bài"}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <strong>
                    {a.result
                      ? `${a.result.score.toLocaleString("vi-VN")} / 10`
                      : "—"}
                  </strong>
                  {a.result && (
                    <button
                      className="account-button-secondary text-xs"
                      onClick={() => setSelected(a)}
                    >
                      Xem chi tiết
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
          {selected?.result && <QuizResultView result={selected.result} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
