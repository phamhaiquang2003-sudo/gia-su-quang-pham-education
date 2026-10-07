import { ServiceError } from "./errors.js";
import { validUid } from "./firebase.js";
import { validId } from "./quiz-model.js";

const invalid = (message) => {
  throw new ServiceError("invalid-argument", message);
};
const conflict = () => {
  throw new ServiceError(
    "failed-precondition",
    "Buổi học đã thay đổi. Hãy tải lại trước khi sửa hoặc xóa.",
    409,
  );
};
const field = (doc, key) => doc?.fields?.[key]?.stringValue;
function validDate(value) {
  if (typeof value !== "string" || !/^(20\d{2}|2100)-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
function monthRange(month) {
  if (
    typeof month !== "string" ||
    !/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(month)
  )
    invalid("Chọn tháng hợp lệ từ năm 2000 đến 2100.");
  const [year, number] = month.split("-").map(Number);
  const next =
    number === 12
      ? `${year + 1}-01`
      : `${year}-${String(number + 1).padStart(2, "0")}`;
  return [month + "-01", next + "-01"];
}
const lesson = (row) => ({
  id: row.id,
  studentUid: row.student_uid,
  displayName: row.display_name,
  username: row.username,
  date: row.lesson_date,
  fee: row.fee_vnd,
  note: row.note,
  revision: row.revision,
});

export function makeTuitionService(db, user, firebase, now = () => Date.now()) {
  function admin() {
    if (!user.admin)
      throw new ServiceError(
        "permission-denied",
        "Chỉ quản trị viên được quản lý buổi học và học phí.",
        403,
      );
  }
  async function ownRow(id) {
    if (!validId(id)) invalid("Mã buổi học không hợp lệ.");
    const row = await db
      .prepare("SELECT * FROM tuition_lessons WHERE id=?")
      .bind(id)
      .first();
    if (row && row.teacher_uid !== user.uid)
      throw new ServiceError(
        "permission-denied",
        "Bạn không có quyền sửa buổi học này.",
        403,
      );
    return row;
  }
  return {
    async tuitionMonth(data) {
      admin();
      const [from, to] = monthRange(data.month);
      const studentFilter = data.studentUid || "";
      if (studentFilter && !validUid(studentFilter))
        invalid("Bộ lọc học sinh không hợp lệ.");
      const [rows, groups, rates] = await db.batch([
        db
          .prepare(
            "SELECT * FROM tuition_lessons WHERE teacher_uid=? AND lesson_date>=? AND lesson_date<? AND (?='' OR student_uid=?) ORDER BY lesson_date DESC,created_at DESC,id DESC LIMIT 1000",
          )
          .bind(user.uid, from, to, studentFilter, studentFilter),
        db
          .prepare(
            "WITH grouped AS (SELECT student_uid,COUNT(*) AS lesson_count,SUM(fee_vnd) AS total_fee FROM tuition_lessons WHERE teacher_uid=? AND lesson_date>=? AND lesson_date<? GROUP BY student_uid) SELECT g.*,l.display_name,l.username FROM grouped g JOIN tuition_lessons l ON l.id=(SELECT id FROM tuition_lessons WHERE teacher_uid=? AND student_uid=g.student_uid AND lesson_date>=? AND lesson_date<? ORDER BY lesson_date DESC,updated_at DESC,id DESC LIMIT 1) ORDER BY l.display_name,g.student_uid",
          )
          .bind(user.uid, from, to, user.uid, from, to),
        db
          .prepare(
            "SELECT student_uid,fee_vnd FROM tuition_student_rates WHERE teacher_uid=?",
          )
          .bind(user.uid),
      ]);
      const students = groups.results.map((group) => ({
        studentUid: group.student_uid,
        displayName: group.display_name,
        username: group.username,
        lessonCount: group.lesson_count,
        totalFee: group.total_fee,
      }));
      return {
        month: data.month,
        studentFilter,
        lessons: rows.results.map(lesson),
        students,
        rates: rates.results.map((row) => ({
          studentUid: row.student_uid,
          fee: row.fee_vnd,
        })),
        totals: {
          studentCount: students.length,
          lessonCount: students.reduce((sum, row) => sum + row.lessonCount, 0),
          totalFee: students.reduce((sum, row) => sum + row.totalFee, 0),
        },
        truncated:
          groups.results
            .filter(
              (row) => !studentFilter || row.student_uid === studentFilter,
            )
            .reduce((sum, row) => sum + row.lesson_count, 0) >
          rows.results.length,
      };
    },
    async tuitionSave(data) {
      admin();
      if (!validUid(data.studentUid)) invalid("Chọn một học sinh hợp lệ.");
      if (!validDate(data.date)) invalid("Ngày học không hợp lệ.");
      if (
        !Number.isSafeInteger(data.fee) ||
        data.fee < 0 ||
        data.fee > 1_000_000_000
      )
        invalid("Học phí cần là số nguyên từ 0 đến 1.000.000.000 đồng.");
      if (
        typeof (data.note ?? "") !== "string" ||
        (data.note ?? "").length > 1000
      )
        invalid("Ghi chú tối đa 1000 ký tự.");
      if (
        !validId(data.mutationToken) ||
        !Number.isSafeInteger(data.revision) ||
        data.revision < 0
      )
        invalid("Phiên lưu buổi học không hợp lệ.");
      if (
        data.setDefaultRate !== undefined &&
        typeof data.setDefaultRate !== "boolean"
      )
        invalid("Mức phí mặc định không hợp lệ.");
      const current = await ownRow(data.id);
      if (current?.mutation_token === data.mutationToken)
        return { lesson: lesson(current) };
      if ((current?.revision ?? 0) !== data.revision) conflict();
      const profile = await firebase.getProfile(data.studentUid);
      const isStudent =
        field(profile, "role") === "student" &&
        ["active", "disabled"].includes(field(profile, "status"));
      if (
        !isStudent &&
        !(profile === null && current?.student_uid === data.studentUid)
      )
        invalid("Không tìm thấy tài khoản học sinh này.");
      const displayName = isStudent
        ? field(profile, "displayName") || field(profile, "username")
        : current.display_name;
      const username = isStudent
        ? field(profile, "username") || ""
        : current.username;
      const timestamp = now(),
        note = (data.note || "").trim();
      const statements = [
        current
          ? db
              .prepare(
                "UPDATE tuition_lessons SET student_uid=?,display_name=?,username=?,lesson_date=?,fee_vnd=?,note=?,revision=revision+1,mutation_token=?,updated_at=? WHERE id=? AND teacher_uid=? AND revision=?",
              )
              .bind(
                data.studentUid,
                displayName,
                username,
                data.date,
                data.fee,
                note,
                data.mutationToken,
                timestamp,
                data.id,
                user.uid,
                data.revision,
              )
          : db
              .prepare(
                "INSERT OR IGNORE INTO tuition_lessons(id,teacher_uid,student_uid,display_name,username,lesson_date,fee_vnd,note,mutation_token,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
              )
              .bind(
                data.id,
                user.uid,
                data.studentUid,
                displayName,
                username,
                data.date,
                data.fee,
                note,
                data.mutationToken,
                timestamp,
                timestamp,
              ),
      ];
      if (data.setDefaultRate)
        statements.push(
          db
            .prepare(
              "INSERT INTO tuition_student_rates(teacher_uid,student_uid,fee_vnd,updated_at) SELECT teacher_uid,student_uid,fee_vnd,updated_at FROM tuition_lessons WHERE id=? AND teacher_uid=? AND mutation_token=? ON CONFLICT(teacher_uid,student_uid) DO UPDATE SET fee_vnd=excluded.fee_vnd,updated_at=excluded.updated_at",
            )
            .bind(data.id, user.uid, data.mutationToken),
        );
      await db.batch(statements);
      const updated = await ownRow(data.id);
      if (!updated || updated.mutation_token !== data.mutationToken) conflict();
      return { lesson: lesson(updated) };
    },
    async tuitionDelete(data) {
      admin();
      const current = await ownRow(data.id);
      if (!current) return { success: true };
      if (data.revision !== current.revision) conflict();
      const write = await db
        .prepare(
          "DELETE FROM tuition_lessons WHERE id=? AND teacher_uid=? AND revision=?",
        )
        .bind(data.id, user.uid, data.revision)
        .run();
      if (!write.meta.changes && (await ownRow(data.id))) conflict();
      return { success: true };
    },
  };
}
