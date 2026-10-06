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
import { makeProfileService, studyStreak } from "../src/profile-service.js";
import { DOC_MIME, DOCX_MIME } from "../src/word-files.js";

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
      accessCode: "012345",
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
    await assert.rejects(
      student.file({ id: uploaded.file.id }),
      (e) => e.status === 403,
    );
    const started = await student.start({ id: saved.id, accessCode: "012345" });
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
    assert.deepEqual(overview.stats, { studiedSubjects: 2, completedAttempts: 4, studyMilliseconds: 160000, streakDays: 3 });
    assert.deepEqual(overview.progress.find(row => row.subject === "toan"), { subject: "toan", total: 2, completed: 1, percent: 50 });
    assert.deepEqual(overview.progress.find(row => row.subject === "vat-ly"), { subject: "vat-ly", total: 1, completed: 1, percent: 100 });
    assert.equal(overview.recent.length, 4);
    assert.equal(overview.recent.find(row => row.id === pending.id).status, "pending");
    assert.equal(overview.recent.find(row => row.id === pending.id).score, null);
    assert.equal(overview.recent.find(row => row.id === expiring.id).score, 10);
    assert.equal(overview.recent.find(row => row.id === expiring.id).submittedAt, expiring.deadlineAt);
    assert.equal(overview.recent.find(row => row.id === first.id).isCurrent, false);
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

test("server schedule hides unopened content and files, checks exact boundaries before the code, and closes a late-starting attempt using saved answers", async () => {
  const { db, sqlite } = database(); let now = 1_000_000;
  try {
    const teacher = makeQuizService(db, adminUser, () => now), student = makeQuizService(db, studentUser, () => now), other = makeQuizService(db, { ...studentUser, uid: "window-other" }, () => now);
    for (const id of ["window-pdf", "window-image"]) sqlite.prepare("INSERT INTO quiz_files(id,owner_uid,name,mime,data,created_at) VALUES(?,'teacher',?,'image/png',?,1)").run(id, id, submissionPng);
    const opensAt = now + 60_000, closesAt = opensAt + 30_000;
    const input = { ...fixture(), opensAt, closesAt, accessCode: "012345", mode: "document", documentIds: ["window-pdf"] };
    input.questions[0].imageId = "window-image";
    const { quiz } = await teacher.save({ quiz: input }), id = quiz.id;
    assert.equal(quiz.opensAt, opensAt); assert.equal(quiz.closesAt, closesAt);
    assert.equal((await student.list({ subject: "toan" })).serverNow, now);
    assert.equal((await student.list({ subject: "toan" })).quizzes[0].closesAt, closesAt);
    assert.equal((await teacher.listAdmin()).quizzes[0].opensAt, opensAt);
    const detail = await student.detail({ id });
    assert.deepEqual(detail.quiz.questions, []); assert.deepEqual(detail.quiz.documentIds, []); assert.equal(detail.quiz.questionCount, 3);
    await assert.rejects(student.start({ id, accessCode: "012345" }), e => e.status === 403 && e.message.includes("chưa đến giờ"));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_attempts").get().n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_access_failures").get().n, 0);
    for (const file of ["window-pdf", "window-image"]) await assert.rejects(student.file({ id: file }), e => e.status === 403);
    assert.equal((await teacher.file({ id: "window-pdf" })).status, 200);
    now = opensAt;
    await assert.rejects(student.start({ id }), e => e.status === 403 && e.message.includes("Mật khẩu"));
    let a = (await student.start({ id, accessCode: "012345" })).attempt;
    assert.equal(a.startedAt, opensAt); assert.equal(a.deadlineAt, closesAt);
    assert.equal((await student.file({ id: "window-image" })).status, 200);
    a = (await student.progress({ id: a.id, revision: a.revision, answers: { single: "B", tf: [true,false,true,false], short: "0.5" }, flagged: ["single"] })).attempt;
    now = closesAt;
    await assert.rejects(other.start({ id, accessCode: "012345" }), e => e.status === 403 && e.message.includes("đã đóng"));
    await assert.rejects(other.file({ id: "window-pdf" }), e => e.status === 403);
    const ended = await student.submit({ id: a.id, revision: a.revision, answers: { single: "A" }, flagged: [] });
    assert.equal(ended.attempt.result.score, 10); assert.equal(ended.attempt.submittedAt, closesAt);
    assert.deepEqual(ended.attempt.flagged, ["single"]);
    assert.equal((await student.start({ id })).attempt.id, a.id);
    assert.equal((await student.detail({ id })).attempt.result.score, 10);
    assert.equal((await student.file({ id: "window-pdf" })).status, 200);
    assert.deepEqual((await other.detail({ id })).quiz.questions, []);
    await teacher.allowRetake({ id: a.id });
    await assert.rejects(student.start({ id, accessCode: "012345" }), e => e.status === 403);
    await teacher.save({ id, revision: 1, quiz: { ...input, opensAt: null, closesAt: null } });
    const newAttempt = await student.start({ id, accessCode: "012345" });
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
    const input = { ...fixture(), accessCode: "012345" };
    input.questions[0].imageId = "unhide-image";
    sqlite
      .prepare(
        "INSERT INTO quiz_files(id,owner_uid,name,mime,data,created_at) VALUES('unhide-image','teacher','image.png','image/png',?,1)",
      )
      .run(submissionPng);
    const { quiz } = await teacher.save({ quiz: input });
    const started = await student.start({ id: quiz.id, accessCode: "012345" });
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
    assert.equal(restored.requiresAccessCode, true);
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
    await assert.rejects(other.start({ id: quiz.id }), (e) => e.status === 403);
    assert.equal(
      (await other.start({ id: quiz.id, accessCode: "012345" })).quiz.status,
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
        quiz: { ...essayFixture(), accessCode: "012345" },
      }),
      id = saved.quiz.id;
    assert.equal(saved.quiz.gradingMode, "manual");
    assert.equal(
      (await student.list({ subject: "toan" })).quizzes[0].gradingMode,
      "manual",
    );
    await assert.rejects(student.start({ id }), (e) => e.status === 403);
    let { attempt: a } = await student.start({ id, accessCode: "012345" });
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
    const retake = await student.start({ id, accessCode: "012345" });
    assert.deepEqual(retake.attempt.answers, {});
    await assert.rejects(
      student.progress({
        id: retake.attempt.id,
        revision: 0,
        answers: { "essay-one": { text: "", imageIds: [fileId] } },
      }),
      (e) => e.status === 403,
    );
    assert.equal((await student.file({ id: fileId })).status, 200);
    assert.equal(
      (await teacher.results({ id })).attempts.find((old) => old.id === a.id)
        .result.score,
      9,
    );
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
function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON;");
  const migrations = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(migrations)
    .filter((file) => file.endsWith(".sql"))
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

