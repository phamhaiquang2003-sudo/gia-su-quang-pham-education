import { getFirebase } from "./firebase";
import { adminApiUrl } from "./admin-config";
import type { SubjectId } from "./subjects";
import type { FixedQuizFormId } from "../../shared/quiz-forms.js";

export type QuestionType = "single" | "truefalse" | "short" | "essay";
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
  scoring?: "exam";
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
  gradingMode?: "auto" | "manual";
  fixedForm?: FixedQuizFormId | "";
  durationMinutes: number;
  opensAt?: number | null;
  closesAt?: number | null;
  instructions: string;
  questionCount?: number;
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
  opensAt?: number | null;
  closesAt?: number | null;
  createdAt: number;
  gradingMode?: "auto" | "manual";
  updatedAt: number;
}
export interface EssayAnswer {
  text: string;
  imageIds: string[];
}
export type Answers = Record<string, string | (boolean | null)[] | EssayAnswer>;
export function essayAnswer(value: Answers[string] | undefined): EssayAnswer {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : { text: "", imageIds: [] };
}
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
  manual?: boolean;
  status?: "pending" | "graded";
  feedback?: string;
  gradedAt?: number;
  score: number;
  earned: number;
  total: number;
  correctCount: number;
  unansweredCount: number;
  questionCount: number;
  details: GradeDetail[];
}
export interface Attempt {
  quiz?: Quiz;
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
      `${adminApiUrl}/api/quiz/${operation}${file ? `?${new URLSearchParams({ name: file.name, ...(data as Record<string, string>) })}` : ""}`,
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
export async function getProfileAvatar() {
  return (await request("profileAvatar", {})).blob();
}
export async function uploadProfileAvatar(file: File) {
  return (await request("profileAvatarUpload", {}, file)).json() as Promise<{
    avatarUpdatedAt: number;
  }>;
}
export async function uploadQuizFile(file: File) {
  if (file.size > 1_800_000)
    throw new Error(
      "Tệp cần nhỏ hơn 1,8 MB. Hãy giảm dung lượng tệp trước khi tải lên.",
    );
  const extension = file.name.split(".").pop()?.toLowerCase();
  const wordMime =
    extension === "doc"
      ? "application/msword"
      : extension === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "";
  if (wordMime && file.type !== wordMime)
    file = new File([file], file.name, { type: wordMime });
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
export async function loadQuizAttachment(id: string) {
  const response = await request("file", { id });
  const encodedName = response.headers
    .get("Content-Disposition")
    ?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  let name = "";
  try {
    name = encodedName ? decodeURIComponent(encodedName) : "";
  } catch {
    /* use fallback name */
  }
  return { blob: await response.blob(), name };
}
export async function uploadSubmissionFile(
  file: File,
  attemptId: string,
  questionId: string,
  revision: number,
) {
  if (file.size > 1_800_000) throw new Error("Ảnh cần nhỏ hơn 1,8 MB.");
  return (
    await request(
      "submissionUpload",
      { attemptId, questionId, revision: String(revision) },
      file,
    )
  ).json() as Promise<{ attempt: Attempt; serverNow: number }>;
}
export function quizHref(quiz: { id: string; subject: SubjectId }) {
  return `${import.meta.env.BASE_URL}bai-tap.html?mon=${quiz.subject}&de=${encodeURIComponent(quiz.id)}`;
}
export function isAnswered(
  question: Question,
  answer: Answers[string] | undefined,
) {
  if (question.type === "essay") {
    const value = essayAnswer(answer);
    return Boolean(value.text.trim() || value.imageIds.length);
  }
  return question.type === "truefalse"
    ? Array.isArray(answer) &&
        answer.length === 4 &&
        answer.every((a) => typeof a === "boolean")
    : typeof answer === "string" && Boolean(answer.trim());
}
export function prepareQuizForEditing(quiz: Quiz): Quiz {
  return {
    ...quiz,
    questions: quiz.questions.map((question) =>
      question.type === "truefalse"
        ? { ...question, scoring: "exam" }
        : question,
    ),
  };
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
      scoring: "exam",
    };
  if (type === "essay") return base;
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
    opensAt: null,
    closesAt: null,
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
