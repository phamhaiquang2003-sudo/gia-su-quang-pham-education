import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import App from "@/App";
import { accountDestination, accountError, loginAccount } from "@/lib/accounts";
import { configurationMessage, firebaseConfigured } from "@/lib/firebase";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const ACCOUNT_KEY = "phq-education:remembered-username";

function rememberedUsername() {
  try {
    return localStorage.getItem(ACCOUNT_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function LoginPage() {
  const [initialUsername] = useState(rememberedUsername);
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(Boolean(initialUsername));
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ username: "", password: "" });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      if (remember && username.trim()) {
        localStorage.setItem(ACCOUNT_KEY, username.trim());
      } else {
        localStorage.removeItem(ACCOUNT_KEY);
      }
    } catch {
      // The form remains usable when the browser blocks local storage.
    }
  }, [remember, username]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const nextErrors = {
      username: username.trim() ? "" : "Vui lòng nhập tên đăng nhập.",
      password: password ? "" : "Vui lòng nhập mật khẩu.",
    };
    setErrors(nextErrors);
    setStatus("");
    if (nextErrors.username) {
      usernameRef.current?.focus();
      return;
    }
    if (nextErrors.password) {
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const profile = await loginAccount(username, password, remember);
      setPassword("");
      window.location.assign(accountDestination(profile));
    } catch (error) {
      setStatus(accountError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative isolate flex min-h-svh flex-col items-center justify-center px-4 pb-6 pt-24 sm:px-8 sm:py-8">
      <div
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        aria-hidden="true"
        inert
      >
        <App />
      </div>
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-background/25 backdrop-blur-[4px]"
        aria-hidden="true"
      />
      <a
        href={import.meta.env.BASE_URL}
        className="fixed left-5 top-6 z-20 inline-flex items-center gap-2 rounded-full border border-white/20 bg-background/70 px-6 py-3.5 text-sm text-white shadow-sm backdrop-blur-md outline-none transition-colors hover:bg-background/90 focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Quay lại
      </a>
      <div className="login-page relative z-10 w-full max-w-[526px] rounded-[26px] border border-white/20 bg-background/85 p-7 text-foreground shadow-[0_20px_65px_rgba(0,0,0,0.4)] backdrop-blur-xl sm:px-11 sm:py-14">
        <header className="text-center">
          <img
            src={`${import.meta.env.BASE_URL}logo-lumenpelagi.png`}
            alt="Logo PHQ Education"
            width={256}
            height={256}
            className="mx-auto mb-6 size-16 object-contain"
          />
          <a
            href={import.meta.env.BASE_URL}
            className="inline-block rounded-sm text-[28px] font-bold leading-tight tracking-[-0.055em] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            PHQ Education
          </a>
          <div
            className="mx-auto mb-9 mt-6 h-[3px] w-[50px] rounded-full bg-white/70"
            aria-hidden="true"
          />
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.045em]">
            Đăng nhập
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            Chào mừng bạn quay trở lại!
          </p>
        </header>

        <form
          className="mt-9"
          onSubmit={handleSubmit}
          noValidate
          aria-busy={busy}
        >
          <div>
            <label
              htmlFor="login-username"
              className="mb-2 block text-[15px] text-muted-foreground"
            >
              Tên đăng nhập
            </label>
            <div className="relative">
              <UserRound
                className="pointer-events-none absolute left-[18px] top-1/2 size-5 -translate-y-1/2 text-white/50"
                aria-hidden="true"
              />
              <input
                ref={usernameRef}
                id="login-username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Nhập tên tài khoản..."
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setErrors((current) => ({ ...current, username: "" }));
                  setStatus("");
                }}
                className="login-input h-[62px] w-full rounded-[14px] border border-input bg-white/5 py-4 pl-[52px] pr-4 text-base text-foreground outline-none transition-colors placeholder:text-white/45 focus:border-white/50 focus:ring-2 focus:ring-white/10"
                required
                aria-invalid={Boolean(errors.username)}
                aria-describedby={
                  errors.username ? "username-error" : undefined
                }
              />
            </div>
            {errors.username && (
              <p id="username-error" className="mt-2 text-sm text-red-300">
                {errors.username}
              </p>
            )}
          </div>

          <div className="mt-6">
            <label
              htmlFor="login-password"
              className="mb-2 block text-[15px] text-muted-foreground"
            >
              Mật khẩu
            </label>
            <div className="relative">
              <LockKeyhole
                className="pointer-events-none absolute left-[18px] top-1/2 size-5 -translate-y-1/2 text-white/50"
                aria-hidden="true"
              />
              <input
                ref={passwordRef}
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setErrors((current) => ({ ...current, password: "" }));
                  setStatus("");
                }}
                className="login-input h-[62px] w-full rounded-[14px] border border-input bg-white/5 py-4 pl-[52px] pr-[54px] text-base text-foreground outline-none transition-colors placeholder:text-white/45 focus:border-white/50 focus:ring-2 focus:ring-white/10"
                required
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password ? "password-error" : undefined
                }
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-white/50 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                aria-pressed={showPassword}
                aria-controls="login-password"
              >
                {showPassword ? (
                  <EyeOff className="size-5" />
                ) : (
                  <Eye className="size-5" />
                )}
              </button>
            </div>
            {errors.password && (
              <p id="password-error" className="mt-2 text-sm text-red-300">
                {errors.password}
              </p>
            )}
          </div>

          <label className="mt-6 inline-flex cursor-pointer items-center gap-2.5 text-sm text-muted-foreground">
            <input
              type="checkbox"
              name="remember"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="size-4 cursor-pointer rounded border-input accent-white"
            />
            Ghi nhớ tài khoản
          </label>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Khi chọn, phiên đăng nhập được giữ trên thiết bị đến khi bạn đăng
            xuất.
          </p>

          <Button
            type="submit"
            variant="glass"
            disabled={busy || !firebaseConfigured}
            className="mt-8 h-[62px] w-full rounded-[14px] text-[17px] font-semibold hover:bg-white/10"
          >
            {busy ? "Đang đăng nhập…" : "Đăng nhập"}{" "}
            <ArrowRight className="ml-1 size-5" />
          </Button>

          {(status || !firebaseConfigured) && (
            <p
              role="status"
              className="mt-4 rounded-xl border border-input bg-white/5 p-4 text-sm leading-relaxed text-muted-foreground"
            >
              {status || configurationMessage}
            </p>
          )}
        </form>

        <footer className="mt-6 text-center text-sm leading-relaxed text-muted-foreground">
          Tài khoản được cung cấp bởi giáo viên.{" "}
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="cursor-pointer font-semibold text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                Liên hệ
              </button>
            </DialogTrigger>
            <DialogContent className="login-page">
              <DialogTitle className="text-2xl font-semibold">
                Hỗ trợ đăng nhập
              </DialogTitle>
              <DialogDescription>
                Vui lòng liên hệ giáo viên phụ trách lớp để được cấp tài khoản
                hoặc hỗ trợ đăng nhập.
              </DialogDescription>
              <DialogClose asChild>
                <Button className="mt-6">Đã hiểu</Button>
              </DialogClose>
            </DialogContent>
          </Dialog>
        </footer>
      </div>
    </main>
  );
}
