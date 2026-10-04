import { ServiceError } from "./errors.js";
import {
  validateQuiz,
  validId,
  fileIds,
  publicQuiz,
  validateResponses,
  grade,
  publicResult,
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
    return row;
  };
  async function finish(
    row,
    answers = JSON.parse(row.answers),
    submittedAt = now(),
    flagged = JSON.parse(row.flagged),
  ) {
    if (row.result) return row;
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
    if (!updated.result) conflict();
    return updated;
  }
  async function expire(row) {
    return !row.result && row.deadline_at <= now() ? finish(row) : row;
  }
  const publicAttempt = (row) => ({
    id: row.id,
    quizId: row.quiz_id,
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
          "SELECT id,title,subject,category,status,revision,question_count,duration_minutes,created_at,updated_at FROM quizzes WHERE status='published' AND subject=? ORDER BY created_at DESC LIMIT 200",
        )
        .bind(data.subject)
        .all();
      return { quizzes: rows.results.map(summary) };
    },
    async listAdmin() {
      admin();
      const rows = await db
        .prepare(
          "SELECT id,title,subject,category,status,revision,question_count,duration_minutes,created_at,updated_at FROM quizzes ORDER BY created_at DESC LIMIT 200",
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
      if (existing && existing.revision !== data.revision) conflict();
      const ids = fileIds(quiz);
      for (const file of ids) {
        const row = await db
          .prepare("SELECT id FROM quiz_files WHERE id=? AND owner_uid=?")
          .bind(file, user.uid)
          .first();
        if (!row)
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
      for (const file of ids)
        statements.push(
          db
            .prepare(
              "INSERT OR IGNORE INTO quiz_file_links(quiz_id,file_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM quizzes WHERE id=? AND save_token=?)",
            )
            .bind(id, file, id, nonce),
        );
      const results = await db.batch(statements);
      if (!results[0].meta.changes) conflict();
      return { quiz: summary(await quizRow(id)) };
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
    async detail(data) {
      const row = await quizRow(data.id);
      let attempt = await db
        .prepare("SELECT * FROM quiz_attempts WHERE quiz_id=? AND user_uid=?")
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
      return {
        quiz: publicQuiz(quiz),
        attempt: attempt ? publicAttempt(attempt) : null,
        serverNow: now(),
      };
    },
    async start(data) {
      const row = await quizRow(data.id);
      const old = await db
        .prepare("SELECT * FROM quiz_attempts WHERE quiz_id=? AND user_uid=?")
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
      const quiz = {
        ...JSON.parse(row.body),
        id: row.id,
        revision: row.revision,
      };
      const id = crypto.randomUUID(),
        startedAt = now(),
        deadline = startedAt + quiz.durationMinutes * 60_000;
      const statements = [
        db
          .prepare(
            "INSERT OR IGNORE INTO quiz_attempts(id,quiz_id,user_uid,display_name,username,user_role,snapshot,started_at,deadline_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM quizzes WHERE id=? AND revision=? AND status='published')",
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
            row.revision,
          ),
      ];
      for (const file of fileIds(quiz))
        statements.push(
          db
            .prepare(
              "INSERT OR IGNORE INTO attempt_file_links(attempt_id,file_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM quiz_attempts WHERE id=?)",
            )
            .bind(id, file, id),
        );
      await db.batch(statements);
      const attempt = await db
        .prepare("SELECT * FROM quiz_attempts WHERE quiz_id=? AND user_uid=?")
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
    async upload(request) {
      admin();
      const mime = request.headers.get("Content-Type")?.split(";")[0];
      if (
        !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(
          mime,
        )
      )
        throw new ServiceError(
          "invalid-argument",
          "Chỉ nhận PDF, PNG, JPG hoặc WebP.",
        );
      if (Number(request.headers.get("Content-Length") || 0) > 1_800_000)
        throw new ServiceError(
          "invalid-argument",
          "Tệp cần nhỏ hơn 1,8 MB.",
          413,
        );
      const buffer = await readLimitedBody(request, 1_800_000);
      const bytes = new Uint8Array(buffer);
      const magic = new TextDecoder().decode(bytes.slice(0, 12));
      const valid =
        (mime === "application/pdf" && magic.startsWith("%PDF-")) ||
        (mime === "image/png" &&
          bytes[0] === 137 &&
          magic.slice(1, 4) === "PNG") ||
        (mime === "image/jpeg" &&
          bytes[0] === 255 &&
          bytes[1] === 216 &&
          bytes[2] === 255) ||
        (mime === "image/webp" &&
          magic.startsWith("RIFF") &&
          magic.slice(8, 12) === "WEBP");
      if (!valid)
        throw new ServiceError(
          "invalid-argument",
          "Nội dung tệp không khớp định dạng.",
        );
      const name = new URL(request.url).searchParams.get("name") || "Tệp đề";
      if (name.length > 160)
        throw new ServiceError("invalid-argument", "Tên tệp quá dài.");
      const id = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO quiz_files(id,owner_uid,name,mime,data,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(id, user.uid, name, mime, buffer, now())
        .run();
      return { file: { id, name, mime, size: bytes.length } };
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
        const candidates = await db
          .prepare(
            "SELECT q.body AS body,0 AS reveal FROM quiz_file_links l JOIN quizzes q ON q.id=l.quiz_id WHERE l.file_id=? AND q.status='published' UNION ALL SELECT a.snapshot AS body,CASE WHEN a.submitted_at IS NOT NULL THEN 1 ELSE 0 END AS reveal FROM attempt_file_links l JOIN quiz_attempts a ON a.id=l.attempt_id WHERE l.file_id=? AND a.user_uid=?",
          )
          .bind(data.id, data.id, user.uid)
          .all();
        const access = candidates.results.some((row) => {
          const quiz = JSON.parse(row.body);
          const visible =
            row.reveal && quiz.revealAnswers ? quiz : publicQuiz(quiz);
          return fileIds(visible).includes(data.id);
        });
        if (!access)
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
          "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    },
  };
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
