import { useEffect, useState, type FormEvent } from "react";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  Eye,
  EyeOff,
  FileText,
  LogOut,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";
import QuizAdmin from "@/components/QuizAdmin";
import AccountGate from "@/components/AccountGate";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  accountError,
  createStudents,
  manageStudent,
  localAdminEnabled,
  studentDeletionEnabled,
  usernamePattern,
  type AccountProfile,
  type CreationResult,
} from "@/lib/accounts";
import { getFirebase } from "@/lib/firebase";
import { parseStudentCsv } from "@/lib/student-csv";
import { useAccount } from "@/lib/use-account";

type Tab = "quizzes" | "add" | "bulk" | "list";
type Action = "disable" | "enable" | "resetPassword" | "delete";

export default function AdminPage() {
  const session = useAccount();
  const [tab, setTab] = useState<Tab>("quizzes");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<CreationResult[]>([]);
  const [students, setStudents] = useState<AccountProfile[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot>();
  const [hasMore, setHasMore] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [loadedList, setLoadedList] = useState(false);
  const [selected, setSelected] = useState<{
    student: AccountProfile;
    action: Action;
  } | null>(null);
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    if (!session.loading && !session.profile) {
      setStudents([]);
      setPassword("");
      setBulk("");
      setNewPassword("");
      setSelected(null);
    }
  }, [session.loading, session.profile]);

  async function loadStudents(more = false) {
    if (loadingList || session.profile?.role !== "admin") return;
    setLoadingList(true);
    setMessage("");
    try {
      const constraints = [
        orderBy("username"),
        ...(more && cursor ? [startAfter(cursor)] : []),
        limit(50),
      ];
      const snapshot = await getDocs(
        query(collection(getFirebase().db, "users"), ...constraints),
      );
      const page = snapshot.docs.map(
        (item) => ({ ...item.data(), uid: item.id }) as AccountProfile,
      );
      setStudents((previous) => (more ? [...previous, ...page] : page));
      setCursor(snapshot.docs.at(-1));
      setHasMore(snapshot.size === 50);
      setLoadedList(true);
    } catch (error) {
      setMessage(accountError(error));
    } finally {
      setLoadingList(false);
    }
  }

  async function addStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setMessage("");
    setResults([]);
    const cleanUsername = username.trim().toLowerCase();
    if (!usernamePattern.test(cleanUsername)) {
      setMessage(
        "Tên đăng nhập cần 3–32 ký tự, chỉ gồm chữ không dấu, số, _ hoặc -.",
      );
      return;
    }
    setBusy(true);
    try {
      const response = await createStudents([
        { username: cleanUsername, password, displayName: displayName.trim() },
      ]);
      setResults(response);
      setPassword("");
      if (response[0]?.success) {
        setUsername("");
        setDisplayName("");
      }
    } catch (error) {
      setMessage(accountError(error));
    } finally {
      setBusy(false);
    }
  }

  async function addBulk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setMessage("");
    setResults([]);
    try {
      const input = parseStudentCsv(bulk);
      setBusy(true);
      const response = await createStudents(input);
      setResults(response);
      setBulk("");
    } catch (error) {
      setMessage(accountError(error));
    } finally {
      setBusy(false);
    }
  }

  async function applyAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await manageStudent(
        selected.student.uid,
        selected.action,
        selected.action === "resetPassword" ? newPassword : undefined,
      );
      setNewPassword("");
      setSelected(null);
      await loadStudents();
    } catch (error) {
      setMessage(accountError(error));
    } finally {
      setBusy(false);
    }
  }

  const actionLabels: Record<Action, string> = {
    disable: "Khóa tài khoản",
    enable: "Mở khóa tài khoản",
    resetPassword: "Cấp lại mật khẩu",
    delete: "Xóa tài khoản",
  };

  return (
    <AccountGate {...session} admin>
      <main className="account-page min-h-svh px-4 py-8 sm:py-12">
        <div className="mx-auto max-w-5xl">
          <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <a href={import.meta.env.BASE_URL} aria-label="Về trang chủ">
                <img
                  src={`${import.meta.env.BASE_URL}logo-lumenpelagi.png`}
                  alt=""
                  className="size-14"
                />
              </a>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  PHQ Education — Quản trị
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  Bài tập và tài khoản học sinh · {session.profile?.displayName}
                </p>
              </div>
            </div>
            <button
              className="account-button-secondary"
              disabled={busy}
              onClick={() =>
                void session
                  .logout()
                  .catch((error) => setMessage(accountError(error)))
              }
            >
              <LogOut className="size-4" /> Đăng xuất
            </button>
          </header>
          <p className="mb-6 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-relaxed text-sky-900">
            {localAdminEnabled
              ? "Quản trị trên máy tính · Firebase Spark. Tài khoản và hồ sơ được lưu trực tiếp trên Firebase."
              : studentDeletionEnabled
                ? "Bạn có thể thêm tài khoản, thêm hàng loạt và xóa tài khoản ngay trên website. Xóa tài khoản sẽ xóa cả đăng nhập Firebase và hồ sơ học sinh. Firebase Spark và Cloudflare Workers dùng gói miễn phí."
                : "Firebase Spark: bạn có thể thêm tài khoản và thêm hàng loạt ngay trên website. Để khóa, mở khóa, cấp lại mật khẩu hoặc xóa tài khoản, mở quan-tri-mien-phi.bat trên máy tính."}
          </p>
          <div
            className="mb-6 flex flex-wrap gap-2"
            role="tablist"
            aria-label="Quản trị website"
          >
            {(
              [
                ["quizzes", "Bài tập", FileText],
                ["add", "Thêm tài khoản", Plus],
                ["bulk", "Thêm hàng loạt", Users],
                ["list", "Danh sách tài khoản", Users],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                id={`tab-${value}`}
                role="tab"
                aria-selected={tab === value}
                aria-controls={`panel-${value}`}
                tabIndex={tab === value ? 0 : -1}
                onKeyDown={(event) => {
                  const values: Tab[] = ["quizzes", "add", "bulk", "list"];
                  const position = values.indexOf(value);
                  const next =
                    event.key === "ArrowRight"
                      ? values[(position + 1) % values.length]
                      : event.key === "ArrowLeft"
                        ? values[(position + values.length - 1) % values.length]
                        : event.key === "Home"
                          ? "quizzes"
                          : event.key === "End"
                            ? "list"
                            : null;
                  if (next && !busy) {
                    event.preventDefault();
                    document.getElementById(`tab-${next}`)?.click();
                    document.getElementById(`tab-${next}`)?.focus();
                  }
                }}
                disabled={busy}
                className={
                  tab === value ? "account-button" : "account-button-secondary"
                }
                onClick={() => {
                  setTab(value);
                  setMessage("");
                  setResults([]);
                  if (value === "list") void loadStudents();
                }}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
          <section
            className="account-card"
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
            aria-busy={busy || loadingList}
          >
            {tab === "quizzes" && session.profile && (
              <QuizAdmin uid={session.profile.uid} />
            )}
            {tab === "add" && (
              <>
                <h2 className="mb-5 text-lg font-semibold">
                  Thêm tài khoản học sinh
                </h2>
                <form onSubmit={addStudent}>
                  <fieldset
                    disabled={busy}
                    className="grid gap-4 sm:grid-cols-2"
                  >
                    <label className="account-label">
                      Tên đăng nhập
                      <input
                        className="account-input"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        placeholder="hocsinh01"
                        autoCapitalize="none"
                        autoComplete="off"
                        spellCheck={false}
                        required
                        maxLength={32}
                      />
                    </label>
                    <label className="account-label">
                      Mật khẩu ban đầu
                      <div className="relative">
                        <input
                          className="account-input pr-12"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          autoComplete="new-password"
                          minLength={8}
                          maxLength={128}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          className="absolute right-3 top-1/2 -translate-y-1/2"
                          aria-label={
                            showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                          }
                        >
                          {showPassword ? (
                            <EyeOff className="size-5" />
                          ) : (
                            <Eye className="size-5" />
                          )}
                        </button>
                      </div>
                    </label>
                    <label className="account-label">
                      Họ và tên
                      <input
                        className="account-input"
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        placeholder="Nguyễn Văn A"
                        maxLength={100}
                        required
                      />
                    </label>
                    <label className="account-label">
                      Vai trò
                      <input
                        className="account-input"
                        value="Học sinh"
                        readOnly
                      />
                    </label>
                  </fieldset>
                  <p className="my-4 text-sm leading-relaxed text-slate-600">
                    Học sinh dùng tên đăng nhập và mật khẩu bạn cấp. Hãy ghi lại
                    mật khẩu để gửi riêng cho học sinh.
                  </p>
                  <button className="account-button w-full" disabled={busy}>
                    {busy ? "Đang tạo tài khoản…" : "Thêm vào Firebase"}
                  </button>
                </form>
              </>
            )}
            {tab === "bulk" && (
              <>
                <h2 className="mb-5 text-lg font-semibold">Thêm hàng loạt</h2>
                <form onSubmit={addBulk}>
                  <label className="account-label" htmlFor="bulk-students">
                    Mỗi dòng: tên đăng nhập,mật khẩu,họ tên
                  </label>
                  <textarea
                    id="bulk-students"
                    className="account-input min-h-56 resize-y font-mono"
                    value={bulk}
                    onChange={(event) => setBulk(event.target.value)}
                    placeholder={
                      "hocsinh01,Matkhau-rieng-01,Nguyễn Văn A\nhocsinh02,Matkhau-rieng-02,Trần Thị B"
                    }
                    required
                    disabled={busy}
                  />
                  <p className="my-4 text-sm leading-relaxed text-slate-600">
                    Tối đa 50 tài khoản mỗi lần; mật khẩu từ 8–128 ký tự. Nếu
                    một cột có dấu phẩy, đặt cột đó trong dấu ngoặc kép. Tên
                    trùng sẽ được báo riêng.
                  </p>
                  <button className="account-button w-full" disabled={busy}>
                    {busy
                      ? "Đang xử lý danh sách…"
                      : "Thêm tất cả vào Firebase"}
                  </button>
                </form>
              </>
            )}
            {tab === "list" && (
              <>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">Danh sách tài khoản</h2>
                  <button
                    className="account-button-secondary"
                    onClick={() => void loadStudents()}
                    disabled={loadingList || busy}
                  >
                    <RefreshCw
                      className={`size-4 ${loadingList ? "animate-spin" : ""}`}
                    />{" "}
                    Tải lại
                  </button>
                </div>
                {loadedList && !students.length && (
                  <p className="text-slate-600">Chưa có tài khoản nào.</p>
                )}
                <div className="space-y-3">
                  {students.map((student) => (
                    <article
                      key={student.uid}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 p-4"
                    >
                      <div className="min-w-0">
                        <h3 className="break-words font-semibold">
                          {student.displayName}{" "}
                          <span
                            className={`ml-1 inline-block rounded-full px-2 py-1 text-xs ${student.role === "admin" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}
                          >
                            {student.role === "admin" ? "Quản trị" : "Học sinh"}
                          </span>
                        </h3>
                        <p className="mt-1 break-all text-sm text-slate-500">
                          @{student.username} ·{" "}
                          {student.status === "active"
                            ? "Đang hoạt động"
                            : "Đã khóa"}
                          {student.createdAt?.toDate
                            ? ` · ${student.createdAt.toDate().toLocaleDateString("vi-VN")}`
                            : ""}
                        </p>
                      </div>
                      {student.role === "student" && (
                        <div className="flex flex-wrap gap-2">
                          {(
                            [
                              student.status === "active"
                                ? "disable"
                                : "enable",
                              "resetPassword",
                              "delete",
                            ] as Action[]
                          ).map((action) => (
                            <button
                              key={action}
                              className={`account-button-secondary text-xs ${action === "delete" ? "text-red-700" : ""}`}
                              disabled={
                                busy ||
                                loadingList ||
                                (action === "delete"
                                  ? !studentDeletionEnabled
                                  : !localAdminEnabled)
                              }
                              onClick={() => {
                                setMessage("");
                                setNewPassword("");
                                setSelected({ student, action });
                              }}
                            >
                              {actionLabels[action]}
                            </button>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
                {hasMore && (
                  <button
                    className="account-button-secondary mt-5"
                    disabled={loadingList || busy}
                    onClick={() => void loadStudents(true)}
                  >
                    Tải thêm
                  </button>
                )}
              </>
            )}
            {message && (
              <p
                role="alert"
                className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              >
                {message}
              </p>
            )}
            {!!results.length && (
              <div
                role="status"
                className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm"
              >
                <p className="font-semibold">
                  Đã tạo {results.filter((result) => result.success).length}/
                  {results.length} tài khoản.
                </p>
                <ul className="mt-2 space-y-2">
                  {results.map((result, index) => (
                    <li
                      key={index}
                      className={
                        result.success ? "text-emerald-800" : "text-red-800"
                      }
                    >
                      @{result.username}: {result.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
          <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">
            Mật khẩu được Firebase Authentication quản lý. Hồ sơ học sinh được
            lưu trong Cloud Firestore.
          </p>
        </div>
        <Dialog
          open={Boolean(selected)}
          onOpenChange={(open) => {
            if (!open && !busy) {
              setSelected(null);
              setNewPassword("");
            }
          }}
        >
          <DialogContent
            className="account-page"
            onEscapeKeyDown={(event) => {
              if (busy) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (busy) event.preventDefault();
            }}
          >
            <DialogTitle>
              {selected && actionLabels[selected.action]}
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              {selected?.student.displayName} (@{selected?.student.username})
              {selected?.action === "delete" &&
                ". Thao tác này xóa tài khoản đăng nhập và hồ sơ học sinh, không thể hoàn tác."}
            </DialogDescription>
            <form onSubmit={applyAction} className="space-y-5">
              {selected?.action === "resetPassword" && (
                <label className="account-label">
                  Mật khẩu mới
                  <input
                    className="account-input"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                    disabled={busy}
                  />
                </label>
              )}
              {message && (
                <p role="alert" className="text-sm text-red-700">
                  {message}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <DialogClose asChild>
                  <button
                    type="button"
                    className="account-button-secondary"
                    disabled={busy}
                  >
                    Hủy
                  </button>
                </DialogClose>
                <Button type="submit" disabled={busy}>
                  {busy ? "Đang xử lý…" : "Xác nhận"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </AccountGate>
  );
}
