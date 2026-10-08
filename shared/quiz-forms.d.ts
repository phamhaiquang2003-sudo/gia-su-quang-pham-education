export type FixedQuizFormId = "mixed-22" | "mixed-28" | "single-40";
export interface FixedQuizFormQuestion {
  type: "single" | "truefalse" | "short";
  points: number;
  scoring?: "exam";
}
export interface FixedQuizForm {
  id: FixedQuizFormId;
  label: string;
  sections: readonly (FixedQuizFormQuestion & {
    label: string;
    count: number;
  })[];
}
export const fixedQuizForms: readonly FixedQuizForm[];
export function getFixedQuizForm(id: unknown): FixedQuizForm | undefined;
export function fixedQuizFormQuestions(
  form: FixedQuizForm,
): FixedQuizFormQuestion[];
