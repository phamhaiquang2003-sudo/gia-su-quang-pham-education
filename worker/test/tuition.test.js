import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { makeTuitionService } from "../src/tuition-service.js";
import { makeHandler } from "../src/index.js";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  const migrations = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(migrations)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(new URL(file, migrations), "utf8"));
  }
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
          const statement = sqlite.prepare(sql);
          return statement.columns().length
            ? { results: statement.all(...params), meta: { changes: 0 } }
            : { meta: statement.run(...params) };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { db, sqlite };
}
const profile = (role, name = "Học sinh", status = "active") => ({
  fields: {
    role: { stringValue: role },
    status: { stringValue: status },
    displayName: { stringValue: name },
    username: { stringValue: "student01" },
  },
});
const teacher = { uid: "teacher", admin: true, role: "admin" };
const directory = () => ({
  getProfile: async (uid) =>
    uid === "student-admin"
      ? profile("admin")
      : uid === "missing"
        ? null
        : profile("student", uid === "student02" ? "Học sinh 2" : "Học sinh 1"),
});
const draft = (id, extra = {}) => ({
  id,
  studentUid: "student01",
  date: "2026-10-01",
  fee: 250000,
  revision: 0,
  mutationToken: "token-" + id,
  setDefaultRate: true,
  ...extra,
});

test("tuition SQL aggregates calendar months and students, preserves each recorded fee, and updates totals after edits/deletions", async () => {
  const { db, sqlite } = database();
  try {
    const service = makeTuitionService(db, teacher, directory(), () => 1000);
    const otherTeacher = makeTuitionService(
      db,
      { ...teacher, uid: "other-teacher" },
      directory(),
    );
    await service.tuitionSave(
      draft("previous", { date: "2026-09-30", fee: 900000 }),
    );
    const first = (await service.tuitionSave(draft("first"))).lesson;
    const second = (
      await service.tuitionSave(
        draft("second", { date: "2026-10-31", fee: 300000 }),
      )
    ).lesson;
    await service.tuitionSave(
      draft("third", { studentUid: "student02", fee: 120000 }),
    );
    await service.tuitionSave(
      draft("next", { date: "2026-11-01", fee: 500000, setDefaultRate: false }),
    );
    await otherTeacher.tuitionSave(draft("foreign", { fee: 1000000000 }));
    const october = await service.tuitionMonth({
      month: "2026-10",
      teacherUid: "other-teacher",
    });
    assert.deepEqual(october.totals, {
      studentCount: 2,
      lessonCount: 3,
      totalFee: 670000,
    });
    assert.equal(
      october.students.find((row) => row.studentUid === "student01").totalFee,
      550000,
    );
    assert.equal(
      october.rates.find((row) => row.studentUid === "student01").fee,
      300000,
    );
    assert.equal(
      october.lessons.find((row) => row.id === first.id).fee,
      250000,
    );
    const filtered = await service.tuitionMonth({
      month: "2026-10",
      studentUid: "student01",
    });
    assert.deepEqual(
      filtered.lessons.map((row) => row.id),
      ["second", "first"],
    );
    assert.deepEqual(filtered.totals, october.totals);
    const changed = (
      await service.tuitionSave(
        draft(first.id, {
          revision: first.revision,
          date: "2026-11-03",
          fee: 280000,
          mutationToken: "edit-first",
          setDefaultRate: false,
        }),
      )
    ).lesson;
    assert.equal(changed.revision, 2);
    assert.equal(
      (await service.tuitionMonth({ month: "2026-10" })).totals.totalFee,
      420000,
    );
    assert.equal(
      (await service.tuitionMonth({ month: "2026-11" })).totals.totalFee,
      780000,
    );
    await service.tuitionDelete({ id: second.id, revision: second.revision });
    await service.tuitionDelete({ id: second.id, revision: second.revision });
    const remaining = await service.tuitionMonth({ month: "2026-10" });
    assert.deepEqual(remaining.totals, {
      studentCount: 1,
      lessonCount: 1,
      totalFee: 120000,
    });
    assert.equal(
      remaining.rates.find((row) => row.studentUid === "student01").fee,
      300000,
    );
    await service.tuitionSave(draft("december", { date: "2026-12-31" }));
    await service.tuitionSave(draft("january", { date: "2027-01-01" }));
    assert.equal(
      (await service.tuitionMonth({ month: "2026-12" })).totals.lessonCount,
      1,
    );
    assert.equal(
      (await service.tuitionMonth({ month: "2027-01" })).totals.lessonCount,
      1,
    );
    assert.equal(
      (await otherTeacher.tuitionMonth({ month: "2026-10" })).totals.totalFee,
      1000000000,
    );
  } finally {
    sqlite.close();
  }
});

