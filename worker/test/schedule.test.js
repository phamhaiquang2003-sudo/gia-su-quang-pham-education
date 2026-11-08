import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { makeScheduleService } from "../src/schedule-service.js";
import { makeHandler } from "../src/index.js";
import { validScheduleDate, addScheduleDays, scheduleWeekday, scheduleMinutes, scheduleDates, scheduleRange, scheduleOverlaps, layoutScheduleEvents } from "../../shared/schedule.js";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  const migrations = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(migrations).filter(file => file.endsWith(".sql")).sort()) sqlite.exec(readFileSync(new URL(file, migrations), "utf8"));
  const db = {
    prepare(sql) {
      let args = [];
      return { bind(...params) { args = params; return this; },
        async first() { return sqlite.prepare(sql).get(...args) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async run() { return { meta: sqlite.prepare(sql).run(...args) }; } };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec("COMMIT"); return results; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  return { db, sqlite };
}
const teacher = { uid: "teacher", admin: true, role: "admin" };
const profile = (role = "student", status = "active") => ({ fields: {
  role: { stringValue: role }, status: { stringValue: status }, displayName: { stringValue: "Tên thật" }, username: { stringValue: "student01" },
} });
const directory = () => ({ getProfile: async uid => uid === "missing" ? null : profile(uid === "admin-account" ? "admin" : "student") });
const draft = (id, extra = {}) => ({ id, revision: 0, mutationToken: `token-${id}`, title: "Toán 11", date: "2026-11-09",
  startTime: "17:00", endTime: "18:30", studentUids: ["student01"], subject: "toan", color: "blue", status: "planned", location: "Tại nhà", note: "Ôn tập", ...extra });
const range = { from: "2026-11-01", to: "2026-11-30" };
const conflict = error => error.status === 409;
const invalid = error => error.code === "invalid-argument";

test("teaching calendar dates, times, month/week boundaries and repeat expansion ignore local timezone", () => {
  for (const value of ["2026-02-29", "2026-04-31", "2026-1-01", "1999-12-31", "2101-01-01", null]) assert.equal(validScheduleDate(value), false);
  assert.equal(validScheduleDate("2028-02-29"), true);
  assert.equal(addScheduleDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addScheduleDays("2028-02-28", 1), "2028-02-29");
  assert.equal(scheduleWeekday("2026-11-09"), 1);
  assert.equal(scheduleWeekday("2026-11-15"), 7);
  assert.equal(scheduleMinutes("23:59"), 1439);
  for (const value of ["24:00", "12:60", "1:00", 900, null]) assert.equal(scheduleMinutes(value), null);
  assert.deepEqual(scheduleDates("2026-11-09", { until: "2026-11-23", weekdays: [1, 5] }), ["2026-11-09", "2026-11-13", "2026-11-16", "2026-11-20", "2026-11-23"]);
  assert.deepEqual(scheduleDates("2026-11-10", { until: "2026-11-15", weekdays: [1, 7] }), ["2026-11-15"]);
  assert.equal(scheduleRange("2026-11-15", "week").from, "2026-11-09");
  assert.equal(scheduleRange("2026-11-01", "month").days.length, 42);
  assert.equal(scheduleRange("2026-11-01", "month").from, "2026-10-26");
  assert.equal(scheduleRange("2000-01-01", "month").from, "1999-12-27");
  assert.equal(scheduleRange("2100-12-01", "month").to, "2101-01-09");
});

test("calendar overlaps exclude adjacent/cancelled lessons and layout keeps overlap chains side-by-side", () => {
  const row = (id, startMinute, endMinute, status = "planned") => ({ id, startMinute, endMinute, status, date: "2026-11-09" });
  const a = row("a", 540, 720), b = row("b", 600, 660), c = row("c", 660, 780), d = row("d", 780, 840);
  assert.equal(scheduleOverlaps(a, b), true);
  assert.equal(scheduleOverlaps(b, c), false);
  assert.equal(scheduleOverlaps(a, { ...b, status: "cancelled" }), false);
  assert.equal(scheduleOverlaps(a, { ...b, date: "2026-11-10" }), false);
  assert.equal(scheduleOverlaps(a, a), false);
  const layout = layoutScheduleEvents([d, c, b, a]);
  assert.deepEqual(layout.map(item => [item.event.id, item.lane, item.lanes]), [["a", 0, 2], ["b", 1, 2], ["c", 1, 2], ["d", 0, 1]]);
});

test("calendar CRUD uses trusted student identity, per-teacher ownership, revisions, and never touches tuition", async () => {
  const { db, sqlite } = database();
  try {
    const service = makeScheduleService(db, teacher, directory());
    const other = makeScheduleService(db, { ...teacher, uid: "other" }, directory());
    const input = draft("first", { displayName: "Forged", teacherUid: "other" });
    const saved = (await service.scheduleSave(input)).events[0];
    assert.equal(saved.students[0].displayName, "Tên thật");
    assert.equal(saved.startMinute, 1020);
    assert.equal(saved.endMinute, 1110);
    assert.deepEqual((await service.scheduleSave(input)).events, [saved]);
    await other.scheduleSave(draft("foreign"));
    assert.deepEqual((await service.scheduleList({ ...range, teacherUid: "other" })).events.map(e => e.id), ["first"]);
    await assert.rejects(other.scheduleSave(draft("first", { revision: 1, mutationToken: "foreign-edit" })), error => error.status === 403);
    await assert.rejects(other.scheduleDelete({ id: "first", revision: 1 }), error => error.status === 403);
    const edit = draft(saved.id, { revision: 1, mutationToken: "edit-first", date: "2026-11-10", status: "completed", color: "teal" });
    const updated = (await service.scheduleSave(edit)).events[0];
    assert.equal(updated.revision, 2);
    assert.equal(updated.date, "2026-11-10");
    assert.deepEqual((await service.scheduleSave(edit)).events, [updated]);
    await assert.rejects(service.scheduleSave({ ...edit, title: "Changed payload, same token" }), conflict);
    await assert.rejects(service.scheduleDelete({ id: saved.id, revision: 1 }), conflict);
    await service.scheduleDelete({ id: saved.id, revision: 2 });
    await service.scheduleDelete({ id: saved.id, revision: 2 });
    assert.equal((await service.scheduleList(range)).events.length, 0);
    assert.equal((await other.scheduleList(range)).events.length, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM tuition_lessons").get().n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM tuition_student_rates").get().n, 0);
  } finally { sqlite.close(); }
});

test("weekly repeats save atomically, reject future conflicts before writing, retry without duplicates, and edit/delete individual occurrences", async () => {
  const { db, sqlite } = database();
  try {
    const service = makeScheduleService(db, teacher, directory());
    await service.scheduleSave(draft("blocker", { date: "2026-11-16", startTime: "18:00", endTime: "19:00" }));
    const repeated = draft("series", { repeat: { until: "2026-11-23", weekdays: [1, 5] } });
    await assert.rejects(service.scheduleSave(repeated), error => error.status === 409 && error.code === "already-exists" && error.message.includes("2026-11-16"));
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM schedule_events").get().n, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM schedule_batches WHERE id='series'").get().n, 0);
    const allowed = { ...repeated, allowOverlap: true, mutationToken: "allow-series" };
    const saved = await service.scheduleSave(allowed);
    assert.equal(saved.savedCount, 5);
    assert.ok(saved.events.every(e => e.recurring && e.seriesId === "series"));
    assert.deepEqual(await service.scheduleSave(allowed), saved);
    assert.equal((await service.scheduleList(range)).events.length, 6);
    const second = saved.events[1];
    const changed = (await service.scheduleSave(draft(second.id, { revision: 1, mutationToken: "one-occurrence", date: second.date, startTime: "10:00", endTime: "11:00" }))).events[0];
    assert.equal(changed.startMinute, 600);
    assert.equal((await service.scheduleList(range)).events.find(e => e.id === saved.events[0].id).startMinute, 1020);
    await service.scheduleDelete({ id: changed.id, revision: 2 });
    assert.equal((await service.scheduleSave(allowed)).savedCount, 4);
    assert.equal((await service.scheduleList(range)).events.length, 5);
    // A cancelled lesson does not block time, and exact boundaries are adjacent.
    await service.scheduleSave(draft("cancelled", { date: "2026-11-10", status: "cancelled" }));
    await service.scheduleSave(draft("reuse-cancelled", { date: "2026-11-10" }));
    await service.scheduleSave(draft("adjacent", { date: "2026-11-10", startTime: "18:30", endTime: "19:00" }));
  } finally { sqlite.close(); }
});

