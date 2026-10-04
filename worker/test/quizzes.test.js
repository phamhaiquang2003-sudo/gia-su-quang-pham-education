import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { makeQuizService, finalizeExpired } from "../src/quiz-service.js";
import {
  grade,
  publicQuiz,
  publicResult,
  validateQuiz,
  shortMatches,
  fileIds,
} from "../src/quiz-model.js";
import { requireQuizUser } from "../src/quiz-auth.js";

// Run the real SQL against SQLite, including atomic batches and preconditions.
function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON;");
  sqlite.exec(
    readFileSync(
      new URL("../migrations/0001_quizzes.sql", import.meta.url),
      "utf8",
    ),
  );
  const db = {
    prepare(sql) {
      let params = [];
      return {
        bind(...args) {
          params = args;
          return this;
        },
        async first() {
          return sqlite.prepare(sql).get(...params) || null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...params) };
        },
        async run() {
          return { meta: sqlite.prepare(sql).run(...params) };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const result = [];
        for (const s of statements) result.push(await s.run());
        sqlite.exec("COMMIT");
        return result;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { db, sqlite };
}
function fixture(revealAnswers = true) {
  return {
    title: "Đề kiểm thử",
    subject: "toan",
    category: "Lớp 12",
    status: "published",
    mode: "inline",
    durationMinutes: 1,
    instructions: "",
    revealAnswers,
    documentIds: [],
    questions: [
      {
        id: "single",
        type: "single",
        prompt: "1+1?",
        points: 1,
        imageId: "",
        choices: ["1", "2", "3", "4"],
        answer: "B",
        explanation: "1+1=2",
      },
      {
        id: "tf",
        type: "truefalse",
        prompt: "Đúng hay sai?",
        points: 1,
        imageId: "",
        statements: ["a", "b", "c", "d"],
        answer: [true, false, true, false],
        scoring: "exam",
        explanation: "",
      },
      {
        id: "short",
        type: "short",
        prompt: "Một nửa",
        points: 2,
        imageId: "",
        acceptedAnswers: ["0.5"],
        tolerance: 0,
        explanation: "",
      },
    ],
  };
}
const adminUser = {
  uid: "teacher",
  admin: true,
  role: "admin",
  displayName: "Giáo viên",
  username: "teacher",
};
const studentUser = {
  uid: "student",
  admin: false,
  role: "student",
  displayName: "Học sinh",
  username: "student",
};

test("mixed question grading handles decimals, fractions, tolerance and partial true/false credit", () => {
  const quiz = validateQuiz(fixture());
  assert.equal(
    grade(quiz, { single: "B", tf: [true, false, true, false], short: "1/2" })
      .score,
    10,
  );
  assert.equal(
    grade(quiz, { single: "B", tf: [true, false, false, true], short: "0,5" })
      .score,
    8.13,
  );
  assert.equal(grade(quiz, {}).score, 0);
  assert.equal(shortMatches("0.51", "0,5", 0.01), true);
  assert.equal(shortMatches("1/0", "0.5", 0), false);
  assert.equal(shortMatches("", "0", 0), false);
  assert.equal(shortMatches("HÀ NỘI", "hà nội"), true);
  assert.throws(() => validateQuiz({ ...fixture(), durationMinutes: 0 }));
  assert.throws(() =>
    validateQuiz({
      ...fixture(),
      questions: [{ ...fixture().questions[0], points: -1 }],
    }),
  );
  for (const q of publicQuiz(quiz).questions) {
    assert.equal(q.answer, undefined);
    assert.equal(q.acceptedAnswers, undefined);
    assert.equal(q.explanation, undefined);
  }
  const result = grade(quiz, { single: "B" });
  assert.equal(publicResult(result, false).details[0].expected, undefined);
});

test("publication, persistence, revision checks, snapshot isolation and idempotent server-side submission", async () => {
  const { db, sqlite } = database();
  let now = 1_000_000;
  try {
    const teacher = makeQuizService(db, adminUser, () => now),
      student = makeQuizService(db, studentUser, () => now);
    const saved = await teacher.save({ quiz: fixture(false) }),
      id = saved.quiz.id;
    assert.equal((await student.list({ subject: "toan" })).quizzes.length, 1);
    await assert.rejects(student.adminDetail({ id }), (e) => e.status === 403);
    await assert.rejects(
      student.save({ quiz: fixture() }),
      (e) => e.status === 403,
    );
    const started = await student.start({ id }),
      a = started.attempt;
    assert.equal(
      (await student.start({ id })).attempt.deadlineAt,
      a.deadlineAt,
    );
    const progress = await student.progress({
      id: a.id,
      revision: 0,
      answers: { single: "B" },
      flagged: ["short"],
    });
    await assert.rejects(
      student.progress({ id: a.id, revision: 0, answers: {}, flagged: [] }),
      (e) => e.status === 409,
    );
    const updated = fixture(false);
    updated.questions[0].answer = "A";
    await teacher.save({ id, revision: 1, quiz: updated });
    assert.equal((await student.detail({ id })).attempt.flagged[0], "short");
    const other = makeQuizService(
      db,
      { ...studentUser, uid: "other" },
      () => now,
    );
    await assert.rejects(
      other.progress({ id: a.id, revision: 1, answers: {}, flagged: [] }),
      (e) => e.status === 404,
    );
    await assert.rejects(
      student.submit({ id: a.id, revision: 0, answers: {}, flagged: [] }),
      (e) => e.status === 409,
    );
    now += 2000;
    const finished = await student.submit({
      id: a.id,
      revision: progress.attempt.revision,
      answers: { single: "B", tf: [true, false, true, false], short: "0,5" },
      flagged: ["tf"],
    });
    assert.equal(finished.attempt.result.score, 10);
    assert.deepEqual(finished.attempt.flagged, ["tf"]);
    assert.equal(finished.attempt.result.details[0].expected, undefined);
    assert.equal(
      (await student.submit({ id: a.id, answers: {} })).attempt.result.score,
      10,
    );
    const results = await teacher.results({ id });
    assert.equal(results.attempts[0].result.details[0].expected, "B");
    await teacher.hide({ id });
    assert.equal((await teacher.adminDetail({ id })).quiz.status, "hidden");
    assert.equal((await student.list({ subject: "toan" })).quizzes.length, 0);
    await assert.rejects(other.start({ id }), (e) => e.status === 403);
    assert.equal((await student.detail({ id })).attempt.result.score, 10);
  } finally {
    sqlite.close();
  }
});

test("late answers cannot replace saved answers; expiry is finalized even without an open browser", async () => {
  const { db, sqlite } = database();
  let now = Date.now() - 120_000;
  try {
    const teacher = makeQuizService(db, adminUser, () => now),
      student = makeQuizService(db, studentUser, () => now);
    const { quiz } = await teacher.save({ quiz: fixture() });
    const start = await student.start({ id: quiz.id });
    await student.progress({
      id: start.attempt.id,
      revision: 0,
      answers: { single: "B" },
      flagged: ["tf"],
    });
    await finalizeExpired(db);
    now = Date.now();
    const submitted = await student.submit({
      id: start.attempt.id,
      answers: { single: "B", tf: [true, false, true, false], short: "0.5" },
      flagged: [],
    });
    assert.equal(submitted.attempt.result.score, 2.5);
    assert.equal(submitted.attempt.submittedAt, start.attempt.deadlineAt);
    assert.deepEqual(submitted.attempt.flagged, ["tf"]);
    assert.equal(
      (await student.start({ id: quiz.id })).attempt.id,
      start.attempt.id,
    );
  } finally {
    sqlite.close();
  }
});

test("PDF files require publication or ownership of the attempt, including after the teacher edits the attachment", async () => {
  const { db, sqlite } = database();
  let now = 1_000_000;
  try {
    const teacher = makeQuizService(db, adminUser, () => now),
      student = makeQuizService(db, studentUser, () => now);
    const req = new Request("https://example.com/api/quiz/upload?name=de.pdf", {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: "%PDF-1.4\n%%EOF",
    });
    const { file } = await teacher.upload(req);
    const q = {
      ...fixture(),
      mode: "document",
      documentIds: [file.id],
      status: "draft",
    };
    const { quiz } = await teacher.save({ quiz: q });
    await assert.rejects(
      student.file({ id: file.id }),
      (e) => e.status === 403,
    );
    await teacher.save({
      id: quiz.id,
      revision: 1,
      quiz: { ...q, status: "published" },
    });
    assert.equal(
      (await student.file({ id: file.id })).headers.get("Content-Type"),
      "application/pdf",
    );
    await student.start({ id: quiz.id });
    await teacher.save({
      id: quiz.id,
      revision: 2,
      quiz: { ...fixture(), status: "hidden" },
    });
    assert.equal((await student.file({ id: file.id })).status, 200);
    const other = makeQuizService(
      db,
      { ...studentUser, uid: "other" },
      () => now,
    );
    await assert.rejects(other.file({ id: file.id }), (e) => e.status === 403);
  } finally {
    sqlite.close();
  }
});

test("quiz authentication checks disabled/revoked users, active profile and actual admin claim", async () => {
  const claims = { sub: "student", auth_time: 100 };
  let user = { validSince: "0" },
    role = "student",
    status = "active";
  const firebase = {
    async getAuthUser() {
      return user;
    },
    async getProfile() {
      return {
        fields: {
          role: { stringValue: role },
          status: { stringValue: status },
        },
      };
    },
  };
  assert.equal(
    (await requireQuizUser("token", firebase, async () => claims)).uid,
    "student",
  );
  await assert.rejects(
    requireQuizUser("token", firebase, async () => claims, true),
    (e) => e.status === 403,
  );
  user = { disabled: true };
  await assert.rejects(
    requireQuizUser("token", firebase, async () => claims),
    (e) => e.status === 401,
  );
  user = { validSince: "101" };
  await assert.rejects(
    requireQuizUser("token", firebase, async () => claims),
    (e) => e.status === 401,
  );
  user = {};
  status = "disabled";
  await assert.rejects(
    requireQuizUser("token", firebase, async () => claims),
    (e) => e.status === 403,
  );
  status = "active";
  role = "admin";
  claims.admin = true;
  await assert.rejects(
    requireQuizUser("token", firebase, async () => claims),
    (e) => e.status === 403,
  );
  user = { customAttributes: '{"admin":true}' };
  assert.equal(
    (await requireQuizUser("token", firebase, async () => claims, true)).admin,
    true,
  );
});

test("image-only questions save without retyping; solution images count as attachments and stay out of public questions/results", () => {
  const input = fixture();
  input.questions[0] = {
    ...input.questions[0],
    prompt: "",
    imageId: "question-image",
    explanationImageId: "solution-image",
  };
  const quiz = validateQuiz(input);
  assert.deepEqual(fileIds(quiz), ["question-image", "solution-image"]);
  assert.deepEqual(fileIds(publicQuiz(quiz)), ["question-image"]);
  assert.equal(publicQuiz(quiz).questions[0].explanationImageId, undefined);
  const result = grade(quiz, { single: "B" });
  assert.equal(
    publicResult(result, false).details[0].explanationImageId,
    undefined,
  );
  assert.equal(
    publicResult(result, true).details[0].explanationImageId,
    "solution-image",
  );
  assert.throws(() =>
    validateQuiz({
      ...input,
      questions: [{ ...input.questions[0], imageId: "" }],
    }),
  );
  assert.throws(() =>
    validateQuiz({
      ...input,
      questions: [{ ...input.questions[0], explanationImageId: "invalid/id" }],
    }),
  );
  const large = {
    ...input,
    questions: Array.from({ length: 100 }, (_, i) => ({
      ...input.questions[0],
      id: `q-${i}`,
      imageId: `question-${i}`,
      explanationImageId: `solution-${i}`,
    })),
  };
  assert.equal(fileIds(validateQuiz(large)).length, 200);
});

test("solution image bytes require a submitted own attempt with reveal enabled; old snapshots keep their solution after edits", async () => {
  const { db, sqlite } = database();
  let now = 1_000_000;
  try {
    const teacher = makeQuizService(db, adminUser, () => now);
    const student = makeQuizService(db, studentUser, () => now);
    const other = makeQuizService(
      db,
      { ...studentUser, uid: "other" },
      () => now,
    );
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    async function upload(name) {
      return (
        await teacher.upload(
          new Request(`https://example.com/api/quiz/upload?name=${name}.png`, {
            method: "POST",
            headers: { "Content-Type": "image/png" },
            body: png,
          }),
        )
      ).file.id;
    }
    const questionImage = await upload("question");
    const solutionImage = await upload("solution");
    const input = fixture();
    input.questions[0] = {
      ...input.questions[0],
      prompt: "",
      imageId: questionImage,
      explanationImageId: solutionImage,
    };
    const { quiz } = await teacher.save({ quiz: input });
    assert.equal((await student.file({ id: questionImage })).status, 200);
    await assert.rejects(
      student.file({ id: solutionImage }),
      (e) => e.status === 403,
    );
    assert.equal((await teacher.file({ id: solutionImage })).status, 200);
    assert.equal(
      (await student.detail({ id: quiz.id })).quiz.questions[0]
        .explanationImageId,
      undefined,
    );
    const started = await student.start({ id: quiz.id });
    await assert.rejects(
      student.file({ id: solutionImage }),
      (e) => e.status === 403,
    );
    const hiddenInput = { ...input, revealAnswers: false };
    const { quiz: hidden } = await teacher.save({ quiz: hiddenInput });
    const hiddenStart = await other.start({ id: hidden.id });
    await other.submit({
      id: hiddenStart.attempt.id,
      revision: 0,
      answers: { single: "B" },
      flagged: [],
    });
    await assert.rejects(
      other.file({ id: solutionImage }),
      (e) => e.status === 403,
    );
    const changed = fixture(false);
    changed.status = "hidden";
    await teacher.save({ id: quiz.id, revision: 1, quiz: changed });
    now += 1000;
    const submitted = await student.submit({
      id: started.attempt.id,
      revision: 0,
      answers: { single: "B" },
      flagged: [],
    });
    assert.equal(
      submitted.attempt.result.details[0].explanationImageId,
      solutionImage,
    );
    assert.equal((await student.file({ id: solutionImage })).status, 200);
    assert.equal((await student.file({ id: questionImage })).status, 200);
    await assert.rejects(
      other.file({ id: solutionImage }),
      (e) => e.status === 403,
    );
    assert.equal(
      (await teacher.results({ id: hidden.id })).attempts[0].result.details[0]
        .explanationImageId,
      solutionImage,
    );
  } finally {
    sqlite.close();
  }
});
