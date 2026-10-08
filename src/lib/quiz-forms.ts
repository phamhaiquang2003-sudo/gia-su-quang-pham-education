import { newQuestion, type Question, type Quiz } from "./quizzes";
import {
  fixedQuizFormQuestions,
  getFixedQuizForm,
  type FixedQuizFormId,
} from "../../shared/quiz-forms.js";

export {
  fixedQuizForms,
  getFixedQuizForm,
  fixedQuizFormQuestions,
} from "../../shared/quiz-forms.js";
export type { FixedQuizFormId } from "../../shared/quiz-forms.js";

export function prepareFixedQuizForm(quiz: Quiz, id: FixedQuizFormId) {
  const form = getFixedQuizForm(id)!;
  const used = new Set<string>();
  const questions = fixedQuizFormQuestions(form).map((rule) => {
    const existing = quiz.questions.find(
      (question) => question.type === rule.type && !used.has(question.id),
    );
    const question =
      existing || newQuestion(rule.type, quiz.mode === "document");
    used.add(question.id);
    return { ...question, ...rule };
  });
  return {
    questions,
    discarded: quiz.questions.filter((question) => !used.has(question.id)),
  };
}

export function hasQuestionContent(question: Question, document: boolean) {
  return Boolean(
    question.prompt.trim() ||
    question.imageId ||
    question.explanation?.trim() ||
    question.explanationImageId ||
    question.choiceImageIds?.some(Boolean) ||
    question.statementImageIds?.some(Boolean) ||
    question.choices?.some(
      (choice, index) =>
        choice.trim() && (!document || choice !== "ABCD"[index]),
    ) ||
    question.statements?.some(
      (statement, index) =>
        statement.trim() && (!document || statement !== `Ý ${"abcd"[index]}`),
    ) ||
    question.acceptedAnswers?.some((answer) => answer.trim()) ||
    (typeof question.answer === "string" && question.answer !== "A") ||
    (Array.isArray(question.answer) &&
      question.answer.some((answer) => !answer)),
  );
}