test("optional quiz access codes require exactly six digits and preserve leading zeros", () => {
  assert.equal(validateQuiz(fixture()).accessCode, "");
  for (const accessCode of ["", "000000", "012345", "987654"]) {
    const quiz = validateQuiz({ ...fixture(), accessCode });
    assert.equal(quiz.accessCode, accessCode);
    assert.equal(publicQuiz(quiz).accessCode, undefined);
    assert.equal(publicQuiz(quiz).requiresAccessCode, Boolean(accessCode));
  }
  for (const accessCode of [
    null,
    123456,
    "12345",
    "1234567",
    "12a456",
    " 123456",
    "123456 ",
    "１２３４５６",
  ])
    assert.throws(() => validateQuiz({ ...fixture(), accessCode }));
});

test("quiz codes gate question content, PDFs and individual images before starting; correct code unlocks an own snapshot, resume and retakes follow current settings", async () => {
  const { db, sqlite } = database();
  let now = 1_000_000;
  try {
    const teacher = makeQuizService(db, adminUser, () => now),
      student = makeQuizService(db, studentUser, () => now);
    const input = {
      ...fixture(),
      accessCode: "012345",
      mode: "document",
      documentIds: ["code-pdf"],
    };
    input.questions[0].imageId = "code-stem";
    input.questions[0].choiceImageIds = ["code-choice", "", "", ""];
    input.questions[0].explanationImageId = "code-solution";
    for (const id of ["code-pdf", "code-stem", "code-choice", "code-solution"])
      sqlite
        .prepare(
          "INSERT INTO quiz_files(id,owner_uid,name,mime,data,created_at) VALUES(?,'teacher',?,'image/png',?,1)",
        )
        .run(id, id, new Uint8Array([137, 80, 78, 71]));
    const { quiz } = await teacher.save({ quiz: input }),
      id = quiz.id;
    assert.equal(quiz.requiresAccessCode, true);
    assert.equal((await teacher.adminDetail({ id })).quiz.accessCode, "012345");
    for (const operation of ["list", "listAdmin"]) {
      const data = await teacher[operation]({ subject: "toan" });
      assert.equal(data.quizzes[0].requiresAccessCode, true);
      assert.ok(!JSON.stringify(data).includes("012345"));
    }
    const detail = await student.detail({ id });
    assert.equal(detail.quiz.requiresAccessCode, true);
    assert.equal(detail.quiz.questionCount, 3);
    assert.deepEqual(detail.quiz.questions, []);
    assert.deepEqual(detail.quiz.documentIds, []);
    assert.equal(detail.quiz.accessCode, undefined);
    for (const file of fileIds(input))
      await assert.rejects(student.file({ id: file }), (e) => e.status === 403);
    for (const accessCode of [undefined, 12345, "12345", "111111"])
      await assert.rejects(
        student.start({ id, accessCode }),
        (e) => e.status === 403,
      );
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_attempts").get().n,
      0,
    );
    now += 20_000;
    const started = await student.start({ id, accessCode: "012345" });
    assert.equal(started.attempt.startedAt, now);
    assert.equal(started.attempt.deadlineAt, now + 60_000);
    assert.equal(started.quiz.questions.length, 3);
    assert.equal(started.quiz.accessCode, undefined);
    const snapshot = JSON.parse(
      sqlite.prepare("SELECT snapshot FROM quiz_attempts").get().snapshot,
    );
    assert.equal(snapshot.accessCode, undefined);
    assert.ok(!JSON.stringify(snapshot).includes("012345"));
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_access_failures").get().n,
      0,
    );
    for (const file of ["code-pdf", "code-stem", "code-choice"])
      assert.equal((await student.file({ id: file })).status, 200);
    await assert.rejects(
      student.file({ id: "code-solution" }),
      (e) => e.status === 403,
    );
    const other = makeQuizService(
      db,
      { ...studentUser, uid: "other" },
      () => now,
    );
    await assert.rejects(
      other.file({ id: "code-choice" }),
      (e) => e.status === 403,
    );
    await teacher.save({
      id,
      revision: 1,
      quiz: { ...input, accessCode: "654321" },
    });
    assert.equal((await student.start({ id })).attempt.id, started.attempt.id);
    assert.equal((await student.detail({ id })).quiz.questions.length, 3);
    const result = await student.submit({
      id: started.attempt.id,
      revision: 0,
      answers: { single: "B", tf: [true, false, true, false], short: "0.5" },
      flagged: [],
    });
    assert.equal(result.attempt.result.score, 10);
    assert.equal((await student.file({ id: "code-solution" })).status, 200);
    await teacher.allowRetake({ id: started.attempt.id });
    assert.deepEqual((await student.detail({ id })).quiz.questions, []);
    await assert.rejects(
      student.start({ id, accessCode: "012345" }),
      (e) => e.status === 403,
    );
    now += 1_000;
    const retake = await student.start({ id, accessCode: "654321" });
    assert.equal(retake.attempt.attemptNumber, 2);
    assert.deepEqual(retake.attempt.answers, {});
    assert.equal(retake.attempt.deadlineAt, now + 60_000);
    await teacher.save({ id, revision: 2, quiz: { ...input, accessCode: "" } });
    assert.equal((await other.detail({ id })).quiz.questions.length, 3);
    assert.equal((await other.detail({ id })).quiz.requiresAccessCode, false);
    assert.equal((await other.start({ id })).quiz.questions.length, 3);
    // Bodies written before this feature have no accessCode field.
    const legacy = await teacher.save({ quiz: fixture() });
    sqlite
      .prepare(
        "UPDATE quizzes SET body=json_remove(body,'$.accessCode') WHERE id=?",
      )
      .run(legacy.quiz.id);
    assert.equal(
      (await student.list({ subject: "toan" })).quizzes.find(
        (q) => q.id === legacy.quiz.id,
      ).requiresAccessCode,
      false,
    );
    assert.equal(
      (await student.start({ id: legacy.quiz.id })).quiz.questions.length,
      3,
    );
    await teacher.deleteQuiz({ id, revision: 3 });
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

test("incorrect code checks are bounded per user and revision; cooldown and teacher code changes release the limit without creating attempts", async () => {
  const { db, sqlite } = database();
  let now = 1_000_000;
  try {
    const teacher = makeQuizService(db, adminUser, () => now),
      student = makeQuizService(db, studentUser, () => now);
    const { quiz } = await teacher.save({
        quiz: { ...fixture(), accessCode: "012345" },
      }),
      id = quiz.id;
    for (let i = 0; i < 5; i++)
      await assert.rejects(
        student.start({ id, accessCode: "111111" }),
        (e) => e.status === 403,
      );
    await assert.rejects(
      student.start({ id, accessCode: "012345" }),
      (e) => e.status === 429,
    );
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_attempts").get().n,
      0,
    );
    const other = makeQuizService(
      db,
      { ...studentUser, uid: "other" },
      () => now,
    );
    assert.equal(
      (await other.start({ id, accessCode: "012345" })).quiz.questions.length,
      3,
    );
    now += 60_001;
    await assert.rejects(
      student.start({ id, accessCode: "111111" }),
      (e) => e.status === 403,
    );
    assert.equal(
      sqlite
        .prepare(
          "SELECT failures FROM quiz_access_failures WHERE user_uid='student'",
        )
        .get().failures,
      1,
    );
    for (let i = 0; i < 4; i++)
      await assert.rejects(
        student.start({ id, accessCode: "111111" }),
        (e) => e.status === 403,
      );
    await teacher.save({
      id,
      revision: 1,
      quiz: { ...fixture(), accessCode: "654321" },
    });
    assert.equal(
      (await student.start({ id, accessCode: "654321" })).quiz.questions.length,
      3,
    );
    const third = makeQuizService(
      db,
      { ...studentUser, uid: "third" },
      () => now,
    );
    await assert.rejects(third.start({ id }), (e) => e.status === 403);
    await teacher.deleteQuiz({ id, revision: 2 });
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM quiz_access_failures").get().n,
      0,
    );
  } finally {
    sqlite.close();
  }
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

test("only the teacher can release a student's current attempt; history survives and retakes start blank with a fresh deadline and snapshot", async () => {
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
      (e) => e.status === 409,
    );
    await assert.rejects(
      student.submit({
        id: first.attempt.id,
        revision: 1,
        answers: {},
        flagged: [],
      }),
      (e) => e.status === 409,
    );
    const history = await teacher.results({ id: quiz.id });
    const old = history.attempts.find((a) => a.id === first.attempt.id);
    assert.equal(old.isCurrent, false);
    assert.equal(old.result.score, submitted.attempt.result.score);
    assert.equal(old.result.details[0].expected, "B");
    assert.deepEqual(old.flagged, ["tf"]);
    const secondSubmitted = await student.submit({
      id: second.attempt.id,
      revision: 0,
      answers: { single: "A", short: "0.5" },
      flagged: [],
    });
    assert.equal(secondSubmitted.attempt.result.details[0].expected, "A");
  } finally {
    sqlite.close();
  }
});

test("granting a retake closes an in-progress attempt using only saved answers; repeated grants do not grant unlimited retries", async () => {
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
    assert.equal(history.attempts.length, 1);
    assert.equal(history.attempts[0].result.score, 2.5);
    assert.equal(history.attempts[0].submittedAt, now);
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
    await teacher.allowRetake({ id: first.attempt.id });
    const current = { ...input, documentIds: [shared, newFile] };
    await teacher.save({ id: quiz.id, revision: 1, quiz: current });
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
