const schoolCategories = [
  "Thi thử TNTHPT",
  "Lớp 12",
  "Lớp 11",
  "Lớp 10",
  "Lớp 9",
  "Lớp 8",
  "Lớp 7",
  "Lớp 6",
];

export const quizSubjectCategories = {
  toan: schoolCategories,
  "vat-ly": schoolCategories,
  khtn: ["Lớp 9", "Lớp 8", "Lớp 7", "Lớp 6"],
  "tsa-hsa-spt": ["TSA", "HSA", "SPT"],
  "giai-tri": ["Đố vui", "Tư duy logic", "Khám phá khoa học"],
};

export function quizSchoolGrades(account) {
  if (!Array.isArray(account?.classIds)) return [];
  return [...new Set(account.classIds)]
    .filter((id) => typeof id === "string" && /^lop-(6|7|8|9|10|11|12)$/.test(id))
    .map((id) => Number(id.slice(4)));
}

export function hasAllQuizAccess(account) {
  return (
    account?.admin === true ||
    account?.role === "admin" ||
    (account?.role === "student" && account?.allQuizAccess === true)
  );
}

export function allowedQuizCategories(account, subject) {
  const categories = Object.hasOwn(quizSubjectCategories, subject)
    ? quizSubjectCategories[subject]
    : [];
  if (hasAllQuizAccess(account)) return categories;
  if (account?.role !== "student") return [];
  if (subject === "giai-tri") return categories;
  const grades = quizSchoolGrades(account);
  if (subject === "tsa-hsa-spt")
    return grades.some((grade) => grade >= 10) ? categories : [];
  return categories.filter((category) =>
    category === "Thi thử TNTHPT"
      ? grades.includes(12)
      : grades.some((grade) => category === `Lớp ${grade}`),
  );
}

export function canAccessQuizSubject(account, subject) {
  return allowedQuizCategories(account, subject).length > 0;
}

export function canAccessQuiz(account, quiz) {
  return (
    hasAllQuizAccess(account) ||
    (["giai-tri", "tsa-hsa-spt"].includes(quiz.subject) &&
      canAccessQuizSubject(account, quiz.subject)) ||
    allowedQuizCategories(account, quiz.subject).includes(quiz.category)
  );
}

export function quizClassAccessMessage(account, subject) {
  if (!quizSchoolGrades(account).length)
    return "Tài khoản chưa được gán lớp. Hãy liên hệ giáo viên để cập nhật lớp học.";
  return subject === "tsa-hsa-spt"
    ? "TSA/HSA/SPT chỉ dành cho học sinh lớp 10, 11 và 12."
    : "Bài tập này không thuộc lớp bạn đang học.";
}
