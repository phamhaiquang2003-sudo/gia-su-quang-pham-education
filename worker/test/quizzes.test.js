import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { makeQuizService, finalizeExpired } from "../src/quiz-service.js";
import {
  grade,
  publicQuiz,
  publicResult,
  validateQuiz,
  validateResponses,
  shortMatches,
  fileIds,
} from "../src/quiz-model.js";
import { requireQuizUser } from "../src/quiz-auth.js";
import { makeHandler } from "../src/index.js";
import { makeProfileService, studyStreak } from "../src/profile-service.js";
import { DOC_MIME, DOCX_MIME } from "../src/word-files.js";
import { parseQuickAnswerKey } from "../../shared/quiz-forms.js";

const wordWorksheet = Buffer.from(
  readFileSync(
    new URL("./fixtures/worksheet.docx.base64", import.meta.url),
    "utf8",
  ).trim(),
  "base64",
);
function teacherUpload(bytes, mime, name = "Đề bài.docx") {
  return new Request(
    `https://example.test/api/quiz/upload?name=${encodeURIComponent(name)}`,
    { method: "POST", headers: { "Content-Type": mime }, body: bytes },
  );
}

test("teacher Word uploads retain original bytes/name, are downloadable only through quiz permissions, survive snapshots and delete with their quiz", async () => {
  const { db, sqlite } = database();
  try {
    const teacher = makeQuizService(db, adminUser),
      student = makeQuizService(db, studentUser);
    await assert.rejects(
      student.upload(teacherUpload(wordWorksheet, DOCX_MIME)),
      (e) => e.status === 403,
    );
    const uploaded = await teacher.upload(
      teacherUpload(wordWorksheet, DOCX_MIME),
    );
    const source = {
      ...essayFixture("document"),
      documentIds: [uploaded.file.id],
      status: "draft",
    };
    let saved = (await teacher.save({ quiz: source })).quiz;
    await assert.rejects(
      student.file({ id: uploaded.file.id }),
      (e) => e.status === 403,
    );
    saved = (
      await teacher.save({
        id: saved.id,
        revision: saved.revision,
        quiz: { ...source, status: "published" },
      })
    ).quiz;
    assert.equal((await student.file({ id: uploaded.file.id })).status, 200);
    const started = await student.start({ id: saved.id });
    const response = await student.file({ id: uploaded.file.id });
    assert.equal(response.headers.get("Content-Type"), DOCX_MIME);
    assert.equal(
      response.headers.get("Access-Control-Expose-Headers"),
      "Content-Disposition",
    );
    assert.equal(
      response.headers.get("Content-Disposition"),
      `attachment; filename*=UTF-8''${encodeURIComponent("Đề bài.docx")}`,
    );
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), wordWorksheet);
    await assert.rejects(
      student.submissionUpload(
        workUpload(started.attempt, "__submission", wordWorksheet, DOCX_MIME),
      ),
    );
    await teacher.save({
      id: saved.id,
      revision: saved.revision,
      quiz: fixture(),
    });
    assert.equal((await student.file({ id: uploaded.file.id })).status, 200);
    await teacher.deleteQuiz({ id: saved.id, revision: saved.revision + 1 });
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_files").get().n,
      0,
    );
  } finally {
    sqlite.close();
  }
});

test("Word format checks accept legacy DOC signatures, reject unrelated/truncated archives, mismatched content and oversized files", async () => {
  const { db, sqlite } = database();
  try {
    const teacher = makeQuizService(db, adminUser);
    const doc = Buffer.alloc(512);
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(doc);
    Buffer.from("WordDocument", "utf16le").copy(doc, 128);
    const legacy = await teacher.upload(
      teacherUpload(doc, DOC_MIME, "Đề cũ.doc"),
    );
    assert.equal(legacy.file.mime, DOC_MIME);
    assert.deepEqual(
      Buffer.from(
        await (await teacher.file({ id: legacy.file.id })).arrayBuffer(),
      ),
      doc,
    );
    const unrelatedZip = Buffer.from(
      wordWorksheet
        .toString("latin1")
        .replaceAll("word/document.xml", "xl__/document.xml"),
      "latin1",
    );
    for (const [bytes, mime] of [
      [unrelatedZip, DOCX_MIME],
      [wordWorksheet.subarray(0, 100), DOCX_MIME],
      [wordWorksheet, DOC_MIME],
      [doc, DOCX_MIME],
      [Buffer.from("PK fake Word"), DOCX_MIME],
      [Buffer.alloc(512), DOC_MIME],
    ])
      await assert.rejects(
        teacher.upload(teacherUpload(bytes, mime)),
        (e) => e.code === "invalid-argument",
      );
    await assert.rejects(
      teacher.upload(teacherUpload(Buffer.alloc(1_800_001), DOCX_MIME)),
      (e) => e.status === 413,
    );
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_files").get().n,
      1,
    );
  } finally {
    sqlite.close();
  }
});

// Run the real SQL against SQLite, including atomic batches and preconditions.
const submissionPng = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);

test("profile avatar is private to the authenticated account, persists/replaces one row, and rejects invalid formats and oversized uploads", async () => {
  const { db, sqlite } = database();
  let now = 1000;
  try {
    const student = makeProfileService(db, studentUser, () => now);
    const other = makeProfileService(db, { ...studentUser, uid: "other-profile" }, () => now);
    const teacher = makeProfileService(db, adminUser, () => now);
    const empty = await student.profileOverview({ uid: "other-profile" });
    assert.deepEqual(empty.stats, { studiedSubjects: 0, completedAttempts: 0, studyMilliseconds: 0, streakDays: 0 });
    assert.deepEqual(empty.recent, []);
    assert.equal(empty.hasAvatar, false);
    await assert.rejects(student.profileAvatar(), error => error.status === 404);
    await student.profileAvatarUpload(teacherUpload(submissionPng, "image/png", "avatar.png"));
    const photo = await student.profileAvatar({ uid: "other-profile" });
    assert.equal(photo.headers.get("Content-Type"), "image/png");
    assert.equal(photo.headers.get("Cache-Control"), "no-store");
    assert.equal(photo.headers.get("X-Content-Type-Options"), "nosniff");
    assert.deepEqual(new Uint8Array(await photo.arrayBuffer()), submissionPng);
    await assert.rejects(other.profileAvatar({ uid: studentUser.uid }), error => error.status === 404);
    await assert.rejects(teacher.profileAvatar({ uid: studentUser.uid }), error => error.status === 404);
    now = 2000;
    const webp = new Uint8Array([82,73,70,70,255,255,255,128,87,69,66,80,1]);
    await student.profileAvatarUpload(teacherUpload(webp, "image/webp", "avatar.webp"));
    await other.profileAvatarUpload(teacherUpload(submissionPng, "image/png", "avatar.png"));
    assert.deepEqual(new Uint8Array(await (await student.profileAvatar()).arrayBuffer()), webp);
    assert.equal((await student.profileOverview()).avatarUpdatedAt, 2000);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM student_profiles").get().n, 2);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_files").get().n, 0);
    const tooLarge = new Uint8Array(350001); tooLarge.set(submissionPng);
    await assert.rejects(student.profileAvatarUpload(teacherUpload(tooLarge, "image/png")), error => error.status === 413);
    await assert.rejects(student.profileAvatarUpload(teacherUpload("<svg></svg>", "image/svg+xml")));
    await assert.rejects(student.profileAvatarUpload(teacherUpload(submissionPng, "image/jpeg")));
    assert.deepEqual(new Uint8Array(await (await student.profileAvatar()).arrayBuffer()), webp);
  } finally { sqlite.close(); }
});

test("profile statistics use only own attempts, count retakes once in progress, hide pending scores, preserve hidden-quiz history, and finish only own expired attempts", async () => {
  const { db, sqlite } = database();
  const day = 86400000;
  let now = Date.UTC(2026, 9, 4, 2);
  try {
    const teacher = makeQuizService(db, adminUser, () => now);
    const student = makeQuizService(db, studentUser, () => now);
    const otherUser = { ...studentUser, uid: "other-history" };
    const other = makeQuizService(db, otherUser, () => now);
    const ownProfile = makeProfileService(db, studentUser, () => now);
    const maths = (await teacher.save({ quiz: fixture() })).quiz;
    const unusedMaths = (await teacher.save({ quiz: { ...fixture(), title: "Other student's quiz" } })).quiz;
    const physics = (await teacher.save({ quiz: { ...fixture(), subject: "vat-ly" } })).quiz;
    const manualInput = { ...essayFixture(), subject: "vat-ly" };
    const manual = (await teacher.save({ quiz: manualInput })).quiz;
    const golden = { single: "B", tf: [true, false, true, false], short: "0.5" };
    let first = (await student.start({ id: maths.id })).attempt;
    now += 30000;
    await student.submit({ id: first.id, revision: first.revision, answers: golden });
    await teacher.allowRetake({ id: first.id });
    now = Date.UTC(2026, 9, 5, 2);
    const second = (await student.start({ id: maths.id })).attempt;
    now += 20000;
    await student.submit({ id: second.id, revision: second.revision, answers: golden });
    now = Date.UTC(2026, 9, 6, 2);
    const pending = (await student.start({ id: manual.id })).attempt;
    now += 50000;
    await student.submit({ id: pending.id, revision: pending.revision, answers: {} });
    await teacher.hide({ id: manual.id });
    const foreign = (await other.start({ id: unusedMaths.id })).attempt;
    let expiring = (await student.start({ id: physics.id })).attempt;
    expiring = (await student.progress({ id: expiring.id, revision: expiring.revision, answers: golden })).attempt;
    now = expiring.deadlineAt + 1;
    const overview = await ownProfile.profileOverview({ uid: otherUser.uid });
    assert.deepEqual(overview.stats, { studiedSubjects: 2, completedAttempts: 3, studyMilliseconds: 130000, streakDays: 2 });
    assert.deepEqual(overview.progress.find(row => row.subject === "toan"), { subject: "toan", total: 2, completed: 1, percent: 50 });
    assert.deepEqual(overview.progress.find(row => row.subject === "vat-ly"), { subject: "vat-ly", total: 1, completed: 1, percent: 100 });
    assert.equal(overview.recent.length, 3);
    assert.equal(overview.recent.find(row => row.id === pending.id).status, "pending");
    assert.equal(overview.recent.find(row => row.id === pending.id).score, null);
    assert.equal(overview.recent.find(row => row.id === expiring.id).score, 10);
    assert.equal(overview.recent.find(row => row.id === expiring.id).submittedAt, expiring.deadlineAt);
    assert.equal(overview.recent.some(row => row.id === first.id), false);
    assert.equal(overview.recent.some(row => row.id === foreign.id), false);
    assert.equal(sqlite.prepare("SELECT submitted_at FROM quiz_attempts WHERE id=?").get(foreign.id).submitted_at, null);
    for (const row of overview.recent) for (const field of ["answers", "snapshot", "result", "acceptedAnswers", "user_uid"]) assert.equal(row[field], undefined);
    const teacherProfile = await makeProfileService(db, adminUser, () => now).profileOverview({ uid: studentUser.uid });
    assert.equal(teacherProfile.stats.completedAttempts, 0);
    assert.deepEqual(teacherProfile.recent, []);
    await teacher.manualGrade({ id: pending.id, revision: (await student.detail({ id: manual.id })).attempt.revision, score: 8.5, feedback: "Good" });
    assert.equal((await ownProfile.profileOverview()).recent.find(row => row.id === pending.id).score, 8.5);
  } finally { sqlite.close(); }
});

