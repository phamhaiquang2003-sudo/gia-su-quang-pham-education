import { useState } from "react";

export default function QuizAccessCodeInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [position, setPosition] = useState(0);

  return (
    <span
      className={`relative mt-3 block max-w-lg ${disabled ? "opacity-50" : ""}`}
    >
      <input
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0 disabled:cursor-wait"
        type="password"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        autoComplete="off"
        disabled={disabled}
        value={value}
        aria-label="Mật khẩu đề"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSelect={(event) =>
          setPosition(event.currentTarget.selectionStart || 0)
        }
        onClick={(event) => {
          const input = event.currentTarget;
          const slots =
            input.parentElement?.querySelectorAll<HTMLElement>(
              "[data-code-slot]",
            );
          if (!slots) return;
          let nearest = 0;
          let distance = Infinity;
          slots.forEach((slot, index) => {
            const bounds = slot.getBoundingClientRect();
            const next = Math.abs(
              event.clientX - bounds.left - bounds.width / 2,
            );
            if (next < distance) {
              nearest = index;
              distance = next;
            }
          });
          const index = Math.min(nearest, value.length);
          input.setSelectionRange(
            index,
            index < value.length ? index + 1 : index,
          );
          setPosition(index);
        }}
        onChange={(event) => {
          const digits = event.target.value.replace(/[^0-9]/g, "").slice(0, 6);
          onChange(digits);
          setPosition(
            Math.min(event.target.selectionStart || 0, digits.length),
          );
        }}
        onPaste={(event) => {
          const digits = event.clipboardData
            .getData("text")
            .replace(/[^0-9]/g, "");
          if (digits.length !== 6) return;
          event.preventDefault();
          onChange(digits);
          setPosition(6);
          const input = event.currentTarget;
          requestAnimationFrame(() => input.setSelectionRange(6, 6));
        }}
      />
      <span
        aria-hidden="true"
        className="flex items-center justify-between gap-2"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <span
            key={index}
            data-code-slot
            data-filled={index < value.length}
            className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors min-[360px]:size-10 sm:size-12 ${focused && index === Math.min(position, 5) ? "border-amber-200 ring-2 ring-amber-200/30" : "border-white/40"}`}
          >
            <span
              className={`size-5 rounded-full transition-colors min-[360px]:size-7 sm:size-8 ${index < value.length ? "bg-white/95" : "bg-white/35"}`}
            />
          </span>
        ))}
      </span>
    </span>
  );
}
