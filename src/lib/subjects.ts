import { quizSubjectCategories } from "../../shared/quiz-access.js";

export const ZALO_CONTACT_URL = "https://zalo.me/0365900419";
export const TUTOR_CONTACT_VISIBLE = false;

export const subjects = [
  {
    id: "toan",
    label: "Toán",
    title: "Bài tập Toán",
    description: "Tổng hợp các bài kiểm tra và đề thi môn Toán.",
    categories: quizSubjectCategories.toan,
  },
  {
    id: "vat-ly",
    label: "Vật lý",
    title: "Bài tập Vật lý",
    description: "Tổng hợp các bài kiểm tra và đề thi môn Vật lý.",
    categories: quizSubjectCategories["vat-ly"],
  },
  {
    id: "khtn",
    label: "KHTN",
    title: "Bài tập Khoa học tự nhiên",
    description: "Tổng hợp các bài kiểm tra và đề thi môn Khoa học tự nhiên.",
    categories: quizSubjectCategories.khtn,
  },
  {
    id: "tsa-hsa-spt",
    label: "TSA/HSA/SPT",
    title: "Luyện thi TSA/HSA/SPT",
    description:
      "Tổng hợp bài luyện đánh giá tư duy và đánh giá năng lực TSA, HSA, SPT.",
    categories: quizSubjectCategories["tsa-hsa-spt"],
  },
  {
    id: "giai-tri",
    label: "Giải trí",
    title: "Góc giải trí",
    description: "Các hoạt động và câu hỏi thư giãn sau giờ học.",
    categories: quizSubjectCategories["giai-tri"],
  },
] as const;

export type SubjectId = (typeof subjects)[number]["id"];

export function getSubject(id: string | null) {
  return subjects.find((subject) => subject.id === id) || subjects[0];
}

export function subjectHref(id: SubjectId) {
  return `${import.meta.env.BASE_URL}bai-tap.html?mon=${id}`;
}