test("study streak uses Vietnam midnight, allows yesterday as the last active day, and breaks at gaps", () => {
  const day = 86400000, midnight = Date.UTC(2026, 9, 5, 17);
  const today = Math.floor((midnight + 25200000) / day);
  assert.equal(studyStreak([today, today - 1, today - 2], midnight), 3);
  assert.equal(studyStreak([today - 1, today - 2], midnight), 2);
  assert.equal(studyStreak([today - 2], midnight), 0);
  assert.equal(studyStreak([today, today - 2], midnight), 1);
  assert.equal(studyStreak([today - 1, today - 2], midnight - 1), 2);
  assert.equal(studyStreak([], midnight), 0);
});
function workUpload(
  attempt,
  questionId,
  bytes = submissionPng,
  mime = "image/png",
) {
  return new Request(
    `https://example.test/api/quiz/submissionUpload?attemptId=${attempt.id}&questionId=${questionId}&revision=${attempt.revision}&name=work.png`,
    {
      method: "POST",
      headers: { "Content-Type": mime },
      body: bytes,
    },
  );
}
function essayFixture(mode = "inline") {
  return {
    ...fixture(),
    gradingMode: "manual",
    mode,
    questions:
      mode === "document"
        ? []
        : [
            {
              id: "essay-one",
              type: "essay",
              prompt: "Giải câu 1",
              points: 1,
              imageId: "",
            },
            {
              id: "essay-two",
              type: "essay",
              prompt: "Giải câu 2",
              points: 1,
              imageId: "",
            },
          ],
    documentIds: mode === "document" ? ["essay-pdf"] : [],
  };
}

test("quiz schedules are optional, validate absolute timestamps and require closing after opening", () => {
  assert.equal(validateQuiz(fixture()).opensAt, null);
  assert.equal(validateQuiz(fixture()).closesAt, null);
  for (const fields of [{ opensAt: 1_000_000 }, { closesAt: 2_000_000 }, { opensAt: 1_000_000, closesAt: 2_000_000 }, { opensAt: "", closesAt: null }])
    assert.doesNotThrow(() => validateQuiz({ ...fixture(), ...fields }));
  for (const value of ["2026-10-05T09:00", -1, 0, 1.5, Infinity, NaN, true, {}, 253402300800000]) {
    assert.throws(() => validateQuiz({ ...fixture(), opensAt: value }));
    assert.throws(() => validateQuiz({ ...fixture(), closesAt: value }));
  }
  for (const closesAt of [1_000_000, 999_999])
    assert.throws(() => validateQuiz({ ...fixture(), opensAt: 1_000_000, closesAt }));
});

test("server schedule hides unopened content and files, checks exact boundaries, and closes a late-starting attempt using saved answers", async () => {
  const { db, sqlite } = database(); let now = 1_000_000;
  try {
    const teacher = makeQuizService(db, adminUser, () => now), student = makeQuizService(db, studentUser, () => now), other = makeQuizService(db, { ...studentUser, uid: "window-other" }, () => now);
    for (const id of ["window-pdf", "window-image"]) sqlite.prepare("INSERT INTO quiz_files(id,owner_uid,name,mime,data,created_at) VALUES(?,'teacher',?,'image/png',?,1)").run(id, id, submissionPng);
    const opensAt = now + 60_000, closesAt = opensAt + 30_000;
    const input = { ...fixture(), opensAt, closesAt, mode: "document", documentIds: ["window-pdf"] };
    input.questions[0].imageId = "window-image";
    const { quiz } = await teacher.save({ quiz: input }), id = quiz.id;
    assert.equal(quiz.opensAt, opensAt); assert.equal(quiz.closesAt, closesAt);
    assert.equal((await student.list({ subject: "toan" })).serverNow, now);
    assert.equal((await student.list({ subject: "toan" })).quizzes[0].closesAt, closesAt);
    assert.equal((await teacher.listAdmin()).quizzes[0].opensAt, opensAt);
    const detail = await student.detail({ id });
    assert.deepEqual(detail.quiz.questions, []); assert.deepEqual(detail.quiz.documentIds, []); assert.equal(detail.quiz.questionCount, 3);
    await assert.rejects(student.start({ id }), e => e.status === 403 && e.message.includes("chưa đến giờ"));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_attempts").get().n, 0);
    for (const file of ["window-pdf", "window-image"]) await assert.rejects(student.file({ id: file }), e => e.status === 403);
    assert.equal((await teacher.file({ id: "window-pdf" })).status, 200);
    now = opensAt;
    let a = (await student.start({ id })).attempt;
    assert.equal(a.startedAt, opensAt); assert.equal(a.deadlineAt, closesAt);
    assert.equal((await student.file({ id: "window-image" })).status, 200);
    a = (await student.progress({ id: a.id, revision: a.revision, answers: { single: "B", tf: [true,false,true,false], short: "0.5" }, flagged: ["single"] })).attempt;
    now = closesAt;
    await assert.rejects(other.start({ id }), e => e.status === 403 && e.message.includes("đã đóng"));
    await assert.rejects(other.file({ id: "window-pdf" }), e => e.status === 403);
    const ended = await student.submit({ id: a.id, revision: a.revision, answers: { single: "A" }, flagged: [] });
    assert.equal(ended.attempt.result.score, 10); assert.equal(ended.attempt.submittedAt, closesAt);
    assert.deepEqual(ended.attempt.flagged, ["single"]);
    assert.equal((await student.start({ id })).attempt.id, a.id);
    assert.equal((await student.detail({ id })).attempt.result.score, 10);
    assert.equal((await student.file({ id: "window-pdf" })).status, 200);
    assert.deepEqual((await other.detail({ id })).quiz.questions, []);
    await teacher.allowRetake({ id: a.id });
    await assert.rejects(student.start({ id }), e => e.status === 403);
    await teacher.save({ id, revision: 1, quiz: { ...input, opensAt: null, closesAt: null } });
    const newAttempt = await student.start({ id });
    assert.equal(newAttempt.attempt.attemptNumber, 2);
    assert.equal(newAttempt.attempt.deadlineAt, now + 60_000);
    assert.deepEqual(newAttempt.attempt.answers, {});
  } finally { sqlite.close(); }
});

test("unrestricted legacy quizzes, opening-only and closing-only schedules work; schedule edits keep started snapshots and stale starts cannot bypass revision checks", async () => {
  const { db, sqlite } = database(); let now = 1_000_000;
  try {
    const teacher = makeQuizService(db, adminUser, () => now), student = makeQuizService(db, studentUser, () => now), other = makeQuizService(db, { ...studentUser, uid: "later-window" }, () => now);
    const legacy = (await teacher.save({ quiz: fixture() })).quiz;
    sqlite.prepare("UPDATE quizzes SET body=json_remove(body,'$.opensAt','$.closesAt') WHERE id=?").run(legacy.id);
    assert.equal((await student.list({ subject: "toan" })).quizzes[0].opensAt, null);
    assert.equal((await student.start({ id: legacy.id })).attempt.deadlineAt, now + 60_000);
    sqlite.prepare("INSERT INTO quiz_files(id,owner_uid,name,mime,data,created_at) VALUES('opening-image','teacher','image.png','image/png',?,1)").run(submissionPng);
    const openingInput = { ...fixture(), opensAt: now + 10_000 };
    openingInput.questions[0].imageId = "opening-image";
    const opening = (await teacher.save({ quiz: openingInput })).quiz;
    assert.deepEqual((await student.detail({ id: opening.id })).quiz.questions, []);
    await assert.rejects(other.file({ id: "opening-image" }), e => e.status === 403);
    now += 10_000;
    const a = (await student.start({ id: opening.id })).attempt;
    assert.equal((await other.file({ id: "opening-image" })).status, 200);
    assert.equal(a.deadlineAt, now + 60_000);
    await teacher.save({ id: opening.id, revision: 1, quiz: { ...openingInput, opensAt: now - 1000, closesAt: now + 5000 } });
    assert.equal((await student.detail({ id: opening.id })).attempt.deadlineAt, a.deadlineAt);
    now += 5000;
    await assert.rejects(other.file({ id: "opening-image" }), e => e.status === 403);
    assert.equal((await student.file({ id: "opening-image" })).status, 200);
    const closing = (await teacher.save({ quiz: { ...fixture(), closesAt: now + 120_000 } })).quiz;
    assert.equal((await student.start({ id: closing.id })).attempt.deadlineAt, now + 60_000);
    const closeSoon = (await teacher.save({ quiz: { ...fixture(), closesAt: now + 5000 } })).quiz;
    assert.equal((await student.start({ id: closeSoon.id })).attempt.deadlineAt, now + 5000);
    // A changed schedule between reading the quiz and the insert cannot start the stale version.
    const race = (await teacher.save({ quiz: fixture() })).quiz;
    const originalBatch = db.batch.bind(db); let changed = false;
    db.batch = async statements => {
      if (!changed) { changed = true; sqlite.prepare("UPDATE quizzes SET body=json_set(body,'$.closesAt',?),revision=revision+1 WHERE id=?").run(now - 1, race.id); }
      return originalBatch(statements);
    };
    await assert.rejects(other.start({ id: race.id }), e => e.status === 409);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_attempts WHERE quiz_id=?").get(race.id).n, 0);
    await assert.rejects(other.start({ id: race.id }), e => e.status === 403);
  } finally { sqlite.close(); }
});

test("scheduled manual attempts stop photo uploads at closing and cron retains saved photos for teacher grading", async () => {
  const { db, sqlite } = database(); let now = 1_000_000;
  try {
    const teacher = makeQuizService(db, adminUser, () => now), student = makeQuizService(db, studentUser, () => now);
    const closesAt = now + 5000;
    const { quiz } = await teacher.save({ quiz: { ...essayFixture(), closesAt } });
    let a = (await student.start({ id: quiz.id })).attempt;
    a = (await student.submissionUpload(workUpload(a, "essay-one"))).attempt;
    const fileId = a.answers["essay-one"].imageIds[0];
    now = closesAt;
    await assert.rejects(student.submissionUpload(workUpload(a, "essay-one")), e => e.status === 409);
    await assert.rejects(student.removeSubmissionFile({ id: a.id, revision: a.revision, fileId }), e => e.status === 409);
    await finalizeExpired(db);
    const ended = (await student.detail({ id: quiz.id })).attempt;
    assert.equal(ended.submittedAt, closesAt); assert.equal(ended.result.status, "pending");
    assert.deepEqual(ended.answers["essay-one"].imageIds, [fileId]);
    assert.equal((await student.file({ id: fileId })).status, 200);
    assert.equal((await teacher.manualGrade({ id: ended.id, revision: ended.revision, score: 8, feedback: "Đã chấm" })).attempt.result.score, 8);
  } finally { sqlite.close(); }
});

test("unhide republishes only a current hidden quiz, preserving answer keys, files, attempts and grades", async () => {
  const { db, sqlite } = database();
  let now = 1_000_000;
  try {
    const teacher = makeQuizService(db, adminUser, () => now),
      student = makeQuizService(db, studentUser, () => now);
    const input = fixture();
    input.questions[0].imageId = "unhide-image";
    sqlite
      .prepare(
        "INSERT INTO quiz_files(id,owner_uid,name,mime,data,created_at) VALUES('unhide-image','teacher','image.png','image/png',?,1)",
      )
      .run(submissionPng);
    const { quiz } = await teacher.save({ quiz: input });
    const started = await student.start({ id: quiz.id });
    await student.submit({
      id: started.attempt.id,
      revision: 0,
      answers: { single: "B", tf: [true, false, true, false], short: "0.5" },
      flagged: [],
    });
    const before = sqlite
      .prepare("SELECT * FROM quiz_attempts WHERE id=?")
      .get(started.attempt.id);
    await teacher.hide({ id: quiz.id });
    assert.equal((await student.list({ subject: "toan" })).quizzes.length, 0);
    await assert.rejects(
      student.unhide({ id: quiz.id, revision: 2 }),
      (e) => e.status === 403,
    );
    await assert.rejects(
      teacher.unhide({ id: quiz.id, revision: 1 }),
      (e) => e.status === 409,
    );
    now += 1000;
    const restored = (await teacher.unhide({ id: quiz.id, revision: 2 })).quiz;
    assert.equal(restored.status, "published");
    assert.equal(restored.revision, 3);
    assert.equal(restored.updatedAt, now);
    assert.equal(
      (await student.list({ subject: "toan" })).quizzes[0].id,
      quiz.id,
    );
    assert.deepEqual(
      (await teacher.adminDetail({ id: quiz.id })).quiz.questions,
      validateQuiz(input).questions,
    );
    assert.deepEqual(
      sqlite
        .prepare("SELECT * FROM quiz_attempts WHERE id=?")
        .get(started.attempt.id),
      before,
    );
    assert.equal(
      (await student.detail({ id: quiz.id })).attempt.result.score,
      10,
    );
    assert.equal((await student.file({ id: "unhide-image" })).status, 200);
    await assert.rejects(
      teacher.unhide({ id: quiz.id, revision: 3 }),
      (e) => e.status === 409,
    );
    // A body saved with hidden status is synchronized when republished.
    await teacher.save({
      id: quiz.id,
      revision: 3,
      quiz: { ...input, status: "hidden" },
    });
    await teacher.unhide({ id: quiz.id, revision: 4 });
    const other = makeQuizService(
      db,
      { ...studentUser, uid: "unhide-other" },
      () => now,
    );
    assert.equal(
      (await other.detail({ id: quiz.id })).quiz.status,
      "published",
    );
    assert.equal(
      (await other.start({ id: quiz.id })).quiz.status,
      "published",
    );
    const draft = (
      await teacher.save({ quiz: { ...fixture(), status: "draft" } })
    ).quiz;
    await assert.rejects(
      teacher.unhide({ id: draft.id, revision: draft.revision }),
      (e) => e.status === 409,
    );
    await teacher.deleteQuiz({ id: quiz.id, revision: 5 });
    await assert.rejects(
      teacher.unhide({ id: quiz.id, revision: 5 }),
      (e) => e.status === 404,
    );
  } finally {
    sqlite.close();
  }
});

