import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDeletionService } from "../src/deletion-service.js";
import { makeHandler } from "../src/index.js";

const profile = (role, extra = {}) => ({
  name: `users/${role}`,
  updateTime: "original",
  fields: Object.fromEntries(
    Object.entries({
      role,
      status: "active",
      username: "student01",
      ...extra,
    }).map(([key, value]) => [key, { stringValue: value }]),
  ),
});
function fixture() {
  const calls = [];
  const admin = profile("admin");
  const student = profile("student");
  const reservation = profile("reservation", { uid: "student-uid" });
  const adminUser = {
    localId: "admin-uid",
    customAttributes: '{"admin":true}',
    validSince: "10",
  };
  const studentUser = {
    localId: "student-uid",
    email: "student01@phq-education.firebaseapp.com",
  };
  const firebase = {
    getProfile: async (uid) => (uid === "admin-uid" ? admin : student),
    getAuthUser: async (uid) => (uid === "admin-uid" ? adminUser : studentUser),
    getReservation: async () => reservation,
    disableProfile: async () => {
      calls.push("disable");
      return "disabled-version";
    },
    deleteAuth: async (uid) => calls.push(`auth:${uid}`),
    deleteDocuments: async (_, time, name) => {
      assert.equal(time, "disabled-version");
      assert.equal(name, reservation);
      calls.push("documents");
    },
  };
  const claims = { sub: "admin-uid", admin: true, auth_time: 100 };
  return {
    calls,
    firebase,
    claims,
    admin,
    student,
    reservation,
    adminUser,
    studentUser,
    service: makeDeletionService({ firebase, verifyToken: async () => claims }),
  };
}

test("deletion revokes profile access before Auth, then deletes profile and its reservation", async () => {
  const f = fixture();
  assert.deepEqual(
    await f.service("token", { uid: "student-uid", action: "delete" }),
    { success: true },
  );
  assert.deepEqual(f.calls, ["disable", "auth:student-uid", "documents"]);
});

test("deletion refuses missing admin claim, inactive admin, disabled/revoked Auth and protected targets", async () => {
  const changes = [
    (f) => {
      f.claims.admin = false;
    },
    (f) => {
      f.admin.fields.status.stringValue = "disabled";
    },
    (f) => {
      f.adminUser.disabled = true;
    },
    (f) => {
      f.adminUser.validSince = "101";
    },
    (f) => {
      f.adminUser.customAttributes = "{}";
    },
    (f) => {
      f.student.fields.role.stringValue = "admin";
    },
    (f) => {
      f.studentUser.customAttributes = '{"admin":true}';
    },
    (f) => {
      f.studentUser.email = "other@phq-education.firebaseapp.com";
    },
    (f) => {
      f.reservation.fields.uid.stringValue = "another-uid";
    },
  ];
  for (const change of changes) {
    const f = fixture();
    change(f);
    await assert.rejects(
      f.service("token", { uid: "student-uid", action: "delete" }),
    );
    assert.deepEqual(f.calls, []);
  }
  const f = fixture();
  await assert.rejects(
    f.service("token", { uid: "admin-uid", action: "delete" }),
  );
  await assert.rejects(
    f.service("token", { uid: "../admin-uid", action: "delete" }),
  );
  await assert.rejects(
    f.service("token", { uid: "student-uid", action: "resetPassword" }),
  );
  assert.deepEqual(f.calls, []);
});

test("partial failure retains locked profile and reservation; retry can finish after Auth is absent", async () => {
  const f = fixture();
  f.firebase.deleteAuth = async () => {
    throw new Error("Auth unavailable");
  };
  await assert.rejects(
    f.service("token", { uid: "student-uid", action: "delete" }),
  );
  assert.deepEqual(f.calls, ["disable"]);
  f.calls.length = 0;
  f.firebase.getAuthUser = async (uid) =>
    uid === "admin-uid" ? f.adminUser : null;
  await f.service("token", { uid: "student-uid", action: "delete" });
  assert.deepEqual(f.calls, ["disable", "documents"]);
});

test("custom-domain CORS accepts only exact configured origins for account and quiz requests, retaining the original origin", async () => {
  const handler = makeHandler();
  const env = {
    ALLOWED_ORIGIN: "https://phamhaiquang2003-sudo.github.io",
    ALLOWED_ORIGINS: " https://lumenpelagi.id.vn, https://www.lumenpelagi.id.vn, ",
  };
  for (const path of ["/api/admin/manageStudent", "/api/quiz/profileOverview", "/api/quiz/start"]) {
    for (const origin of [env.ALLOWED_ORIGIN, "https://lumenpelagi.id.vn", "https://www.lumenpelagi.id.vn"]) {
      const preflight = await handler(new Request("https://worker.example" + path, {
        method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
      }), env);
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), origin);
      assert.equal(preflight.headers.get("Vary"), "Origin");
      const anonymous = await handler(new Request("https://worker.example" + path, {
        method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "{}",
      }), env);
      assert.equal(anonymous.status, 401);
      assert.equal(anonymous.headers.get("Access-Control-Allow-Origin"), origin);
    }
    for (const origin of ["http://lumenpelagi.id.vn", "https://lumenpelagi.id.vn.example", "https://sub.lumenpelagi.id.vn", "https://lumenpelagi.id.vn:444", "null", "https://another.example"]) {
      const response = await handler(new Request("https://worker.example" + path, {
        method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
      }), env);
      assert.equal(response.status, 403);
      assert.equal(response.headers.has("Access-Control-Allow-Origin"), false);
    }
  }
});

test("HTTP endpoint requires bearer identity, exact origin, JSON, small body, and returns sanitized failures", async () => {
  const f = fixture();
  const env = {
    ALLOWED_ORIGIN: "https://school.example",
    FIREBASE_SERVICE_ACCOUNT: "secret",
  };
  const handler = makeHandler({
    makeFirebaseClient: () => f.firebase,
    verifyIdToken: async () => f.claims,
  });
  const url = "https://worker.example/api/admin/manageStudent";
  const request = (extra = {}) =>
    new Request(url, {
      method: "POST",
      headers: {
        Origin: env.ALLOWED_ORIGIN,
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uid: "student-uid", action: "delete" }),
      ...extra,
    });
  assert.equal(
    (
      await handler(
        request({ headers: { Origin: "https://another.example" } }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (await handler(request({ headers: { Origin: env.ALLOWED_ORIGIN } }), env))
      .status,
    401,
  );
  assert.equal((await handler(request({ body: "{" }), env)).status, 400);
  assert.equal(
    (
      await handler(
        request({
          headers: {
            Origin: env.ALLOWED_ORIGIN,
            Authorization: "Bearer token",
            "Content-Type": "application/json-invalid",
          },
        }),
        env,
      )
    ).status,
    415,
  );
  assert.equal(
    (await handler(request({ body: "x".repeat(4097) }), env)).status,
    413,
  );
  assert.equal(
    (await handler(request({ method: "GET", body: undefined }), env)).status,
    405,
  );
  const preflight = await handler(
    new Request(url, {
      method: "OPTIONS",
      headers: {
        Origin: env.ALLOWED_ORIGIN,
        "Access-Control-Request-Method": "POST",
      },
    }),
    env,
  );
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get("Access-Control-Allow-Origin"),
    env.ALLOWED_ORIGIN,
  );
  const success = await handler(request(), env);
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), { success: true });
  f.firebase.deleteAuth = async () => {
    throw new Error("private-key-and-internal-details");
  };
  const failed = await handler(request(), env);
  assert.equal(failed.status, 500);
  assert.equal((await failed.text()).includes("private-key"), false);
});
