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
    id: "single-40",
    label: "40 câu · Trắc nghiệm",
    sections: [
      { type: "single", label: "Trắc nghiệm", count: 40, points: 0.25 },
    ],
  },
];

export function getFixedQuizForm(id) {
  return fixedQuizForms.find((form) => form.id === id);
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
