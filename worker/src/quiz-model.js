import { ServiceError } from "./errors.js";

const subjectIds = ["toan", "vat-ly", "khtn", "tsa-hsa-spt", "giai-tri"];
export const validId = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
const fail = (message) => {
  throw new ServiceError("invalid-argument", message);
};
function text(value, max, label, required = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    fail(`${label} không hợp lệ.`);
  return value.trim();
}

export function validateQuiz(input) {
  if (!input || typeof input !== "object") fail("Thiếu thông tin đề.");
  const title = text(input.title, 160, "Tên đề", true);
  if (!subjectIds.includes(input.subject)) fail("Môn học không hợp lệ.");
  if (!["draft", "published", "hidden"].includes(input.status))
    fail("Trạng thái đề không hợp lệ.");
  if (!["inline", "document"].includes(input.mode))
    fail("Cách tạo đề không hợp lệ.");
  const durationMinutes = Number(input.durationMinutes);
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 1 ||
    durationMinutes > 360
  )
    fail("Thời gian làm bài cần từ 1 đến 360 phút.");
  if (
    !Array.isArray(input.questions) ||
    input.questions.length < 1 ||
    input.questions.length > 100
  )
    fail("Mỗi đề cần từ 1 đến 100 câu.");
  const ids = new Set();
  const questions = input.questions.map((q, index) => {
    if (!q || !validId(q.id) || ids.has(q.id))
      fail(`Mã câu ${index + 1} không hợp lệ hoặc bị trùng.`);
    ids.add(q.id);
    if (!["single", "truefalse", "short"].includes(q.type))
      fail(`Dạng câu ${index + 1} không hợp lệ.`);
    const prompt = text(
      q.prompt,
      5000,
      `Nội dung câu ${index + 1}`,
      input.mode === "inline" && !q.imageId,
    );
    const points = Number(q.points);
    if (!Number.isFinite(points) || points <= 0 || points > 100)
      fail(`Điểm câu ${index + 1} phải lớn hơn 0 và không quá 100.`);
    const imageId = q.imageId || "";
    if (imageId && !validId(imageId)) fail("Ảnh câu hỏi không hợp lệ.");
    const explanationImageId = q.explanationImageId || "";
    if (explanationImageId && !validId(explanationImageId))
      fail("Ảnh đáp án / lời giải không hợp lệ.");
    const common = {
      id: q.id,
      type: q.type,
      prompt,
      points,
      imageId,
      explanation: text(q.explanation || "", 5000, "Lời giải"),
      explanationImageId,
    };
    if (q.type === "single") {
      if (
        !Array.isArray(q.choices) ||
        q.choices.length !== 4 ||
        !["A", "B", "C", "D"].includes(q.answer)
      )
        fail(`Câu ${index + 1} cần 4 lựa chọn và một đáp án A/B/C/D.`);
      return {
        ...common,
        choices: q.choices.map((c, i) =>
          text(c, 2000, `Lựa chọn ${i + 1}`, true),
        ),
        answer: q.answer,
      };
    }
    if (q.type === "truefalse") {
      if (
        !Array.isArray(q.statements) ||
        q.statements.length !== 4 ||
        !Array.isArray(q.answer) ||
        q.answer.length !== 4 ||
        q.answer.some((a) => typeof a !== "boolean")
      )
        fail(`Câu ${index + 1} cần 4 ý và đáp án Đúng/Sai cho từng ý.`);
      const scoring = q.scoring === "exam" ? "exam" : "equal";
      return {
        ...common,
        statements: q.statements.map((s) => text(s, 2000, "Nội dung ý", true)),
        answer: q.answer,
        scoring,
      };
    }
    if (
      !Array.isArray(q.acceptedAnswers) ||
      !q.acceptedAnswers.length ||
      q.acceptedAnswers.length > 10
    )
      fail(`Câu ${index + 1} cần ít nhất một đáp án ngắn.`);
    const tolerance = Number(q.tolerance || 0);
    if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 100)
      fail("Sai số không hợp lệ.");
    return {
      ...common,
      acceptedAnswers: q.acceptedAnswers.map((a) =>
        text(a, 100, "Đáp án ngắn", true),
      ),
      tolerance,
    };
  });
  const documentIds = input.documentIds || [];
  if (
    !Array.isArray(documentIds) ||
    documentIds.length > 8 ||
    documentIds.some((id) => !validId(id))
  )
    fail("Tệp đề không hợp lệ.");
  if (input.mode === "document" && !documentIds.length)
    fail("Hãy tải ít nhất một PDF hoặc ảnh đề.");
  const files = [
    ...new Set([
      ...documentIds,
      ...questions.map((q) => q.imageId).filter(Boolean),
      ...questions.map((q) => q.explanationImageId).filter(Boolean),
    ]),
  ];
  if (files.length > 208) fail("Mỗi đề dùng tối đa 208 tệp.");
  return {
    title,
    subject: input.subject,
    category: text(input.category || "", 100, "Danh mục"),
    status: input.status,
    mode: input.mode,
    durationMinutes,
    instructions: text(input.instructions || "", 5000, "Hướng dẫn"),
    revealAnswers: input.revealAnswers === true,
    documentIds,
    questions,
  };
}

