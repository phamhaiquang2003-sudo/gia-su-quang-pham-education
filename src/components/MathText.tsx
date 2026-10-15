import { Fragment, type ReactNode } from "react";

/** Matches `\frac{numerator}{denominator}` (no nested braces). */
const FRACTION = /\\frac\{([^{}]*)\}\{([^{}]*)\}/g;

/**
 * Renders plain quiz text, turning `\frac{a}{b}` into a stacked fraction
 * (numerator over denominator with a rule between them). Any text without
 * that markup renders exactly as before, so existing quizzes are unchanged.
 */
export default function MathText({ text }: { text: string }) {
  if (!text.includes("\\frac{")) return <>{text}</>;
  const parts: ReactNode[] = [];
  let cursor = 0;
  let index = 0;
  FRACTION.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FRACTION.exec(text)) !== null) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    parts.push(
      <span
        key={`fraction-${index}`}
        data-math="fraction"
        className="mx-1 inline-grid items-center align-middle text-[0.95em] leading-tight"
      >
        <span className="px-2 text-center">{match[1]}</span>
        <span className="border-t border-current px-2 text-center">
          {match[2]}
        </span>
      </span>,
    );
    cursor = match.index + match[0].length;
    index += 1;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <Fragment>{parts}</Fragment>;
}