test("tuition validates real calendar dates and integer VND, uses trusted student names, and preserves history after account removal", async () => {
  const { db, sqlite } = database();
  try {
    const firebase = directory();
    const service = makeTuitionService(db, teacher, firebase);
    for (const extra of [
      { date: "2026-02-29" },
      { date: "2026-04-31" },
      { date: "2026-13-01" },
      { date: "2026-01-00" },
      { date: "2026-1-01" },
      { date: "1999-12-31" },
      { fee: -1 },
      { fee: 0.5 },
      { fee: "250000" },
      { fee: 1000000001 },
      { fee: Infinity },
      { fee: null },
      { studentUid: "missing" },
      { studentUid: "student-admin" },
      { studentUid: "bad/uid" },
      { note: "x".repeat(1001) },
      { note: {} },
      { revision: -1 },
      { revision: "0" },
      { mutationToken: "" },
      { id: "bad/id" },
      { setDefaultRate: "true" },
    ])
      await assert.rejects(
        service.tuitionSave(draft("invalid", extra)),
        (error) => error.code === "invalid-argument",
      );
    for (const month of [
      "2026-00",
      "2026-13",
      "2026-1",
      "1999-12",
      "2101-01",
      null,
    ]) {
      await assert.rejects(
        service.tuitionMonth({ month }),
        (error) => error.code === "invalid-argument",
      );
    }
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM tuition_lessons").get().n,
      0,
    );
    const saved = (
      await service.tuitionSave(
        draft("leap", {
          date: "2028-02-29",
          fee: 0,
          displayName: "Forged name",
          teacherUid: "foreign",
          note: "  Buổi học bù  ",
        }),
      )
    ).lesson;
    assert.equal(saved.displayName, "Học sinh 1");
    assert.equal(saved.note, "Buổi học bù");
    assert.equal(
      (await service.tuitionMonth({ month: "2028-02" })).totals.totalFee,
      0,
    );
    firebase.getProfile = async () => null;
    const retained = (
      await service.tuitionSave(
        draft(saved.id, {
          date: saved.date,
          revision: saved.revision,
          fee: 1000000000,
          mutationToken: "after-removal",
        }),
      )
    ).lesson;
    assert.equal(retained.displayName, saved.displayName);
    assert.equal(
      (await service.tuitionMonth({ month: "2028-02" })).totals.totalFee,
      1000000000,
    );
    await assert.rejects(
      service.tuitionSave(draft("new-removed")),
      (error) => error.code === "invalid-argument",
    );
    await assert.rejects(
      service.tuitionSave(
        draft(saved.id, {
          revision: retained.revision,
          studentUid: "missing",
          mutationToken: "reassign-missing",
        }),
      ),
      (error) => error.code === "invalid-argument",
    );
  } finally {
    sqlite.close();
  }
});

test("tuition retries do not duplicate lessons and atomic revisions prevent stale changes from overwriting fees or defaults", async () => {
  const { db, sqlite } = database();
  try {
    const service = makeTuitionService(db, teacher, directory());
    const other = makeTuitionService(
      db,
      { ...teacher, uid: "other" },
      directory(),
    );
    const input = draft("repeat");
    const saved = (await service.tuitionSave(input)).lesson;
    assert.deepEqual((await service.tuitionSave(input)).lesson, saved);
    assert.equal(
      (await service.tuitionMonth({ month: "2026-10" })).totals.lessonCount,
      1,
    );
    const edited = {
      ...input,
      revision: 1,
      mutationToken: "winner",
      fee: 300000,
    };
    let winner;
    // A second editor commits after the stale reader checks its revision.
    const stale = makeTuitionService(db, teacher, {
      getProfile: async (uid) => {
        winner = (await service.tuitionSave(edited)).lesson;
        return directory().getProfile(uid);
      },
    });
    await assert.rejects(
      stale.tuitionSave({ ...edited, mutationToken: "loser", fee: 400000 }),
      (error) => error.status === 409,
    );
    const after = await service.tuitionMonth({ month: "2026-10" });
    assert.equal(after.lessons[0].fee, 300000);
    assert.equal(after.rates[0].fee, 300000);
    assert.equal(after.lessons[0].revision, 2);
    assert.deepEqual((await service.tuitionSave(edited)).lesson, winner);
    await assert.rejects(
      service.tuitionSave(input),
      (error) => error.status === 409,
    );
    await assert.rejects(
      service.tuitionDelete({ id: saved.id, revision: 1 }),
      (error) => error.status === 409,
    );
    await assert.rejects(
      other.tuitionDelete({ id: saved.id, revision: 2 }),
      (error) => error.status === 403,
    );
    await assert.rejects(
      other.tuitionSave({ ...edited, revision: 2, mutationToken: "foreign" }),
      (error) => error.status === 403,
    );
    await service.tuitionDelete({ id: winner.id, revision: winner.revision });
    assert.equal(
      (await service.tuitionMonth({ month: "2026-10" })).totals.totalFee,
      0,
    );
  } finally {
    sqlite.close();
  }
});

