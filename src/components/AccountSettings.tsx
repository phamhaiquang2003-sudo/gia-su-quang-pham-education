import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  accountError,
  changeOwnPassword,
  type AccountProfile,
} from "@/lib/accounts";

export default function AccountSettings({
  profile,
  light = false,
}: {
  profile: AccountProfile;
  light?: boolean;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const helpId = useId();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await changeOwnPassword(profile.uid, currentPassword, newPassword);
      if (!mounted.current) return;
      setCurrentPassword("");
      setNewPassword("");
      setShowCurrent(false);
      setShowNew(false);
      setMessage(
        "Đã đổi mật khẩu thành công. Hãy dùng mật khẩu mới cho lần đăng nhập tiếp theo.",
      );
    } catch (failure) {
      if (mounted.current) setError(accountError(failure));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const inputClass = light
    ? "account-input pr-12"
    : "mt-2 block w-full rounded-xl border border-white/25 bg-white/5 px-4 py-3 pr-12 text-base text-white outline-none focus:border-sky-200 focus:ring-2 focus:ring-sky-200/30";

  return (
    <div className="mt-6 space-y-6">
      <section aria-labelledby={`${helpId}-password`}>
        <h3 id={`${helpId}-password`} className="mb-4 font-semibold">
          Đổi mật khẩu
        </h3>
        <form onSubmit={changePassword} aria-busy={busy}>
          <fieldset disabled={busy} className="space-y-4">
            {([
              [
                "current", "Mật khẩu hiện tại", currentPassword,
                setCurrentPassword, showCurrent, setShowCurrent,
              ],
              [
                "new", "Mật khẩu mới", newPassword,
                setNewPassword, showNew, setShowNew,
              ],
            ] as const).map(([kind, label, value, setValue, shown, setShown]) => (
              <label key={kind} className="block text-sm font-medium">
                {label}
                <div className="relative">
                  <input
                    className={inputClass}
                    type={shown ? "text" : "password"}
                    name={`${kind}-password`}
                    autoComplete={`${kind}-password`}
                    value={value}
                    onChange={(event) => {
                      setValue(event.target.value);
                      setError("");
                      setMessage("");
                    }}
                    minLength={kind === "new" ? 8 : undefined}
                    maxLength={128}
                    aria-describedby={kind === "new" ? helpId : undefined}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 opacity-75 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2"
                    aria-label={`${shown ? "Ẩn" : "Hiện"} ${kind === "current" ? "mật khẩu hiện tại" : "mật khẩu mới"}`}
                    onClick={() => setShown((previous) => !previous)}
                  >
                    {shown ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </label>
            ))}
            <p id={helpId} className="text-xs leading-relaxed opacity-70">
              Mật khẩu mới từ 8 đến 128 ký tự.
            </p>
            <button
              type="submit"
              className={light ? "account-button min-h-11 w-full" : "min-h-11 w-full rounded-xl bg-amber-300 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-200 disabled:opacity-60"}
            >
              {busy ? "Đang đổi mật khẩu…" : "Lưu mật khẩu mới"}
            </button>
          </fieldset>
          {error && (
            <p role="alert" className={`mt-4 text-sm ${light ? "text-red-700" : "text-red-300"}`}>
              {error}
            </p>
          )}
          {message && (
            <p role="status" className={`mt-4 text-sm ${light ? "text-emerald-700" : "text-emerald-200"}`}>
              {message}
            </p>
          )}
        </form>
      </section>
      <section
        aria-labelledby={`${helpId}-information`}
        className="border-t border-current/15 pt-5"
      >
        <h3 id={`${helpId}-information`} className="mb-4 font-semibold">
          Thông tin tài khoản
        </h3>
        <dl className="space-y-4 text-sm">
          {[
            ["Tên hiển thị", profile.displayName],
            ["Tên đăng nhập", profile.username],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-current/15 p-4">
              <dt className="mb-1 text-xs opacity-70">{label}</dt>
              <dd className="break-words font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