export function fileIds(quiz) {
  return [
    ...new Set([
      ...quiz.documentIds,
      ...quiz.questions.map((q) => q.imageId).filter(Boolean),
      ...quiz.questions.map((q) => q.explanationImageId).filter(Boolean),
    ]),
  ];
}

export function publicQuiz(quiz) {
  return {
    ...quiz,
    questions: quiz.questions.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      points: q.points,
      imageId: q.imageId,
      ...(q.choices ? { choices: q.choices } : {}),
      ...(q.statements ? { statements: q.statements } : {}),
    })),
  };
}

export function validateResponses(quiz, input, flags = []) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("Câu trả lời không hợp lệ.");
  const allowed = new Set(quiz.questions.map((q) => q.id));
  if (Object.keys(input).some((id) => !allowed.has(id)))
    fail("Có câu trả lời ngoài đề.");
  const answers = {};
  for (const q of quiz.questions) {
    const a = input[q.id];
    if (a === undefined || a === null || a === "") continue;
    if (q.type === "single") {
      if (!["A", "B", "C", "D"].includes(a)) fail("Lựa chọn không hợp lệ.");
      answers[q.id] = a;
    } else if (q.type === "truefalse") {
      if (
        !Array.isArray(a) ||
        a.length !== 4 ||
        a.some((value) => value !== null && typeof value !== "boolean")
      )
        fail("Câu trả lời Đúng/Sai không hợp lệ.");
      answers[q.id] = a;
    } else {
      answers[q.id] = text(a, 100, "Câu trả lời ngắn");
    }
  }
  if (
    !Array.isArray(flags) ||
    flags.length > quiz.questions.length ||
    flags.some((id) => !allowed.has(id))
  )
    fail("Dấu đánh dấu câu không hợp lệ.");
  return { answers, flagged: [...new Set(flags)] };
}

function numberValue(value) {
  const s = value.normalize("NFKC").trim().replace(",", ".");
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const parts = s.split("/").map((p) => p.trim());
  if (parts.length > 2 || parts.some((p) => !numeric.test(p))) return null;
  const n =
    parts.length === 2 ? Number(parts[0]) / Number(parts[1]) : Number(parts[0]);
  return Number.isFinite(n) ? n : null;
}
const normalized = (value) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
export function shortMatches(value, expected, tolerance = 0) {
  if (typeof value !== "string" || !value.trim()) return false;
  const actual = numberValue(value),
    target = numberValue(expected);
  if (actual !== null && target !== null)
    return (
      Math.abs(actual - target) <=
      tolerance + Number.EPSILON * Math.max(1, Math.abs(target)) * 8
    );
  return normalized(value) === normalized(expected);
}
export function answered(q, a) {
  return q.type === "truefalse"
    ? Array.isArray(a) && a.every((v) => typeof v === "boolean")
    : typeof a === "string" && Boolean(a.trim());
}
export function grade(quiz, answers) {
  let earned = 0,
    total = 0,
    correctCount = 0,
    unansweredCount = 0;
  const details = quiz.questions.map((q) => {
    const value = answers[q.id];
    let ratio = 0;
    if (q.type === "single") ratio = value === q.answer ? 1 : 0;
    else if (q.type === "truefalse") {
      const count = q.answer.filter(
        (a, i) => Array.isArray(value) && value[i] === a,
      ).length;
      ratio = q.scoring === "exam" ? [0, 0.1, 0.25, 0.5, 1][count] : count / 4;
    } else
      ratio = q.acceptedAnswers.some((expected) =>
        shortMatches(value, expected, q.tolerance),
      )
        ? 1
        : 0;
    const points = Math.round(q.points * ratio * 10000) / 10000;
    total += q.points;
    earned += points;
    if (ratio === 1) correctCount++;
    if (!answered(q, value)) unansweredCount++;
    return {
      id: q.id,
      type: q.type,
      points,
      maxPoints: q.points,
      correct: ratio === 1,
      answered: answered(q, value),
      response: value ?? null,
      expected: q.answer ?? q.acceptedAnswers,
      explanation: q.explanation,
      explanationImageId: q.explanationImageId,
    };
  });
  return {
    score: Math.round((earned / total) * 1000) / 100,
    earned,
    total,
    correctCount,
    unansweredCount,
    questionCount: quiz.questions.length,
    details,
  };
}
export function publicResult(result, reveal) {
  return {
    ...result,
    details: result.details.map(
      ({ expected, explanation, explanationImageId, ...detail }) =>
        reveal
          ? { ...detail, expected, explanation, explanationImageId }
          : detail,
    ),
  };
}
