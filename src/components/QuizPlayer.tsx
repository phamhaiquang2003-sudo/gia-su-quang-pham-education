import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Clock3, Flag, Grid3X3 } from "lucide-react";
import {
  quizApi,
  QuizApiError,
  isAnswered,
  essayAnswer,
  uploadSubmissionFile,
  type QuizState,
  type Quiz,
  type Attempt,
  type Answers,
} from "@/lib/quizzes";
import { subjectHref } from "@/lib/subjects";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import StarryBackground from "./StarryBackground";
import QuizQuestions from "./QuizQuestions";
import QuizFile from "./QuizFile";
import QuizResultView from "./QuizResultView";
import QuizAccessCodeInput from "./QuizAccessCodeInput";
import QuizEssayAnswer from "./QuizEssayAnswer";
import QuizManualReview from "./QuizManualReview";
import { prepareQuizImage } from "@/lib/quiz-images";

export default function QuizPlayer({ id, uid }: { id: string; uid: string }) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [flagged, setFlagged] = useState<string[]>([]);
  const [active, setActive] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef(false);
  const [accessCode, setAccessCode] = useState("");
  const [locked, setLocked] = useState(false);
  const [stale, setStale] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Đã lưu trên máy chủ");
  const [confirm, setConfirm] = useState(false);
  const [navigation, setNavigation] = useState(false);
  const [mobileTab, setMobileTab] = useState<"document" | "answers">("answers");
  const [reload, setReload] = useState(0);
  const [nextAttemptNumber, setNextAttemptNumber] = useState(1);
  const current = useRef({
    answers: {} as Answers,
    flagged: [] as string[],
    version: 0,
    savedVersion: 0,
  });
  const attemptRef = useRef<Attempt | null>(null);
  const clock = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockRef = useRef(false);
  const staleRef = useRef(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const cacheKey = `phq-quiz-progress:${uid}:${id}`;
  function serverNow() {
    return performance.now() + clock.current;
  }
  function cache() {
    const a = attemptRef.current;
    if (!a) return;
    try {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          id: a.id,
          revision: a.revision,
          answers: current.current.answers,
          flagged: current.current.flagged,
        }),
      );
    } catch {
      /* server autosave still runs */
    }
  }
  function apply(data: { attempt: Attempt; serverNow: number }) {
    attemptRef.current = data.attempt;
    clock.current = data.serverNow - performance.now();
    if (!mounted.current) return;
    setAttempt(data.attempt);
    if (data.attempt.result) {
      lockRef.current = true;
      setLocked(true);
      setConfirm(false);
      setError("");
      setAnswers(data.attempt.answers);
      setFlagged(data.attempt.flagged);
      try {
        localStorage.removeItem(cacheKey);
      } catch {
        /* ignore */
      }
    }
  }
  useEffect(() => {
    mounted.current = true;
    const currentGeneration = ++generation.current;
    let cancelled = false;
    setLoading(true);
    uploadRef.current = false;
    setUploading(false);
    setError("");
    staleRef.current = false;
    setAccessCode("");
    setStale(false);
    quizApi<QuizState>("detail", { id })
      .then((data) => {
        if (cancelled) return;
        setQuiz(data.quiz);
        setNextAttemptNumber(data.nextAttemptNumber || 1);
        setActive(data.quiz.questions[0]?.id || "");
        clock.current = data.serverNow - performance.now();
        attemptRef.current = data.attempt;
        setAttempt(data.attempt);
        let recovered = false;
        let a = data.attempt?.answers || {},
          f = data.attempt?.flagged || [];
        if (!data.attempt) {
          try {
            localStorage.removeItem(cacheKey);
          } catch {
            /* ignore */
          }
        }
        if (
          data.attempt &&
          !data.attempt.result &&
          data.attempt.deadlineAt > data.serverNow
        ) {
          try {
            const old = JSON.parse(localStorage.getItem(cacheKey) || "null");
            if (
              old?.id === data.attempt.id &&
              old.revision === data.attempt.revision &&
              old.answers &&
              Array.isArray(old.flagged)
            ) {
              a = old.answers;
              f = old.flagged;
              recovered = true;
            }
          } catch {
            /* use server copy */
          }
        }
        current.current = {
          answers: a,
          flagged: f,
          version: recovered ? 1 : 0,
          savedVersion: 0,
        };
        setAnswers(a);
        setFlagged(f);
        setSaveStatus(
          recovered
            ? "Đã khôi phục trên máy này; đang đồng bộ…"
            : "Đã lưu trên máy chủ",
        );
        const done = !!data.attempt?.result;
        lockRef.current = done;
        setLocked(done);
        setRemaining(
          data.attempt
            ? Math.max(0, data.attempt.deadlineAt - data.serverNow)
            : data.quiz.durationMinutes * 60_000,
        );
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
          if (e instanceof QuizApiError && e.status === 404) {
            setQuiz(null);
            setAttempt(null);
            attemptRef.current = null;
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      if (generation.current === currentGeneration) generation.current++;
      cancelled = true;
      mounted.current = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [id, cacheKey, reload]);

  function enqueue<T>(job: () => Promise<T>) {
    const next = queue.current.then(job, job);
    queue.current = next.catch(() => {});
    return next;
  }
  async function syncProgress() {
    return enqueue(async () => {
      const a = attemptRef.current,
        state = current.current;
      if (
        !a ||
        a.result ||
        staleRef.current ||
        state.savedVersion === state.version ||
        serverNow() >= a.deadlineAt ||
        !mounted.current
      )
        return;
      const version = state.version;
      const requestGeneration = generation.current;
      setSaveStatus("Đang lưu câu trả lời…");
      try {
        const data = await quizApi<{ attempt: Attempt; serverNow: number }>(
          "progress",
          {
            id: a.id,
            revision: a.revision,
            answers: state.answers,
            flagged: state.flagged,
          },
        );
        if (generation.current !== requestGeneration) return;
        apply(data);
        current.current.savedVersion = version;
        if (current.current.version === version) {
          if (mounted.current) {
            setSaveStatus("Đã lưu trên máy chủ");
            setError("");
          }
          try {
            localStorage.removeItem(cacheKey);
          } catch {
            /* ignore */
          }
        } else cache();
      } catch (e) {
        if (!mounted.current || generation.current !== requestGeneration)
          return;
        if (
          e instanceof QuizApiError &&
          (e.status === 409 || e.status === 404)
        ) {
          staleRef.current = true;
          setStale(true);
          setSaveStatus("Bài được cập nhật ở cửa sổ khác.");
        } else
          setSaveStatus("Chưa đồng bộ · đang giữ câu trả lời trên máy này");
        setError(e instanceof Error ? e.message : "Chưa lưu được câu trả lời.");
      }
    });
  }
  function changed(a: Answers, f: string[]) {
    if (
      lockRef.current ||
      uploadRef.current ||
      staleRef.current ||
      !attemptRef.current ||
      serverNow() >= attemptRef.current.deadlineAt
    )
      return;
    current.current = {
      ...current.current,
      answers: a,
      flagged: f,
      version: current.current.version + 1,
    };
    setAnswers(a);
    setFlagged(f);
    setSaveStatus("Có thay đổi chưa đồng bộ…");
    cache();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void syncProgress(), 900);
  }
  async function mutateSubmission(
    action: (
      attempt: Attempt,
    ) => Promise<{ attempt: Attempt; serverNow: number }>,
  ) {
    if (uploadRef.current || lockRef.current || staleRef.current) return;
    uploadRef.current = true;
    setUploading(true);
    const requestGeneration = generation.current;
    try {
      await syncProgress();
      if (
        staleRef.current ||
        current.current.savedVersion !== current.current.version
      )
        throw new Error("Hãy lưu phần trả lời trước khi tải hoặc gỡ ảnh.");
      await enqueue(async () => {
        const a = attemptRef.current;
        if (
          !a ||
          a.result ||
          serverNow() >= a.deadlineAt ||
          requestGeneration !== generation.current
        )
          return;
        const data = await action(a);
        if (requestGeneration !== generation.current || !mounted.current)
          return;
        apply(data);
        current.current = {
          answers: data.attempt.answers,
          flagged: data.attempt.flagged,
          version: 0,
          savedVersion: 0,
        };
        setAnswers(data.attempt.answers);
        setFlagged(data.attempt.flagged);
        try {
          localStorage.removeItem(cacheKey);
        } catch {
          /* storage unavailable */
        }
        setSaveStatus("Đã lưu trên máy chủ");
        setError("");
      });
    } catch (e) {
      if (requestGeneration !== generation.current || !mounted.current) return;
      setError(e instanceof Error ? e.message : "Chưa tải được ảnh bài làm.");
      if (e instanceof QuizApiError && (e.status === 409 || e.status === 404)) {
        staleRef.current = true;
        setStale(true);
      }
    } finally {
      if (requestGeneration === generation.current && mounted.current) {
        uploadRef.current = false;
        setUploading(false);
      }
    }
  }
  async function uploadWork(questionId: string, files: File[]) {
    const uploadGeneration = generation.current;
    await mutateSubmission(async (a) => {
      const imageCount = Object.values(a.answers).reduce(
        (sum, value) => sum + essayAnswer(value).imageIds.length,
        0,
      );
      if (imageCount + files.length > 20)
        throw new Error(
          "Mỗi lượt làm được tải tối đa 20 ảnh. Hãy gỡ ảnh cũ nếu cần thay ảnh mới.",
        );
      let latest = { attempt: a, serverNow: serverNow() };
      for (const file of files) {
        if (uploadGeneration !== generation.current || !mounted.current)
          throw new Error("Đã chuyển sang lượt khác.");
        const ready = await prepareQuizImage(file);
        latest = await uploadSubmissionFile(
          ready,
          latest.attempt.id,
          questionId,
          latest.attempt.revision,
        );
        if (uploadGeneration !== generation.current || !mounted.current)
          throw new Error("Đã chuyển sang lượt khác.");
        apply(latest);
        current.current = {
          answers: latest.attempt.answers,
          flagged: latest.attempt.flagged,
          version: 0,
          savedVersion: 0,
        };
        setAnswers(latest.attempt.answers);
      }
      return latest;
    });
  }
  async function removeWork(fileId: string) {
    await mutateSubmission((a) =>
      quizApi("removeSubmissionFile", {
        id: a.id,
        revision: a.revision,
        fileId,
      }),
    );
  }
  async function submit() {
    if (staleRef.current || attemptRef.current?.result) return;
    lockRef.current = true;
    setLocked(true);
    setConfirm(false);
    setError("");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await enqueue(async () => {
      const a = attemptRef.current;
      if (!a || a.result) return;
      const requestGeneration = generation.current;
      setSaveStatus("Đang nộp và chấm bài…");
      try {
        const data = await quizApi<{ attempt: Attempt; serverNow: number }>(
          "submit",
          {
            id: a.id,
            revision: a.revision,
            answers: current.current.answers,
            flagged: current.current.flagged,
          },
        );
        if (generation.current !== requestGeneration) return;
        apply(data);
      } catch (e) {
        if (!mounted.current || generation.current !== requestGeneration)
          return;
        setError(e instanceof Error ? e.message : "Chưa nộp được bài.");
        setSaveStatus("Chưa xác nhận nộp bài · hãy thử lại");
        if (
          e instanceof QuizApiError &&
          (e.status === 409 || e.status === 404)
        ) {
          staleRef.current = true;
          setStale(true);
        }
        if (serverNow() < a.deadlineAt) {
          lockRef.current = false;
          setLocked(false);
        }
      }
    });
  }
  useEffect(() => {
    if (!attempt || attempt.result || loading) return;
    let lastRetry = 0;
    const tick = () => {
      const a = attemptRef.current;
      if (!a || a.result || staleRef.current) return;
      const left = Math.max(0, a.deadlineAt - serverNow());
      setRemaining(left);
      if (!left) {
        if (performance.now() - lastRetry > 10_000 || !lockRef.current) {
          lastRetry = performance.now();
          void submit();
        }
      } else if (performance.now() - lastRetry > 10_000) {
        lastRetry = performance.now();
        void syncProgress();
      }
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
    // References keep the serialized autosave queue and clock current.
  }, [attempt?.id, attempt?.result, loading]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (
        !attemptRef.current?.result &&
        (uploadRef.current ||
          current.current.version !== current.current.savedVersion)
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  async function start() {
    if (starting) return;
    setStarting(true);
    setError("");
    try {
      const data = await quizApi<QuizState>("start", { id, accessCode });
      setQuiz(data.quiz);
      setAccessCode("");
      setActive(data.quiz.questions[0]?.id || "");
      if (data.attempt) {
        apply({ attempt: data.attempt, serverNow: data.serverNow });
        setAnswers(data.attempt.answers);
        setFlagged(data.attempt.flagged);
        current.current = {
          answers: data.attempt.answers,
          flagged: data.attempt.flagged,
          version: 0,
          savedVersion: 0,
        };
        setRemaining(data.attempt.deadlineAt - data.serverNow);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa bắt đầu được bài.");
      if (e instanceof QuizApiError && (e.status === 403 || e.status === 409)) {
        try {
          const data = await quizApi<QuizState>("detail", { id });
          setQuiz(data.quiz);
        } catch {
          /* Keep the original start error. */
        }
      }
    } finally {
      setStarting(false);
    }
  }
  function jump(questionId: string) {
    setMobileTab("answers");
    setNavigation(false);
    setActive(questionId);
    requestAnimationFrame(() => {
      const el = document.getElementById(`question-${questionId}`);
      el?.scrollIntoView({ behavior: "instant", block: "start" });
      el?.focus({ preventScroll: true });
    });
  }
  const answeredCount =
    quiz?.questions.filter((q) => isAnswered(q, answers[q.id])).length || 0;
  const unansweredCount = (quiz?.questions.length || 0) - answeredCount;
  const wholeSubmission =
    quiz?.gradingMode === "manual" && quiz.mode === "document";
  const seconds = Math.ceil(remaining / 1000);
  const timer = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  const nav = (
    <div>
      <h2 className="mb-4 font-semibold">
        {wholeSubmission ? "Bài tự luận" : "Bảng câu hỏi"}
      </h2>
      {wholeSubmission ? (
        <p className="text-sm text-slate-200">
          Nộp ảnh bài làm chung cho cả đề. Gia sư sẽ chấm điểm và nhận xét.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-2">
            {quiz?.questions.map((q, index) => (
              <button
                key={q.id}
                type="button"
                onClick={() => jump(q.id)}
                aria-label={`Câu ${index + 1}, ${isAnswered(q, answers[q.id]) ? "đã trả lời" : "chưa trả lời"}${flagged.includes(q.id) ? ", đánh dấu xem lại" : ""}`}
                aria-current={active === q.id ? "true" : undefined}
                className={`relative min-h-11 rounded-lg border text-sm font-semibold ${isAnswered(q, answers[q.id]) ? "border-emerald-300/50 bg-emerald-400/20 text-emerald-100" : "border-white/30 bg-white/5"} ${active === q.id ? "ring-2 ring-sky-300 ring-offset-2 ring-offset-slate-950" : ""}`}
              >
                {index + 1}
                {flagged.includes(q.id) && (
                  <Flag className="absolute -right-1 -top-1 size-3.5 fill-amber-300 text-amber-300" />
                )}
              </button>
            ))}
          </div>
          <div className="mt-5 space-y-2 text-xs text-slate-200">
            <p>
              Đã trả lời: {answeredCount}/{quiz?.questions.length}
            </p>
            <p>Chưa hoàn tất: {unansweredCount}</p>
            <p className="flex items-center gap-2">
              <Flag className="size-3 text-amber-200" />
              Đánh dấu xem lại: {flagged.length}
            </p>
          </div>
        </>
      )}
      <button
        className="mt-5 w-full rounded-xl bg-amber-300 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50"
        disabled={locked || stale || uploading}
        onClick={() => setConfirm(true)}
      >
        Nộp bài
      </button>
    </div>
  );
  return (
    <main className="exercise-page relative isolate min-h-svh pb-12">
      <StarryBackground />
      <header className="sticky top-0 z-20 border-b border-white/15 bg-[#06132c]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <a
            href={
              quiz
                ? subjectHref(quiz.subject)
                : `${import.meta.env.BASE_URL}bai-tap.html`
            }
            className="flex items-center gap-2 text-sm text-slate-200"
          >
            <ArrowLeft className="size-4" />
            Kho bài tập
          </a>
          {quiz && (
            <p className="max-w-lg truncate text-sm font-semibold">
              {quiz.title}
            </p>
          )}
          {attempt && !attempt.result && (
            <div
              className={`flex items-center gap-2 rounded-xl border px-4 py-2 font-mono text-xl font-semibold ${remaining <= 60_000 ? "border-red-300 bg-red-400/15 text-red-200" : remaining <= 300_000 ? "border-amber-300/40 bg-amber-300/10 text-amber-200" : "border-white/20 text-white"}`}
              aria-label={`Thời gian còn lại ${timer}`}
            >
              <Clock3 className="size-5" />
              {timer}
            </div>
          )}
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-4 pt-6 sm:px-8">
        {loading && (
          <p role="status" className="exercise-panel p-8 text-center">
            Đang tải bài tập…
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-red-300/30 bg-red-950/70 p-4 text-sm text-red-100"
          >
            {error}
            <div className="mt-3 flex flex-wrap gap-4">
              {(!quiz || stale) && (
                <button
                  className="underline"
                  onClick={() => setReload((n) => n + 1)}
                >
                  Tải lại bài từ máy chủ
                </button>
              )}
              {quiz && attempt && !attempt.result && !stale && (
                <button
                  className="underline"
                  onClick={() => void (locked ? submit() : syncProgress())}
                >
                  {locked ? "Thử nộp lại" : "Thử lưu lại"}
                </button>
              )}
            </div>
          </div>
        )}
        {!loading && quiz && !attempt && (
          <section className="exercise-panel mx-auto max-w-2xl p-6 sm:p-10">
            <p className="mb-3 text-xs uppercase tracking-widest text-amber-200">
              PHQ Education · Làm bài trực tuyến
            </p>
            <h1 className="font-display text-4xl">{quiz.title}</h1>
            <div className="my-6 flex flex-wrap gap-3 text-sm">
              <span className="rounded-lg bg-white/10 px-3 py-2">
                {quiz.gradingMode === "manual" && quiz.mode === "document"
                  ? "Tự luận · Tệp đề"
                  : `${quiz.questionCount ?? quiz.questions.length} câu hỏi`}
              </span>
              <span className="rounded-lg bg-white/10 px-3 py-2">
                {quiz.durationMinutes} phút
              </span>
              <span className="rounded-lg bg-white/10 px-3 py-2">
                Điểm thang 10
              </span>
            </div>
            {quiz.instructions && (
              <p className="mb-6 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                {quiz.instructions}
              </p>
            )}
            <p className="mb-6 text-sm leading-relaxed text-slate-300">
              {quiz.gradingMode === "manual" ? (
                "Đồng hồ chạy ngay khi bắt đầu. Nộp ảnh bài làm hoặc nhập phần trả lời; gia sư sẽ chấm thủ công. Hết giờ, bài được nộp từ nội dung đã lưu. Tải lại trang vẫn tiếp tục lượt hiện tại."
              ) : (
                <>
                  Đồng hồ chạy ngay khi bắt đầu. Bạn có thể đánh dấu câu để xem
                  lại và dùng bảng số câu để chuyển nhanh. Hết giờ, bài được
                  khóa và chấm từ các câu trả lời đã lưu trước hạn. Tải lại
                  trang để tiếp tục lượt hiện tại. Giáo viên có thể cấp thêm
                  lượt làm lại.
                </>
              )}
            </p>
            {nextAttemptNumber > 1 && (
              <p className="mb-6 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-4 text-sm text-emerald-200">
                Giáo viên đã cho phép bạn làm lại — lượt {nextAttemptNumber}.
                Lượt mới có đáp án trống và đầy đủ thời gian làm bài.
              </p>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void start();
              }}
            >
              {quiz.requiresAccessCode && (
                <label className="mb-5 block text-sm font-semibold">
                  Mật khẩu đề
                  <QuizAccessCodeInput
                    disabled={starting}
                    value={accessCode}
                    onChange={setAccessCode}
                  />
                </label>
              )}
              <button
                type="submit"
                disabled={starting}
                className="w-full rounded-xl bg-amber-300 px-5 py-4 font-bold text-slate-950 disabled:opacity-50"
              >
                {starting ? "Đang bắt đầu…" : "Bắt đầu làm bài"}
              </button>
            </form>
          </section>
        )}
        {!loading && quiz && attempt?.result && (
          <section className="exercise-panel mx-auto max-w-3xl p-5 sm:p-8">
            <p className="mb-2 text-sm text-emerald-200">
              {attempt.result.manual
                ? "Đã nộp bài tự luận"
                : "Đã nộp và chấm bài"}
            </p>
            <h1 className="mb-3 font-display text-3xl">{quiz.title}</h1>
            <p className="mb-6 text-xs text-slate-300">
              Lượt {attempt.attemptNumber || 1} ·{" "}
              {attempt.submittedAt &&
                new Date(attempt.submittedAt).toLocaleString("vi-VN")}{" "}
              · Thời gian làm:{" "}
              {Math.max(
                0,
                Math.ceil(
                  ((attempt.submittedAt || attempt.deadlineAt) -
                    attempt.startedAt) /
                    60_000,
                ),
              )}{" "}
              phút
            </p>
            {attempt.result.manual ? (
              <QuizManualReview attempt={attempt} quiz={quiz} />
            ) : (
              <QuizResultView result={attempt.result} />
            )}
            {attempt.result.manual && (
              <button
                type="button"
                className="mt-6 mr-3 rounded-xl border border-white/20 px-5 py-3 text-sm"
                onClick={() => setReload((n) => n + 1)}
              >
                Cập nhật điểm và nhận xét
              </button>
            )}
            <button
              type="button"
              className="mt-6 mr-3 inline-block rounded-xl border border-white/20 px-5 py-3 text-sm"
              onClick={() => setReload((n) => n + 1)}
            >
              Kiểm tra lượt làm lại
            </button>
            <a
              className="mt-6 inline-block rounded-xl border border-white/20 px-5 py-3 text-sm"
              href={subjectHref(quiz.subject)}
            >
              Về kho bài tập
            </a>
          </section>
        )}
        {!loading && quiz && attempt && !attempt.result && (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p role="status" className="text-xs text-slate-300">
                {uploading ? "Đang xử lý ảnh bài làm…" : saveStatus}
              </p>
              {!wholeSubmission && (
                <button
                  className="flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-sm lg:hidden"
                  onClick={() => setNavigation(true)}
                >
                  <Grid3X3 className="size-4" />
                  Bảng câu hỏi ({answeredCount}/{quiz.questions.length})
                </button>
              )}
            </div>
            {remaining <= 60_000 && (
              <p
                role="status"
                className="mb-5 rounded-xl border border-red-300/40 bg-red-950/60 p-4 text-sm text-red-100"
              >
                {remaining > 0
                  ? "Còn dưới 1 phút. Hãy hoàn tất câu trả lời và kiểm tra bài."
                  : "Đã hết thời gian. Phần trả lời đã khóa; hệ thống đang hoàn tất bài từ các câu đã lưu trước hạn."}
              </p>
            )}
            {quiz.mode === "document" && (
              <div className="mb-5 flex gap-3 xl:hidden">
                {(["document", "answers"] as const).map((tab) => (
                  <button
                    key={tab}
                    className={`rounded-xl border px-4 py-2 text-sm ${mobileTab === tab ? "border-sky-300 bg-sky-300/10" : "border-white/20"}`}
                    onClick={() => setMobileTab(tab)}
                  >
                    {tab === "document" ? "Xem đề" : "Trả lời"}
                  </button>
                ))}
              </div>
            )}
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div
                className={`grid min-w-0 items-start gap-5 ${quiz.mode === "document" ? "xl:grid-cols-2" : ""}`}
              >
                {quiz.mode === "document" && (
                  <div
                    className={`min-w-0 space-y-5 xl:sticky xl:top-28 ${mobileTab === "document" ? "" : "hidden xl:block"}`}
                  >
                    {quiz.documentIds.map((file) => (
                      <div key={file} className="exercise-panel p-4">
                        <QuizFile id={file} />
                      </div>
                    ))}
                  </div>
                )}
                <div
                  className={`min-w-0 ${quiz.mode === "document" && mobileTab !== "answers" ? "hidden xl:block" : ""}`}
                >
                  {wholeSubmission ? (
                    <section className="exercise-panel p-5 sm:p-6">
                      <h2 className="mb-4 font-semibold">
                        Nộp bài làm cho cả đề
                      </h2>
                      <QuizEssayAnswer
                        value={answers.__submission}
                        disabled={
                          locked || stale || uploading || remaining <= 0
                        }
                        onChange={(value) =>
                          changed(
                            { ...current.current.answers, __submission: value },
                            [],
                          )
                        }
                        onUpload={(files) => uploadWork("__submission", files)}
                        onRemove={removeWork}
                      />
                    </section>
                  ) : (
                    <QuizQuestions
                      questions={quiz.questions}
                      answers={answers}
                      flagged={flagged}
                      onAnswer={(q, value) =>
                        changed(
                          { ...current.current.answers, [q]: value },
                          current.current.flagged,
                        )
                      }
                      onFlag={(q) =>
                        changed(
                          current.current.answers,
                          current.current.flagged.includes(q)
                            ? current.current.flagged.filter((f) => f !== q)
                            : [...current.current.flagged, q],
                        )
                      }
                      disabled={locked || stale || uploading || remaining <= 0}
                      onActive={setActive}
                      onUpload={uploadWork}
                      onRemoveImage={removeWork}
                    />
                  )}
                  <button
                    disabled={locked || stale || uploading}
                    className="mt-5 w-full rounded-xl bg-amber-300 py-4 font-bold text-slate-950 disabled:opacity-50 lg:hidden"
                    onClick={() => setConfirm(true)}
                  >
                    Nộp bài
                  </button>
                </div>
              </div>
              <aside className="exercise-panel sticky top-28 hidden p-5 lg:block">
                {nav}
              </aside>
            </div>
          </>
        )}
      </div>
      <Dialog open={navigation} onOpenChange={setNavigation}>
        <DialogContent className="exercise-page max-h-[85svh] overflow-y-auto">
          <DialogTitle>Điều hướng câu hỏi</DialogTitle>
          <DialogDescription className="text-slate-300">
            Chọn số câu để chuyển đến phần trả lời.
          </DialogDescription>
          {nav}
        </DialogContent>
      </Dialog>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="exercise-page">
          <DialogTitle>Nộp bài để chấm điểm?</DialogTitle>
          <DialogDescription className="text-slate-200">
            {wholeSubmission ? (
              "Bài làm và ảnh đã tải sẽ được gửi cho gia sư chấm. Sau khi nộp, bạn không thể thay đổi bài."
            ) : (
              <>
                Bạn còn {unansweredCount} câu chưa hoàn tất và {flagged.length}{" "}
                câu đánh dấu xem lại. Sau khi nộp, bạn không thể thay đổi câu
                trả lời.
              </>
            )}
          </DialogDescription>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="rounded-xl border border-white/20 px-4 py-3 text-sm"
              onClick={() => setConfirm(false)}
            >
              Tiếp tục làm bài
            </button>
            <button
              className="rounded-xl bg-amber-300 px-4 py-3 text-sm font-bold text-slate-950"
              disabled={uploading || locked || stale}
              onClick={() => void submit()}
            >
              Nộp bài
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
