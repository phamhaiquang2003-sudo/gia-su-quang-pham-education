import type { SubjectId } from "./subjects";

export interface ProfileOverview {
  stats: {
    studiedSubjects: number;
    completedAttempts: number;
    studyMilliseconds: number;
    streakDays: number;
  };
  progress: {
    subject: SubjectId;
    total: number;
    completed: number;
    percent: number;
  }[];
  recent: {
    id: string;
    quizId: string;
    title: string;
    subject: SubjectId;
    isCurrent: boolean;
    attemptNumber: number;
    startedAt: number;
    submittedAt: number | null;
    elapsedMilliseconds: number;
    status: "in-progress" | "processing" | "pending" | "graded";
    score: number | null;
  }[];
  hasAvatar: boolean;
  avatarUpdatedAt: number | null;
  serverNow: number;
}

export function formatStudyTime(milliseconds: number) {
  if (!milliseconds) return "0 phút";
  const minutes = Math.floor(milliseconds / 60_000);
  if (!minutes) return "< 1 phút";
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60),
    remainder = minutes % 60;
  return `${hours} giờ${remainder ? ` ${remainder} phút` : ""}`;
}

export async function prepareAvatarImage(file: File): Promise<File> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Ảnh đại diện cần là PNG, JPG hoặc WebP.");
  if (file.size > 20_000_000) throw new Error("Hãy chọn ảnh nhỏ hơn 20 MB.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "Không đọc được ảnh. Hãy chọn một ảnh PNG, JPG hoặc WebP khác.",
    );
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Không xử lý được ảnh đại diện.");
    const size = Math.min(bitmap.width, bitmap.height);
    context.fillStyle = "white";
    context.fillRect(0, 0, 256, 256);
    context.drawImage(
      bitmap,
      (bitmap.width - size) / 2,
      (bitmap.height - size) / 2,
      size,
      size,
      0,
      0,
      256,
      256,
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.88),
    );
    if (!blob || blob.size > 350_000)
      throw new Error("Không thu nhỏ được ảnh đại diện.");
    return new File([blob], "avatar.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
