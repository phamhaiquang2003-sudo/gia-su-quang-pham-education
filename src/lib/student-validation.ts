import type { NewStudent } from "./accounts";
import { isSchoolClassId } from "./school-classes";

export const usernamePattern = /^[a-z0-9][a-z0-9_-]{2,31}$/;

export function normalizeStudents(students: NewStudent[]): NewStudent[] {
  if (!Array.isArray(students) || !students.length || students.length > 50) {
    throw new Error("Mỗi lần tạo từ 1 đến 50 tài khoản.");
  }
  const seen = new Set<string>();
  return students.map((input, index) => {
    if (
      !input ||
      typeof input.username !== "string" ||
      typeof input.displayName !== "string"
    ) {
      throw new Error(`Dòng ${index + 1}: thông tin tài khoản không hợp lệ.`);
    }
    const username = input.username.trim().toLowerCase();
    const displayName = input.displayName.trim();
    if (!usernamePattern.test(username)) {
      throw new Error(
        `Dòng ${index + 1}: tên đăng nhập cần 3–32 ký tự, chỉ gồm chữ không dấu, số, _ hoặc -.`,
      );
    }
    if (
      typeof input.password !== "string" ||
      input.password.length < 8 ||
      input.password.length > 128
    ) {
      throw new Error(`Dòng ${index + 1}: mật khẩu cần từ 8 đến 128 ký tự.`);
    }
    if (!displayName || displayName.length > 100) {
      throw new Error(`Dòng ${index + 1}: họ tên cần từ 1 đến 100 ký tự.`);
    }
    const classId = input.classId ?? "";
    if (classId !== "" && !isSchoolClassId(classId)) {
      throw new Error(`Dòng ${index + 1}: hãy chọn lớp từ Lớp 1 đến Lớp 12.`);
    }
    if (seen.has(username))
      throw new Error(`Tên đăng nhập ${username} bị lặp trong danh sách.`);
    seen.add(username);
    return { username, displayName, password: input.password, classId };
  });
}
