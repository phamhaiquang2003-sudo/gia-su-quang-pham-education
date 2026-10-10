export const fixedQuizForms = [
  {
    id: "mixed-22",
    label: "22 câu · 12 trắc nghiệm + 4 đúng/sai + 6 trả lời ngắn",
    sections: [
      { type: "single", label: "Trắc nghiệm", count: 12, points: 0.25 },
      {
        type: "truefalse",
        label: "Đúng/Sai",
        count: 4,
        points: 1,
        scoring: "exam",
      },
      { type: "short", label: "Trả lời ngắn", count: 6, points: 0.5 },
    ],
  },
  {
    id: "mixed-28",
    label: "28 câu · 18 trắc nghiệm + 4 đúng/sai + 6 trả lời ngắn",
    sections: [
      { type: "single", label: "Trắc nghiệm", count: 18, points: 0.25 },
      {
        type: "truefalse",
        label: "Đúng/Sai",
        count: 4,
        points: 1,
        scoring: "exam",
      },
      { type: "short", label: "Trả lời ngắn", count: 6, points: 0.25 },
    ],
  },
  {
    id: "single-all",
    label: "Trắc nghiệm toàn phần",
    variableQuestionCount: true,
    sections: [
      { type: "single", label: "Trắc nghiệm", count: 40, points: 0.25 },
    ],
  },
];

export function getFixedQuizForm(id, questionCount = 40) {
  // Old 40-question drafts/snapshots retain their original fixed structure.
  if (id === "single-40") {
    const form = fixedQuizForms.find((item) => item.id === "single-all");
    return { ...form, id, variableQuestionCount: false };
  }
  const form = fixedQuizForms.find((item) => item.id === id);
  if (!form?.variableQuestionCount) return form;
  if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 100)
    return undefined;
  return {
    ...form,
    sections: [
      {
        type: "single",
        label: "Trắc nghiệm",
        count: questionCount,
        points: 10 / questionCount,
      },
    ],
  };
}

export function parseQuickAnswerKey(input, limit) {
  if (typeof input !== "string" || input.length > 2000)
    throw new Error("Chuỗi đáp án không hợp lệ.");
  const key = input.replace(/[\s,;]+/g, "").toUpperCase();
  if (!key || !/^[ABCD]+$/.test(key))
    throw new Error(
      "Chỉ nhập đáp án A, B, C, D; có thể ngăn cách bằng khoảng trắng, dấu phẩy hoặc xuống dòng.",
    );
  if (key.length > limit)
    throw new Error(
      `Bạn nhập ${key.length} đáp án nhưng đề chỉ có ${limit} câu trắc nghiệm A/B/C/D.`,
    );
  return [...key];
}

export function fixedQuizFormQuestions(form) {
  return form.sections.flatMap((section) =>
    Array.from({ length: section.count }, () => ({
      type: section.type,
      points: section.points,
      ...(section.scoring ? { scoring: section.scoring } : {}),
    })),
  );
}