test("manual authoring supports PDF without answer rows and inline essay questions, and rejects mixed modes/invalid submissions", () => {
  assert.equal(validateQuiz(essayFixture()).questions[0].type, "essay");
  assert.equal(validateQuiz(essayFixture("document")).questions.length, 0);
  assert.throws(() => validateQuiz({ ...essayFixture(), gradingMode: "auto" }));
  assert.throws(() =>
    validateQuiz({
      ...essayFixture("document"),
      questions: essayFixture().questions,
    }),
  );
  assert.throws(() => validateQuiz({ ...fixture(), gradingMode: "manual" }));
  assert.throws(() =>
    validateQuiz({ ...essayFixture("document"), documentIds: [] }),
  );
  const quiz = validateQuiz(essayFixture());
  for (const answers of [
    { "essay-one": "plain string" },
    { other: { text: "x", imageIds: [] } },
    { "essay-one": { text: "x", imageIds: ["bad id"] } },
    { "essay-one": { imageIds: ["same", "same"] } },
  ])
    assert.throws(() => validateResponses(quiz, answers));
});

test("private essay images autosave to their own question/attempt; submit waits for manual grading, teacher can grade/regrade, retakes and deletion retain correct ownership", async () => {
  const { db, sqlite } = database();
  let now = 1_000_000;
  try {
    const teacher = makeQuizService(db, adminUser, () => now),
      student = makeQuizService(db, studentUser, () => now),
      other = makeQuizService(
        db,
        { ...studentUser, uid: "essay-other" },
        () => now,
      );
    const saved = await teacher.save({
        quiz: essayFixture(),
      }),
      id = saved.quiz.id;
    assert.equal(saved.quiz.gradingMode, "manual");
    assert.equal(
      (await student.list({ subject: "toan" })).quizzes[0].gradingMode,
      "manual",
    );
    let { attempt: a } = await student.start({ id });
    await assert.rejects(student.submissionUpload(workUpload(a, "outside")));
    await assert.rejects(
      other.submissionUpload(workUpload(a, "essay-one")),
      (e) => e.status === 404,
    );
    await assert.rejects(
      student.submissionUpload(
        workUpload(
          a,
          "essay-one",
          new TextEncoder().encode("%PDF-test"),
          "application/pdf",
        ),
      ),
    );
    await assert.rejects(
      student.submissionUpload(
        workUpload(a, "essay-one", new Uint8Array([1, 2, 3])),
      ),
    );
    const upload = await student.submissionUpload(workUpload(a, "essay-one"));
    const fileId = upload.attempt.answers["essay-one"].imageIds[0];
    assert.equal(upload.attempt.revision, a.revision + 1);
    a = upload.attempt;
    assert.equal(
      (await student.detail({ id })).attempt.answers["essay-one"].imageIds[0],
      fileId,
    );
    assert.equal((await student.file({ id: fileId })).status, 200);
    assert.equal((await teacher.file({ id: fileId })).status, 200);
    await assert.rejects(other.file({ id: fileId }), (e) => e.status === 403);
    await assert.rejects(
      student.progress({
        id: a.id,
        revision: a.revision,
        answers: { "essay-two": { text: "", imageIds: [fileId] } },
      }),
      (e) => e.status === 403,
    );
    const answers = {
      ...a.answers,
      "essay-one": { text: "Bài giải viết tay", imageIds: [fileId] },
    };
    a = (
      await student.progress({
        id: a.id,
        revision: a.revision,
        answers,
        flagged: [],
      })
    ).attempt;
    await assert.rejects(
      student.manualGrade({
        id: a.id,
        revision: a.revision,
        score: 10,
        feedback: "",
      }),
      (e) => e.status === 403,
    );
    await assert.rejects(
      teacher.manualGrade({
        id: a.id,
        revision: a.revision,
        score: 10,
        feedback: "",
      }),
      (e) => e.status === 409,
    );
    const pending = await student.submit({
      id: a.id,
      revision: a.revision,
      answers,
      flagged: [],
    });
    a = pending.attempt;
    assert.equal(a.result.manual, true);
    assert.equal(a.result.status, "pending");
    assert.equal(a.result.details.length, 0);
    await assert.rejects(
      student.submissionUpload(workUpload(a, "essay-one")),
      (e) => e.status === 409,
    );
    await assert.rejects(
      student.removeSubmissionFile({ id: a.id, revision: a.revision, fileId }),
      (e) => e.status === 409,
    );
    assert.deepEqual(
      (
        await student.submit({
          id: a.id,
          revision: a.revision,
          answers: {},
          flagged: [],
        })
      ).attempt.answers,
      answers,
    );
    for (const score of [-1, 11, NaN, "8"])
      await assert.rejects(
        teacher.manualGrade({
          id: a.id,
          revision: a.revision,
          score,
          feedback: "",
        }),
      );
    a = (
      await teacher.manualGrade({
        id: a.id,
        revision: a.revision,
        score: 8.75,
        feedback: "Trình bày tốt, cần bổ sung đơn vị.",
      })
    ).attempt;
    assert.equal(a.result.status, "graded");
    assert.equal(a.result.score, 8.75);
    await assert.rejects(
      teacher.manualGrade({
        id: a.id,
        revision: a.revision - 1,
        score: 9,
        feedback: "",
      }),
      (e) => e.status === 409,
    );
    a = (
      await teacher.manualGrade({
        id: a.id,
        revision: a.revision,
        score: 9,
        feedback: "Đã cập nhật.",
      })
    ).attempt;
    assert.equal(
      (await student.detail({ id })).attempt.result.feedback,
      "Đã cập nhật.",
    );
    await teacher.allowRetake({ id: a.id });
    const retake = await student.start({ id });
    assert.deepEqual(retake.attempt.answers, {});
    await assert.rejects(
      student.progress({
        id: retake.attempt.id,
        revision: 0,
        answers: { "essay-one": { text: "", imageIds: [fileId] } },
      }),
      (e) => e.status === 403,
    );
    await assert.rejects(student.file({ id: fileId }), e => e.status === 404);
    assert.equal((await teacher.results({ id })).attempts.some(old => old.id === a.id), false);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_attempts WHERE id=?").get(a.id).n, 0);
    await teacher.deleteQuiz({ id, revision: saved.quiz.revision });
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM submission_file_links").get().n,
      0,
    );
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_files").get().n,
      0,
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

test("manual PDF uses one submission, uploaded work survives deadline and changed quiz; removing images and 20-file limit are enforced", async () => {
  const { db, sqlite } = database();
  let now = 1_000_000;
  try {
    const teacher = makeQuizService(db, adminUser, () => now),
      student = makeQuizService(db, studentUser, () => now);
    sqlite
      .prepare(
        "INSERT INTO quiz_files(id,owner_uid,name,mime,data,created_at) VALUES('essay-pdf','teacher','test.pdf','application/pdf',?,1)",
      )
      .run(new TextEncoder().encode("%PDF-test"));
    const { quiz } = await teacher.save({ quiz: essayFixture("document") });
    let a = (await student.start({ id: quiz.id })).attempt;
    a = (await student.submissionUpload(workUpload(a, "__submission"))).attempt;
    const removedId = a.answers.__submission.imageIds[0];
    await assert.rejects(
      student.removeSubmissionFile({
        id: a.id,
        revision: a.revision - 1,
        fileId: removedId,
      }),
      (e) => e.status === 409,
    );
    a = (
      await student.removeSubmissionFile({
        id: a.id,
        revision: a.revision,
        fileId: removedId,
      })
    ).attempt;
    assert.equal(a.answers.__submission.imageIds.length, 0);
    await assert.rejects(
      student.file({ id: removedId }),
      (e) => e.status === 404,
    );
    for (let i = 0; i < 20; i++)
      a = (await student.submissionUpload(workUpload(a, "__submission")))
        .attempt;
    await assert.rejects(
      student.submissionUpload(workUpload(a, "__submission")),
      (e) => e.message.includes("20"),
    );
    await teacher.save({
      id: quiz.id,
      revision: quiz.revision,
      quiz: fixture(),
    });
    now = a.deadlineAt + 1;
    const expired = (await student.detail({ id: quiz.id })).attempt;
    assert.equal(expired.result.status, "pending");
    assert.equal(expired.answers.__submission.imageIds.length, 20);
    const late = await student.submit({
      id: a.id,
      revision: a.revision,
      answers: { __submission: { text: "Late", imageIds: [] } },
      flagged: [],
    });
    assert.equal(late.attempt.answers.__submission.text, "");
    const graded = await teacher.manualGrade({
      id: expired.id,
      revision: expired.revision,
      score: 0,
      feedback: "Cần làm lại",
    });
    assert.equal(graded.attempt.result.score, 0);
    assert.equal(graded.attempt.result.status, "graded");
    await teacher.deleteQuiz({ id: quiz.id, revision: quiz.revision + 1 });
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_files").get().n,
      0,
    );
  } finally {
    sqlite.close();
  }
});

test("student uploads and removals are atomic across concurrent edits; WebP signature checks do not decode size bytes", async () => {
  const { db, sqlite } = database();
  try {
    const teacher = makeQuizService(db, adminUser, () => 1_000_000),
      student = makeQuizService(db, studentUser, () => 1_000_000);
    const { quiz } = await teacher.save({ quiz: essayFixture() });
    let a = (await student.start({ id: quiz.id })).attempt;
    const webp = new Uint8Array([
      82, 73, 70, 70, 0xc2, 0xa0, 0, 0, 87, 69, 66, 80, 1,
    ]);
    a = (
      await student.submissionUpload(
        workUpload(a, "essay-one", webp, "image/webp"),
      )
    ).attempt;
    a = (await student.submissionUpload(workUpload(a, "essay-two"))).attempt;
    const originalBatch = db.batch.bind(db);
    let raced = false;
    db.batch = async (statements) => {
      if (!raced) {
        raced = true;
        sqlite
          .prepare("UPDATE quiz_attempts SET revision=revision+1 WHERE id=?")
          .run(a.id);
      }
      return originalBatch(statements);
    };
    const fileId = a.answers["essay-one"].imageIds[0];
    await assert.rejects(
      student.removeSubmissionFile({ id: a.id, revision: a.revision, fileId }),
      (e) => e.status === 409,
    );
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM submission_file_links").get().n,
      2,
    );
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_files").get().n,
      2,
    );
    a = (await student.detail({ id: quiz.id })).attempt;
    raced = false;
    await assert.rejects(
      student.submissionUpload(workUpload(a, "essay-one")),
      (e) => e.status === 409,
    );
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_files").get().n,
      2,
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});
function database(beforeMigration = "") {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON;");
  const migrations = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(migrations)
    .filter((file) => file.endsWith(".sql") && (!beforeMigration || file < beforeMigration))
    .sort())
    sqlite.exec(readFileSync(new URL(file, migrations), "utf8"));
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

