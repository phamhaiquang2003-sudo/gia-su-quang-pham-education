import { essayAnswer, type Answers } from "@/lib/quizzes";
import { clipboardImage } from "@/lib/quiz-images";
import QuizFile from "./QuizFile";

export default function QuizEssayAnswer({
  value,
  onChange,
  onUpload,
  onRemove,
  disabled = false,
  readOnly = false,
  label = "Bài làm của bạn",
}: {
  value?: Answers[string];
  onChange?: (value: Answers[string]) => void;
  onUpload?: (files: File[]) => Promise<void>;
  onRemove?: (id: string) => Promise<void>;
  disabled?: boolean;
  readOnly?: boolean;
  label?: string;
}) {
  const answer = essayAnswer(value);
  return (
    <div className="space-y-4">
      {readOnly ? (
        answer.text ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {answer.text}
          </p>
        ) : null
      ) : (
        <label className="block text-sm font-semibold">
          {label}
          <textarea
            className="exercise-input mt-2 min-h-32 resize-y font-normal"
            value={answer.text}
            maxLength={10000}
            disabled={disabled}
            onChange={(event) =>
              onChange?.({ ...answer, text: event.target.value })
            }
            onPaste={(event) => {
              const image = clipboardImage(event.clipboardData);
              if (!image || disabled) return;
              event.preventDefault();
              void onUpload?.([image]);
            }}
            placeholder="Nhập bài làm hoặc tải ảnh bài viết tay bên dưới…"
          />
        </label>
      )}
      {answer.imageIds.length > 0 && (
        <div className="space-y-4">
          {answer.imageIds.map((id, index) => (
            <div key={id} className="rounded-xl border border-current/20 p-3">
              <p className="mb-2 text-xs opacity-70">Ảnh bài làm {index + 1}</p>
              <QuizFile
                id={id}
                imageOnly
                openImage
                alt={`Ảnh bài làm ${index + 1}`}
              />
              {!readOnly && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void onRemove?.(id)}
                  className="mt-3 text-sm text-red-300 underline disabled:opacity-50"
                >
                  Gỡ ảnh {index + 1}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {!readOnly && (
        <label className="block text-sm font-semibold">
          Tải ảnh bài làm
          <input
            className="exercise-input mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-sky-200/15 file:px-3 file:py-2 file:text-sky-100"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            disabled={disabled}
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              event.target.value = "";
              if (files.length) void onUpload?.(files);
            }}
          />
          <span className="mt-2 block text-xs font-normal opacity-70">
            Chọn ảnh chụp bài làm từ máy tính hoặc điện thoại. Tối đa 20 ảnh mỗi
            lượt; ảnh lớn được tự nén.
          </span>
        </label>
      )}
      {readOnly && !answer.text && !answer.imageIds.length && (
        <p className="text-sm opacity-70">Chưa có bài làm ở phần này.</p>
      )}
    </div>
  );
}
