export type FixedQuizFormId = "mixed-22" | "mixed-28" | "single-all" | "single-40";
export interface FixedQuizFormQuestion {
  type: "single" | "truefalse" | "short";
  points: number;
  scoring?: "exam";
}
export interface FixedQuizForm {
  id: FixedQuizFormId;
  label: string;
  variableQuestionCount?: boolean;
  sections: readonly (FixedQuizFormQuestion & {
    label: string;
    count: number;
  })[];
}
export const fixedQuizForms: readonly FixedQuizForm[];
export function getFixedQuizForm(
  id: unknown,
  questionCount?: number,
): FixedQuizForm | undefined;
export function parseQuickAnswerKey(
  input: string,
  limit: number,
): ("A" | "B" | "C" | "D")[];
export function fixedQuizFormQuestions(
  form: FixedQuizForm,
): FixedQuizFormQuestion[];
