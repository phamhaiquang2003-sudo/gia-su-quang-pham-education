import { newQuestion, type Question, type Quiz } from "./quizzes";
import {
  fixedQuizForms,
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
    question.tolerance ||
    (typeof question.answer === "string" && question.answer !== "A") ||
    (Array.isArray(question.answer) &&
      question.answer.some((answer) => !answer)),
  );
}

export function customQuizQuestions(quiz: Quiz) {
  // With an attached paper, even default answer rows may be intentional.
  if (quiz.mode === "document" && quiz.documentIds.length)
    return quiz.questions;
  const authored = quiz.questions.filter((question) =>
    hasQuestionContent(question, quiz.mode === "document"),
  );
  return authored.length
    ? authored
    : [newQuestion("single", quiz.mode === "document")];
}

export function restoreCustomQuizDraft(quiz: Quiz): Quiz {
  // Clean up unsaved, empty template rows left by the old Custom option.
  if (
    quiz.id ||
    quiz.fixedForm ||
    quiz.gradingMode === "manual" ||
    quiz.documentIds.length
  )
    return quiz;
  const emptyTemplate = fixedQuizForms.some((form) => {
    const rules = fixedQuizFormQuestions(form);
    return (
      quiz.questions.length === rules.length &&
      rules.every((rule, index) => {
        const question = quiz.questions[index];
        return (
          question.type === rule.type &&
          question.points === rule.points &&
          (!rule.scoring || question.scoring === rule.scoring)
        );
      })
    );
  });
  return emptyTemplate
    ? { ...quiz, questions: customQuizQuestions(quiz) }
    : quiz;
}
