export const ZALO_CONTACT_URL = "https://zalo.me/0365900419";
export const TUTOR_CONTACT_VISIBLE = false;

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

export const subjects = [
  {
    id: "toan",
    label: "Toán",
    title: "Bài tập Toán",
    description: "Tổng hợp các bài kiểm tra và đề thi môn Toán.",
    categories: schoolCategories,
  },
  {
    id: "vat-ly",
    label: "Vật lý",
    title: "Bài tập Vật lý",
    description: "Tổng hợp các bài kiểm tra và đề thi môn Vật lý.",
    categories: schoolCategories,
  },
  {
    id: "khtn",
    label: "KHTN",
    title: "Bài tập Khoa học tự nhiên",
    description: "Tổng hợp các bài kiểm tra và đề thi môn Khoa học tự nhiên.",
    categories: ["Lớp 9", "Lớp 8", "Lớp 7", "Lớp 6"],
  },
  {
    id: "tsa-hsa-spt",
    label: "TSA/HSA/SPT",
    title: "Luyện thi TSA/HSA/SPT",
    description:
      "Tổng hợp bài luyện đánh giá tư duy và đánh giá năng lực TSA, HSA, SPT.",
    categories: ["TSA", "HSA", "SPT"],
  },
  {
    id: "giai-tri",
    label: "Giải trí",
    title: "Góc giải trí",
    description: "Các hoạt động và câu hỏi thư giãn sau giờ học.",
    categories: ["Đố vui", "Tư duy logic", "Khám phá khoa học"],
  },
] as const;

export type SubjectId = (typeof subjects)[number]["id"];

export function getSubject(id: string | null) {
  return subjects.find((subject) => subject.id === id) || subjects[0];
}

export function subjectHref(id: SubjectId) {
  return `${import.meta.env.BASE_URL}bai-tap.html?mon=${id}`;
}
