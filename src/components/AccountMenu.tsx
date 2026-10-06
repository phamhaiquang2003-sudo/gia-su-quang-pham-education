import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
import { accountError, type AccountProfile } from "@/lib/accounts";
import AccountSettings from "./AccountSettings";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

type AccountView = "account" | null;
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
          Tài khoản
        </DialogTitle>
        <DialogDescription>
          Thông tin tài khoản đăng nhập của bạn.
        </DialogDescription>
        {view === "account" && (
          <AccountSettings key={profile.uid} profile={profile} light={light} />
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
      const items = menuRef.current?.querySelectorAll<HTMLElement>(
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
        className={`flex min-h-11 max-w-full cursor-pointer items-center gap-2.5 rounded-full px-6 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-60 ${light ? "border border-slate-200 bg-white text-[#002b42] hover:bg-slate-100" : "liquid-glass text-white hover:bg-white/10"}`}
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
            className={`rounded-2xl p-2 shadow-xl ${light ? "border border-slate-200/50 bg-white/10 text-[#002b42] backdrop-blur-sm" : "liquid-glass text-white text-shadow-sm"}`}
            onKeyDown={(event) => {
              if (event.key === "Tab") {
                setOpen(false);
                return;
              }
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
                return;
              event.preventDefault();
              const items = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(
                  "[role=menuitem]:not(:disabled)",
                ),
              );
              const index = items.indexOf(
                document.activeElement as HTMLElement,
              );
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : (index +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        items.length) %
                      items.length;
              items[next]?.focus();
            }}
          >
            {(
              [
                ["profile", "Hồ sơ cá nhân", UserRound],
                ["account", "Tài khoản", Settings],
              ] as const
            ).map(([target, label, Icon]) =>
              target === "profile" ? (
                <a
                  key={target}
                  href={`${import.meta.env.BASE_URL}ho-so.html`}
                  role="menuitem"
                  tabIndex={-1}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm focus:outline-none ${light ? "hover:bg-slate-200/30 focus:bg-slate-200/30" : "hover:bg-white/10 focus:bg-white/10"}`}
                >
                  <Icon
                    aria-hidden="true"
                    className={`size-4 ${light ? "text-slate-500" : "text-white/75"}`}
                  />
                  {label}
                </a>
              ) : (
                <button
                  key={target}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm focus:outline-none ${light ? "hover:bg-slate-200/30 focus:bg-slate-200/30" : "hover:bg-white/10 focus:bg-white/10"}`}
                  onClick={() => {
                    setOpen(false);
                    setView(target);
                  }}
                >
                  <Icon
                    aria-hidden="true"
                    className={`size-4 ${light ? "text-slate-500" : "text-white/75"}`}
                  />
                  {label}
                </button>
              ),
            )}
            <div
              className={`my-1 border-t ${light ? "border-slate-200/50" : "border-white/15"}`}
            />
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={unavailable || !onLogout}
              onClick={() => void logout()}
              className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm focus:outline-none disabled:opacity-50 ${light ? "text-red-700 hover:bg-red-100/30 focus:bg-red-100/30" : "text-red-300 hover:bg-red-300/10 focus:bg-red-300/10"}`}
            >
              <LogOut aria-hidden="true" className="size-4" />
              {loggingOut ? "Đang đăng xuất…" : "Đăng xuất"}
            </button>
            {error && (
              <p
                role="alert"
                className={`px-3 py-2 text-xs leading-relaxed ${light ? "text-red-700" : "text-red-200"}`}
              >
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
