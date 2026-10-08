import { useRef, useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { quizHref, type QuizSummary } from "@/lib/quizzes";

export default function QuizShareLink({
  quiz,
  disabled = false,
}: {
  quiz: Pick<QuizSummary, "id" | "subject" | "title">;
  disabled?: boolean;
}) {
  const link = new URL(quizHref(quiz), window.location.href).href;
  const anchor = useRef<HTMLAnchorElement>(null);
  const [copying, setCopying] = useState(false);
  const [status, setStatus] = useState<{ link: string; copied: boolean }>();
  const copied = status?.link === link && status.copied;

  async function copyLink() {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(link);
      setStatus({ link, copied: true });
    } catch {
      if (anchor.current) {
        const range = document.createRange();
        range.selectNodeContents(anchor.current);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setStatus({ link, copied: false });
    } finally {
      setCopying(false);
    }
  }

  return (
    <section
      aria-label={`Chia sẻ bài tập ${quiz.title}`}
      className="mt-4 min-w-0 rounded-xl border border-sky-200 bg-sky-50/60 p-4"
    >
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-sky-900">
        <Link2 className="size-4 shrink-0" />
        Liên kết gửi học sinh
      </p>
      <a
        ref={anchor}
        href={link}
        target="_blank"
        rel="noreferrer"
        aria-label={`Liên kết trực tiếp bài tập ${quiz.title}`}
        className="block text-sm leading-relaxed text-sky-800 underline underline-offset-4 [overflow-wrap:anywhere]"
      >
        {link}
      </a>
      <button
        type="button"
        className="account-button-secondary mt-3 text-xs"
        aria-label={`Sao chép liên kết bài tập ${quiz.title}`}
        disabled={disabled || copying}
        onClick={() => void copyLink()}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copying
          ? "Đang sao chép…"
          : copied
            ? "Đã sao chép"
            : "Sao chép liên kết"}
      </button>
      {status?.link === link && (
        <p
          role="status"
          className={`mt-2 text-xs leading-relaxed ${copied ? "text-emerald-800" : "text-slate-600"}`}
        >
          {copied
            ? "Đã sao chép liên kết. Bạn có thể dán để gửi cho học sinh."
            : "Hãy sao chép đường link đã được chọn bên trên để gửi cho học sinh."}
        </p>
      )}
    </section>
  );
}
