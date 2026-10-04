// Screenshots can be pasted without ever creating a file on the user's disk.
export function clipboardImage(data: DataTransfer): File | undefined {
  for (const item of Array.from(data.items)) {
    if (item.kind === "file" && item.type.startsWith("image/"))
      return item.getAsFile() || undefined;
  }
  return Array.from(data.files).find((file) => file.type.startsWith("image/"));
}

export async function prepareQuizImage(file: File): Promise<File> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Ảnh cần là PNG, JPG hoặc WebP.");
  if (file.size <= 1_800_000) return file;
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Không xử lý được ảnh. Hãy chụp vùng nhỏ hơn.");
    let scale = Math.min(1, 3200 / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 5; attempt++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      );
      if (blob && blob.size <= 1_800_000)
        return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, {
          type: "image/jpeg",
        });
      scale *= 0.75;
    }
    throw new Error("Ảnh quá lớn. Hãy chụp vùng nhỏ hơn rồi dán lại.");
  } finally {
    bitmap.close();
  }
}
