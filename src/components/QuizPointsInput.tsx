import { useEffect, useRef, useState } from "react";

const displayPoints = (value: number, precision?: number) =>
  precision === undefined
    ? String(value).replace(".", ",")
    : value.toLocaleString("vi-VN", {
        useGrouping: false,
        maximumFractionDigits: precision,
      });
function readPoints(text: string) {
  const trimmed = text.trim();
  return /^[0-9]+(?:[.,][0-9]+)?$/.test(trimmed)
    ? Number(trimmed.replace(",", "."))
    : NaN;
}
function pointsError(text: string) {
  const value = readPoints(text);
  if (!text.trim()) return "Hãy nhập điểm cho câu hỏi.";
  if (!Number.isFinite(value))
    return "Nhập điểm bằng dấu phẩy hoặc dấu chấm, ví dụ 0,25 hoặc 0.25.";
  return value < 0.01 || value > 100
    ? "Điểm từng câu cần từ 0,01 đến 100."
    : "";
}

export default function QuizPointsInput({
  value,
  onChange,
  readOnly = false,
  ariaLabel,
  displayPrecision,
}: {
  value: number;
  onChange: (value: number) => void;
  readOnly?: boolean;
  ariaLabel: string;
  displayPrecision?: number;
}) {
  const [text, setText] = useState(() => displayPoints(value, displayPrecision));
  const lastValue = useRef<number | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (lastValue.current !== value || readOnly) {
      const displayed = displayPoints(value, displayPrecision);
      setText(displayed);
      input.current?.setCustomValidity(readOnly ? "" : pointsError(displayed));
    }
    lastValue.current = value;
  }, [value, readOnly, displayPrecision]);
  return (
    <input
      ref={input}
      className="account-input read-only:bg-slate-100 read-only:text-slate-500"
      type="text"
      inputMode="decimal"
      autoComplete="off"
      maxLength={24}
      value={text}
      readOnly={readOnly}
      aria-label={ariaLabel}
      title={
        readOnly && displayPrecision !== undefined ? String(value) : undefined
      }
      required
      onChange={(event) => {
        if (readOnly) return;
        const next = event.target.value;
        const error = pointsError(next);
        setText(next);
        event.target.setCustomValidity(error);
        if (!error) {
          const points = readPoints(next);
          lastValue.current = points;
          onChange(points);
        }
      }}
      onBlur={(event) => {
        if (readOnly) return;
        if (!pointsError(text)) {
          setText(displayPoints(readPoints(text)));
          event.target.setCustomValidity("");
        }
      }}
    />
  );
}