function fixedFormFixture(fixedForm) {
  const [single, truefalse, short, shortPoints] = fixedForm === "mixed-22"
    ? [12, 4, 6, 0.5] : fixedForm === "mixed-28" ? [18, 4, 6, 0.25] : [40, 0, 0, 0.25];
  const sample = fixture();
  return {
    ...sample, fixedForm,
    questions: [
      ...Array.from({ length: single }, (_, i) => ({ ...structuredClone(sample.questions[0]), id: `single-${i}`, points: 0.25 })),
      ...Array.from({ length: truefalse }, (_, i) => ({ ...structuredClone(sample.questions[1]), id: `tf-${i}`, points: 1, scoring: "exam" })),
      ...Array.from({ length: short }, (_, i) => ({ ...structuredClone(sample.questions[2]), id: `short-${i}`, points: shortPoints })),
    ],
  };
}

function fullMultipleChoiceFixture(count) {
  const sample = fixture();
  return {
    ...sample,
    fixedForm: "single-all",
    questions: Array.from({ length: count }, (_, index) => ({
      ...structuredClone(sample.questions[0]),
      id: `single-${index}`,
      points: 10 / count,
      answer: "ABCD"[index % 4],
    })),
  };
}

test("full multiple-choice forms grade 1–100 equal-weight questions without rounded-weight drift", () => {
  for (let count = 1; count <= 100; count++) {
    const quiz = validateQuiz(fullMultipleChoiceFixture(count));
    assert.equal(quiz.questions.length, count);
    assert.ok(quiz.questions.every(question => question.points === 10 / count));
    const all = Object.fromEntries(quiz.questions.map(question => [question.id, question.answer]));
    const perfect = grade(quiz, all);
    assert.equal(perfect.score, 10);
    assert.equal(perfect.earned, 10);
    assert.equal(perfect.total, 10);
    assert.equal(perfect.correctCount, count);
    delete all[quiz.questions.at(-1).id];
    const partial = grade(quiz, all);
    assert.equal(partial.earned, (count - 1) * 10 / count);
    assert.equal(partial.score, Math.round(((count - 1) * 10 / count) * 100) / 100);
    assert.equal(partial.total, 10);
    assert.equal(partial.unansweredCount, 1);
    assert.equal(partial.details.at(-1).points, 0);
    assert.equal(partial.details.at(-1).maxPoints, 10 / count);
    assert.equal(publicQuiz(quiz).questions[0].answer, undefined);
  }
});

test("full multiple-choice forms reject out-of-range counts, mismatched weights and other question types", () => {
  for (const count of [0, 101])
    assert.throws(() => validateQuiz(fullMultipleChoiceFixture(count)), { code: "invalid-argument" });
  for (const change of [
    quiz => { quiz.questions[0].points = 0.833333; },
    quiz => { quiz.questions[0] = { ...fixture().questions[2], points: 10 / 12 }; },
    quiz => { quiz.questions.pop(); },
    quiz => { quiz.gradingMode = "manual"; },
  ]) {
    const quiz = fullMultipleChoiceFixture(12);
    change(quiz);
    assert.throws(() => validateQuiz(quiz), { code: "invalid-argument" });
  }
});

test("quick answer keys retain A/B/C/D order, accept separators and reject invalid or excess answers", () => {
  assert.deepEqual(parseQuickAnswerKey("ACD", 12), ["A", "C", "D"]);
  assert.deepEqual(parseQuickAnswerKey("a c\r\nd, b; A", 5), ["A", "C", "D", "B", "A"]);
  for (const input of ["", "  ", "ACX", "A1C", "A/C", "ABCD"])
    assert.throws(() => parseQuickAnswerKey(input, 3));
  assert.deepEqual(parseQuickAnswerKey("ABCD".repeat(25), 100), [..."ABCD".repeat(25)]);
});

test("full multiple-choice count changes preserve active snapshots and retakes use the new question count", async () => {
  const { db, sqlite } = database();
  try {
    const teacher = makeQuizService(db, adminUser, () => 1_000_000);
    const student = makeQuizService(db, studentUser, () => 1_000_000);
    const original = fullMultipleChoiceFixture(12);
    const saved = (await teacher.save({ quiz: original })).quiz;
    const active = (await student.start({ id: saved.id })).attempt;
    await teacher.save({ id: saved.id, revision: saved.revision, quiz: fullMultipleChoiceFixture(50) });
    const detail = await student.detail({ id: saved.id });
    assert.equal(detail.quiz.questions.length, 12);
    assert.equal(detail.quiz.questions[0].points, 10 / 12);
    const answers = Object.fromEntries(original.questions.slice(0, 11).map(question => [question.id, question.answer]));
    const result = (await student.submit({ id: active.id, revision: active.revision, answers, flagged: [] })).attempt;
    assert.equal(result.result.questionCount, 12);
    assert.equal(result.result.score, 9.17);
    assert.equal(result.result.total, 10);
    const next = await student.retake({ id: saved.id, attemptId: result.id, revision: result.revision });
    assert.equal(next.quiz.questions.length, 50);
    assert.equal(next.quiz.questions[0].points, 0.2);
    assert.deepEqual(next.attempt.answers, {});
    const newAnswers = Object.fromEntries(fullMultipleChoiceFixture(50).questions.map(question => [question.id, question.answer]));
    const perfect = (await student.submit({ id: next.attempt.id, revision: next.attempt.revision, answers: newAnswers, flagged: [] })).attempt;
    assert.equal(perfect.result.score, 10);
    assert.equal(perfect.result.earned, 10);
    assert.equal(perfect.result.total, 10);
  } finally {
    sqlite.close();
  }
});

test("all three fixed forms validate exact counts and weights, total ten points and grade full answers as ten", () => {
  for (const [id, counts] of [["mixed-22", [12, 4, 6]], ["mixed-28", [18, 4, 6]], ["single-40", [40, 0, 0]]]) {
    const quiz = validateQuiz(fixedFormFixture(id));
    assert.equal(quiz.fixedForm, id);
    assert.deepEqual(["single", "truefalse", "short"].map(type => quiz.questions.filter(q => q.type === type).length), counts);
    const answers = Object.fromEntries(quiz.questions.map(q => [q.id, q.answer || q.acceptedAnswers[0]]));
    const result = grade(quiz, answers);
    assert.equal(result.total, 10); assert.equal(result.earned, 10); assert.equal(result.score, 10);
    assert.equal(result.correctCount, counts.reduce((a, b) => a + b, 0));
    assert.equal(publicQuiz(quiz).fixedForm, id);
    assert.equal(publicQuiz(quiz).questions[0].answer, undefined);
  }
});

test("fixed forms reject count, type, ordering, point and true/false scoring changes; custom and manual quizzes keep existing behavior", () => {
  for (const id of ["mixed-22", "mixed-28", "single-40"]) {
    const changes = [
      q => { q.questions.pop(); },
      q => { q.questions.push({ ...q.questions[0], id: "extra" }); },
      q => { q.questions[0].points = 0.5; },
      q => { q.questions[0].type = "short"; },
      q => { q.gradingMode = "manual"; },
      q => { q.fixedForm = "unknown"; },
    ];
    if (id !== "single-40") changes.push(
      q => { q.questions.find(item => item.type === "truefalse").scoring = "equal"; },
      q => { delete q.questions.find(item => item.type === "truefalse").scoring; },
      q => { q.questions.find(item => item.type === "short").points = 1; },
      q => { const i = q.questions.findIndex(item => item.type === "truefalse"); [q.questions[0], q.questions[i]] = [q.questions[i], q.questions[0]]; },
    );
    for (const change of changes) {
      const input = fixedFormFixture(id); change(input);
      assert.throws(() => validateQuiz(input), { code: "invalid-argument" });
    }
  }
  const custom = fixedFormFixture("mixed-22");
  custom.fixedForm = ""; custom.questions[0].points = 2.75; custom.questions[12].scoring = "equal";
  assert.equal(validateQuiz(custom).questions[0].points, 2.75);
  assert.equal(validateQuiz(custom).questions[12].scoring, "exam");
  assert.equal(validateQuiz(fixture()).fixedForm, "");
  assert.equal(validateQuiz(essayFixture()).fixedForm, "");
});

test("mixed forms award 0.1/0.25/0.5/1 for one to four correct true/false statements and their exact short-answer points", () => {
  for (const [id, shortPoints] of [["mixed-22", 0.5], ["mixed-28", 0.25]]) {
    const quiz = validateQuiz(fixedFormFixture(id));
    const question = quiz.questions.find(q => q.type === "truefalse");
    const short = quiz.questions.find(q => q.type === "short");
    for (const [count, expected] of [[0, 0], [1, 0.1], [2, 0.25], [3, 0.5], [4, 1]]) {
      const result = grade(quiz, { [question.id]: question.answer.map((answer, index) => index < count ? answer : !answer), [short.id]: "0,5", "single-0": "B" });
      assert.equal(result.details.find(q => q.id === question.id).points, expected);
      assert.equal(result.details.find(q => q.id === short.id).points, shortPoints);
      assert.equal(result.score, Math.round((expected + shortPoints + 0.25) * 100) / 100);
    }
  }
});

test("custom true/false questions always use exam scoring even when a cached editor sends equal weighting or no scoring field", () => {
  for (const legacyScoring of [undefined, "equal", "exam"]) {
    for (const points of [1, 2.5]) {
      const input = fixture();
      input.questions[1].scoring = legacyScoring;
      input.questions[1].points = points;
      const quiz = validateQuiz(input), question = quiz.questions[1];
      assert.equal(question.scoring, "exam");
      for (const [count, ratio] of [[0, 0], [1, 0.1], [2, 0.25], [3, 0.5], [4, 1]]) {
        const answers = question.answer.map((answer, index) => index < count ? answer : !answer);
        const result = grade(quiz, { tf: answers });
        assert.equal(result.details[1].points, points * ratio);
        assert.equal(result.details[1].maxPoints, points);
      }
    }
  }
});

test("short answers compare exact decimal and fraction values without rounding away tiny differences", () => {
  for (const [answer, expected] of [
    ["0,5", "0.5"], ["1/2", "0.5"], ["2/4", "0,5"], ["0.5000", ".5"],
    [" 1 / 2 ", "0.5"], ["1/-2", "-0.5"], ["5e-1", "0.5"],
    ["0", "-0.000"], ["1e1000000", "10e999999"], ["１／２", "0.5"],
    ["HÀ   NỘI", "hà nội"],
  ]) assert.equal(shortMatches(answer, expected), true, `${answer} equals ${expected}`);
  for (const [answer, expected] of [
    ["0.51", "0.5"], ["0.5000000000000001", "0.5"], ["0.50000000000000001", "0.5"],
    ["1/3", "0.3333333333333333"], ["1e-400", "0"],
    ["10000000000000001", "10000000000000000"], ["1/0", "0.5"], ["", "0"],
    ["ha noi", "hà nội"],
  ]) assert.equal(shortMatches(answer, expected), false, `${answer} differs from ${expected}`);
});

test("new and edited short questions always discard the retired tolerance field and award points only for exact accepted answers", () => {
  for (const tolerance of [undefined, 0, 0.01, "0.1", -1, null, "old-setting"]) {
    const input = fixture(); input.questions[2].tolerance = tolerance;
    const quiz = validateQuiz(input);
    assert.equal(quiz.questions[2].tolerance, 0);
    for (const answer of ["0.51", "0.50000000000000001"])
      assert.equal(grade(quiz, { short: answer }).details[2].points, 0);
    assert.equal(grade(quiz, { short: "1/2" }).details[2].points, 2);
    quiz.questions[2].acceptedAnswers.push("0.6");
    assert.equal(grade(quiz, { short: "3/5" }).details[2].points, 2);
  }
});

