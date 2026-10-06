import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
import { accountError, type AccountProfile } from "@/lib/accounts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

type AccountView = "profile" | "account" | null;
const roleLabel = (profile: AccountProfile) =>
  profile.role === "admin" ? "Quản trị viên" : "Học sinh";

export function AccountDetails({
  profile,
  view,
  onViewChange,
  triggerRef,
  light = false,
}: {
  profile: AccountProfile;
  view: AccountView;
  onViewChange: (view: AccountView) => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  light?: boolean;
}) {
  return (
    <Dialog
      open={Boolean(view)}
      onOpenChange={(open) => !open && onViewChange(null)}
    >
      <DialogContent
        className={`${light ? "account-page" : "login-page"} max-h-[calc(100svh-2rem)] overflow-y-auto`}
        onCloseAutoFocus={(event) => {
          if (triggerRef?.current?.isConnected) {
            event.preventDefault();
            triggerRef.current.focus();
          }
        }}
      >
        <DialogTitle className="pr-8 text-2xl font-semibold">
          {view === "account" ? "Tài khoản" : "Hồ sơ cá nhân"}
        </DialogTitle>
        <DialogDescription>
          {view === "account"
            ? "Thông tin tài khoản đăng nhập của bạn."
            : "Thông tin cá nhân do giáo viên cấp trong hệ thống PHQ Education."}
        </DialogDescription>
        <dl className="mt-6 space-y-4 text-sm">
          {(view === "account"
            ? [
                ["Tên đăng nhập", `@${profile.username}`],
                ["Vai trò", roleLabel(profile)],
                [
                  "Trạng thái",
                  profile.status === "active" ? "Đang hoạt động" : "Đã khóa",
                ],
              ]
            : [
                ["Họ và tên", profile.displayName],
                ["Vai trò", roleLabel(profile)],
                ...(profile.createdAt?.toDate
                  ? [[
                      "Ngày cấp tài khoản",
                      profile.createdAt.toDate().toLocaleDateString("vi-VN", {
                        timeZone: "Asia/Ho_Chi_Minh",
                      }),
                    ]]
                  : []),
              ]
          ).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-current/15 p-4">
              <dt className="mb-1 text-xs opacity-70">{label}</dt>
              <dd className="break-words font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        {view === "account" && (
          <p className="mt-5 text-sm leading-relaxed opacity-75">
            Cần chỉnh sửa thông tin hoặc cấp lại mật khẩu? Liên hệ giáo viên
            quản lý tài khoản.
          </p>
        )}
        {profile.role === "admin" && (
          <a
            href={`${import.meta.env.BASE_URL}quan-tri.html`}
            className="mt-5 inline-flex rounded-xl border border-current/20 px-4 py-3 text-sm font-semibold hover:bg-current/5"
          >
            Trang quản trị
          </a>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AccountMenu({
  profile,
  onLogout,
  disabled = false,
  light = false,
  className = "",
}: {
  profile: AccountProfile;
  onLogout?: () => Promise<void>;
  disabled?: boolean;
  light?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<AccountView>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hovered = useRef(false);
  const menuId = useId();
  const unavailable = disabled || loggingOut;

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function focusItem(last = false) {
    setOpen(true);
    requestAnimationFrame(() => {
      const items = menuRef.current?.querySelectorAll<HTMLButtonElement>(
        "[role=menuitem]:not(:disabled)",
      );
      items?.[last ? items.length - 1 : 0]?.focus();
    });
  }

  async function logout() {
    if (!onLogout || unavailable) return;
    setLoggingOut(true);
    setError("");
    try {
      await onLogout();
    } catch (failure) {
      setError(accountError(failure));
      setOpen(true);
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className={`relative min-w-0 max-w-full ${className}`}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse" && !unavailable && !view) {
          hovered.current = true;
          setOpen(true);
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") {
          hovered.current = false;
          if (!menuRef.current?.contains(document.activeElement) && !loggingOut)
            setOpen(false);
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Menu tài khoản của ${profile.displayName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={unavailable}
        onClick={(event) => {
          if (event.detail === 0) focusItem();
          else setOpen((current) => hovered.current || !current);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            focusItem(event.key === "ArrowUp");
          }
        }}
        className={`flex max-w-full items-center gap-2.5 rounded-2xl px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-60 ${light ? "text-[#002b42] hover:bg-slate-200/60" : "text-white hover:bg-white/10"}`}
      >
        <span className="min-w-0 max-w-48">
          <span className="block truncate text-sm font-semibold sm:text-base">
            {profile.displayName}
          </span>
          <span
            className={`block text-xs ${light ? "text-slate-600" : "text-sky-100/80"}`}
          >
            {roleLabel(profile)}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`size-3.5 shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 w-60 max-w-[calc(100vw-2rem)] pt-2 sm:left-auto sm:right-0">
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label="Menu tài khoản"
            className="rounded-2xl border border-slate-200 bg-white p-2 text-[#002b42] shadow-xl"
            onKeyDown={(event) => {
              if (event.key === "Tab") {
                setOpen(false);
                return;
              }
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
                return;
              event.preventDefault();
              const items = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "[role=menuitem]:not(:disabled)",
                ),
              );
              const index = items.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
              items[next]?.focus();
            }}
          >
            {([
              ["profile", "Hồ sơ cá nhân", UserRound],
              ["account", "Tài khoản", Settings],
            ] as const).map(([target, label, Icon]) => (
              <button
                key={target}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                onClick={() => {
                  setOpen(false);
                  setView(target);
                }}
              >
                <Icon aria-hidden="true" className="size-4 text-slate-500" />
                {label}
              </button>
            ))}
            <div className="my-1 border-t border-slate-100" />
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={unavailable || !onLogout}
              onClick={() => void logout()}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50 focus:bg-red-50 focus:outline-none disabled:opacity-50"
            >
              <LogOut aria-hidden="true" className="size-4" />
              {loggingOut ? "Đang đăng xuất…" : "Đăng xuất"}
            </button>
            {error && (
              <p role="alert" className="px-3 py-2 text-xs leading-relaxed text-red-700">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
      <AccountDetails
        profile={profile}
        view={view}
        onViewChange={setView}
        triggerRef={triggerRef}
        light={light}
      />
    </div>
  );
}
