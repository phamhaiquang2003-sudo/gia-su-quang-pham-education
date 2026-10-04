import { getFirebase } from "./firebase";
import { adminApiUrl } from "./admin-config";
import type { SubjectId } from "./subjects";

export type QuestionType = "single" | "truefalse" | "short";
export interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  imageId: string;
  explanationImageId?: string;
  choices?: string[];
  choiceImageIds?: string[];
  statements?: string[];
  statementImageIds?: string[];
  answer?: string | boolean[];
  acceptedAnswers?: string[];
  tolerance?: number;
  scoring?: "equal" | "exam";
  explanation?: string;
}
export interface Quiz {
  id?: string;
  revision?: number;
  title: string;
  subject: SubjectId;
  category: string;
  status: "draft" | "published" | "hidden";
  mode: "inline" | "document";
  durationMinutes: number;
  instructions: string;
  revealAnswers: boolean;
  documentIds: string[];
  questions: Question[];
}
export interface QuizSummary {
  id: string;
  title: string;
  subject: SubjectId;
  category: string;
  status: Quiz["status"];
  revision: number;
  questionCount: number;
  durationMinutes: number;
  createdAt: number;
  updatedAt: number;
}
export type Answers = Record<string, string | (boolean | null)[]>;
export interface GradeDetail {
  id: string;
  type: QuestionType;
  points: number;
  maxPoints: number;
  correct: boolean;
  answered: boolean;
  response: string | (boolean | null)[] | null;
  expected?: string | boolean[] | string[];
  explanation?: string;
  explanationImageId?: string;
}
export interface QuizResult {
  score: number;
  earned: number;
  total: number;
  correctCount: number;
  unansweredCount: number;
  questionCount: number;
  details: GradeDetail[];
}
export interface Attempt {
  id: string;
  quizId: string;
  attemptNumber?: number;
  isCurrent?: boolean;
  answers: Answers;
  flagged: string[];
  revision: number;
  startedAt: number;
  deadlineAt: number;
  submittedAt: number | null;
  result: QuizResult | null;
  displayName?: string;
  username?: string;
  role?: string;
}
export interface QuizState {
  nextAttemptNumber?: number;
  quiz: Quiz;
  attempt: Attempt | null;
  serverNow: number;
}
export class QuizApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
async function request(operation: string, data: unknown, file?: File) {
  const user = getFirebase().auth.currentUser;
  if (!user) throw new Error("Vui lòng đăng nhập để tiếp tục.");
  const token = await user.getIdToken();
  let response: Response;
  try {
    response = await fetch(
      `${adminApiUrl}/api/quiz/${operation}${file ? `?name=${encodeURIComponent(file.name)}` : ""}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": file?.type || "application/json",
        },
        body: file || JSON.stringify(data),
        signal: AbortSignal.timeout(45_000),
      },
    );
  } catch {
    throw new Error(
      "Không kết nối được kho bài tập. Kiểm tra mạng rồi thử lại.",
    );
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new QuizApiError(
      body.error?.message || "Không thể thực hiện yêu cầu.",
      response.status,
    );
  }
  return response;
}
export async function quizApi<T>(
  operation: string,
  data: unknown = {},
): Promise<T> {
  return (await request(operation, data)).json();
}
export async function uploadQuizFile(file: File) {
  if (file.size > 1_800_000)
    throw new Error(
      "Tệp cần nhỏ hơn 1,8 MB. Hãy nén PDF/ảnh trước khi tải lên.",
    );
  return (await (await request("upload", {}, file)).json()).file as {
    id: string;
    name: string;
    mime: string;
    size: number;
  };
}
export async function loadQuizFile(id: string) {
  return (await request("file", { id })).blob();
}
export function quizHref(quiz: { id: string; subject: SubjectId }) {
  return `${import.meta.env.BASE_URL}bai-tap.html?mon=${quiz.subject}&de=${encodeURIComponent(quiz.id)}`;
}
export function isAnswered(
  question: Question,
  answer: Answers[string] | undefined,
) {
  return question.type === "truefalse"
    ? Array.isArray(answer) &&
        answer.length === 4 &&
        answer.every((a) => typeof a === "boolean")
    : typeof answer === "string" && Boolean(answer.trim());
}
export function newQuestion(
  type: QuestionType = "single",
  document = false,
): Question {
  const base = {
    id: crypto.randomUUID(),
    type,
    prompt: "",
    points: 1,
    imageId: "",
    choiceImageIds: ["", "", "", ""],
    statementImageIds: ["", "", "", ""],
    explanation: "",
  };
  if (type === "single")
    return {
      ...base,
      choices: document ? ["A", "B", "C", "D"] : ["", "", "", ""],
      answer: "A",
    };
  if (type === "truefalse")
    return {
      ...base,
      statements: document ? ["Ý a", "Ý b", "Ý c", "Ý d"] : ["", "", "", ""],
      answer: [true, true, true, true],
      scoring: "equal",
    };
  return { ...base, acceptedAnswers: [""], tolerance: 0 };
}
export function newQuiz(): Quiz {
  return {
    title: "",
    subject: "toan",
    category: "Lớp 12",
    status: "draft",
    mode: "inline",
    durationMinutes: 45,
    instructions: "",
    revealAnswers: true,
    documentIds: [],
    questions: [newQuestion()],
  };
}
export function displayAnswer(
  value: GradeDetail["response"] | GradeDetail["expected"],
) {
  if (value === undefined || value === null || value === "")
    return "Chưa trả lời";
  if (Array.isArray(value))
    return value
      .map((a) =>
        a === true ? "Đúng" : a === false ? "Sai" : a === null ? "—" : a,
      )
      .join(" · ");
  return value;
}