test("calendar rejects invalid dates, ranges, fields, identities and excessive repeat batches before writes", async () => {
  const { db, sqlite } = database();
  try {
    const service = makeScheduleService(db, teacher, directory());
    for (const extra of [
      { id: "bad/id" }, { id: "x".repeat(61) }, { revision: -1 }, { revision: "0" }, { mutationToken: "" },
      { title: " " }, { title: {} }, { title: "x".repeat(161) }, { location: "x".repeat(301) }, { note: "x".repeat(1001) },
      { date: "2026-02-29" }, { date: "2026-04-31" }, { date: "1999-12-31" }, { startTime: "24:00" }, { startTime: "12:60" },
      { endTime: "17:00" }, { endTime: "16:30" }, { endTime: "24:00" }, { studentUids: ["missing"] }, { studentUids: ["admin-account"] },
      { studentUids: ["bad/uid"] }, { studentUids: ["student01", "student01"] }, { studentUids: Array.from({length:31},(_,i)=>"s"+i) },
      { color: "#fff" }, { subject: "random" }, { status: "paid" }, { allowOverlap: "true" }, { repeat: [] }, { repeat: 5 },
      { repeat: { until: "2026-11-08", weekdays: [1] } }, { repeat: { until: "2027-11-09", weekdays: [1] } },
      { repeat: { until: "2026-11-10", weekdays: [] } }, { repeat: { until: "2026-11-10", weekdays: [1,1] } },
      { repeat: { until: "2026-11-10", weekdays: [8] } }, { repeat: { until: "2026-11-10", weekdays: ["1"] } },
      { repeat: { until: "2026-11-10", weekdays: [7] } }, { repeat: { until: "2027-05-08", weekdays: [1,2,3,4,5,6,7] } },
    ]) await assert.rejects(service.scheduleSave(draft("invalid", extra)), invalid);
    for (const data of [ { from: "2026-11-31", to: "2026-12-01" }, { from: "2026-11-02", to: "2026-11-01" }, { from: "2026-01-01", to: "2026-12-31" }, { from: null, to: "2026-11-09" } ]) await assert.rejects(service.scheduleList(data), invalid);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM schedule_events").get().n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM schedule_calendars").get().n, 0);
    assert.equal((await service.scheduleList({ from: "1999-12-27", to: "2000-02-06" })).events.length, 0);
    assert.equal((await service.scheduleList({ from: "2100-11-29", to: "2101-01-09" })).events.length, 0);
    const long = (await service.scheduleSave(draft("x".repeat(60), { repeat: { until: "2026-11-16", weekdays: [1] } }))).events[0];
    assert.equal(long.id.length, 71);
    await service.scheduleSave(draft(long.id, { revision: 1, mutationToken: "long-edit", date: long.date, title: "Edited" }));
  } finally { sqlite.close(); }
});

