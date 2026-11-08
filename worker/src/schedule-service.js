import { ServiceError } from "./errors.js";
import { validUid } from "./firebase.js";
import { validId } from "./quiz-model.js";
import { scheduleMinutes, scheduleDates, scheduleColors, scheduleStatuses, scheduleSubjects } from "../../shared/schedule.js";

const invalid = message => { throw new ServiceError("invalid-argument", message); };
const conflict = () => { throw new ServiceError("failed-precondition", "Lịch đã thay đổi ở cửa sổ khác. Hãy tải lại và mở lại buổi học trước khi sửa hoặc xóa.", 409); };
const field = (doc, key) => doc?.fields?.[key]?.stringValue;
const queryDate = value => typeof value === "string" && /^(1999|20\d{2}|2100|2101)-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
const clean = (value, max, label, required = false) => {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) invalid(`${label} không hợp lệ (tối đa ${max} ký tự).`);
  return value.trim();
};
const event = row => ({
  id: row.id, seriesId: row.batch_id, recurring: Boolean(row.recurring), title: row.title,
  subject: row.subject, students: JSON.parse(row.students), date: row.event_date,
  startMinute: row.start_minute, endMinute: row.end_minute, location: row.location,
  note: row.note, color: row.color, status: row.status, revision: row.revision,
});

