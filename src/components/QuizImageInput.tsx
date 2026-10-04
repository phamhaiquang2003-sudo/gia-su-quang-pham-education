import { useRef, useState, type ClipboardEvent } from "react";
import { ClipboardPaste, ImagePlus, Trash2 } from "lucide-react";
import { clipboardImage } from "@/lib/quiz-images";
import QuizFile from "./QuizFile";

export default function QuizImageInput({
  label,
  imageId,
  disabled,
  onUpload,
  onRemove,
}: {
  label: string;
  imageId?: string;
  disabled: boolean;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const readingRef = useRef(false);
  function paste(event: ClipboardEvent<HTMLDivElement>) {
    const file = clipboardImage(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    event.stopPropagation();
    if (disabled || readingRef.current) return;
    setError("");
    void onUpload(file);
  }
  async function readClipboard() {
    if (disabled || readingRef.current) return;
    readingRef.current = true;
    setReading(true);
    setError("");
    try {
      if (!navigator.clipboard?.read) throw new Error("unsupported");
      const items = await navigator.clipboard.read();
      const item = items.find((entry) =>
        entry.types.some((type) => type.startsWith("image/")),
      );
      const type = item?.types.find((type) => type.startsWith("image/"));
      if (!item || !type) {
        setError(
          "Clipboard chưa có ảnh. Chụp bằng Win + Shift + S, rồi dán lại.",
        );
        return;
      }
      const blob = await item.getType(type);
      await onUpload(new File([blob], "anh-chup.png", { type }));
    } catch {
      setError("Bấm vào vùng dán ảnh này rồi nhấn Ctrl + V (Mac: ⌘ + V).");
    } finally {
      readingRef.current = false;
      setReading(false);
    }
  }
  return (
    <div
      role="group"
      aria-label={label}
      tabIndex={disabled ? -1 : 0}
      onPaste={paste}
      className="mt-4 min-w-0 rounded-xl border-2 border-dashed border-sky-200 bg-sky-50/50 p-4 outline-none focus-within:border-sky-500 focus-visible:ring-2 focus-visible:ring-sky-300"
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">
        Chụp màn hình bằng Win + Shift + S → bấm vào đây → Ctrl + V. Không cần
        lưu ảnh về máy. Ảnh lớn được tự nén.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="account-button-secondary text-xs"
          disabled={disabled || reading}
          onClick={() => void readClipboard()}
        >
          <ClipboardPaste className="size-4" />
          {reading ? "Đang đọc clipboard…" : "Dán ảnh từ clipboard"}
        </button>
        <button
          type="button"
          className="account-button-secondary text-xs"
          disabled={disabled || reading}
          onClick={() => input.current?.click()}
        >
          <ImagePlus className="size-4" /> Chọn ảnh có sẵn
        </button>
        {imageId && (
          <button
            type="button"
            className="account-button-secondary text-xs text-red-700"
            disabled={disabled || reading}
            onClick={onRemove}
          >
            <Trash2 className="size-4" /> Bỏ ảnh
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        className="sr-only"
        aria-label={`Chọn ${label.toLowerCase()}`}
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled || reading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            setError("");
            void onUpload(file);
          }
        }}
      />
      {error && (
        <p role="alert" className="mt-3 text-xs text-red-700">
          {error}
        </p>
      )}
      {imageId && (
        <div className="mt-4">
          <QuizFile id={imageId} imageOnly alt={label} />
        </div>
      )}
    </div>
  );
}