test("student snapshots survive account removal, but cannot enrol deleted accounts into new lessons or use admin identities", async () => {
  const { db, sqlite } = database();
  try {
    const firebase = directory();
    const service = makeScheduleService(db, teacher, firebase);
    const saved = (await service.scheduleSave(draft("history"))).events[0];
    firebase.getProfile = async () => null;
    const retained = (await service.scheduleSave(draft(saved.id, { revision: 1, mutationToken: "keep-student" }))).events[0];
    assert.deepEqual(retained.students, saved.students);
    await assert.rejects(service.scheduleSave(draft("new-history", { startTime: "19:00", endTime: "20:00" })), invalid);
    const personal = (await service.scheduleSave(draft("personal", { studentUids: [], startTime: "20:00", endTime: "21:00" }))).events[0];
    assert.deepEqual(personal.students, []);
  } finally { sqlite.close(); }
});

test("stale calendar writers cannot overwrite a raced edit or create conflicting repeat occurrences", async () => {
  const { db, sqlite } = database();
  try {
    const service = makeScheduleService(db, teacher, directory());
    await service.scheduleSave(draft("edit-race"));
    let winner;
    const stale = makeScheduleService(db, teacher, { getProfile: async uid => {
      winner = (await service.scheduleSave(draft("edit-race", { revision: 1, mutationToken: "winner", title: "Winner" }))).events[0];
      return directory().getProfile(uid);
    } });
    await assert.rejects(stale.scheduleSave(draft("edit-race", { revision: 1, mutationToken: "loser", title: "Loser" })), conflict);
    assert.equal((await service.scheduleList(range)).events[0].title, "Winner");
    assert.equal(winner.revision, 2);
    const racedDb = { ...db, prepare(sql) {
      const statement = db.prepare(sql);
      if (sql.includes("status<>'cancelled'")) {
        const all = statement.all.bind(statement);
        statement.all = async () => {
          const before = await all();
          await service.scheduleSave(draft("created-during-check", { date: "2026-11-12" }));
          return before;
        };
      }
      return statement;
    } };
    const raced = makeScheduleService(racedDb, teacher, directory());
    await assert.rejects(raced.scheduleSave(draft("lost-series", { date: "2026-11-12", repeat: { until: "2026-11-19", weekdays: [4] } })), conflict);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM schedule_batches WHERE id='lost-series'").get().n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM schedule_events WHERE batch_id='lost-series'").get().n, 0);
    assert.equal((await service.scheduleList(range)).events.length, 2);
  } finally { sqlite.close(); }
});