test("exact-answer migration updates only current tolerant quizzes with a new revision; snapshots, submitted grades, files and other content persist", async () => {
  const { db, sqlite } = database("0009");
  try {
    const now = 1_000_000;
    const teacher = makeQuizService(db, adminUser, () => now);
    const student = makeQuizService(db, studentUser, () => now);
    const other = makeQuizService(db, { ...studentUser, uid: "old-submitted" }, () => now);
    const uploaded = await teacher.upload(teacherUpload(submissionPng, "image/png", "exact-migration.png"));
    const input = { ...fixture(), opensAt: now - 1000, closesAt: now + 60_000 };
    input.questions[0].imageId = uploaded.file.id;
    const { quiz } = await teacher.save({ quiz: input });
    sqlite.prepare("UPDATE quizzes SET body=json_set(body,'$.questions[2].tolerance',0.01) WHERE id=?").run(quiz.id);
    const unaffected = (await teacher.save({ quiz: fixture() })).quiz;
    const manual = (await teacher.save({ quiz: essayFixture() })).quiz;
    let active = (await student.start({ id: quiz.id })).attempt;
    const answers = { single: "B", tf: [true, false, true, false], short: "0.51" };
    active = (await student.progress({ id: active.id, revision: active.revision, answers, flagged: ["short"] })).attempt;
    const submitted = (await other.start({ id: quiz.id })).attempt;
    await other.submit({ id: submitted.id, revision: submitted.revision, answers });
    const beforeQuiz = sqlite.prepare("SELECT * FROM quizzes WHERE id=?").get(quiz.id);
    const beforeOther = sqlite.prepare("SELECT * FROM quizzes WHERE id IN (?,?) ORDER BY id").all(unaffected.id, manual.id);
    const beforeAttempts = sqlite.prepare("SELECT * FROM quiz_attempts ORDER BY id").all();
    const beforeFiles = sqlite.prepare("SELECT * FROM quiz_files ORDER BY id").all();
    const beforeLinks = sqlite.prepare("SELECT * FROM attempt_file_links ORDER BY attempt_id").all();
    const beforeCounters = sqlite.prepare("SELECT * FROM quiz_attempt_counters ORDER BY user_uid").all();
    const migration = readFileSync(new URL("../migrations/0009_exact_short_answers.sql", import.meta.url), "utf8");
    sqlite.exec("BEGIN"); sqlite.exec(migration); sqlite.exec("COMMIT");
    const afterQuiz = sqlite.prepare("SELECT * FROM quizzes WHERE id=?").get(quiz.id);
    const expectedBody = JSON.parse(beforeQuiz.body); expectedBody.questions[2].tolerance = 0;
    assert.deepEqual(JSON.parse(afterQuiz.body), expectedBody);
    assert.equal(afterQuiz.revision, beforeQuiz.revision + 1);
    assert.ok(afterQuiz.updated_at >= beforeQuiz.updated_at);
    assert.deepEqual({ ...afterQuiz, body: beforeQuiz.body, revision: beforeQuiz.revision, updated_at: beforeQuiz.updated_at }, { ...beforeQuiz });
    assert.deepEqual(sqlite.prepare("SELECT * FROM quizzes WHERE id IN (?,?) ORDER BY id").all(unaffected.id, manual.id), beforeOther);
    assert.deepEqual(sqlite.prepare("SELECT * FROM quiz_attempts ORDER BY id").all(), beforeAttempts);
    assert.deepEqual(sqlite.prepare("SELECT * FROM quiz_files ORDER BY id").all(), beforeFiles);
    assert.deepEqual(sqlite.prepare("SELECT * FROM attempt_file_links ORDER BY attempt_id").all(), beforeLinks);
    assert.deepEqual(sqlite.prepare("SELECT * FROM quiz_attempt_counters ORDER BY user_uid").all(), beforeCounters);
    sqlite.exec(migration);
    assert.deepEqual(sqlite.prepare("SELECT * FROM quizzes WHERE id=?").get(quiz.id), afterQuiz);
    await assert.rejects(teacher.save({ id: quiz.id, revision: quiz.revision, quiz: input }), e => e.status === 409);
    assert.equal((await other.detail({ id: quiz.id })).attempt.result.score, 10);
    assert.equal((await student.submit({ id: active.id, revision: active.revision, answers })).attempt.result.score, 10);
    const newer = makeQuizService(db, { ...studentUser, uid: "exact-new" }, () => now);
    const fresh = (await newer.start({ id: quiz.id })).attempt;
    const result = (await newer.submit({ id: fresh.id, revision: fresh.revision, answers })).attempt.result;
    assert.equal(result.score, 5); assert.equal(result.details[2].points, 0);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { sqlite.close(); }
});

test("saving an older equal-weighted quiz retires that option for new attempts while preserving the original scoring of started attempts", async () => {
  for (const scoring of ["equal", undefined]) {
    const { db, sqlite } = database();
    try {
      const now = 1_000_000;
      const teacher = makeQuizService(db, adminUser, () => now);
      const student = makeQuizService(db, studentUser, () => now);
      const { quiz } = await teacher.save({ quiz: fixture() });
      const stored = (await teacher.adminDetail({ id: quiz.id })).quiz;
      stored.questions[1].scoring = scoring;
      sqlite.prepare("UPDATE quizzes SET body=? WHERE id=?").run(JSON.stringify(stored), quiz.id);
      const started = (await student.start({ id: quiz.id })).attempt;
      const snapshot = sqlite.prepare("SELECT snapshot FROM quiz_attempts WHERE id=?").get(started.id).snapshot;
      await teacher.save({ id: quiz.id, revision: quiz.revision, quiz: stored });
      assert.equal((await teacher.adminDetail({ id: quiz.id })).quiz.questions[1].scoring, "exam");
      assert.equal(sqlite.prepare("SELECT snapshot FROM quiz_attempts WHERE id=?").get(started.id).snapshot, snapshot);
      const answers = { single: "B", tf: [true, true, false, true], short: "0.5" };
      const original = (await student.submit({ id: started.id, revision: started.revision, answers })).attempt;
      assert.equal(original.result.details[1].points, 0.25);
      assert.equal(original.result.score, 8.13);
      const nextStudent = makeQuizService(db, { ...studentUser, uid: "new-scoring" }, () => now);
      const newer = (await nextStudent.start({ id: quiz.id })).attempt;
      const current = (await nextStudent.submit({ id: newer.id, revision: newer.revision, answers })).attempt;
      assert.equal(current.result.details[1].points, 0.1);
      assert.equal(current.result.score, 7.75);
      assert.deepEqual((await student.detail({ id: quiz.id })).attempt.result, original.result);
    } finally { sqlite.close(); }
  }
});

test("fixed forms persist through save/reload and existing attempts keep their original form, answers and scoring after a teacher changes the form", async () => {
  const { db, sqlite } = database();
  try {
    const teacher = makeQuizService(db, adminUser, () => 1_000_000);
    const student = makeQuizService(db, studentUser, () => 1_000_000);
    const { quiz } = await teacher.save({ quiz: fixedFormFixture("mixed-22") });
    assert.equal((await teacher.adminDetail({ id: quiz.id })).quiz.fixedForm, "mixed-22");
    let attempt = (await student.start({ id: quiz.id })).attempt;
    const original = (await teacher.adminDetail({ id: quiz.id })).quiz;
    const answers = Object.fromEntries(original.questions.map(q => [q.id, q.answer || q.acceptedAnswers[0]]));
    attempt = (await student.progress({ id: attempt.id, revision: attempt.revision, answers, flagged: ["tf-0"] })).attempt;
    await teacher.save({ id: quiz.id, revision: quiz.revision, quiz: fixedFormFixture("mixed-28") });
    const current = await student.detail({ id: quiz.id });
    assert.equal(current.quiz.fixedForm, "mixed-22"); assert.equal(current.quiz.questions.length, 22);
    assert.deepEqual(current.attempt.answers, answers);
    const graded = await student.submit({ id: attempt.id, revision: attempt.revision, answers, flagged: ["tf-0"] });
    assert.equal(graded.attempt.result.score, 10); assert.equal(graded.attempt.result.total, 10);
    const other = makeQuizService(db, { ...studentUser, uid: "next-form" }, () => 1_000_000);
    const newer = await other.start({ id: quiz.id });
    assert.equal(newer.quiz.fixedForm, "mixed-28"); assert.equal(newer.quiz.questions.length, 28);
    await teacher.allowRetake({ id: attempt.id });
    const retake = await student.start({ id: quiz.id });
    assert.equal(retake.quiz.fixedForm, "mixed-28"); assert.equal(retake.attempt.attemptNumber, 2);
    assert.deepEqual(retake.attempt.answers, {});
  } finally { sqlite.close(); }
});
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

test("retired quiz passwords from cached drafts are discarded on save and never returned to students", () => {
  for (const accessCode of [undefined, "", "012345", "old-format", 123456]) {
    const quiz = validateQuiz({ ...fixture(), accessCode, requiresAccessCode: true });
    assert.equal(quiz.accessCode, undefined);
    assert.equal(quiz.requiresAccessCode, undefined);
    const visible = publicQuiz({ ...quiz, accessCode: "012345", requiresAccessCode: true });
    assert.equal(visible.accessCode, undefined);
    assert.equal(visible.requiresAccessCode, undefined);
    assert.equal(visible.questions[0].answer, undefined);
  }
});

test("legacy password-protected quizzes start without a code; files follow publication/schedule rules while solution images remain private", async () => {
  const { db, sqlite } = database();
  let now = 1_000_000;
  try {
    const teacher = makeQuizService(db, adminUser, () => now), student = makeQuizService(db, studentUser, () => now);
    const input = { ...fixture(), mode: "document", documentIds: ["legacy-pdf"] };
    input.questions[0].imageId = "legacy-stem";
    input.questions[0].explanationImageId = "legacy-solution";
    for (const id of ["legacy-pdf", "legacy-stem", "legacy-solution"])
      sqlite.prepare("INSERT INTO quiz_files(id,owner_uid,name,mime,data,created_at) VALUES(?,'teacher',?,'image/png',?,1)").run(id, id, submissionPng);
    const { quiz } = await teacher.save({ quiz: input }), id = quiz.id;
    sqlite.prepare("UPDATE quizzes SET body=json_set(body,'$.accessCode','012345','$.requiresAccessCode',json('true')) WHERE id=?").run(id);
    const detail = await student.detail({ id });
    assert.equal(detail.quiz.questions.length, 3);
    assert.equal(detail.quiz.accessCode, undefined);
    assert.equal(detail.quiz.requiresAccessCode, undefined);
    assert.deepEqual(detail.quiz.documentIds, ["legacy-pdf"]);
    assert.equal((await teacher.adminDetail({ id })).quiz.accessCode, undefined);
    for (const operation of ["list", "listAdmin"]) {
      const data = await teacher[operation]({ subject: "toan" });
      assert.equal(data.quizzes[0].requiresAccessCode, undefined);
      assert.ok(!JSON.stringify(data).includes("012345"));
    }
    for (const file of ["legacy-pdf", "legacy-stem"]) assert.equal((await student.file({ id: file })).status, 200);
    await assert.rejects(student.file({ id: "legacy-solution" }), e => e.status === 403);
    const started = await student.start({ id });
    const snapshot = JSON.parse(sqlite.prepare("SELECT snapshot FROM quiz_attempts").get().snapshot);
    assert.equal(snapshot.accessCode, undefined); assert.equal(snapshot.requiresAccessCode, undefined);
    // Older browsers may still send a stale code, but it cannot block resume.
    assert.equal((await student.start({ id, accessCode: "wrong" })).attempt.id, started.attempt.id);
    const result = await student.submit({ id: started.attempt.id, revision: 0, answers: { single: "B", tf: [true, false, true, false], short: "0.5" }, flagged: [] });
    assert.equal(result.attempt.result.score, 10);
    assert.equal((await student.file({ id: "legacy-solution" })).status, 200);
    await teacher.allowRetake({ id: started.attempt.id });
    now += 1_000;
    const retake = await student.start({ id });
    assert.equal(retake.attempt.attemptNumber, 2); assert.deepEqual(retake.attempt.answers, {});
    assert.equal(retake.attempt.deadlineAt, now + 60_000);
    await teacher.deleteQuiz({ id, revision: quiz.revision });
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { sqlite.close(); }
});

test("password retirement migration removes only obsolete fields/cooldowns and preserves active answers, submitted grades, schedules, revisions and attachments", async () => {
  const { db, sqlite } = database("0008");
  const now = 1_000_000;
  try {
    const teacher = makeQuizService(db, adminUser, () => now), student = makeQuizService(db, studentUser, () => now);
    const uploaded = await teacher.upload(teacherUpload(submissionPng, "image/png", "migration.png"));
    const input = { ...fixture(), opensAt: now - 1000, closesAt: now + 60_000 };
    input.questions[0].imageId = uploaded.file.id;
    const { quiz } = await teacher.save({ quiz: input });
    let active = (await student.start({ id: quiz.id })).attempt;
    active = (await student.progress({ id: active.id, revision: active.revision, answers: { single: "B" }, flagged: ["short"] })).attempt;
    const other = makeQuizService(db, { ...studentUser, uid: "submitted" }, () => now);
    const submitted = (await other.start({ id: quiz.id })).attempt;
    await other.submit({ id: submitted.id, revision: submitted.revision, answers: { single: "B", tf: [true, false, true, false], short: "0.5" }, flagged: [] });
    const cleanQuiz = (await teacher.save({ quiz: { ...fixture(), status: "draft" } })).quiz;
    sqlite.prepare("UPDATE quizzes SET body=json_set(body,'$.accessCode','012345','$.requiresAccessCode',json('true')) WHERE id=?").run(quiz.id);
    sqlite.prepare("UPDATE quiz_attempts SET snapshot=json_set(snapshot,'$.requiresAccessCode',json('true')) WHERE quiz_id=?").run(quiz.id);
    sqlite.prepare("INSERT INTO quiz_access_failures VALUES(?, 'blocked-student', 1, 5, ?)").run(quiz.id, now + 60_000);
    const beforeQuiz = sqlite.prepare("SELECT * FROM quizzes ORDER BY id").all();
    const beforeAttempts = sqlite.prepare("SELECT * FROM quiz_attempts ORDER BY id").all();
    const beforeFiles = sqlite.prepare("SELECT * FROM quiz_files").all();
    const beforeLinks = sqlite.prepare("SELECT * FROM attempt_file_links ORDER BY attempt_id").all();
    sqlite.exec("BEGIN");
    sqlite.exec(readFileSync(new URL("../migrations/0008_remove_quiz_access_codes.sql", import.meta.url), "utf8"));
    sqlite.exec("COMMIT");
    const strip = value => { const object = JSON.parse(value); delete object.accessCode; delete object.requiresAccessCode; return JSON.stringify(object); };
    assert.deepEqual(sqlite.prepare("SELECT * FROM quizzes ORDER BY id").all().map(row => ({ ...row })), beforeQuiz.map(row => ({ ...row, body: strip(row.body) })));
    assert.deepEqual(sqlite.prepare("SELECT * FROM quiz_attempts ORDER BY id").all().map(row => ({ ...row })), beforeAttempts.map(row => ({ ...row, snapshot: strip(row.snapshot) })));
    assert.deepEqual(sqlite.prepare("SELECT * FROM quiz_files").all(), beforeFiles);
    assert.deepEqual(sqlite.prepare("SELECT * FROM attempt_file_links ORDER BY attempt_id").all(), beforeLinks);
    assert.equal(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='quiz_access_failures'").get(), undefined);
    assert.deepEqual((await student.detail({ id: quiz.id })).attempt.answers, { single: "B" });
    assert.equal((await other.detail({ id: quiz.id })).attempt.result.score, 10);
    assert.equal((await student.start({ id: quiz.id })).attempt.id, active.id);
    const blocked = makeQuizService(db, { ...studentUser, uid: "blocked-student" }, () => now);
    assert.equal((await blocked.start({ id: quiz.id })).quiz.questions.length, 3);
    await assert.rejects(blocked.start({ id: cleanQuiz.id }), e => e.status === 403);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { sqlite.close(); }
});

test("retake migration preserves existing attempts, answers, results and attachment links inside a transaction", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("PRAGMA foreign_keys=ON;");
    sqlite.exec(
      readFileSync(
        new URL("../migrations/0001_quizzes.sql", import.meta.url),
        "utf8",
      ),
    );
    sqlite
      .prepare(
        "INSERT INTO quizzes(id,owner_uid,title,subject,category,status,body,question_count,duration_minutes,created_at,updated_at) VALUES('legacy','teacher','Legacy','toan','Lớp 12','published',?,3,1,100,100)",
      )
      .run(JSON.stringify(fixture()));
    sqlite
      .prepare(
        "INSERT INTO quiz_files(id,owner_uid,name,mime,data,created_at) VALUES('image','teacher','image.png','image/png',?,100)",
      )
      .run(new Uint8Array([137, 80, 78, 71]));
    sqlite
      .prepare(
        "INSERT INTO quiz_attempts(id,quiz_id,user_uid,display_name,username,user_role,snapshot,answers,flagged,revision,started_at,deadline_at,submitted_at,result) VALUES('old','legacy','student','Student','student','student',?,'{\"single\":\"B\"}','[\"tf\"]',3,100,60100,200,?)",
      )
      .run(
        JSON.stringify(fixture()),
        JSON.stringify(grade(fixture(), { single: "B" })),
      );
    sqlite.exec("INSERT INTO attempt_file_links VALUES('old','image');");
    const before = sqlite.prepare("SELECT * FROM quiz_attempts").get();
    sqlite.exec("BEGIN");
    sqlite.exec(
      readFileSync(
        new URL("../migrations/0002_quiz_retakes.sql", import.meta.url),
        "utf8",
      ),
    );
    sqlite.exec("COMMIT");
    const after = sqlite.prepare("SELECT * FROM quiz_attempts").get();
    assert.deepEqual(
      { ...after, attempt_number: undefined, is_current: undefined },
      { ...before, attempt_number: undefined, is_current: undefined },
    );
    assert.equal(after.attempt_number, 1);
    assert.equal(after.is_current, 1);
    assert.equal(
      sqlite
        .prepare(
          "SELECT file_id FROM attempt_file_links WHERE attempt_id='old'",
        )
        .get().file_id,
      "image",
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

test("students can replace a submitted attempt exactly three times; reloads and old requests preserve the latest attempt, other students and teacher-only extra grants", async () => {
  const { db, sqlite } = database();
  let now = 1_000_000;
  try {
    const teacher = makeQuizService(db, adminUser, () => now);
    const student = makeQuizService(db, studentUser, () => now);
    const other = makeQuizService(db, { ...studentUser, uid: "self-retake-other" }, () => now);
    const { quiz } = await teacher.save({ quiz: fixture() });
    const otherAttempt = (await other.start({ id: quiz.id })).attempt;
    let attempt = (await student.start({ id: quiz.id })).attempt;
    const firstId = attempt.id;
    assert.equal(attempt.retakesRemaining, 3);
    for (let number = 1; number <= 4; number++) {
      assert.equal(attempt.attemptNumber, number);
      attempt = (await student.submit({ id: attempt.id, revision: attempt.revision, answers: { single: "B", short: "0.5" }, flagged: ["tf"] })).attempt;
      assert.equal(attempt.retakesRemaining, 4 - number);
      assert.equal((await student.start({ id: quiz.id })).attempt.id, attempt.id);
      if (number === 4) break;
      const request = { id: quiz.id, attemptId: attempt.id, revision: attempt.revision };
      const oldId = attempt.id;
      now += 2_000;
      const next = await student.retake(request);
      attempt = next.attempt;
      assert.notEqual(attempt.id, oldId);
      assert.deepEqual(attempt.answers, {});
      assert.deepEqual(attempt.flagged, []);
      assert.equal(attempt.result, null);
      assert.equal(attempt.deadlineAt, now + 60_000);
      assert.equal(sqlite.prepare("SELECT id FROM quiz_attempts WHERE id=?").get(oldId), undefined);
      assert.equal((await student.retake(request)).attempt.id, attempt.id);
      assert.equal((await student.detail({ id: quiz.id })).attempt.id, attempt.id);
      assert.equal((await other.detail({ id: quiz.id })).attempt.id, otherAttempt.id);
    }
    await assert.rejects(student.retake({ id: quiz.id, attemptId: attempt.id, revision: attempt.revision }), e => e.status === 403 && e.message.includes("3 lần"));
    assert.equal((await student.retake({ id: quiz.id, attemptId: firstId, revision: 1 })).attempt.id, attempt.id);
    const results = (await teacher.results({ id: quiz.id })).attempts;
    assert.equal(results.length, 2);
    assert.equal(results.find(row => row.id === attempt.id).attemptNumber, 4);
    assert.equal((await makeProfileService(db, studentUser, () => now).profileOverview()).recent.length, 1);
    await assert.rejects(student.allowRetake({ id: attempt.id }), e => e.status === 403);
    await teacher.allowRetake({ id: attempt.id });
    const granted = (await student.start({ id: quiz.id })).attempt;
    assert.equal(granted.attemptNumber, 5);
    assert.equal(granted.retakesRemaining, 0);
    assert.deepEqual(granted.answers, {});
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { sqlite.close(); }
});

test("self-retakes require a submitted own attempt and a current revision, obey current publication/schedule, and use a fresh snapshot with the closing deadline", async () => {
  const { db, sqlite } = database();
  let now = 1_000_000;
  try {
    const teacher = makeQuizService(db, adminUser, () => now);
    const student = makeQuizService(db, studentUser, () => now);
    const other = makeQuizService(db, { ...studentUser, uid: "retake-ownership" }, () => now);
    const { quiz } = await teacher.save({ quiz: fixture() });
    let a = (await student.start({ id: quiz.id })).attempt;
    await assert.rejects(student.retake({ id: quiz.id, attemptId: a.id, revision: a.revision }), e => e.status === 409);
    assert.equal((await other.retake({ id: quiz.id, attemptId: a.id, revision: a.revision })).attempt, null);
    a = (await student.submit({ id: a.id, revision: a.revision, answers: { single: "B" }, flagged: [] })).attempt;
    await assert.rejects(student.retake({ id: quiz.id, attemptId: a.id, revision: a.revision - 1 }), e => e.status === 409);
    const before = sqlite.prepare("SELECT * FROM quiz_attempts WHERE id=?").get(a.id);
    const closed = { ...fixture(), closesAt: now };
    let saved = (await teacher.save({ id: quiz.id, revision: quiz.revision, quiz: closed })).quiz;
    await assert.rejects(student.retake({ id: quiz.id, attemptId: a.id, revision: a.revision }), e => e.status === 403);
    saved = (await teacher.save({ id: quiz.id, revision: saved.revision, quiz: { ...fixture(), opensAt: now + 10_000 } })).quiz;
    await assert.rejects(student.retake({ id: quiz.id, attemptId: a.id, revision: a.revision }), e => e.status === 403);
    await teacher.hide({ id: quiz.id });
    await assert.rejects(student.retake({ id: quiz.id, attemptId: a.id, revision: a.revision }), e => e.status === 403);
    assert.deepEqual(sqlite.prepare("SELECT * FROM quiz_attempts WHERE id=?").get(a.id), before);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_attempt_counters").get().n, 0);
    const revised = { ...fixture(), durationMinutes: 2, closesAt: now + 5000 };
    revised.questions[0].answer = "A";
    saved = (await teacher.save({ id: quiz.id, revision: saved.revision + 1, quiz: revised })).quiz;
    const fresh = await student.retake({ id: quiz.id, attemptId: a.id, revision: a.revision });
    assert.equal(fresh.quiz.durationMinutes, 2);
    assert.equal(fresh.quiz.revision, saved.revision);
    assert.equal(fresh.attempt.deadlineAt, now + 5000);
    assert.equal(fresh.quiz.questions[0].answer, undefined);
    const graded = await student.submit({ id: fresh.attempt.id, revision: 0, answers: { single: "A" }, flagged: [] });
    assert.equal(graded.attempt.result.details[0].expected, "A");
  } finally { sqlite.close(); }
});

test("racing self-retake requests and stale teacher grading cannot replace two attempts or delete a new result", async () => {
  const { db, sqlite } = database();
  try {
    const teacher = makeQuizService(db, adminUser), student = makeQuizService(db, studentUser);
    const { quiz } = await teacher.save({ quiz: fixture() });
    let a = (await student.start({ id: quiz.id })).attempt;
    a = (await student.submit({ id: a.id, revision: 0, answers: {}, flagged: [] })).attempt;
    const request = { id: quiz.id, attemptId: a.id, revision: a.revision };
    let raced = false, winner;
    const concurrent = makeQuizService({ ...db, async batch(statements) {
      if (!raced) { raced = true; winner = await student.retake(request); }
      return db.batch(statements);
    } }, studentUser);
    const loser = await concurrent.retake(request);
    assert.equal(loser.attempt.id, winner.attempt.id);
    assert.equal(loser.attempt.attemptNumber, 2);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_attempts").get().n, 1);
    assert.equal(sqlite.prepare("SELECT last_attempt_number FROM quiz_attempt_counters").get().last_attempt_number, 1);
    let latest = (await student.submit({ id: winner.attempt.id, revision: 0, answers: { single: "B" }, flagged: [] })).attempt;
    assert.equal((await student.retake(request)).attempt.id, latest.id);
    let revised = false;
    const stale = makeQuizService({ ...db, async batch(statements) {
      if (!revised) { revised = true; sqlite.prepare("UPDATE quiz_attempts SET revision=revision+1 WHERE id=?").run(latest.id); }
      return db.batch(statements);
    } }, studentUser);
    await assert.rejects(stale.retake({ id: quiz.id, attemptId: latest.id, revision: latest.revision }), e => e.status === 409);
    assert.equal((await student.detail({ id: quiz.id })).attempt.id, latest.id);
    assert.equal(sqlite.prepare("SELECT last_attempt_number FROM quiz_attempt_counters").get().last_attempt_number, 1);
  } finally { sqlite.close(); }
});

test("a raced quiz edit or failed replacement insert rolls back self-retakes without losing the original result or numbering", async () => {
  const { db, sqlite } = database();
  try {
    const teacher = makeQuizService(db, adminUser), student = makeQuizService(db, studentUser);
    const { quiz } = await teacher.save({ quiz: fixture() });
    let a = (await student.start({ id: quiz.id })).attempt;
    a = (await student.submit({ id: a.id, revision: 0, answers: { single: "B" }, flagged: [] })).attempt;
    const before = sqlite.prepare("SELECT * FROM quiz_attempts WHERE id=?").get(a.id);
    let raced = false;
    const concurrent = makeQuizService({ ...db, async batch(statements) {
      if (!raced) { raced = true; sqlite.prepare("UPDATE quizzes SET revision=revision+1 WHERE id=?").run(quiz.id); }
      return db.batch(statements);
    } }, studentUser);
    const request = { id: quiz.id, attemptId: a.id, revision: a.revision };
    await assert.rejects(concurrent.retake(request), e => e.status === 409);
    assert.deepEqual(sqlite.prepare("SELECT * FROM quiz_attempts WHERE id=?").get(a.id), before);
    sqlite.exec("CREATE TRIGGER reject_new_attempt BEFORE INSERT ON quiz_attempts WHEN NEW.attempt_number>1 BEGIN SELECT RAISE(ABORT,'replacement failed'); END");
    await assert.rejects(student.retake(request), /replacement failed/);
    assert.deepEqual(sqlite.prepare("SELECT * FROM quiz_attempts WHERE id=?").get(a.id), before);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_attempt_counters").get().n, 0);
    sqlite.exec("DROP TRIGGER reject_new_attempt");
    assert.equal((await student.retake(request)).attempt.attemptNumber, 2);
  } finally { sqlite.close(); }
});

test("self-retaking a pending essay deletes private work and old exclusive snapshot files, preserves shared images and starts a blank new manual submission", async () => {
  const { db, sqlite } = database();
  let now = 1_000_000;
  try {
    const teacher = makeQuizService(db, adminUser, () => now), student = makeQuizService(db, studentUser, () => now);
    const shared = (await teacher.upload(teacherUpload(submissionPng, "image/png", "shared.png"))).file.id;
    const oldFile = (await teacher.upload(teacherUpload(submissionPng, "image/png", "old.png"))).file.id;
    const input = essayFixture();
    input.questions[0].imageId = shared;
    input.questions[1].imageId = oldFile;
    const { quiz } = await teacher.save({ quiz: input });
    let a = (await student.start({ id: quiz.id })).attempt;
    a = (await student.submissionUpload(workUpload(a, "essay-one"))).attempt;
    const privateFile = a.answers["essay-one"].imageIds[0];
    a = (await student.submit({ id: a.id, revision: a.revision, answers: a.answers, flagged: [] })).attempt;
    assert.equal(a.result.status, "pending");
    const revised = structuredClone(input);
    revised.questions[1].imageId = shared;
    await teacher.save({ id: quiz.id, revision: quiz.revision, quiz: revised });
    now += 1000;
    const next = (await student.retake({ id: quiz.id, attemptId: a.id, revision: a.revision })).attempt;
    assert.equal(next.attemptNumber, 2);
    assert.equal(next.deadlineAt, now + 60_000);
    assert.deepEqual(next.answers, {});
    assert.equal(next.result, null);
    for (const id of [privateFile, oldFile]) await assert.rejects(teacher.file({ id }), e => e.status === 404);
    assert.equal((await student.file({ id: shared })).status, 200);
    await assert.rejects(teacher.manualGrade({ id: a.id, revision: a.revision, score: 8, feedback: "Old" }), e => e.status === 404);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
    now = next.deadlineAt;
    const expired = (await student.detail({ id: quiz.id })).attempt;
    assert.equal(expired.result.status, "pending");
    assert.equal((await student.retake({ id: quiz.id, attemptId: expired.id, revision: expired.revision })).attempt.attemptNumber, 3);
  } finally { sqlite.close(); }
});

test("self-retake HTTP endpoint accepts active student identities without admin claims and denies locked or revoked sessions", async () => {
  const { db, sqlite } = database();
  try {
    const teacher = makeQuizService(db, adminUser), student = makeQuizService(db, studentUser);
    const { quiz } = await teacher.save({ quiz: fixture() });
    let a = (await student.start({ id: quiz.id })).attempt;
    a = (await student.submit({ id: a.id, revision: 0, answers: {}, flagged: [] })).attempt;
    let disabled = false, status = "active";
    const firebase = {
      getAuthUser: async () => ({ validSince: "10", disabled }),
      getProfile: async () => ({ fields: { role: { stringValue: "student" }, status: { stringValue: status }, username: { stringValue: studentUser.username }, displayName: { stringValue: studentUser.displayName } } }),
    };
    const handler = makeHandler({ makeFirebaseClient: () => firebase, verifyIdToken: async () => ({ sub: studentUser.uid, auth_time: 100 }) });
    const env = { ALLOWED_ORIGIN: "https://lumenpelagi.vercel.app", QUIZ_DB: db };
    const request = () => new Request("https://worker.example/api/quiz/retake", { method: "POST", headers: { Origin: env.ALLOWED_ORIGIN, Authorization: "Bearer student-token", "Content-Type": "application/json" }, body: JSON.stringify({ id: quiz.id, attemptId: a.id, revision: a.revision }) });
    const response = await handler(request(), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).attempt.attemptNumber, 2);
    status = "disabled";
    assert.equal((await handler(request(), env)).status, 403);
    status = "active"; disabled = true;
    assert.equal((await handler(request(), env)).status, 401);
  } finally { sqlite.close(); }
});

test("retake cleanup migration deletes released results and exclusive attachments, retains current/shared files, and preserves next attempt numbers", async () => {
  const { db, sqlite } = database("0006");
  try {
    const teacher = makeQuizService(db, adminUser);
    const quiz = (await teacher.save({ quiz: fixture() })).quiz;
    const insert = sqlite.prepare("INSERT INTO quiz_attempts(id,quiz_id,user_uid,display_name,username,user_role,snapshot,answers,result,started_at,deadline_at,submitted_at,attempt_number,is_current) VALUES(?,?,?,'Student','student','student',?,'{\"single\":\"B\"}',?,100,60100,200,?,?)");
    const result = JSON.stringify(grade(fixture(), { single: "B" }));
    insert.run("released-one", quiz.id, "released", JSON.stringify(fixture()), result, 1, 0);
    insert.run("released-three", quiz.id, "released", JSON.stringify(fixture()), result, 3, 0);
    insert.run("current", quiz.id, "active", JSON.stringify(fixture()), result, 2, 1);
    const before = sqlite.prepare("SELECT * FROM quiz_attempts WHERE id='current'").get();
    for (const id of ["exclusive-snapshot", "exclusive-submission", "shared-published", "shared-current"]) {
      sqlite.prepare("INSERT INTO quiz_files(id,owner_uid,name,mime,data,created_at) VALUES(?,'teacher',?,'image/png',?,100)").run(id, id, submissionPng);
    }
    sqlite.exec("INSERT INTO attempt_file_links VALUES('released-one','exclusive-snapshot'),('released-three','shared-published'),('released-three','shared-current'),('current','shared-current'); INSERT INTO submission_file_links VALUES('released-one','essay','exclusive-submission');");
    sqlite.prepare("INSERT INTO quiz_file_links VALUES(?,'shared-published')").run(quiz.id);
    sqlite.exec("BEGIN");
    sqlite.exec(readFileSync(new URL("../migrations/0006_delete_retake_results.sql", import.meta.url), "utf8"));
    sqlite.exec("COMMIT");
    assert.deepEqual(sqlite.prepare("SELECT * FROM quiz_attempts").all(), [before]);
    assert.deepEqual(sqlite.prepare("SELECT id FROM quiz_files ORDER BY id").all().map(row => row.id), ["shared-current", "shared-published"]);
    assert.equal((await makeQuizService(db, { ...studentUser, uid: "released" }).detail({ id: quiz.id })).nextAttemptNumber, 4);
    assert.equal((await makeQuizService(db, { ...studentUser, uid: "released" }).start({ id: quiz.id })).attempt.attemptNumber, 4);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
    await teacher.deleteQuiz({ id: quiz.id, revision: quiz.revision });
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_attempt_counters").get().n, 0);
  } finally { sqlite.close(); }
});

test("retake deletion rejects a concurrent autosave without deleting data or files; retry atomically removes the attempt and keeps shared question images", async () => {
  const { db, sqlite } = database();
  try {
    const teacher = makeQuizService(db, adminUser), student = makeQuizService(db, studentUser);
    const uploaded = await teacher.upload(teacherUpload(submissionPng, "image/png", "shared.png"));
    const quiz = (await teacher.save({ quiz: { ...essayFixture(), questions: essayFixture().questions.map(q => ({ ...q, imageId: uploaded.file.id })) } })).quiz;
    let attempt = (await student.start({ id: quiz.id })).attempt;
    attempt = (await student.submissionUpload(workUpload(attempt, "essay-one"))).attempt;
    const privateImage = attempt.answers["essay-one"].imageIds[0];
    let raced = false;
    const concurrentTeacher = makeQuizService({ ...db, async batch(statements) {
      if (!raced) { raced = true; sqlite.prepare("UPDATE quiz_attempts SET revision=revision+1 WHERE id=?").run(attempt.id); }
      return db.batch(statements);
    } }, adminUser);
    await assert.rejects(concurrentTeacher.allowRetake({ id: attempt.id }), e => e.status === 409);
    assert.ok(sqlite.prepare("SELECT id FROM quiz_attempts WHERE id=?").get(attempt.id));
    assert.equal((await student.file({ id: privateImage })).status, 200);
    await teacher.allowRetake({ id: attempt.id });
    assert.equal(sqlite.prepare("SELECT id FROM quiz_attempts WHERE id=?").get(attempt.id), undefined);
    await assert.rejects(student.file({ id: privateImage }), e => e.status === 404);
    assert.equal((await teacher.file({ id: uploaded.file.id })).status, 200);
    assert.deepEqual((await student.start({ id: quiz.id })).attempt.answers, {});
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { sqlite.close(); }
});

test("only the teacher can delete a student's current attempt for a retake; other students survive and numbering, blank answers and fresh snapshots are preserved", async () => {
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
    const { quiz } = await teacher.save({ quiz: fixture() });
    const first = await student.start({ id: quiz.id });
    const otherFirst = await other.start({ id: quiz.id });
    const submitted = await student.submit({
      id: first.attempt.id,
      revision: 0,
      answers: { single: "B", short: "0.5" },
      flagged: ["tf"],
    });
    await assert.rejects(
      student.allowRetake({ id: first.attempt.id }),
      (e) => e.status === 403,
    );
    assert.equal(
      (await student.start({ id: quiz.id })).attempt.id,
      first.attempt.id,
    );
    await teacher.allowRetake({ id: first.attempt.id });
    const detail = await student.detail({ id: quiz.id });
    assert.equal(detail.attempt, null);
    assert.equal(detail.nextAttemptNumber, 2);
    assert.equal(
      (await other.detail({ id: quiz.id })).attempt.id,
      otherFirst.attempt.id,
    );
    const updated = fixture();
    updated.durationMinutes = 2;
    updated.questions[0].answer = "A";
    await teacher.save({ id: quiz.id, revision: 1, quiz: updated });
    now += 600_000;
    const second = await student.start({ id: quiz.id });
    assert.notEqual(second.attempt.id, first.attempt.id);
    assert.equal(second.attempt.attemptNumber, 2);
    assert.deepEqual(second.attempt.answers, {});
    assert.deepEqual(second.attempt.flagged, []);
    assert.equal(second.attempt.deadlineAt, now + 120_000);
    assert.equal(second.quiz.durationMinutes, 2);
    await teacher.allowRetake({ id: first.attempt.id });
    assert.equal(
      (await student.start({ id: quiz.id })).attempt.id,
      second.attempt.id,
    );
    await assert.rejects(
      student.progress({
        id: first.attempt.id,
        revision: 1,
        answers: { single: "A" },
        flagged: [],
      }),
      (e) => e.status === 404,
    );
    await assert.rejects(
      student.submit({
        id: first.attempt.id,
        revision: 1,
        answers: {},
        flagged: [],
      }),
      (e) => e.status === 404,
    );
    const history = await teacher.results({ id: quiz.id });
    assert.equal(history.attempts.some(a => a.id === first.attempt.id), false);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_attempts WHERE id=?").get(first.attempt.id).n, 0);
    const secondSubmitted = await student.submit({
      id: second.attempt.id,
      revision: 0,
      answers: { single: "A", short: "0.5" },
      flagged: [],
    });
    assert.equal(secondSubmitted.attempt.result.details[0].expected, "A");
    await teacher.allowRetake({ id: second.attempt.id });
    const third = await student.start({ id: quiz.id });
    assert.equal(third.attempt.attemptNumber, 3);
    assert.deepEqual(third.attempt.answers, {});
    await teacher.allowRetake({ id: second.attempt.id });
    assert.equal((await student.start({ id: quiz.id })).attempt.id, third.attempt.id);
  } finally {
    sqlite.close();
  }
});

test("granting a retake deletes an in-progress attempt and saved answers; repeated grants do not grant unlimited retries", async () => {
  const { db, sqlite } = database();
  let now = 1_000_000;
  try {
    const teacher = makeQuizService(db, adminUser, () => now),
      student = makeQuizService(db, studentUser, () => now);
    const { quiz } = await teacher.save({ quiz: fixture() });
    const first = await student.start({ id: quiz.id });
    await student.progress({
      id: first.attempt.id,
      revision: 0,
      answers: { single: "B" },
      flagged: ["short"],
    });
    now += 2000;
    await teacher.allowRetake({ id: first.attempt.id });
    await teacher.allowRetake({ id: first.attempt.id });
    const history = await teacher.results({ id: quiz.id });
    assert.equal(history.attempts.length, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_attempts").get().n, 0);
    const second = await student.start({ id: quiz.id });
    assert.equal(second.attempt.attemptNumber, 2);
    assert.equal(
      (await student.start({ id: quiz.id })).attempt.id,
      second.attempt.id,
    );
    await teacher.hide({ id: quiz.id });
    await assert.rejects(
      teacher.allowRetake({ id: second.attempt.id }),
      (e) => e.status === 409,
    );
  } finally {
    sqlite.close();
  }
});

test("permanent deletion removes all attempts and exclusive old/current files, preserves shared files and other quizzes, rejects stale editors", async () => {
  const { db, sqlite } = database();
  try {
    const teacher = makeQuizService(db, adminUser),
      student = makeQuizService(db, studentUser);
    const upload = async (name) =>
      (
        await teacher.upload(
          new Request(`https://example.com/api/quiz/upload?name=${name}.pdf`, {
            method: "POST",
            headers: { "Content-Type": "application/pdf" },
            body: "%PDF-1.4\n%%EOF",
          }),
        )
      ).file.id;
    const shared = await upload("shared"),
      oldFile = await upload("old"),
      newFile = await upload("new");
    const input = {
      ...fixture(),
      mode: "document",
      documentIds: [shared, oldFile],
    };
    const { quiz } = await teacher.save({ quiz: input });
    const first = await student.start({ id: quiz.id });
    const current = { ...input, documentIds: [shared, newFile] };
    await teacher.save({ id: quiz.id, revision: 1, quiz: current });
    await teacher.allowRetake({ id: first.attempt.id });
    const second = await student.start({ id: quiz.id });
    const { quiz: keeper } = await teacher.save({
      quiz: { ...fixture(), mode: "document", documentIds: [shared] },
    });
    await assert.rejects(
      student.deleteQuiz({ id: quiz.id, revision: 2 }),
      (e) => e.status === 403,
    );
    await assert.rejects(
      teacher.deleteQuiz({ id: quiz.id, revision: 1 }),
      (e) => e.status === 409,
    );
    assert.equal(
      (await student.detail({ id: quiz.id })).attempt.id,
      second.attempt.id,
    );
    await teacher.deleteQuiz({ id: quiz.id, revision: 2 });
    assert.equal(
      sqlite
        .prepare("SELECT COUNT(*) AS n FROM quiz_attempts WHERE quiz_id=?")
        .get(quiz.id).n,
      0,
    );
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM attempt_file_links").get().n,
      0,
    );
    await assert.rejects(
      student.detail({ id: quiz.id }),
      (e) => e.status === 404,
    );
    await assert.rejects(
      student.submit({ id: second.attempt.id, answers: {}, flagged: [] }),
      (e) => e.status === 404,
    );
    await assert.rejects(
      teacher.file({ id: oldFile }),
      (e) => e.status === 404,
    );
    await assert.rejects(
      teacher.file({ id: newFile }),
      (e) => e.status === 404,
    );
    assert.equal((await student.file({ id: shared })).status, 200);
    assert.equal(
      (await teacher.adminDetail({ id: keeper.id })).quiz.title,
      fixture().title,
    );
    await assert.rejects(
      teacher.save({ id: quiz.id, revision: 2, quiz: current }),
      (e) => e.status === 404,
    );
    for (const status of ["draft", "hidden"]) {
      const { quiz: q } = await teacher.save({
        quiz: { ...fixture(), status },
      });
      await teacher.deleteQuiz({ id: q.id, revision: q.revision });
      await assert.rejects(
        teacher.adminDetail({ id: q.id }),
        (e) => e.status === 404,
      );
    }
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

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

test("whole-question images and document quizzes allow blank choice/statement text while keeping answer keys and grading intact", () => {
  const input = fixture();
  input.questions[0].choices = ["", " ", "", ""];
  input.questions[0].imageId = "whole-single";
  input.questions[1].statements = ["", "", " ", ""];
  input.questions[1].imageId = "whole-tf";
  const quiz = validateQuiz(input);
  assert.deepEqual(quiz.questions[0].choices, ["", "", "", ""]);
  assert.deepEqual(quiz.questions[1].statements, ["", "", "", ""]);
  assert.deepEqual(publicQuiz(quiz).questions[0].choices, ["", "", "", ""]);
  assert.equal(
    grade(quiz, { single: "B", tf: [true, false, true, false], short: "0.5" })
      .score,
    10,
  );
  for (const index of [0, 1]) {
    assert.throws(() =>
      validateQuiz({
        ...input,
        questions: [{ ...input.questions[index], imageId: "" }],
      }),
    );
    assert.throws(() =>
      validateQuiz({
        ...input,
        questions: [{ ...input.questions[index], answer: undefined }],
      }),
    );
  }
  const document = validateQuiz({
    ...input,
    mode: "document",
    documentIds: ["worksheet"],
    questions: input.questions.map((q) => ({ ...q, imageId: "" })),
  });
  assert.deepEqual(document.questions[0].choices, ["", "", "", ""]);
  assert.deepEqual(document.questions[1].statements, ["", "", "", ""]);
  assert.equal(
    grade(document, {
      single: "B",
      tf: [true, false, true, false],
      short: "0.5",
    }).score,
    10,
  );
  assert.throws(() =>
    validateQuiz({
      ...input,
      questions: [
        {
          ...input.questions[2],
          imageId: "whole-short",
          acceptedAnswers: [""],
        },
      ],
    }),
  );
});

test("individual choices and true/false statements allow text, an image, or both, with four correctly indexed image IDs", () => {
  const input = fixture();
  input.questions[0].choices = ["", "Two", "", "Four"];
  input.questions[0].choiceImageIds = ["option-a", "option-b", "option-c", ""];
  input.questions[1].statements = ["", "Second", "Third", ""];
  input.questions[1].statementImageIds = ["statement-a", "", "", "statement-d"];
  const quiz = validateQuiz(input);
  assert.deepEqual(
    publicQuiz(quiz).questions[0].choiceImageIds,
    input.questions[0].choiceImageIds,
  );
  assert.deepEqual(
    publicQuiz(quiz).questions[1].statementImageIds,
    input.questions[1].statementImageIds,
  );
  assert.deepEqual(fileIds(publicQuiz(quiz)), [
    "option-a",
    "option-b",
    "option-c",
    "statement-a",
    "statement-d",
  ]);
  assert.equal(
    grade(quiz, { single: "B", tf: [true, false, true, false], short: "0.5" })
      .score,
    10,
  );
  for (const invalid of [
    ["option-a"],
    ["option-a", "", "bad/id", ""],
    ["option-a", null, "", ""],
  ])
    assert.throws(() =>
      validateQuiz({
        ...input,
        questions: [{ ...input.questions[0], choiceImageIds: invalid }],
      }),
    );
  assert.throws(() =>
    validateQuiz({
      ...input,
      questions: [{ ...input.questions[0], choiceImageIds: ["", "", "", ""] }],
    }),
  );
  assert.throws(() =>
    validateQuiz({
      ...input,
      questions: [
        { ...input.questions[1], statementImageIds: ["statement-a", "", ""] },
      ],
    }),
  );
  assert.deepEqual(validateQuiz(fixture()).questions[0].choiceImageIds, [
    "",
    "",
    "",
    "",
  ]);
});

test("100 questions with all six images save/start within a bounded SQL query count; choice images remain tied to old snapshots and clean up on deletion", async () => {
  const { db, sqlite } = database();
  try {
    const input = {
      ...fixture(),
      mode: "document",
      documentIds: Array.from({ length: 8 }, (_, i) => `document-${i}`),
      questions: Array.from({ length: 100 }, (_, i) => ({
        ...fixture().questions[0],
        id: `q-${i}`,
        prompt: "",
        imageId: `stem-${i}`,
        explanationImageId: `solution-${i}`,
        choices: ["", "", "", ""],
        choiceImageIds: Array.from({ length: 4 }, (_, j) => `choice-${i}-${j}`),
      })),
    };
    const ids = fileIds(validateQuiz(input));
    assert.equal(ids.length, 608);
    const insert = sqlite.prepare(
      "INSERT INTO quiz_files(id,owner_uid,name,mime,data,created_at) VALUES(?,'teacher',?,'image/png',?,1)",
    );
    for (const id of ids)
      insert.run(id, id + ".png", new Uint8Array([137, 80, 78, 71]));
    let queries = 0;
    const counted = {
      ...db,
      prepare(sql) {
        queries++;
        return db.prepare(sql);
      },
    };
    const teacher = makeQuizService(counted, adminUser),
      student = makeQuizService(counted, studentUser);
    const { quiz } = await teacher.save({ quiz: input });
    assert.ok(queries < 20, `save used ${queries} SQL statements`);
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_file_links").get().n,
      608,
    );
    queries = 0;
    const start = await student.start({ id: quiz.id });
    assert.ok(queries < 10, `start used ${queries} SQL statements`);
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM attempt_file_links").get().n,
      608,
    );
    assert.equal((await student.file({ id: "choice-0-2" })).status, 200);
    await assert.rejects(
      student.file({ id: "solution-0" }),
      (e) => e.status === 403,
    );
    await teacher.save({
      id: quiz.id,
      revision: 1,
      quiz: { ...fixture(), status: "hidden" },
    });
    assert.equal(
      (await student.detail({ id: quiz.id })).quiz.questions[0]
        .choiceImageIds[2],
      "choice-0-2",
    );
    assert.equal((await student.file({ id: "choice-0-2" })).status, 200);
    await teacher.deleteQuiz({ id: quiz.id, revision: 2 });
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_files").get().n,
      0,
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
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
