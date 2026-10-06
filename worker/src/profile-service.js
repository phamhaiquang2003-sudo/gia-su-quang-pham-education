import { ServiceError } from "./errors.js";
import { makeQuizService, readUpload } from "./quiz-service.js";

const dayMilliseconds = 86_400_000;
const vietnamOffset = 25_200_000;

export function studyStreak(days, timestamp) {
  const today = Math.floor((timestamp + vietnamOffset) / dayMilliseconds);
  let expected = days[0] === today - 1 ? today - 1 : today;
  let streak = 0;
  for (const day of days) {
    if (day !== expected) break;
    streak++;
    expected--;
  }
  return streak;
}

export function makeProfileService(db, user, now = () => Date.now()) {
  return {
    async profileOverview() {
      const timestamp = now();
      const expired = await db
        .prepare(
          "SELECT id FROM quiz_attempts WHERE user_uid=? AND is_current=1 AND submitted_at IS NULL AND deadline_at<=? LIMIT 5",
        )
        .bind(user.uid, timestamp)
        .all();
      const quizzes = makeQuizService(db, user, now);
      for (const row of expired.results) await quizzes.submit({ id: row.id });
      const [totals, days, available, completed, recent, avatar] =
        await Promise.all([
          db
            .prepare(
              "SELECT COUNT(DISTINCT json_extract(snapshot,'$.subject')) AS studied_subjects,COALESCE(SUM(CASE WHEN submitted_at IS NOT NULL THEN 1 ELSE 0 END),0) AS completed_attempts,COALESCE(SUM(MAX(0,MIN(COALESCE(submitted_at,?),deadline_at,?)-started_at)),0) AS study_milliseconds FROM quiz_attempts WHERE user_uid=?",
            )
            .bind(timestamp, timestamp, user.uid)
            .first(),
          db
            .prepare(
              "SELECT DISTINCT CAST((started_at+25200000)/86400000 AS INTEGER) AS day FROM quiz_attempts WHERE user_uid=? AND started_at<=? ORDER BY day DESC",
            )
            .bind(user.uid, timestamp)
            .all(),
          db
            .prepare(
              "SELECT subject,COUNT(*) AS total FROM quizzes WHERE status='published' GROUP BY subject",
            )
            .all(),
          db
            .prepare(
              "SELECT q.subject,COUNT(DISTINCT a.quiz_id) AS completed FROM quiz_attempts a JOIN quizzes q ON q.id=a.quiz_id WHERE a.user_uid=? AND a.submitted_at IS NOT NULL AND q.status='published' GROUP BY q.subject",
            )
            .bind(user.uid)
            .all(),
          db
            .prepare(
              "SELECT id,quiz_id,is_current,attempt_number,started_at,deadline_at,submitted_at,json_extract(snapshot,'$.title') AS title,json_extract(snapshot,'$.subject') AS subject,json_extract(result,'$.manual') AS manual,json_extract(result,'$.status') AS grade_status,json_extract(result,'$.score') AS score FROM quiz_attempts WHERE user_uid=? ORDER BY started_at DESC,id DESC LIMIT 10",
            )
            .bind(user.uid)
            .all(),
          db
            .prepare("SELECT updated_at FROM student_profiles WHERE user_uid=?")
            .bind(user.uid)
            .first(),
        ]);
      return {
        stats: {
          studiedSubjects: totals.studied_subjects,
          completedAttempts: totals.completed_attempts,
          studyMilliseconds: totals.study_milliseconds,
          streakDays: studyStreak(
            days.results.map((row) => row.day),
            timestamp,
          ),
        },
        progress: available.results.map((row) => {
          const count =
            completed.results.find((item) => item.subject === row.subject)
              ?.completed || 0;
          return {
            subject: row.subject,
            total: row.total,
            completed: count,
            percent: Math.round((count / row.total) * 100),
          };
        }),
        recent: recent.results.map((row) => ({
          id: row.id,
          quizId: row.quiz_id,
          title: row.title,
          subject: row.subject,
          isCurrent: Boolean(row.is_current),
          attemptNumber: row.attempt_number,
          startedAt: row.started_at,
          submittedAt: row.submitted_at,
          elapsedMilliseconds: Math.max(
            0,
            Math.min(
              row.submitted_at ?? timestamp,
              row.deadline_at,
              timestamp,
            ) - row.started_at,
          ),
          status:
            row.submitted_at === null
              ? row.deadline_at <= timestamp
                ? "processing"
                : "in-progress"
              : row.manual && row.grade_status === "pending"
                ? "pending"
                : "graded",
          score:
            row.submitted_at !== null &&
            !(row.manual && row.grade_status === "pending")
              ? row.score
              : null,
        })),
        hasAvatar: Boolean(avatar),
        avatarUpdatedAt: avatar?.updated_at ?? null,
        serverNow: timestamp,
      };
    },
    async profileAvatarUpload(request) {
      const file = await readUpload(request, true);
      if (file.buffer.byteLength > 350_000)
        throw new ServiceError(
          "invalid-argument",
          "Ảnh đại diện cần nhỏ hơn 350 KB.",
          413,
        );
      const timestamp = now();
      await db
        .prepare(
          "INSERT INTO student_profiles(user_uid,avatar_mime,avatar_data,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_uid) DO UPDATE SET avatar_mime=excluded.avatar_mime,avatar_data=excluded.avatar_data,updated_at=excluded.updated_at",
        )
        .bind(user.uid, file.mime, file.buffer, timestamp)
        .run();
      return { avatarUpdatedAt: timestamp };
    },
    async profileAvatar() {
      const row = await db
        .prepare(
          "SELECT avatar_mime,avatar_data FROM student_profiles WHERE user_uid=?",
        )
        .bind(user.uid)
        .first();
      if (!row)
        throw new ServiceError("not-found", "Bạn chưa tải ảnh đại diện.", 404);
      return new Response(new Uint8Array(row.avatar_data), {
        headers: {
          "Content-Type": row.avatar_mime,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    },
  };
}