export function makeScheduleService(db, user, firebase, now = () => Date.now()) {
  function admin() {
    if (!user.admin) throw new ServiceError("permission-denied", "Chỉ quản trị viên được xem và xếp lịch dạy.", 403);
  }
  async function ownRow(id) {
    if (!validId(id)) invalid("Mã buổi học không hợp lệ.");
    const row = await db.prepare("SELECT * FROM schedule_events WHERE id=?").bind(id).first();
    if (row && row.teacher_uid !== user.uid) throw new ServiceError("permission-denied", "Bạn không có quyền truy cập lịch này.", 403);
    return row;
  }
  const calendarRevision = async () => (await db.prepare("SELECT revision FROM schedule_calendars WHERE teacher_uid=?").bind(user.uid).first())?.revision ?? 0;
  const gate = "EXISTS(SELECT 1 FROM schedule_calendars WHERE teacher_uid=? AND save_token=?)";
  const lock = (revision, token) => [
    db.prepare("INSERT OR IGNORE INTO schedule_calendars(teacher_uid) VALUES(?)").bind(user.uid),
    db.prepare("UPDATE schedule_calendars SET revision=revision+1,save_token=? WHERE teacher_uid=? AND revision=?").bind(token, user.uid, revision),
  ];
  return {
    async scheduleList(data) {
      admin();
      if (!queryDate(data.from) || !queryDate(data.to) || data.to < data.from || Date.parse(data.to) - Date.parse(data.from) > 62 * 86400000)
        invalid("Chọn khoảng xem lịch hợp lệ, tối đa 63 ngày (năm 2000–2100).");
      const rows = await db.prepare("SELECT * FROM schedule_events WHERE teacher_uid=? AND event_date>=? AND event_date<=? ORDER BY event_date,start_minute,end_minute,id LIMIT 2001").bind(user.uid, data.from, data.to).all();
      return { from: data.from, to: data.to, events: rows.results.slice(0, 2000).map(event), truncated: rows.results.length > 2000, serverNow: now() };
    },
    async scheduleSave(data) {
      admin();
      if (!validId(data.id) || (!data.revision && data.id.length > 60) || !validId(data.mutationToken) || !Number.isSafeInteger(data.revision) || data.revision < 0)
        invalid("Phiên lưu lịch không hợp lệ.");
      const title = clean(data.title, 160, "Tên buổi học", true);
      const location = clean(data.location ?? "", 300, "Địa điểm");
      const note = clean(data.note ?? "", 1000, "Ghi chú");
      const subject = data.subject ?? "khac", color = data.color ?? "blue", status = data.status ?? "planned";
      if (!scheduleSubjects.includes(subject) || !scheduleColors.includes(color) || !scheduleStatuses.includes(status)) invalid("Môn học, màu hoặc trạng thái không hợp lệ.");
      if (data.allowOverlap !== undefined && typeof data.allowOverlap !== "boolean") invalid("Tùy chọn trùng giờ không hợp lệ.");
      const start = scheduleMinutes(data.startTime), end = scheduleMinutes(data.endTime);
      if (start === null || end === null || end <= start) invalid("Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày (giờ Việt Nam).");
      if (!Array.isArray(data.studentUids) || data.studentUids.length > 30 || data.studentUids.some(uid => !validUid(uid)) || new Set(data.studentUids).size !== data.studentUids.length)
        invalid("Chọn tối đa 30 học sinh khác nhau.");
      if (data.repeat !== undefined && data.repeat !== null && (typeof data.repeat !== "object" || Array.isArray(data.repeat))) invalid("Lịch lặp không hợp lệ.");
      if (data.revision && data.repeat) invalid("Chỉ tạo lịch lặp khi thêm buổi học mới. Chỉnh sửa áp dụng cho một buổi.");
      let dates;
      try { dates = scheduleDates(data.date, data.repeat); } catch (error) { invalid(error.message); }
      const signature = JSON.stringify({ title, location, note, subject, color, status, start, end, dates,
        studentUids: [...data.studentUids].sort(), revision: data.revision, allowOverlap: data.allowOverlap === true });
      const current = data.revision ? await ownRow(data.id) : null;
      if (data.revision) {
        if (!current) throw new ServiceError("not-found", "Buổi học đã bị xóa. Hãy tải lại lịch.", 404);
        if (current.mutation_token === data.mutationToken) {
          if (current.signature !== signature) conflict();
          return { events: [event(current)], savedCount: 1 };
        }
        if (current.revision !== data.revision) conflict();
      } else {
        const batch = await db.prepare("SELECT * FROM schedule_batches WHERE id=?").bind(data.id).first();
        if (batch?.teacher_uid !== undefined && batch.teacher_uid !== user.uid) throw new ServiceError("permission-denied", "Bạn không có quyền truy cập lịch này.", 403);
        if (batch) {
          if (batch.mutation_token !== data.mutationToken || batch.signature !== signature) conflict();
          const rows = await db.prepare("SELECT * FROM schedule_events WHERE teacher_uid=? AND batch_id=? ORDER BY event_date,id").bind(user.uid, data.id).all();
          return { events: rows.results.map(event), savedCount: rows.results.length };
        }
        if (await ownRow(data.id)) conflict();
      }
      const students = await Promise.all(data.studentUids.map(async uid => {
        const profile = await firebase.getProfile(uid);
        if (field(profile, "role") === "student" && ["active", "disabled"].includes(field(profile, "status")))
          return { uid, displayName: field(profile, "displayName") || field(profile, "username") || "Học sinh", username: field(profile, "username") || "" };
        const previous = current && JSON.parse(current.students).find(student => student.uid === uid);
        if (profile === null && previous) return previous;
        invalid("Có học sinh không còn tồn tại hoặc không phải tài khoản học sinh. Hãy tải lại danh sách.");
      }));
      const revision = await calendarRevision();
      if (status !== "cancelled" && data.allowOverlap !== true) {
        const overlaps = await db.prepare("SELECT title,event_date,start_minute,end_minute FROM schedule_events WHERE teacher_uid=? AND status<>'cancelled' AND id<>? AND event_date IN (SELECT value FROM json_each(?)) AND start_minute<? AND end_minute>? ORDER BY event_date,start_minute").bind(user.uid, current?.id || "", JSON.stringify(dates), end, start).all();
        if (overlaps.results.length) {
          const names = overlaps.results.slice(0, 3).map(row => `${row.title} (${row.event_date})`).join(", ");
          throw new ServiceError("already-exists", `Trùng giờ với ${overlaps.results.length} buổi: ${names}. Hãy đổi giờ hoặc tích “Cho phép trùng giờ” nếu bạn vẫn muốn lưu.`, 409);
        }
      }
      const nonce = crypto.randomUUID(), timestamp = now();
      const statements = lock(revision, nonce);
      if (current) {
        statements.push(db.prepare(`UPDATE schedule_events SET title=?,subject=?,students=?,event_date=?,start_minute=?,end_minute=?,location=?,note=?,color=?,status=?,revision=revision+1,mutation_token=?,signature=?,updated_at=? WHERE id=? AND teacher_uid=? AND revision=? AND ${gate}`)
          .bind(title, subject, JSON.stringify(students), dates[0], start, end, location, note, color, status, data.mutationToken, signature, timestamp, data.id, user.uid, data.revision, user.uid, nonce));
      } else {
        statements.push(db.prepare(`INSERT INTO schedule_batches(id,teacher_uid,mutation_token,signature,created_at) SELECT ?,?,?,?,? WHERE ${gate}`)
          .bind(data.id, user.uid, data.mutationToken, signature, timestamp, user.uid, nonce));
        // One bulk statement keeps even 100 occurrences within D1 Free's query limit.
        statements.push(db.prepare(`INSERT INTO schedule_events(id,teacher_uid,batch_id,recurring,title,subject,students,event_date,start_minute,end_minute,location,note,color,status,mutation_token,signature,created_at,updated_at) SELECT CASE WHEN ?=1 THEN ? ELSE ?||'_'||value END,?,?,?,?,?,?,value,?,?,?,?,?,?,?,?,?,? FROM json_each(?) WHERE ${gate}`)
          .bind(dates.length, data.id, data.id, user.uid, data.id, dates.length > 1 ? 1 : 0, title, subject, JSON.stringify(students), start, end, location, note, color, status, data.mutationToken, signature, timestamp, timestamp, JSON.stringify(dates), user.uid, nonce));
      }
      const results = await db.batch(statements);
      if (!results[1].meta.changes || (current && !results[2].meta.changes)) conflict();
      const rows = current ? [await ownRow(data.id)] : (await db.prepare("SELECT * FROM schedule_events WHERE teacher_uid=? AND batch_id=? ORDER BY event_date,id").bind(user.uid, data.id).all()).results;
      if (rows.some(row => !row || row.mutation_token !== data.mutationToken)) conflict();
      return { events: rows.map(event), savedCount: rows.length };
    },
    async scheduleDelete(data) {
      admin();
      if (!Number.isSafeInteger(data.revision) || data.revision < 1) invalid("Phiên xóa lịch không hợp lệ.");
      const current = await ownRow(data.id);
      if (!current) return { success: true };
      if (current.revision !== data.revision) conflict();
      const revision = await calendarRevision(), nonce = crypto.randomUUID();
      const results = await db.batch([...lock(revision, nonce),
        db.prepare(`DELETE FROM schedule_events WHERE id=? AND teacher_uid=? AND revision=? AND ${gate}`).bind(data.id, user.uid, data.revision, user.uid, nonce),
      ]);
      if (!results[1].meta.changes || !results[2].meta.changes) conflict();
      return { success: true };
    },
  };
}
