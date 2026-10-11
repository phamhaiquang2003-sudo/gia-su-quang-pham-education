export interface QuizAccessAccount {
  admin?: boolean;
  role?: string;
  classIds?: readonly unknown[];
  allQuizAccess?: boolean;
}
export const quizSubjectCategories: {
  readonly toan: readonly string[];
  readonly "vat-ly": readonly string[];
  readonly khtn: readonly string[];
  readonly "tsa-hsa-spt": readonly string[];
  readonly "giai-tri": readonly string[];
};
export function quizSchoolGrades(account?: QuizAccessAccount | null): number[];
export function hasAllQuizAccess(
  account?: QuizAccessAccount | null,
): boolean;
export function allowedQuizCategories(
  account: QuizAccessAccount | null | undefined,
  subject: string,
): readonly string[];
export function canAccessQuizSubject(
  account: QuizAccessAccount | null | undefined,
  subject: string,
): boolean;
export function canAccessQuiz(
  account: QuizAccessAccount | null | undefined,
  quiz: { subject: string; category: string },
): boolean;
export function quizClassAccessMessage(
  account: QuizAccessAccount | null | undefined,
  subject: string,
): string;