test("failed occurrence inserts roll back the whole series and calendar revision", async () => {
  const { db, sqlite } = database();
  try {
    const service = makeScheduleService(db, teacher, directory());
    sqlite.exec("CREATE TRIGGER reject_second BEFORE INSERT ON schedule_events WHEN NEW.event_date='2026-11-16' BEGIN SELECT RAISE(ABORT, 'injected failure'); END;");
    await assert.rejects(service.scheduleSave(draft("rollback", { repeat: { until: "2026-11-16", weekdays: [1] } })));
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM schedule_events").get().n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM schedule_batches").get().n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM schedule_calendars").get().n, 0);
  } finally { sqlite.close(); }
});

test("100 recurring lessons use a constant-size atomic batch within D1 Free query limits", async () => {
  const { db, sqlite } = database();
  try {
    let batchSize = 0, queries = 0;
    const bounded = { prepare(sql) { queries++; return db.prepare(sql); }, async batch(statements) { batchSize = statements.length; return db.batch(statements); } };
    const service = makeScheduleService(bounded, teacher, directory());
    const result = await service.scheduleSave(draft("hundred", { repeat: { until: addScheduleDays("2026-11-09",99), weekdays: [1,2,3,4,5,6,7] } }));
    assert.equal(result.savedCount,100);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM schedule_events").get().n,100);
    assert.equal(batchSize,4);
    assert.ok(queries<=10,`Expected bounded SQL query count, got ${queries}`);
  } finally { sqlite.close(); }
});

test("schedule HTTP operations deny student, forged admin, disabled and revoked identities; admin can persist private plans", async () => {
  const { db, sqlite } = database();
  try {
    let role = "student", status = "active";
    let claims = { sub: "student01", auth_time: 100 };
    const authUser = { validSince: "10", customAttributes: '{"admin":true}' };
    const firebase = { getAuthUser: async () => authUser, getProfile: async uid => uid === claims.sub ? profile(role, status) : directory().getProfile(uid) };
    const handler = makeHandler({ makeFirebaseClient: () => firebase, verifyIdToken: async () => claims });
    const env = { ALLOWED_ORIGIN: "https://lumenpelagi.vercel.app", QUIZ_DB: db };
    const request = (op, body) => new Request("https://worker.example/api/quiz/"+op, { method: "POST", headers: { Origin: env.ALLOWED_ORIGIN, Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify(body) });
    for (const [op, body] of [["scheduleList",range], ["scheduleSave",draft("http")], ["scheduleDelete",{id:"http",revision:1}]]) assert.equal((await handler(request(op,body),env)).status,403);
    role = "admin"; claims.sub = teacher.uid;
    assert.equal((await handler(request("scheduleList",range),env)).status,403);
    claims.admin = true; authUser.disabled = true;
    assert.equal((await handler(request("scheduleList",range),env)).status,401);
    authUser.disabled = false; authUser.validSince = "101";
    assert.equal((await handler(request("scheduleList",range),env)).status,401);
    authUser.validSince = "10"; status = "disabled";
    assert.equal((await handler(request("scheduleList",range),env)).status,403);
    status = "active";
    assert.equal((await handler(request("scheduleSave",draft("http")),env)).status,200);
    const response = await handler(request("scheduleList",range),env);
    assert.equal(response.status,200);
    assert.equal(response.headers.get("Cache-Control"),"no-store");
    assert.equal((await response.json()).events[0].title,"Toán 11");
    assert.equal((await handler(request("scheduleDelete",{id:"http",revision:1}),env)).status,200);
  } finally { sqlite.close(); }
});
