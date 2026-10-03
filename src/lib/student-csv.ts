import Papa from "papaparse";
import { usernamePattern, type NewStudent } from "./accounts";

export function parseStudentCsv(input: string): NewStudent[] {
  const parsed = Papa.parse<string[]>(input, { skipEmptyLines: "greedy" });
  if (parsed.errors.length)
    throw new Error("Danh sách CSV có dấu ngoặc kép không hợp lệ.");
  if (!parsed.data.length || parsed.data.length > 50) {
    throw new Error("Mỗi lần nhập từ 1 đến 50 tài khoản.");
  }
  const seen = new Set<string>();
  return parsed.data.map((columns, index) => {
    if (columns.length !== 3) {
      throw new Error(
        `Dòng ${index + 1}: cần đúng 3 cột tên đăng nhập,mật khẩu,họ tên.`,
      );
    }
    const [rawUsername, password, rawName] = columns;
    const username = rawUsername.trim().toLowerCase();
    const displayName = rawName.trim();
    if (!usernamePattern.test(username)) {
      throw new Error(
        `Dòng ${index + 1}: tên đăng nhập cần 3–32 ký tự, chỉ gồm chữ không dấu, số, _ hoặc -.`,
      );
    }
    if (password.length < 8 || password.length > 128) {
      throw new Error(`Dòng ${index + 1}: mật khẩu cần từ 8 đến 128 ký tự.`);
    }
    if (!displayName || displayName.length > 100) {
      throw new Error(`Dòng ${index + 1}: họ tên cần từ 1 đến 100 ký tự.`);
    }
    if (seen.has(username))
      throw new Error(
        `Dòng ${index + 1}: tên đăng nhập ${username} bị lặp trong danh sách.`,
      );
    seen.add(username);
    return { username, password, displayName };
  });
}
