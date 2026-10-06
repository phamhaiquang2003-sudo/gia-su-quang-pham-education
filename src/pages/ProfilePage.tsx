import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCheck,
  Clock3,
  Flame,
  RefreshCw,
} from "lucide-react";
import AccountMenu from "@/components/AccountMenu";
import StarryBackground from "@/components/StarryBackground";
import { accountError } from "@/lib/accounts";
import { formatStudyTime, type ProfileOverview } from "@/lib/profile";
import { getProfileAvatar, quizApi } from "@/lib/quizzes";
import { getSubject, subjectHref } from "@/lib/subjects";
import { useAccount } from "@/lib/use-account";

export default function ProfilePage() {
  const session = useAccount();
  const uid = session.profile?.uid;
  const [overviewState, setOverview] = useState<{
    uid: string;
    data: ProfileOverview;
  } | null>(null);
  const [avatarState, setAvatar] = useState<{
    uid: string;
    url: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [reload, setReload] = useState(0);
  const overview =
    overviewState && overviewState.uid === uid ? overviewState.data : null;
  const avatar = avatarState && avatarState.uid === uid ? avatarState.url : "";

  useEffect(() => {
    document.title = "Hồ sơ cá nhân · PHQ Education";
    if (!uid) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    quizApi<ProfileOverview>("profileOverview")
      .then((data) => {
        if (!cancelled) setOverview({ uid, data });
      })
      .catch((failure) => {
        if (!cancelled) setError(accountError(failure));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, reload]);
  useEffect(() => {
    if (!uid || !overview?.hasAvatar) return;
    let cancelled = false;
    getProfileAvatar()
      .then((blob) => {
        if (!cancelled) setAvatar({ uid, url: URL.createObjectURL(blob) });
      })
      .catch(() => {
        if (!cancelled)
          setAvatarError(
            "Chưa tải được ảnh đại diện. Hãy thử tải lại dữ liệu.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [uid, overview?.hasAvatar, overview?.avatarUpdatedAt, reload]);
  useEffect(
    () => () => {
      if (avatarState?.url) URL.revokeObjectURL(avatarState.url);
    },
    [avatarState?.url],
  );

  if (session.loading || !session.profile)
    return (
      <main className="exercise-page relative isolate flex min-h-svh items-center justify-center px-5 py-12">
        <StarryBackground />
        <section
          className="exercise-panel w-full max-w-md p-8 text-center"
          aria-busy={session.loading}
        >
          <h1 className="text-2xl font-semibold">
            {session.loading ? "Đang kiểm tra tài khoản…" : "Hồ sơ cá nhân"}
          </h1>
          <p role="status" className="my-5 text-sm text-slate-200">
            {session.loading
              ? "Vui lòng chờ trong giây lát."
              : session.error ||
                "Đăng nhập bằng tài khoản được giáo viên cấp để xem hồ sơ của bạn."}
          </p>
          {!session.loading && (
            <a
              className="inline-flex rounded-xl bg-amber-300 px-5 py-3 font-semibold text-slate-950"
              href={`${import.meta.env.BASE_URL}dang-nhap.html`}
            >
              Đăng nhập
            </a>
          )}
          <a
            className="mt-5 block text-sm underline"
            href={import.meta.env.BASE_URL}
          >
            Về trang chủ
          </a>
        </section>
      </main>
    );

  const profile = session.profile;
  const stats = overview?.stats;
  const cards = [
    {
      label: "Số môn đã học",
      value: stats?.studiedSubjects,
      icon: BookOpen,
      color: "border-sky-300/25 bg-sky-400/10",
      iconColor: "text-sky-200",
    },
    {
      label: "Số bài đã làm",
      value: stats?.completedAttempts,
      icon: CheckCheck,
      color: "border-violet-300/25 bg-violet-400/10",
      iconColor: "text-violet-200",
    },
    {
      label: "Thời gian làm bài",
      value: stats ? formatStudyTime(stats.studyMilliseconds) : undefined,
      icon: Clock3,
      color: "border-emerald-300/25 bg-emerald-400/10",
      iconColor: "text-emerald-200",
    },
    {
      label: "Chuỗi ngày học",
      value: stats ? `${stats.streakDays} ngày` : undefined,
      icon: Flame,
      color: "border-amber-300/25 bg-amber-400/10",
      iconColor: "text-amber-200",
    },
  ];

  return (
    <main className="exercise-page relative isolate min-h-svh px-4 pb-12 sm:px-8">
      <StarryBackground />
      <div className="mx-auto max-w-6xl">
        <header className="relative z-30 flex flex-wrap items-center justify-between gap-4 py-5 sm:py-7">
          <a
            href={import.meta.env.BASE_URL}
            aria-label="LumenPelagi — về trang chủ"
            className="font-display text-3xl"
          >
            LumenPelagi<sup className="ml-0.5 text-xs">®</sup>
          </a>
          <AccountMenu
            profile={profile}
            onLogout={() => session.logout(import.meta.env.BASE_URL)}
          />
        </header>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm">
          <a
            href={import.meta.env.BASE_URL}
            className="inline-flex items-center gap-2 text-slate-200 hover:text-white"
          >
            <ArrowLeft className="size-4" />
            Về trang chủ
          </a>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setAvatarError("");
              setReload((n) => n + 1);
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 px-4 py-2 hover:bg-white/10 disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Tải lại dữ liệu
          </button>
        </div>
        <section
          className="exercise-panel flex flex-col items-center gap-6 p-6 text-center sm:flex-row sm:items-start sm:p-8 sm:text-left"
          aria-labelledby="profile-name"
        >
          <div className="flex shrink-0 flex-col items-center gap-3">
            <div className="flex size-28 items-center justify-center overflow-hidden rounded-full border border-sky-200/40 bg-sky-200/10 text-5xl font-medium text-sky-100 ring-4 ring-white/5 sm:size-32">
              {avatar ? (
                <img
                  src={avatar}
                  alt={`Ảnh đại diện của ${profile.displayName}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                Array.from(
                  profile.displayName.trim() || profile.username,
                )[0]?.toLocaleUpperCase("vi-VN")
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-sky-200">
              Hồ sơ cá nhân
            </p>
            <h1
              id="profile-name"
              className="break-words text-2xl font-semibold sm:text-3xl"
            >
              {profile.displayName}
            </h1>
            <p className="mt-2 break-words text-sm text-slate-300">
              {profile.role === "student" ? "Học sinh" : "Quản trị viên"} · @
              {profile.username}
            </p>
            <p className="mt-5 text-sm italic leading-relaxed text-slate-200">
              “Cố gắng mỗi ngày, để trở thành phiên bản tốt hơn của chính mình!”
            </p>
            {avatarError && (
              <p role="alert" className="mt-4 text-sm text-red-200">
                {avatarError}
              </p>
            )}
          </div>
        </section>
        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-red-300/30 bg-red-950/40 p-4 text-sm text-red-200"
          >
            {error}
          </p>
        )}
        <section
          aria-label="Thống kê học tập"
          className="my-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          aria-busy={loading}
        >
          {cards.map(({ label, value, icon: Icon, color, iconColor }) => (
            <article
              key={label}
              className={`rounded-2xl border p-5 shadow-lg backdrop-blur-md ${color}`}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm text-slate-200">{label}</p>
                <Icon aria-hidden="true" className={`size-5 ${iconColor}`} />
              </div>
              <p className="break-words text-2xl font-semibold">
                {value ?? "—"}
              </p>
            </article>
          ))}
        </section>
        <div>
          <section
            className="exercise-panel p-6 sm:p-7"
            aria-labelledby="profile-history"
          >
            <h2 id="profile-history" className="mb-3 text-lg font-semibold">
              Lịch sử làm bài gần đây
            </h2>
            {overview ? (
              overview.recent.length ? (
                <div className="divide-y divide-white/10">
                  {overview.recent.map((row) => (
                    <article key={row.id} className="py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {row.isCurrent ? (
                            <a
                              className="break-words text-sm font-medium hover:underline"
                              href={`${import.meta.env.BASE_URL}bai-tap.html?mon=${row.subject}&de=${encodeURIComponent(row.quizId)}`}
                            >
                              {row.title}
                            </a>
                          ) : (
                            <p className="break-words text-sm font-medium">
                              {row.title}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-slate-300">
                            {getSubject(row.subject).label} · Lượt{" "}
                            {row.attemptNumber}
                            {!row.isCurrent && " · Lượt cũ"}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ${row.status === "graded" ? "bg-emerald-300/10 text-emerald-200" : row.status === "pending" ? "bg-amber-300/10 text-amber-200" : "bg-sky-300/10 text-sky-200"}`}
                        >
                          {row.status === "graded" && row.score !== null
                            ? `${row.score.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}/10`
                            : row.status === "pending"
                              ? "Chờ chấm"
                              : row.status === "in-progress"
                                ? "Đang làm"
                                : row.status === "processing"
                                  ? "Đang xử lý"
                                  : "Đã nộp"}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">
                        {formatStudyTime(row.elapsedMilliseconds)} ·{" "}
                        {new Date(
                          row.submittedAt ?? row.startedAt,
                        ).toLocaleDateString("vi-VN", {
                          timeZone: "Asia/Ho_Chi_Minh",
                        })}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="py-5 text-sm text-slate-300">
                  <p>Bạn chưa có lịch sử làm bài.</p>
                  <a
                    className="mt-4 inline-flex rounded-xl border border-sky-200/30 px-4 py-3 text-sky-100 hover:bg-white/10"
                    href={subjectHref("toan")}
                  >
                    Mở kho bài tập
                  </a>
                </div>
              )
            ) : (
              <p className="py-4 text-sm text-slate-300">
                {loading ? "Đang tải lịch sử…" : "Chưa tải được lịch sử."}
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
