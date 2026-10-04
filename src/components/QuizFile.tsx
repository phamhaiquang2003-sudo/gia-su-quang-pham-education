import { useEffect, useState } from "react";
import { loadQuizAttachment } from "@/lib/quizzes";

export default function QuizFile({
  id,
  imageOnly = false,
  alt = "Ảnh câu hỏi",
  openImage = false,
}: {
  id: string;
  imageOnly?: boolean;
  alt?: string;
  openImage?: boolean;
}) {
  const [file, setFile] = useState<{
    url: string;
    type: string;
    name: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false,
      url = "";
    setFile(null);
    setError("");
    loadQuizAttachment(id)
      .then(({ blob, name }) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setFile({ url, type: blob.type, name });
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, retry]);
  if (error)
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-400/30 p-4 text-sm"
      >
        {error}{" "}
        <button
          type="button"
          className="underline"
          onClick={() => setRetry((n) => n + 1)}
        >
          Tải lại tệp
        </button>
      </div>
    );
  if (!file)
    return (
      <p className="p-4 text-sm" role="status">
        Đang tải tệp đề…
      </p>
    );
  if (file.type.startsWith("image/"))
    return (
      <div className="space-y-3">
        <img
          src={file.url}
          alt={alt}
          className="mx-auto max-h-[80vh] max-w-full rounded-xl object-contain"
        />
        {openImage && (
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-sm underline"
          >
            Mở ảnh kích thước đầy đủ
          </a>
        )}
      </div>
    );
  if (imageOnly) return <p>Hãy dùng tệp ảnh cho câu hỏi.</p>;
  if (
    [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ].includes(file.type)
  ) {
    const name =
      file.name ||
      (file.type === "application/msword" ? "de-bai.doc" : "de-bai.docx");
    return (
      <div className="space-y-3 rounded-xl border border-current/20 p-4">
        <p className="break-words text-sm font-semibold">{name}</p>
        <a
          href={file.url}
          download={name}
          className="inline-block rounded-lg border border-current/25 px-4 py-3 text-sm font-semibold underline"
        >
          Tải file Word
        </a>
        <p className="text-xs opacity-70">
          Tải về để mở bằng Microsoft Word hoặc ứng dụng đọc tài liệu.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <a
        href={file.url}
        target="_blank"
        rel="noreferrer"
        className="inline-block text-sm underline"
      >
        Mở PDF ở tab mới / tải về
      </a>
      <iframe
        src={file.url}
        title="Nội dung đề PDF"
        className="h-[70vh] w-full rounded-xl bg-white"
      />
    </div>
  );
}
