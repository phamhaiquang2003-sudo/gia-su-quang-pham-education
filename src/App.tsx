import { useEffect, useRef, useState } from "react";
import { LoaderCircle, LockKeyhole, Menu, Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { accountError, type AccountProfile } from "@/lib/accounts";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4";
const ZALO_CONTACT_URL = "https://zalo.me/0365900419";
const displayFont = { fontFamily: "'Instrument Serif', serif" };

const sections = {
  Studio: {
    title: "Room for a different kind of work.",
    description:
      "A studio for deep thinkers, bold creators, and quiet rebels. We explore thoughtful digital experiences that help ideas find their shape.",
  },
  About: {
    title: "Less noise. More possibility.",
    description:
      "Velorah is a concept for intentional digital spaces. We believe the best ideas begin when you have the space to listen, explore, and create.",
  },
  Journal: {
    title: "Notes from the quiet.",
    description:
      "Reflections on focus, creativity, and the spaces in between. This journal is part of the design concept; new stories can live here as the project grows.",
  },
  Assessments: {
    title: "Luyện thi TSA/HSA/SPT",
    description:
      "Mục dành cho tài liệu và bài luyện đánh giá tư duy, đánh giá năng lực TSA, HSA và SPT.",
  },
  Entertainment: {
    title: "Góc giải trí",
    description: "Mục dành cho các hoạt động thư giãn và giải trí sau giờ học.",
  },
};

type Section = keyof typeof sections;
const navigation: Section[] = [
  "Studio",
  "About",
  "Journal",
  "Assessments",
  "Entertainment",
];
const navigationLabels: Record<Section, string> = {
  Studio: "Toán",
  About: "Vật lý",
  Journal: "KHTN",
  Assessments: "TSA/HSA/SPT",
  Entertainment: "Giải trí",
};

interface AppProps {
  profile?: AccountProfile | null;
  accountLoading?: boolean;
  accountMessage?: string;
  onLogout?: () => Promise<void>;
}

export default function App({
  profile = null,
  accountLoading = false,
  accountMessage = "",
  onLogout,
}: AppProps = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mobileMenuRef = useRef<HTMLDetailsElement>(null);
  const mobileDialogRef = useRef(false);
  const sectionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const loginLinkRef = useRef<HTMLAnchorElement | null>(null);
  const accountTriggerRef = useRef<HTMLButtonElement | null>(null);
  const manualPlaybackRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [section, setSection] = useState<Section>("Studio");
  const [accountOpen, setAccountOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const greeting = profile ? `Xin chào, ${profile.displayName}` : "Đăng nhập";
  const desktopBreakpoint = profile ? "min-[1440px]:flex" : "lg:flex";
  const mobileBreakpoint = profile ? "min-[1440px]:hidden" : "lg:hidden";
  const requiresLogin = !profile;

  useEffect(() => {
    if (!profile) setAccountOpen(false);
  }, [profile]);

  async function logout() {
    if (!onLogout || loggingOut) return;
    setLoggingOut(true);
    setLogoutError("");
    try {
      await onLogout();
    } catch (error) {
      setLogoutError(accountError(error));
    } finally {
      setLoggingOut(false);
    }
  }

  function accountAction(hero = false) {
    const classes = hero
      ? "max-w-[calc(100vw-3rem)] whitespace-normal break-words"
      : "min-w-0 max-w-[22rem] shrink whitespace-normal break-words leading-snug max-sm:flex-1 max-sm:px-4 max-sm:text-xs";
    if (profile) {
      if (!hero) {
        return (
          <Button
            variant="glass"
            size="glass"
            className={classes}
            onClick={() => void logout()}
            disabled={loggingOut || !onLogout}
          >
            {loggingOut ? "Đang đăng xuất…" : "Đăng xuất"}
          </Button>
        );
      }
      return (
        <Button
          variant="glass"
          size={hero ? "hero" : "glass"}
          className={classes}
          onClick={(event) => {
            accountTriggerRef.current = event.currentTarget;
            setLogoutError("");
            setAccountOpen(true);
          }}
          aria-haspopup="dialog"
        >
          {greeting}
        </Button>
      );
    }
    if (accountLoading) {
      return (
        <Button
          variant="glass"
          size={hero ? "hero" : "glass"}
          className={hero ? "" : "max-sm:px-4"}
          disabled
          aria-busy="true"
        >
          Đang kiểm tra…
        </Button>
      );
    }
    return (
      <Button
        asChild
        variant="glass"
        size={hero ? "hero" : "glass"}
        className={hero ? "" : "max-sm:px-4"}
      >
        <a href={`${import.meta.env.BASE_URL}dang-nhap.html`}>Đăng nhập</a>
      </Button>
    );
  }

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const respectMotionPreference = () => {
      if (preference.matches) {
        manualPlaybackRef.current = false;
        videoRef.current?.pause();
      }
    };
    respectMotionPreference();
    preference.addEventListener("change", respectMotionPreference);
    return () =>
      preference.removeEventListener("change", respectMotionPreference);
  }, []);

  function selectSection(value: Section, trigger: HTMLButtonElement) {
    mobileDialogRef.current = mobileMenuRef.current?.open ?? false;
    sectionTriggerRef.current = trigger;
    setSection(value);
    if (mobileMenuRef.current) mobileMenuRef.current.open = false;
  }

  async function toggleVideo() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      manualPlaybackRef.current = true;
      try {
        await video.play();
      } catch {
        setPlaying(false);
      }
    } else {
      video.pause();
    }
  }

  return (
    <>
      <Dialog>
        <main
          id="home"
          className="relative isolate flex min-h-svh flex-col overflow-hidden bg-background"
        >
          <video
            ref={videoRef}
            className="absolute inset-0 z-0 h-full w-full object-cover"
            src={VIDEO_URL}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            aria-hidden="true"
            onPlay={(event) => {
              if (
                window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
                !manualPlaybackRef.current
              ) {
                event.currentTarget.pause();
              } else {
                setPlaying(true);
              }
            }}
            onPause={() => setPlaying(false)}
            onError={() => setVideoFailed(true)}
          />

          <header
            className={`relative z-20 mx-auto flex w-full items-center justify-between gap-4 py-6 ${profile ? "max-w-[1600px] flex-wrap px-4 sm:flex-nowrap sm:px-8" : "max-w-7xl px-8"}`}
          >
            <a
              href="#home"
              className="shrink-0 text-3xl tracking-tight text-foreground outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
              style={displayFont}
              aria-label="LumenPelagi home"
            >
              LumenPelagi<sup className="ml-0.5 text-xs">®</sup>
            </a>

            <nav
              aria-label="Main navigation"
              className={`liquid-glass hidden shrink-0 items-center gap-4 whitespace-nowrap rounded-full px-5 py-3 ${desktopBreakpoint} xl:gap-7 xl:px-7`}
            >
              <a
                href="#home"
                aria-current="page"
                className="text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
              >
                Trang chủ
              </a>
              {navigation.map((item) => (
                <DialogTrigger key={item} asChild>
                  <button
                    type="button"
                    onClick={(event) =>
                      selectSection(item, event.currentTarget)
                    }
                    className="cursor-pointer text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {navigationLabels[item]}
                  </button>
                </DialogTrigger>
              ))}
              <a
                href={ZALO_CONTACT_URL}
                className="text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                Liên hệ gia sư
              </a>
            </nav>

            <div
              className={`flex min-w-0 items-center gap-3 ${profile ? "w-full justify-between sm:w-auto" : ""}`}
            >
              {accountAction()}
              <details
                ref={mobileMenuRef}
                className={`mobile-navigation shrink-0 ${mobileBreakpoint}`}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && mobileMenuRef.current) {
                    mobileMenuRef.current.open = false;
                    mobileMenuRef.current.querySelector("summary")?.focus();
                  }
                }}
              >
                <summary
                  className="liquid-glass flex size-10 cursor-pointer items-center justify-center rounded-full text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Toggle navigation"
                >
                  <Menu className="menu-open-icon size-4" />
                  <X className="menu-close-icon size-4" />
                </summary>
                <div
                  className={
                    profile
                      ? "absolute right-4 top-full sm:right-8"
                      : "absolute right-8 top-22"
                  }
                >
                  <nav
                    aria-label="Mobile navigation"
                    className="liquid-glass flex w-56 flex-col gap-1 rounded-2xl p-3"
                  >
                    <a
                      href="#home"
                      aria-current="page"
                      onClick={() => {
                        if (mobileMenuRef.current)
                          mobileMenuRef.current.open = false;
                      }}
                      className="shrink-0 rounded-lg px-4 py-2.5 text-sm text-foreground"
                    >
                      Trang chủ
                    </a>
                    {navigation.map((item) => (
                      <DialogTrigger key={item} asChild>
                        <button
                          type="button"
                          onClick={(event) =>
                            selectSection(item, event.currentTarget)
                          }
                          className="shrink-0 cursor-pointer rounded-lg px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {navigationLabels[item]}
                        </button>
                      </DialogTrigger>
                    ))}
                    <a
                      href={ZALO_CONTACT_URL}
                      onClick={() => {
                        if (mobileMenuRef.current)
                          mobileMenuRef.current.open = false;
                      }}
                      className="shrink-0 rounded-lg px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Liên hệ gia sư
                    </a>
                  </nav>
                </div>
              </details>
            </div>
          </header>

          <section
            aria-labelledby="hero-title"
            className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-40 pt-32 text-center md:py-[90px]"
          >
            <h1
              id="hero-title"
              className="animate-fade-rise w-full max-w-7xl text-[clamp(1rem,5vw,4.5rem)] font-normal leading-[1.15] tracking-[-0.02em] text-foreground"
              style={displayFont}
            >
              <span className="block whitespace-nowrap">
                Học hỏi không phải là công việc của tuổi trẻ;
              </span>{" "}
              <span className="block whitespace-nowrap">
                đó là công việc của cả đời
              </span>
            </h1>
            <div className="animate-fade-rise-delay-2 mt-12">
              {accountAction(true)}
            </div>
            {accountMessage && (
              <p
                role="status"
                className="mt-5 max-w-xl rounded-xl border border-white/20 bg-background/75 p-4 text-sm leading-relaxed text-foreground backdrop-blur-md"
              >
                {accountMessage}
              </p>
            )}
          </section>

          {!videoFailed && (
            <div className="absolute bottom-6 right-8 z-10">
              <Button
                variant="glass"
                size="icon"
                className="text-white/70 hover:text-white"
                onClick={toggleVideo}
                aria-label={
                  playing ? "Pause background video" : "Play background video"
                }
              >
                {playing ? <Pause /> : <Play />}
              </Button>
            </div>
          )}
          {logoutError && !accountOpen && (
            <p
              role="alert"
              className="mt-5 max-w-xl rounded-xl border border-white/20 bg-background/75 p-4 text-sm text-red-300 backdrop-blur-md"
            >
              {logoutError}
            </p>
          )}
        </main>

        <DialogContent
          className={
            requiresLogin
              ? "max-h-[calc(100svh-2rem)] overflow-y-auto border-amber-300/60 bg-[#002b42] p-6 text-center shadow-[0_0_80px_rgba(251,191,36,0.2)] sm:p-10"
              : undefined
          }
          onOpenAutoFocus={(event) => {
            if (requiresLogin && loginLinkRef.current) {
              event.preventDefault();
              loginLinkRef.current.focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            if (mobileDialogRef.current) {
              event.preventDefault();
              mobileMenuRef.current?.querySelector("summary")?.focus();
            } else if (sectionTriggerRef.current?.isConnected) {
              event.preventDefault();
              sectionTriggerRef.current.focus();
            }
          }}
        >
          <p
            className={`mb-5 text-xs tracking-[0.18em] ${requiresLogin ? "pr-4 text-amber-200" : "text-muted-foreground"}`}
          >
            PHQ EDUCATION · {navigationLabels[section].toUpperCase()}
          </p>
          {requiresLogin ? (
            <>
              <div
                className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-300/15 text-amber-300"
                aria-hidden="true"
              >
                {accountLoading ? (
                  <LoaderCircle className="size-8 motion-safe:animate-spin" />
                ) : (
                  <LockKeyhole className="size-8" />
                )}
              </div>
              <DialogTitle className="text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl">
                {accountLoading
                  ? "Đang kiểm tra đăng nhập…"
                  : "Bạn cần đăng nhập để tiếp tục"}
              </DialogTitle>
              <DialogDescription className="mt-4 text-base leading-relaxed text-slate-200">
                {accountLoading
                  ? "Vui lòng chờ trong giây lát."
                  : `Vui lòng đăng nhập bằng tài khoản được giáo viên cấp để truy cập mục ${navigationLabels[section]}.`}
              </DialogDescription>
              <div className="mt-8 flex flex-col gap-3">
                {!accountLoading && (
                  <Button
                    asChild
                    className="h-auto rounded-xl bg-amber-300 px-6 py-3.5 text-base font-semibold text-slate-950 shadow-lg hover:bg-amber-200 focus-visible:ring-amber-300"
                  >
                    <a
                      ref={loginLinkRef}
                      href={`${import.meta.env.BASE_URL}dang-nhap.html`}
                    >
                      Đăng nhập ngay
                    </a>
                  </Button>
                )}
                <DialogClose asChild>
                  <Button
                    variant="ghost"
                    className="h-auto rounded-xl py-3 text-slate-200 hover:bg-white/10 hover:text-white"
                  >
                    Để sau
                  </Button>
                </DialogClose>
              </div>
            </>
          ) : (
            <>
              <DialogTitle style={displayFont}>
                {sections[section].title}
              </DialogTitle>
              <DialogDescription>
                {sections[section].description}
              </DialogDescription>
              <DialogClose asChild>
                <Button variant="glass" size="glass" className="mt-8">
                  Back to the moment
                </Button>
              </DialogClose>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={accountOpen && Boolean(profile)}
        onOpenChange={setAccountOpen}
      >
        <DialogContent
          className="login-page"
          onCloseAutoFocus={(event) => {
            if (accountTriggerRef.current?.isConnected) {
              event.preventDefault();
              accountTriggerRef.current.focus();
            }
          }}
        >
          <DialogTitle className="break-words text-2xl">{greeting}</DialogTitle>
          <DialogDescription className="break-words">
            Bạn đang đăng nhập bằng tài khoản @{profile?.username}.
          </DialogDescription>
          {profile?.role === "admin" && (
            <Button asChild variant="glass">
              <a href={`${import.meta.env.BASE_URL}quan-tri.html`}>
                Trang quản trị
              </a>
            </Button>
          )}
          {logoutError && (
            <p role="alert" className="text-sm text-red-300">
              {logoutError}
            </p>
          )}
          <Button
            variant="glass"
            onClick={() => void logout()}
            disabled={loggingOut || !onLogout}
          >
            {loggingOut ? "Đang đăng xuất…" : "Đăng xuất"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