test("tuition detail limits keep complete totals and filtering still retrieves older lessons for an individual student", async () => {
  const { db, sqlite } = database();
  try {
    const insert = sqlite.prepare(
      "INSERT INTO tuition_lessons(id,teacher_uid,student_uid,display_name,username,lesson_date,fee_vnd,mutation_token,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
    );
    for (let i = 0; i < 1002; i++)
      insert.run(
        `bulk-${i}`,
        teacher.uid,
        "student01",
        "Học sinh 1",
        "student01",
        "2026-10-31",
        250000,
        `bulk-token-${i}`,
        i,
        i,
      );
    insert.run(
      "older",
      teacher.uid,
      "student02",
      "Học sinh 2",
      "student02",
      "2026-10-01",
      300000,
      "older-token",
      1,
      1,
    );
    const service = makeTuitionService(db, teacher, directory());
    const all = await service.tuitionMonth({ month: "2026-10" });
    assert.equal(all.lessons.length, 1000);
    assert.equal(all.truncated, true);
    assert.deepEqual(all.totals, {
      studentCount: 2,
      lessonCount: 1003,
      totalFee: 250800000,
    });
    const student = await service.tuitionMonth({
      month: "2026-10",
      studentUid: "student02",
    });
    assert.equal(student.lessons[0].id, "older");
    assert.equal(student.truncated, false);
    assert.deepEqual(student.totals, all.totals);
  } finally {
    sqlite.close();
  }
});

test("tuition HTTP endpoints require current admin identity and deny students, revoked sessions and missing claims", async () => {
  const { db, sqlite } = database();
  try {
    let claims = { sub: "student01", auth_time: 100 };
    let user = { validSince: "10", customAttributes: '{"admin":true}' };
    let role = "student",
      status = "active";
    const firebase = {
      getAuthUser: async () => user,
      getProfile: async (uid) =>
        uid === claims.sub
          ? profile(role, "Giáo viên", status)
          : directory().getProfile(uid),
    };
    const handler = makeHandler({
      makeFirebaseClient: () => firebase,
      verifyIdToken: async () => claims,
    });
    const env = {
      ALLOWED_ORIGIN: "https://lumenpelagi.vercel.app",
      QUIZ_DB: db,
    };
    const request = (op, data) =>
      new Request(`https://worker.example/api/quiz/${op}`, {
        method: "POST",
        headers: {
          Origin: env.ALLOWED_ORIGIN,
          Authorization: "Bearer test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
    for (const [op, data] of [
      ["tuitionMonth", { month: "2026-10" }],
      ["tuitionSave", draft("http")],
      ["tuitionDelete", { id: "http", revision: 1 }],
    ]) {
      assert.equal((await handler(request(op, data), env)).status, 403);
    }
    role = "admin";
    claims = { ...claims, sub: teacher.uid };
    assert.equal(
      (await handler(request("tuitionMonth", { month: "2026-10" }), env))
        .status,
      403,
    );
    claims.admin = true;
    user.customAttributes = "{}";
    assert.equal(
      (await handler(request("tuitionMonth", { month: "2026-10" }), env))
        .status,
      403,
    );
    user.customAttributes = '{"admin":true}';
    user.disabled = true;
    assert.equal(
      (await handler(request("tuitionMonth", { month: "2026-10" }), env))
        .status,
      401,
    );
    user.disabled = false;
    user.validSince = "101";
    assert.equal(
      (await handler(request("tuitionMonth", { month: "2026-10" }), env))
        .status,
      401,
    );
    user.validSince = "10";
    status = "disabled";
    assert.equal(
      (await handler(request("tuitionMonth", { month: "2026-10" }), env))
        .status,
      403,
    );
    status = "active";
    assert.equal(
      (await handler(request("tuitionSave", draft("http")), env)).status,
      200,
    );
    const response = await handler(
      request("tuitionMonth", { month: "2026-10" }),
      env,
    );
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("Access-Control-Allow-Origin"),
      env.ALLOWED_ORIGIN,
    );
    assert.equal((await response.json()).totals.totalFee, 250000);
    assert.equal(
      (
        await handler(
          request("tuitionDelete", { id: "http", revision: 1 }),
          env,
        )
      ).status,
      200,
    );
  } finally {
    sqlite.close();
  }
});
