import { useEffect, useRef, useState } from "react";
import { Menu, Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  "Reach Us": {
    title: "Every idea starts with a conversation.",
    description:
      "A place to connect with the studio. This is a frontend design preview; contact details and message delivery can be connected when you are ready.",
  },
  Journey: {
    title: "Your next chapter begins here.",
    description:
      "Make space for deep focus and inspired work. This is an interactive design preview of Velorah — a starting point for the experience you will build next.",
  },
};

type Section = keyof typeof sections;
const navigation: Section[] = ["Studio", "About", "Journal", "Reach Us"];

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mobileMenuRef = useRef<HTMLDetailsElement>(null);
  const mobileDialogRef = useRef(false);
  const manualPlaybackRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [section, setSection] = useState<Section>("Journey");

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

  function selectSection(value: Section) {
    mobileDialogRef.current = mobileMenuRef.current?.open ?? false;
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

        <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-8 py-6">
          <a
            href="#home"
            className="text-3xl tracking-tight text-foreground outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
            style={displayFont}
            aria-label="Velorah home"
          >
            Velorah<sup className="ml-0.5 text-xs">®</sup>
          </a>

          <nav
            aria-label="Main navigation"
            className="liquid-glass hidden items-center gap-7 rounded-full px-7 py-3 md:flex"
          >
            <a
              href="#home"
              aria-current="page"
              className="text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            >
              Home
            </a>
            {navigation.map((item) => (
              <DialogTrigger key={item} asChild>
                <button
                  type="button"
                  onClick={() => selectSection(item)}
                  className="cursor-pointer text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {item}
                </button>
              </DialogTrigger>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <DialogTrigger asChild>
              <Button
                variant="glass"
                size="glass"
                onClick={() => selectSection("Journey")}
                className="max-sm:px-4"
              >
                Begin Journey
              </Button>
            </DialogTrigger>
            <details
              ref={mobileMenuRef}
              className="mobile-navigation md:hidden"
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
              <div className="absolute right-8 top-22">
                <nav
                  aria-label="Mobile navigation"
                  className="liquid-glass flex w-48 flex-col gap-1 rounded-2xl p-3"
                >
                  <a
                    href="#home"
                    aria-current="page"
                    onClick={() => {
                      if (mobileMenuRef.current)
                        mobileMenuRef.current.open = false;
                    }}
                    className="rounded-lg px-4 py-2.5 text-sm text-foreground"
                  >
                    Home
                  </a>
                  {navigation.map((item) => (
                    <DialogTrigger key={item} asChild>
                      <button
                        type="button"
                        onClick={() => selectSection(item)}
                        className="cursor-pointer rounded-lg px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {item}
                      </button>
                    </DialogTrigger>
                  ))}
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
            className="animate-fade-rise max-w-7xl text-5xl font-normal leading-[0.95] tracking-[-2.46px] text-foreground sm:text-7xl md:text-8xl"
            style={displayFont}
          >
            Học hỏi không phải là công việc của tuổi trẻ;
            <br />
            <em className="not-italic text-muted-foreground">
              đó là công việc của cả đời
            </em>
          </h1>
          <p className="animate-fade-rise-delay mt-8 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            We&apos;re designing tools for deep thinkers, bold creators, and
            quiet rebels. Amid the chaos, we build digital spaces for sharp
            focus and inspired work.
          </p>
          <div className="animate-fade-rise-delay-2 mt-12">
            <DialogTrigger asChild>
              <Button
                variant="glass"
                size="hero"
                onClick={() => selectSection("Journey")}
              >
                Begin Journey
              </Button>
            </DialogTrigger>
          </div>
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
      </main>

      <DialogContent
        onCloseAutoFocus={(event) => {
          if (mobileDialogRef.current) {
            event.preventDefault();
            mobileMenuRef.current?.querySelector("summary")?.focus();
          }
        }}
      >
        <p className="mb-5 text-xs tracking-[0.18em] text-muted-foreground">
          VELORAH ·{" "}
          {section === "Journey" ? "BEGIN JOURNEY" : section.toUpperCase()}
        </p>
        <DialogTitle style={displayFont}>{sections[section].title}</DialogTitle>
        <DialogDescription>{sections[section].description}</DialogDescription>
        <DialogClose asChild>
          <Button variant="glass" size="glass" className="mt-8">
            Back to the moment
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
