import { ServiceError } from "./errors.js";
import {
  DOC_MIME,
  DOCX_MIME,
  isWordMime,
  validWordFile,
} from "./word-files.js";
import {
  validateQuiz,
  validId,
  fileIds,
  publicQuiz,
  validateResponses,
  grade,
  publicResult,
  quizAvailability,
} from "./quiz-model.js";

const conflict = () => {
  throw new ServiceError(
    "failed-precondition",
    "Bài đã thay đổi ở một cửa sổ khác. Hãy tải lại trước khi tiếp tục.",
    409,
  );
};
function checkId(id) {
  if (!validId(id))
    throw new ServiceError("invalid-argument", "Mã bài không hợp lệ.");
}
const summary = (row) => ({
  id: row.id,
  title: row.title,
  subject: row.subject,
  category: row.category,
  status: row.status,
  revision: row.revision,
  questionCount: row.question_count,
  durationMinutes: row.duration_minutes,
  requiresAccessCode: Boolean(row.requires_access_code),
  gradingMode: row.grading_mode || "auto",
  opensAt: row.opens_at ?? null,
  closesAt: row.closes_at ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function makeQuizService(db, user, now = () => Date.now()) {
  const admin = () => {
    if (!user.admin)
      throw new ServiceError(
        "permission-denied",
        "Chỉ quản trị viên được quản lý đề.",
        403,
      );
  };
  const quizRow = async (id) => {
    checkId(id);
    const row = await db
      .prepare("SELECT * FROM quizzes WHERE id=?")
      .bind(id)
      .first();
    if (!row) throw new ServiceError("not-found", "Không tìm thấy đề.", 404);
    return row;
  };
  const ownAttempt = async (id) => {
    checkId(id);
    const row = await db
      .prepare("SELECT * FROM quiz_attempts WHERE id=? AND user_uid=?")
      .bind(id, user.uid)
      .first();
    if (!row)
      throw new ServiceError(
        "not-found",
        "Không tìm thấy lượt làm bài của bạn.",
        404,
      );
    if (!row.is_current)
      throw new ServiceError(
        "failed-precondition",
        "Giáo viên đã cho phép làm lại bài này. Hãy tải lại để bắt đầu lượt mới.",
        409,
      );
    return row;
  };
  async function validateSubmissionImages(row, answers) {
    const requested = Object.entries(answers).flatMap(([questionId, answer]) =>
      (answer?.imageIds || []).map((id) => ({ id, questionId })),
    );
    if (!requested.length) return;
    const links = await db
      .prepare(
        "SELECT file_id,question_id FROM submission_file_links WHERE attempt_id=?",
      )
      .bind(row.id)
      .all();
    if (
      requested.some(
        ({ id, questionId }) =>
          !links.results.some(
            (link) => link.file_id === id && link.question_id === questionId,
          ),
      )
    )
      throw new ServiceError(
        "permission-denied",
        "Ảnh bài nộp không thuộc câu hỏi và lượt làm này.",
        403,
      );
  }
  async function finish(
    row,
    answers = JSON.parse(row.answers),
    submittedAt = now(),
    flagged = JSON.parse(row.flagged),
  ) {
    if (row.result) return row;
    await validateSubmissionImages(row, answers);
    const result = grade(JSON.parse(row.snapshot), answers);
    await db
      .prepare(
        "UPDATE quiz_attempts SET answers=?,flagged=?,result=?,submitted_at=?,revision=revision+1 WHERE id=? AND submitted_at IS NULL AND revision=?",
      )
      .bind(
        JSON.stringify(answers),
        JSON.stringify(flagged),
        JSON.stringify(result),
        Math.min(submittedAt, row.deadline_at),
        row.id,
        row.revision,
      )
      .run();
    const updated = await db
      .prepare("SELECT * FROM quiz_attempts WHERE id=?")
      .bind(row.id)
      .first();
    if (!updated) throw new ServiceError("not-found", "Đề đã được xóa.", 404);
    if (!updated.result) conflict();
    return updated;
  }
  async function expire(row) {
    return !row.result && row.deadline_at <= now() ? finish(row) : row;
  }
  const publicAttempt = (row) => ({
    ...(JSON.parse(row.snapshot).gradingMode === "manual"
      ? { quiz: publicQuiz(JSON.parse(row.snapshot)) }
      : {}),
    id: row.id,
    quizId: row.quiz_id,
    attemptNumber: row.attempt_number,
    isCurrent: Boolean(row.is_current),
    answers: JSON.parse(row.answers),
    flagged: JSON.parse(row.flagged),
    revision: row.revision,
    startedAt: row.started_at,
    deadlineAt: row.deadline_at,
    submittedAt: row.submitted_at,
    result: row.result
      ? publicResult(
          JSON.parse(row.result),
          user.admin || JSON.parse(row.snapshot).revealAnswers,
        )
      : null,
  });

  return {
    async list(data) {
      const rows = await db
        .prepare(
          "SELECT id,title,subject,category,status,revision,question_count,duration_minutes,created_at,updated_at,json_extract(body,'$.opensAt') AS opens_at,json_extract(body,'$.closesAt') AS closes_at,json_extract(body,'$.gradingMode') AS grading_mode,CASE WHEN COALESCE(json_extract(body,'$.accessCode'),'')<>'' THEN 1 ELSE 0 END AS requires_access_code FROM quizzes WHERE status='published' AND subject=? ORDER BY created_at DESC LIMIT 200",
        )
        .bind(data.subject)
        .all();
      return { quizzes: rows.results.map(summary), serverNow: now() };
    },
    async listAdmin() {
      admin();
      const rows = await db
        .prepare(
          "SELECT id,title,subject,category,status,revision,question_count,duration_minutes,created_at,updated_at,json_extract(body,'$.opensAt') AS opens_at,json_extract(body,'$.closesAt') AS closes_at,json_extract(body,'$.gradingMode') AS grading_mode,CASE WHEN COALESCE(json_extract(body,'$.accessCode'),'')<>'' THEN 1 ELSE 0 END AS requires_access_code FROM quizzes ORDER BY created_at DESC LIMIT 200",
        )
        .all();
      return { quizzes: rows.results.map(summary) };
    },
    async adminDetail(data) {
      admin();
      const row = await quizRow(data.id);
      return {
        quiz: {
          ...JSON.parse(row.body),
          status: row.status,
          id: row.id,
          revision: row.revision,
        },
      };
    },
    async save(data) {
      admin();
      const quiz = validateQuiz(data.quiz);
      const id = data.id || crypto.randomUUID();
      checkId(id);
      const existing = await db
        .prepare("SELECT revision FROM quizzes WHERE id=?")
        .bind(id)
        .first();
      if (!existing && data.revision !== undefined)
        throw new ServiceError(
          "not-found",
          "Đề đã được xóa. Hãy tạo đề mới để tiếp tục.",
          404,
        );
      if (existing && existing.revision !== data.revision) conflict();
      const ids = fileIds(quiz);
      for (let i = 0; i < ids.length; i += 80) {
        const chunk = ids.slice(i, i + 80);
        const row = await db
          .prepare(
            `SELECT COUNT(*) AS count FROM quiz_files WHERE owner_uid=? AND id IN (${chunk.map(() => "?").join(",")}) AND NOT EXISTS(SELECT 1 FROM submission_file_links WHERE file_id=quiz_files.id)`,
          )
          .bind(user.uid, ...chunk)
          .first();
        if (row.count !== chunk.length)
          throw new ServiceError(
            "permission-denied",
            "Có tệp không thuộc tài khoản quản trị đang đăng đề.",
            403,
          );
      }
      const timestamp = now(),
        nonce = crypto.randomUUID();
      const body = JSON.stringify(quiz);
      const write = existing
        ? db
            .prepare(
              "UPDATE quizzes SET title=?,subject=?,category=?,status=?,revision=revision+1,save_token=?,body=?,question_count=?,duration_minutes=?,updated_at=? WHERE id=? AND revision=?",
            )
            .bind(
              quiz.title,
              quiz.subject,
              quiz.category,
              quiz.status,
              nonce,
              body,
              quiz.questions.length,
              quiz.durationMinutes,
              timestamp,
              id,
              data.revision,
            )
        : db
            .prepare(
              "INSERT INTO quizzes(id,owner_uid,title,subject,category,status,save_token,body,question_count,duration_minutes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              id,
              user.uid,
              quiz.title,
              quiz.subject,
              quiz.category,
              quiz.status,
              nonce,
              body,
              quiz.questions.length,
              quiz.durationMinutes,
              timestamp,
              timestamp,
            );
      const statements = [
        write,
        db
          .prepare(
            "DELETE FROM quiz_file_links WHERE quiz_id=? AND EXISTS(SELECT 1 FROM quizzes WHERE id=? AND save_token=?)",
          )
          .bind(id, id, nonce),
      ];
      if (ids.length)
        statements.push(
          db
            .prepare(
              "INSERT OR IGNORE INTO quiz_file_links(quiz_id,file_id) SELECT ?,value FROM json_each(?) WHERE EXISTS(SELECT 1 FROM quizzes WHERE id=? AND save_token=?)",
            )
            .bind(id, JSON.stringify(ids), id, nonce),
        );
      const results = await db.batch(statements);
      if (!results[0].meta.changes) conflict();
      return {
        quiz: {
          ...summary(await quizRow(id)),
          requiresAccessCode: Boolean(quiz.accessCode),
          gradingMode: quiz.gradingMode,
          opensAt: quiz.opensAt,
          closesAt: quiz.closesAt,
        },
      };
    },
    async hide(data) {
      admin();
      await quizRow(data.id);
      await db
        .prepare(
          "UPDATE quizzes SET status='hidden',revision=revision+1,updated_at=? WHERE id=?",
        )
        .bind(now(), data.id)
        .run();
      return { success: true };
    },
    async unhide(data) {
      admin();
      const row = await quizRow(data.id);
      if (data.revision !== row.revision) conflict();
      if (row.status !== "hidden")
        throw new ServiceError(
          "failed-precondition",
          "Đề đã thay đổi trạng thái. Hãy tải lại danh sách đề.",
          409,
        );
      const write = await db
        .prepare(
          "UPDATE quizzes SET status='published',body=json_set(body,'$.status','published'),revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status='hidden'",
        )
        .bind(now(), row.id, row.revision)
        .run();
      if (!write.meta.changes) conflict();
      const updated = await quizRow(row.id),
        body = JSON.parse(updated.body);
      return {
        quiz: {
          ...summary(updated),
          requiresAccessCode: Boolean(body.accessCode),
          gradingMode: body.gradingMode || "auto",
          opensAt: body.opensAt ?? null,
          closesAt: body.closesAt ?? null,
        },
      };
    },
    async deleteQuiz(data) {
      admin();
      const row = await quizRow(data.id);
      if (data.revision !== row.revision) conflict();
      const attached = await db
        .prepare(
          "SELECT file_id FROM quiz_file_links WHERE quiz_id=? UNION SELECT l.file_id FROM attempt_file_links l JOIN quiz_attempts a ON a.id=l.attempt_id WHERE a.quiz_id=? UNION SELECT l.file_id FROM submission_file_links l JOIN quiz_attempts a ON a.id=l.attempt_id WHERE a.quiz_id=?",
        )
        .bind(row.id, row.id, row.id)
        .all();
      const statements = [
        db
          .prepare("DELETE FROM quizzes WHERE id=? AND revision=?")
          .bind(row.id, row.revision),
      ];
      // Delete only this quiz's unshared attachments, including old snapshots.
      for (let i = 0; i < attached.results.length; i += 80) {
        const ids = attached.results
          .slice(i, i + 80)
          .map((file) => file.file_id);
        statements.push(
          db
            .prepare(
              `DELETE FROM quiz_files WHERE id IN (${ids.map(() => "?").join(",")}) AND NOT EXISTS(SELECT 1 FROM quiz_file_links WHERE file_id=quiz_files.id) AND NOT EXISTS(SELECT 1 FROM attempt_file_links WHERE file_id=quiz_files.id) AND NOT EXISTS(SELECT 1 FROM submission_file_links WHERE file_id=quiz_files.id) AND NOT EXISTS(SELECT 1 FROM quizzes WHERE id=?)`,
            )
            .bind(...ids, row.id),
        );
      }
      const result = await db.batch(statements);
      if (!result[0].meta.changes) conflict();
      return { success: true };
    },
    async allowRetake(data) {
      admin();
      checkId(data.id);
      let attempt = await db
        .prepare("SELECT * FROM quiz_attempts WHERE id=?")
        .bind(data.id)
        .first();
      if (!attempt)
        throw new ServiceError(
          "not-found",
          "Không tìm thấy lượt làm bài.",
          404,
        );
      const row = await quizRow(attempt.quiz_id);
      if (!attempt.is_current) return { success: true };
      if (row.status !== "published")
        throw new ServiceError(
          "failed-precondition",
          "Hãy xuất bản đề trước khi cho phép làm lại.",
          409,
        );
      if (!attempt.result) attempt = await finish(attempt);
      const result = await db
        .prepare(
          "UPDATE quiz_attempts SET is_current=0,revision=revision+1 WHERE id=? AND is_current=1 AND revision=?",
        )
        .bind(attempt.id, attempt.revision)
        .run();
      if (!result.meta.changes) {
        const updated = await db
          .prepare("SELECT is_current FROM quiz_attempts WHERE id=?")
          .bind(attempt.id)
          .first();
        if (!updated)
          throw new ServiceError("not-found", "Đề đã được xóa.", 404);
        if (updated.is_current) conflict();
      }
      return { success: true };
    },
    async detail(data) {
      const row = await quizRow(data.id);
      let attempt = await db
        .prepare(
          "SELECT * FROM quiz_attempts WHERE quiz_id=? AND user_uid=? AND is_current=1",
        )
        .bind(row.id, user.uid)
        .first();
      if (attempt) attempt = await expire(attempt);
      if (row.status !== "published" && !attempt && !user.admin)
        throw new ServiceError(
          "permission-denied",
          "Đề chưa được xuất bản.",
          403,
        );
      const quiz = attempt
        ? JSON.parse(attempt.snapshot)
        : { ...JSON.parse(row.body), id: row.id, revision: row.revision };
      const visible = publicQuiz(quiz);
      if (
        !attempt &&
        (quiz.accessCode ||
          (!user.admin && quizAvailability(quiz, now()) !== "open"))
      ) {
        visible.questions = [];
        visible.documentIds = [];
        visible.instructions = "";
      }
      return {
        quiz: visible,
        attempt: attempt ? publicAttempt(attempt) : null,
        nextAttemptNumber: attempt
          ? attempt.attempt_number
          : ((
              await db
                .prepare(
                  "SELECT MAX(attempt_number) AS number FROM quiz_attempts WHERE quiz_id=? AND user_uid=?",
                )
                .bind(row.id, user.uid)
                .first()
            ).number || 0) + 1,
        serverNow: now(),
      };
    },
    async start(data) {
      const row = await quizRow(data.id);
      const old = await db
        .prepare(
          "SELECT * FROM quiz_attempts WHERE quiz_id=? AND user_uid=? AND is_current=1",
        )
        .bind(row.id, user.uid)
        .first();
      if (old)
        return {
          attempt: publicAttempt(await expire(old)),
          quiz: publicQuiz(JSON.parse(old.snapshot)),
          serverNow: now(),
        };
      if (row.status !== "published")
        throw new ServiceError(
          "permission-denied",
          "Hãy xuất bản đề trước khi bắt đầu làm bài.",
          403,
        );
      const { accessCode, ...body } = JSON.parse(row.body);
      const checkWindow = (timestamp) => {
        const availability = quizAvailability(body, timestamp);
        if (availability !== "open")
          throw new ServiceError(
            "permission-denied",
            availability === "upcoming"
              ? "Đề chưa đến giờ mở. Vui lòng quay lại đúng lịch."
              : "Đề đã đóng. Bạn không thể bắt đầu lượt làm mới.",
            403,
          );
      };
      checkWindow(now());
      if (accessCode) {
        const failures = await db
          .prepare(
            "SELECT * FROM quiz_access_failures WHERE quiz_id=? AND user_uid=?",
          )
          .bind(row.id, user.uid)
          .first();
        if (
          failures?.quiz_revision === row.revision &&
          failures.failures >= 5 &&
          failures.retry_after > now()
        )
          throw new ServiceError(
            "resource-exhausted",
            "Bạn đã nhập sai nhiều lần. Vui lòng đợi 1 phút rồi thử lại.",
            429,
          );
        if (data.accessCode !== accessCode) {
          const timestamp = now();
          await db
            .prepare(
              "INSERT INTO quiz_access_failures(quiz_id,user_uid,quiz_revision,failures,retry_after) VALUES(?,?,?,1,?) ON CONFLICT(quiz_id,user_uid) DO UPDATE SET quiz_revision=excluded.quiz_revision,failures=CASE WHEN quiz_access_failures.retry_after<=? OR quiz_access_failures.quiz_revision<>excluded.quiz_revision THEN 1 ELSE quiz_access_failures.failures+1 END,retry_after=CASE WHEN quiz_access_failures.retry_after<=? OR quiz_access_failures.quiz_revision<>excluded.quiz_revision THEN excluded.retry_after ELSE quiz_access_failures.retry_after END",
            )
            .bind(
              row.id,
              user.uid,
              row.revision,
              timestamp + 60_000,
              timestamp,
              timestamp,
            )
            .run();
          throw new ServiceError(
            "permission-denied",
            "Mật khẩu đề không đúng. Hãy nhập mã 6 chữ số giáo viên cung cấp.",
            403,
          );
        }
        await db
          .prepare(
            "DELETE FROM quiz_access_failures WHERE quiz_id=? AND user_uid=?",
          )
          .bind(row.id, user.uid)
          .run();
      }
      const quiz = {
        ...body,
        requiresAccessCode: Boolean(accessCode),
        id: row.id,
        revision: row.revision,
      };
      const id = crypto.randomUUID(),
        startedAt = now();
      checkWindow(startedAt);
      const deadline = Math.min(
        startedAt + quiz.durationMinutes * 60_000,
        quiz.closesAt || Infinity,
      );
      const statements = [
        db
          .prepare(
            "INSERT OR IGNORE INTO quiz_attempts(id,quiz_id,user_uid,display_name,username,user_role,snapshot,started_at,deadline_at,attempt_number) SELECT ?,?,?,?,?,?,?,?,?,COALESCE((SELECT MAX(attempt_number) FROM quiz_attempts WHERE quiz_id=? AND user_uid=?),0)+1 WHERE EXISTS(SELECT 1 FROM quizzes WHERE id=? AND revision=? AND status='published') AND NOT EXISTS(SELECT 1 FROM quiz_attempts WHERE quiz_id=? AND user_uid=? AND is_current=1)",
          )
          .bind(
            id,
            row.id,
            user.uid,
            user.displayName,
            user.username,
            user.role,
            JSON.stringify(quiz),
            startedAt,
            deadline,
            row.id,
            user.uid,
            row.id,
            row.revision,
            row.id,
            user.uid,
          ),
      ];
      const attached = fileIds(quiz);
      if (attached.length)
        statements.push(
          db
            .prepare(
              "INSERT OR IGNORE INTO attempt_file_links(attempt_id,file_id) SELECT ?,value FROM json_each(?) WHERE EXISTS(SELECT 1 FROM quiz_attempts WHERE id=?)",
            )
            .bind(id, JSON.stringify(attached), id),
        );
      await db.batch(statements);
      const attempt = await db
        .prepare(
          "SELECT * FROM quiz_attempts WHERE quiz_id=? AND user_uid=? AND is_current=1",
        )
        .bind(row.id, user.uid)
        .first();
      if (!attempt) conflict();
      return {
        attempt: publicAttempt(attempt),
        quiz: publicQuiz(JSON.parse(attempt.snapshot)),
        serverNow: now(),
      };
    },
    async progress(data) {
      let row = await expire(await ownAttempt(data.id));
      if (row.result) return { attempt: publicAttempt(row), serverNow: now() };
      if (data.revision !== row.revision) conflict();
      const response = validateResponses(
        JSON.parse(row.snapshot),
        data.answers,
        data.flagged,
      );
      await validateSubmissionImages(row, response.answers);
      const write = await db
        .prepare(
          "UPDATE quiz_attempts SET answers=?,flagged=?,revision=revision+1 WHERE id=? AND revision=? AND submitted_at IS NULL AND deadline_at>?",
        )
        .bind(
          JSON.stringify(response.answers),
          JSON.stringify(response.flagged),
          row.id,
          data.revision,
          now(),
        )
        .run();
      if (!write.meta.changes) {
        row = await expire(await ownAttempt(data.id));
        if (!row.result) conflict();
      } else row = await ownAttempt(data.id);
      return { attempt: publicAttempt(row), serverNow: now() };
    },
    async submit(data) {
      let row = await ownAttempt(data.id);
      if (!row.result) {
        const expired = row.deadline_at <= now();
        if (!expired && data.revision !== row.revision) conflict();
        const response = expired
          ? {
              answers: JSON.parse(row.answers),
              flagged: JSON.parse(row.flagged),
            }
          : validateResponses(
              JSON.parse(row.snapshot),
              data.answers,
              data.flagged,
            );
        row = await finish(row, response.answers, now(), response.flagged);
      }
      return { attempt: publicAttempt(row), serverNow: now() };
    },
    async results(data) {
      admin();
      await quizRow(data.id);
      const expired = await db
        .prepare(
          "SELECT * FROM quiz_attempts WHERE quiz_id=? AND submitted_at IS NULL AND deadline_at<=? LIMIT 10",
        )
        .bind(data.id, now())
        .all();
      for (const row of expired.results) await finish(row);
      const rows = await db
        .prepare(
          "SELECT * FROM quiz_attempts WHERE quiz_id=? ORDER BY started_at DESC LIMIT 200",
        )
        .bind(data.id)
        .all();
      return {
        attempts: rows.results.map((row) => ({
          ...publicAttempt(row),
          displayName: row.display_name,
          username: row.username,
          role: row.user_role,
        })),
      };
    },
    async manualGrade(data) {
      admin();
      checkId(data.id);
      const row = await db
        .prepare("SELECT * FROM quiz_attempts WHERE id=?")
        .bind(data.id)
        .first();
      if (!row)
        throw new ServiceError("not-found", "Không tìm thấy bài nộp.", 404);
      if (
        JSON.parse(row.snapshot).gradingMode !== "manual" ||
        row.submitted_at === null
      )
        throw new ServiceError(
          "failed-precondition",
          "Chỉ chấm thủ công bài tự luận đã nộp.",
          409,
        );
      if (data.revision !== row.revision) conflict();
      if (
        typeof data.score !== "number" ||
        !Number.isFinite(data.score) ||
        data.score < 0 ||
        data.score > 10 ||
        typeof data.feedback !== "string" ||
        data.feedback.length > 5000
      )
        throw new ServiceError(
          "invalid-argument",
          "Nhập điểm từ 0 đến 10 và nhận xét tối đa 5000 ký tự.",
        );
      const result = {
        ...JSON.parse(row.result),
        manual: true,
        status: "graded",
        score: Math.round(data.score * 100) / 100,
        earned: Math.round(data.score * 100) / 100,
        feedback: data.feedback.trim(),
        gradedAt: now(),
      };
      const write = await db
        .prepare(
          "UPDATE quiz_attempts SET result=?,revision=revision+1 WHERE id=? AND revision=? AND submitted_at IS NOT NULL",
        )
        .bind(JSON.stringify(result), row.id, data.revision)
        .run();
      if (!write.meta.changes) conflict();
      return {
        attempt: publicAttempt(
          await db
            .prepare("SELECT * FROM quiz_attempts WHERE id=?")
            .bind(row.id)
            .first(),
        ),
        serverNow: now(),
      };
    },
    async submissionUpload(request) {
      const params = new URL(request.url).searchParams;
      const row = await ownAttempt(params.get("attemptId"));
      const quiz = JSON.parse(row.snapshot),
        questionId = params.get("questionId");
      if (
        quiz.gradingMode !== "manual" ||
        (quiz.mode === "document"
          ? questionId !== "__submission"
          : !quiz.questions.some(
              (q) => q.id === questionId && q.type === "essay",
            ))
      )
        throw new ServiceError(
          "invalid-argument",
          "Không tìm thấy phần nộp tự luận.",
        );
      if (row.submitted_at !== null || row.deadline_at <= now())
        throw new ServiceError(
          "failed-precondition",
          "Bài đã nộp hoặc hết thời gian; không thể thêm ảnh.",
          409,
        );
      if (Number(params.get("revision")) !== row.revision) conflict();
      const count = await db
        .prepare(
          "SELECT COUNT(*) AS n FROM submission_file_links WHERE attempt_id=?",
        )
        .bind(row.id)
        .first();
      if (count.n >= 20)
        throw new ServiceError(
          "invalid-argument",
          "Mỗi lượt làm được tải tối đa 20 ảnh. Gỡ ảnh cũ để thay ảnh mới.",
        );
      const file = await readUpload(request, true);
      const answers = JSON.parse(row.answers),
        old = answers[questionId] || { text: "", imageIds: [] };
      answers[questionId] = {
        text: old.text,
        imageIds: [...old.imageIds, file.id],
      };
      const timestamp = now();
      const writes = await db.batch([
        db
          .prepare(
            "INSERT INTO quiz_files(id,owner_uid,name,mime,data,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM quiz_attempts WHERE id=? AND user_uid=? AND revision=? AND is_current=1 AND submitted_at IS NULL AND deadline_at>?) AND (SELECT COUNT(*) FROM submission_file_links WHERE attempt_id=?)<20",
          )
          .bind(
            file.id,
            user.uid,
            file.name,
            file.mime,
            file.buffer,
            timestamp,
            row.id,
            user.uid,
            row.revision,
            timestamp,
            row.id,
          ),
        db
          .prepare(
            "INSERT INTO submission_file_links(attempt_id,question_id,file_id) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM quiz_files WHERE id=?)",
          )
          .bind(row.id, questionId, file.id, file.id),
        db
          .prepare(
            "UPDATE quiz_attempts SET answers=?,revision=revision+1 WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM submission_file_links WHERE file_id=?)",
          )
          .bind(JSON.stringify(answers), row.id, row.revision, file.id),
      ]);
      if (!writes[0].meta.changes) conflict();
      return {
        attempt: publicAttempt(await ownAttempt(row.id)),
        serverNow: now(),
      };
    },
    async removeSubmissionFile(data) {
      const row = await ownAttempt(data.id);
      if (
        row.submitted_at !== null ||
        row.deadline_at <= now() ||
        JSON.parse(row.snapshot).gradingMode !== "manual"
      )
        throw new ServiceError(
          "failed-precondition",
          "Bài đã nộp hoặc hết thời gian; không thể gỡ ảnh.",
          409,
        );
      if (data.revision !== row.revision) conflict();
      checkId(data.fileId);
      const link = await db
        .prepare(
          "SELECT file_id FROM submission_file_links WHERE attempt_id=? AND file_id=?",
        )
        .bind(row.id, data.fileId)
        .first();
      if (!link)
        throw new ServiceError("not-found", "Không tìm thấy ảnh bài nộp.", 404);
      const answers = JSON.parse(row.answers);
      for (const answer of Object.values(answers))
        if (answer?.imageIds)
          answer.imageIds = answer.imageIds.filter((id) => id !== data.fileId);
      const nonce = crypto.randomUUID();
      const writes = await db.batch([
        db
          .prepare(
            "UPDATE quiz_attempts SET answers=?,revision=revision+1,mutation_token=? WHERE id=? AND revision=? AND submitted_at IS NULL AND deadline_at>?",
          )
          .bind(JSON.stringify(answers), nonce, row.id, row.revision, now()),
        db
          .prepare(
            "DELETE FROM submission_file_links WHERE attempt_id=? AND file_id=? AND EXISTS(SELECT 1 FROM quiz_attempts WHERE id=? AND mutation_token=?)",
          )
          .bind(row.id, data.fileId, row.id, nonce),
        db
          .prepare(
            "DELETE FROM quiz_files WHERE id=? AND NOT EXISTS(SELECT 1 FROM submission_file_links WHERE file_id=?) AND NOT EXISTS(SELECT 1 FROM quiz_file_links WHERE file_id=?) AND NOT EXISTS(SELECT 1 FROM attempt_file_links WHERE file_id=?)",
          )
          .bind(data.fileId, data.fileId, data.fileId, data.fileId),
      ]);
      if (!writes[0].meta.changes) conflict();
      return {
        attempt: publicAttempt(await ownAttempt(row.id)),
        serverNow: now(),
      };
    },
    async upload(request) {
      admin();
      const { id, name, mime, buffer } = await readUpload(request);
      await db
        .prepare(
          "INSERT INTO quiz_files(id,owner_uid,name,mime,data,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(id, user.uid, name, mime, buffer, now())
        .run();
      return { file: { id, name, mime, size: buffer.byteLength } };
    },
    async file(data) {
      checkId(data.id);
      const meta = await db
        .prepare("SELECT owner_uid FROM quiz_files WHERE id=?")
        .bind(data.id)
        .first();
      if (!meta)
        throw new ServiceError("not-found", "Không tìm thấy tệp đề.", 404);
      if (!user.admin) {
        const submission = await db
          .prepare(
            "SELECT a.user_uid FROM submission_file_links l JOIN quiz_attempts a ON a.id=l.attempt_id WHERE l.file_id=?",
          )
          .bind(data.id)
          .first();
        if (submission && submission.user_uid !== user.uid)
          throw new ServiceError(
            "permission-denied",
            "Bạn không được xem bài nộp này.",
            403,
          );
        const candidates = await db
          .prepare(
            "SELECT q.body AS body,0 AS reveal,0 AS is_attempt FROM quiz_file_links l JOIN quizzes q ON q.id=l.quiz_id WHERE l.file_id=? AND q.status='published' UNION ALL SELECT a.snapshot AS body,CASE WHEN a.submitted_at IS NOT NULL THEN 1 ELSE 0 END AS reveal,1 AS is_attempt FROM attempt_file_links l JOIN quiz_attempts a ON a.id=l.attempt_id WHERE l.file_id=? AND a.user_uid=?",
          )
          .bind(data.id, data.id, user.uid)
          .all();
        const access = candidates.results.some((row) => {
          const quiz = JSON.parse(row.body);
          if (
            !row.is_attempt &&
            (quiz.accessCode || quizAvailability(quiz, now()) !== "open")
          )
            return false;
          const visible =
            row.reveal && quiz.revealAnswers ? quiz : publicQuiz(quiz);
          return fileIds(visible).includes(data.id);
        });
        if (!access && !submission)
          throw new ServiceError(
            "permission-denied",
            "Tệp đề chưa được công bố.",
            403,
          );
      }
      const file = await db
        .prepare("SELECT name,mime,data FROM quiz_files WHERE id=?")
        .bind(data.id)
        .first();
      return new Response(new Uint8Array(file.data), {
        headers: {
          "Content-Type": file.mime,
          "Content-Disposition": `${isWordMime(file.mime) ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
          "Access-Control-Expose-Headers": "Content-Disposition",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    },
  };
}

async function readUpload(request, imageOnly = false) {
  const mime = request.headers.get("Content-Type")?.split(";")[0];
  const allowed = imageOnly
    ? ["image/png", "image/jpeg", "image/webp"]
    : [
        "application/pdf",
        DOC_MIME,
        DOCX_MIME,
        "image/png",
        "image/jpeg",
        "image/webp",
      ];
  if (!allowed.includes(mime))
    throw new ServiceError(
      "invalid-argument",
      imageOnly
        ? "Bài nộp chỉ nhận ảnh PNG, JPG hoặc WebP."
        : "Chỉ nhận PDF, Word (.doc, .docx), PNG, JPG hoặc WebP.",
    );
  if (Number(request.headers.get("Content-Length") || 0) > 1_800_000)
    throw new ServiceError("invalid-argument", "Tệp cần nhỏ hơn 1,8 MB.", 413);
  const buffer = await readLimitedBody(request, 1_800_000),
    bytes = new Uint8Array(buffer);
  // Decode only ASCII signature bytes; WebP size bytes can contain invalid UTF-8.
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  const valid =
    (mime === "application/pdf" && ascii(0, 5) === "%PDF-") ||
    (mime === "image/png" &&
      bytes[0] === 137 &&
      ascii(1, 8) === "PNG\r\n\x1a\n") ||
    (mime === "image/jpeg" &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255) ||
    (mime === "image/webp" &&
      ascii(0, 4) === "RIFF" &&
      ascii(8, 12) === "WEBP") ||
    (!imageOnly && validWordFile(bytes, mime));
  if (!valid)
    throw new ServiceError(
      "invalid-argument",
      "Nội dung tệp không khớp định dạng.",
    );
  const name =
    new URL(request.url).searchParams.get("name") ||
    (imageOnly ? "Ảnh bài làm" : "Tệp đề");
  if (name.length > 160)
    throw new ServiceError("invalid-argument", "Tên tệp quá dài.");
  return { id: crypto.randomUUID(), name, mime, buffer };
}

export async function readLimitedBody(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) throw new ServiceError("invalid-argument", "Thiếu dữ liệu.");
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new ServiceError("invalid-argument", "Dữ liệu quá lớn.", 413);
    }
    chunks.push(value);
  }
  return new Blob(chunks).arrayBuffer();
}

export async function finalizeExpired(db) {
  const service = makeQuizService(db, { admin: true, uid: "scheduled" });
  const rows = await db
    .prepare(
      "SELECT DISTINCT quiz_id FROM quiz_attempts WHERE submitted_at IS NULL AND deadline_at<=? LIMIT 1",
    )
    .bind(Date.now())
    .all();
  for (const row of rows.results) await service.results({ id: row.quiz_id });
}
