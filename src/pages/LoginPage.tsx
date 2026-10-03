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
  const [submitted, setSubmitted] = useState(false);
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = {
      username: username.trim() ? "" : "Vui lòng nhập tên đăng nhập.",
      password: password ? "" : "Vui lòng nhập mật khẩu.",
    };
    setErrors(nextErrors);
    setSubmitted(false);
    if (nextErrors.username) {
      usernameRef.current?.focus();
      return;
    }
    if (nextErrors.password) {
      passwordRef.current?.focus();
      return;
    }
    // This frontend form does not send credentials or simulate authentication.
    setSubmitted(true);
  }

  return (
    <main className="login-page flex min-h-svh flex-col items-center justify-center bg-background px-6 py-10 text-foreground sm:py-12">
      <div className="w-full max-w-[432px]">
        <header className="text-center">
          <div className="mb-6 text-[48px] leading-none" aria-hidden="true">
            🎓
          </div>
          <a
            href={import.meta.env.BASE_URL}
            className="inline-block rounded-sm text-[28px] font-bold leading-tight tracking-[-0.055em] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            PHQ Education
          </a>
          <div
            className="mx-auto mb-9 mt-6 h-[3px] w-[50px] rounded-full bg-neutral-800"
            aria-hidden="true"
          />
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.045em]">
            Đăng nhập
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            Chào mừng bạn quay trở lại!
          </p>
        </header>

        <form className="mt-9" onSubmit={handleSubmit} noValidate>
          <div>
            <label
              htmlFor="login-username"
              className="mb-2 block text-[15px] text-muted-foreground"
            >
              Tên đăng nhập
            </label>
            <div className="relative">
              <UserRound
                className="pointer-events-none absolute left-[18px] top-1/2 size-5 -translate-y-1/2 text-neutral-400"
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
                  setSubmitted(false);
                }}
                className="login-input h-[62px] w-full rounded-[14px] border border-input bg-neutral-100 py-4 pl-[52px] pr-4 text-base outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-500 focus:ring-2 focus:ring-black/5"
                required
                aria-invalid={Boolean(errors.username)}
                aria-describedby={
                  errors.username ? "username-error" : undefined
                }
              />
            </div>
            {errors.username && (
              <p id="username-error" className="mt-2 text-sm text-red-600">
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
                className="pointer-events-none absolute left-[18px] top-1/2 size-5 -translate-y-1/2 text-neutral-400"
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
                  setSubmitted(false);
                }}
                className="login-input h-[62px] w-full rounded-[14px] border border-input bg-neutral-100 py-4 pl-[52px] pr-[54px] text-base outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-500 focus:ring-2 focus:ring-black/5"
                required
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password ? "password-error" : undefined
                }
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-neutral-400 outline-none transition-colors hover:text-neutral-700 focus-visible:ring-2 focus-visible:ring-ring"
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
              <p id="password-error" className="mt-2 text-sm text-red-600">
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
              className="size-4 cursor-pointer rounded border-input accent-black"
            />
            Ghi nhớ tài khoản
          </label>

          <Button
            type="submit"
            className="mt-8 h-[62px] w-full rounded-[14px] bg-black text-[17px] font-semibold text-white hover:bg-neutral-800"
          >
            Đăng nhập <ArrowRight className="ml-1 size-5" />
          </Button>

          {submitted && (
            <p
              role="status"
              className="mt-4 rounded-xl border border-input bg-neutral-100 p-4 text-sm leading-relaxed text-neutral-600"
            >
              Đây là form giao diện mẫu. Chức năng xác thực tài khoản chưa được
              kết nối.
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

        <a
          href={import.meta.env.BASE_URL}
          className="mx-auto mt-7 flex w-fit items-center gap-2 rounded-sm text-xs text-neutral-400 outline-none transition-colors hover:text-neutral-700 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" /> Về trang chủ
        </a>
      </div>
    </main>
  );
}
