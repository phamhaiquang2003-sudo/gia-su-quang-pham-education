import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  FileText,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import StarryBackground from "@/components/StarryBackground";
import { accountError } from "@/lib/accounts";
import {
  getSubject,
  subjectHref,
  subjects,
  ZALO_CONTACT_URL,
} from "@/lib/subjects";
import { useAccount } from "@/lib/use-account";
import { quizApi, quizHref, type QuizSummary } from "@/lib/quizzes";
import QuizPlayer from "@/components/QuizPlayer";

export default function ExercisePage() {
  const session = useAccount();
  const subject = getSubject(
    new URLSearchParams(window.location.search).get("mon"),
  );
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [sort, setSort] = useState("newest");
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);
  const [quizError, setQuizError] = useState("");
  const [reload, setReload] = useState(0);
  const quizId = new URLSearchParams(window.location.search).get("de");
  const filtered = Boolean(search.trim() || categories.length);
  const visible = quizzes
    .filter(
      (q) =>
        (!search.trim() ||
          q.title
            .toLocaleLowerCase("vi")
            .includes(search.trim().toLocaleLowerCase("vi"))) &&
        (!categories.length || categories.includes(q.category)),
    )
    .sort((a, b) =>
      sort === "oldest"
        ? a.createdAt - b.createdAt
        : sort === "title"
          ? a.title.localeCompare(b.title, "vi")
          : b.createdAt - a.createdAt,
    );

  useEffect(() => {
    if (!session.profile || quizId) return;
    let cancelled = false;
    setLoadingQuizzes(true);
    setQuizError("");
    quizApi<{ quizzes: QuizSummary[] }>("list", { subject: subject.id })
      .then((data) => {
        if (!cancelled) setQuizzes(data.quizzes);
      })
      .catch((e) => {
        if (!cancelled) setQuizError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingQuizzes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session.profile?.uid, subject.id, quizId, reload]);

  useEffect(() => {
    document.title = `${subject.label} · Bài tập · PHQ Education`;
  }, [subject.label]);

  function resetFilters() {
    setSearch("");
    setCategories([]);
    setSort("newest");
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError("");
    try {
      await session.logout(import.meta.env.BASE_URL);
    } catch (error) {
      setLogoutError(accountError(error));
    } finally {
      setLoggingOut(false);
    }
  }

  if (session.loading || !session.profile) {
    return (
      <main className="exercise-page relative isolate flex min-h-svh items-center justify-center px-5 py-12">
        <StarryBackground />
        <section
          className="exercise-panel w-full max-w-md p-7 text-center sm:p-10"
          aria-busy={session.loading}
        >
          <div
            className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border border-amber-200/30 bg-amber-200/10 text-amber-200"
            aria-hidden="true"
          >
            {session.loading ? (
              <LoaderCircle className="size-8 motion-safe:animate-spin" />
            ) : (
              <LockKeyhole className="size-8" />
            )}
          </div>
          <p className="mb-3 text-xs uppercase tracking-[0.2em] text-amber-200">
            PHQ Education · {subject.label}
          </p>
          <h1 className="text-2xl font-bold leading-tight">
            {session.loading
              ? "Đang kiểm tra đăng nhập…"
              : "Bạn cần đăng nhập để tiếp tục"}
          </h1>
          <p
            role="status"
            className="my-5 text-sm leading-relaxed text-slate-200"
          >
            {session.loading
              ? "Vui lòng chờ trong giây lát."
              : session.error ||
                "Đăng nhập bằng tài khoản được giáo viên cấp để truy cập kho bài tập."}
          </p>
          {!session.loading && (
            <Button
              asChild
              className="mb-4 h-auto w-full rounded-xl bg-amber-300 py-3 text-slate-950 hover:bg-amber-200"
            >
              <a href={`${import.meta.env.BASE_URL}dang-nhap.html`}>
                Đăng nhập ngay
              </a>
            </Button>
          )}
          <a
            href={import.meta.env.BASE_URL}
            className="inline-flex items-center gap-2 text-sm text-slate-200 hover:text-white"
          >
            <ArrowLeft className="size-4" />
            Về trang chủ
          </a>
        </section>
      </main>
    );
  }

  if (quizId) return <QuizPlayer id={quizId} uid={session.profile.uid} />;

  return (
    <main className="exercise-page relative isolate min-h-svh pb-12">
      <StarryBackground />
      <header className="border-b border-white/15 bg-[#06132c]/65 backdrop-blur-md">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4 py-5">
            <a
              href={import.meta.env.BASE_URL}
              className="flex shrink-0 items-center gap-3"
              aria-label="LumenPelagi — về trang chủ"
            >
              <img
                src={`${import.meta.env.BASE_URL}logo-lumenpelagi.png`}
                alt=""
                className="size-11 rounded-xl"
              />
              <div>
                <span className="font-display text-3xl tracking-tight">
                  LumenPelagi<sup className="ml-0.5 text-xs">®</sup>
                </span>
                <span className="mt-0.5 block text-[10px] uppercase tracking-[0.2em] text-slate-300">
                  PHQ Education
                </span>
              </div>
            </a>
            <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-5">
              <p className="max-w-64 break-words text-sm text-slate-200">
                Xin chào,{" "}
                <span className="font-semibold text-white">
                  {session.profile.displayName}
                </span>
              </p>
              <Button
                variant="glass"
                size="glass"
                onClick={() => void logout()}
                disabled={loggingOut}
                className="gap-2 px-4 text-sm"
              >
                <LogOut className="size-4" />
                {loggingOut ? "Đang đăng xuất…" : "Đăng xuất"}
              </Button>
            </div>
          </div>
          <nav
            aria-label="Điều hướng bài tập"
            className="flex flex-wrap items-center gap-x-1 gap-y-1 pb-3"
          >
            <a href={import.meta.env.BASE_URL} className="exercise-nav-link">
              Trang chủ
            </a>
            {subjects.map((item) => (
              <a
                key={item.id}
                href={subjectHref(item.id)}
                className={`exercise-nav-link ${subject.id === item.id ? "exercise-nav-active" : ""}`}
                aria-current={subject.id === item.id ? "page" : undefined}
              >
                {item.label}
              </a>
            ))}
            <a href={ZALO_CONTACT_URL} className="exercise-nav-link">
              Liên hệ gia sư
            </a>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-4 sm:px-8">
        <section className="py-8 sm:py-10" aria-labelledby="exercise-title">
          <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-amber-200">
            <Sparkles className="size-4" aria-hidden="true" />
            Không gian học tập
          </p>
          <h1
            id="exercise-title"
            className="font-display text-4xl leading-tight sm:text-5xl"
          >
            {subject.title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-200 sm:text-base">
            {subject.description}
          </p>
          {logoutError && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-red-300/30 bg-red-950/50 p-4 text-sm text-red-200"
            >
              {logoutError}
            </p>
          )}
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
          <aside
            aria-label="Bộ lọc bài tập"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1"
          >
            <section className="exercise-panel p-5">
              <label
                htmlFor="exercise-search"
                className="mb-4 block text-base font-semibold"
              >
                Tìm kiếm
              </label>
              <div className="relative">
                <input
                  id="exercise-search"
                  type="search"
                  placeholder="Tìm bài kiểm tra…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  maxLength={100}
                  className="exercise-input pr-11"
                  autoComplete="off"
                />
                <Search
                  className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-slate-300"
                  aria-hidden="true"
                />
              </div>
            </section>
            <section className="exercise-panel p-5">
              <fieldset>
                <legend className="mb-4 flex items-center gap-2 text-base font-semibold">
                  <SlidersHorizontal
                    className="size-4 text-amber-200"
                    aria-hidden="true"
                  />
                  Danh mục
                </legend>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                  {subject.categories.map((category) => (
                    <label
                      key={category}
                      className="flex cursor-pointer items-center gap-3 text-sm leading-relaxed text-slate-200"
                    >
                      <input
                        type="checkbox"
                        checked={categories.includes(category)}
                        onChange={(event) =>
                          setCategories((previous) =>
                            event.target.checked
                              ? [...previous, category]
                              : previous.filter((item) => item !== category),
                          )
                        }
                        className="size-4 shrink-0 cursor-pointer accent-amber-300"
                      />
                      {category}
                    </label>
                  ))}
                </div>
              </fieldset>
              {filtered && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-5 inline-flex items-center gap-2 text-xs font-medium text-amber-200 hover:text-amber-100"
                >
                  <RotateCcw className="size-3.5" />
                  Xóa bộ lọc
                </button>
              )}
            </section>
          </aside>

          <section aria-label="Danh sách bài tập" className="min-w-0">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <p
                role="status"
                aria-live="polite"
                className="text-sm text-slate-200"
              >
                Hiển thị{" "}
                <span className="font-semibold text-white">
                  {visible.length}
                </span>{" "}
                bài kiểm tra
              </p>
              <div className="flex w-full items-center gap-3 sm:w-auto">
                <label
                  htmlFor="exercise-sort"
                  className="text-sm text-slate-200"
                >
                  Sắp xếp
                </label>
                <div className="relative min-w-0 flex-1 sm:flex-none">
                  <select
                    id="exercise-sort"
                    value={sort}
                    onChange={(event) => setSort(event.target.value)}
                    className="exercise-input cursor-pointer appearance-none py-2.5 pr-10 text-sm"
                  >
                    <option value="newest">Mới nhất</option>
                    <option value="oldest">Cũ nhất</option>
                    <option value="title">Tên A–Z</option>
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-300"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </div>
            {filtered && (
              <div className="mb-5 flex flex-wrap gap-2 text-xs text-slate-100">
                {search.trim() && (
                  <span className="max-w-full break-words rounded-lg border border-white/15 bg-white/5 px-3 py-2">
                    Tìm kiếm: {search.trim()}
                  </span>
                )}
                {categories.map((category) => (
                  <span
                    key={category}
                    className="rounded-lg border border-white/15 bg-white/5 px-3 py-2"
                  >
                    {category}
                  </span>
                ))}
              </div>
            )}
            {loadingQuizzes ? (
              <p role="status" className="exercise-panel p-8">
                Đang tải bài tập…
              </p>
            ) : quizError ? (
              <div role="alert" className="exercise-panel p-6">
                <p className="text-red-200">{quizError}</p>
                <button
                  className="mt-4 text-sm underline"
                  onClick={() => setReload((n) => n + 1)}
                >
                  Tải lại danh sách
                </button>
              </div>
            ) : visible.length ? (
              <div className="grid gap-5 sm:grid-cols-2">
                {visible.map((q) => (
                  <article
                    key={q.id}
                    className="exercise-panel flex flex-col p-6"
                  >
                    <p className="mb-3 text-xs text-amber-200">
                      {q.category || subject.label}
                    </p>
                    <h2 className="break-words text-xl font-semibold">
                      {q.title}
                    </h2>
                    <p className="mb-6 mt-4 text-sm text-slate-300">
                      {q.gradingMode === "manual" && q.questionCount === 0
                        ? "Đề PDF"
                        : `${q.questionCount} câu hỏi`}{" "}
                      · {q.durationMinutes} phút ·{" "}
                      {q.gradingMode === "manual"
                        ? "Tự luận · Gia sư chấm"
                        : "Chấm tự động"}
                    </p>
                    {q.requiresAccessCode && (
                      <p className="mb-4 flex items-center gap-2 text-xs text-amber-200">
                        <LockKeyhole className="size-3.5" aria-hidden="true" />
                        Cần mật khẩu đề
                      </p>
                    )}
                    <a
                      className="mt-auto rounded-xl border border-sky-300/30 bg-sky-300/10 px-4 py-3 text-center text-sm font-semibold hover:bg-sky-300/20"
                      href={quizHref(q)}
                    >
                      Mở bài tập
                    </a>
                  </article>
                ))}
              </div>
            ) : (
              <div className="exercise-panel flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center sm:min-h-96 sm:py-16">
                <div className="mb-6 flex size-20 items-center justify-center rounded-3xl border border-sky-200/25 bg-sky-200/10 text-sky-100">
                  <FileText
                    className="size-9"
                    strokeWidth={1.4}
                    aria-hidden="true"
                  />
                </div>
                <p className="mb-2 text-[10px] uppercase tracking-[0.25em] text-amber-200">
                  Kho bài tập · {subject.label}
                </p>
                <h2 className="font-display text-3xl sm:text-4xl">
                  {quizzes.length
                    ? "Không tìm thấy bài phù hợp"
                    : "Chưa có đề bài"}
                </h2>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-200">
                  {quizzes.length
                    ? "Thử thay đổi từ khóa hoặc xóa bộ lọc để xem các bài khác."
                    : `Giáo viên đang chuẩn bị nội dung cho mục ${subject.label}. Các bài tập sẽ xuất hiện tại đây khi được đăng tải.`}
                </p>
                {filtered && (
                  <Button
                    variant="glass"
                    size="glass"
                    onClick={resetFilters}
                    className="mt-6 gap-2 text-sm"
                  >
                    <RotateCcw className="size-4" />
                    Xóa bộ lọc
                  </Button>
                )}
              </div>
            )}
          </section>
        </div>
        <footer className="mt-10 border-t border-white/10 pt-5 text-xs text-slate-300">
          LumenPelagi® · PHQ Education
        </footer>
      </div>
    </main>
  );
}
