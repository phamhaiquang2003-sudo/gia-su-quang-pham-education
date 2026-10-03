const { HttpsError } = require("firebase-functions/v2/https");

const usernamePattern = /^[a-z0-9][a-z0-9_-]{2,31}$/;

function validatePassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Mật khẩu cần từ 8 đến 128 ký tự.",
    );
  }
  return password;
}

function validateStudents(data) {
  if (
    !data ||
    !Array.isArray(data.students) ||
    !data.students.length ||
    data.students.length > 50
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Mỗi lần tạo từ 1 đến 50 tài khoản.",
    );
  }
  const seen = new Set();
  return data.students.map((input, index) => {
    if (
      !input ||
      typeof input.username !== "string" ||
      typeof input.displayName !== "string"
    ) {
      throw new HttpsError(
        "invalid-argument",
        `Dòng ${index + 1}: thông tin tài khoản không hợp lệ.`,
      );
    }
    const username = input.username.trim().toLowerCase();
    const displayName = input.displayName.trim();
    if (!usernamePattern.test(username)) {
      throw new HttpsError(
        "invalid-argument",
        `Dòng ${index + 1}: tên đăng nhập cần 3–32 ký tự, chỉ gồm chữ không dấu, số, _ hoặc -.`,
      );
    }
    if (!displayName || displayName.length > 100) {
      throw new HttpsError(
        "invalid-argument",
        `Dòng ${index + 1}: họ tên cần từ 1 đến 100 ký tự.`,
      );
    }
    validatePassword(input.password);
    if (seen.has(username)) {
      throw new HttpsError(
        "invalid-argument",
        `Tên đăng nhập ${username} bị lặp trong danh sách.`,
      );
    }
    seen.add(username);
    // Role, status and UID always come from the server, never the submitted form.
    return { username, displayName, password: input.password };
  });
}

function validateAction(data) {
  if (
    !data ||
    typeof data.uid !== "string" ||
    !data.uid ||
    data.uid.length > 128 ||
    data.uid.includes("/")
  ) {
    throw new HttpsError("invalid-argument", "Mã tài khoản không hợp lệ.");
  }
  if (!["disable", "enable", "resetPassword", "delete"].includes(data.action)) {
    throw new HttpsError("invalid-argument", "Thao tác không hợp lệ.");
  }
  if (data.action === "resetPassword") validatePassword(data.password);
  return data;
}

module.exports = {
  usernamePattern,
  validatePassword,
  validateStudents,
  validateAction,
};
