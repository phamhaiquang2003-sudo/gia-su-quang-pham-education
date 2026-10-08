import { test } from "node:test";
import assert from "node:assert/strict";
import { makeStudentService } from "../src/student-service.js";
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
  const authUpdates = [];
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
      student.fields.status.stringValue = "disabled";
      return "disabled-version";
    },
    updateAuth: async (uid, changes) => {
      calls.push(`update:${uid}`);
      authUpdates.push(changes);
    },
    setProfileStatus: async (document, status) => {
      assert.equal(document, student);
      calls.push(`profile:${status}`);
      student.fields.status.stringValue = status;
    },
    touchProfile: async (document) => {
      assert.equal(document, student);
      calls.push("touch");
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
    authUpdates,
    firebase,
    claims,
    admin,
    student,
    reservation,
    adminUser,
    studentUser,
    service: makeStudentService({ firebase, verifyToken: async () => claims }),
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

test("locking immediately denies profile access and revokes Auth sessions; unlocking opens Auth before profile", async () => {
  const f = fixture();
  const before = Math.floor(Date.now() / 1000);
  assert.deepEqual(
    await f.service("token", { uid: "student-uid", action: "disable" }),
    { success: true },
  );
  assert.deepEqual(f.calls, ["disable", "update:student-uid"]);
  assert.equal(f.student.fields.status.stringValue, "disabled");
  assert.equal(f.authUpdates[0].disableUser, true);
  assert.ok(Number(f.authUpdates[0].validSince) >= before);
  f.calls.length = 0;
  await f.service("token", { uid: "student-uid", action: "enable" });
  assert.deepEqual(f.calls, ["update:student-uid", "profile:active"]);
  assert.deepEqual(f.authUpdates[1], { disableUser: false });
  assert.equal(f.student.fields.status.stringValue, "active");
});

test("password reset preserves spaces, revokes old sessions and leaves a locked student locked without storing credentials in the profile", async () => {
  const f = fixture();
  f.student.fields.status.stringValue = "disabled";
  f.studentUser.disabled = true;
  const password = "  Temporary-test-password-123  ";
  assert.deepEqual(
    await f.service("token", {
      uid: "student-uid",
      action: "resetPassword",
      password,
    }),
    { success: true },
  );
  assert.deepEqual(f.calls, ["update:student-uid", "touch"]);
  assert.equal(f.authUpdates[0].password, password);
  assert.ok(Number.isFinite(Number(f.authUpdates[0].validSince)));
  assert.equal(f.authUpdates[0].disableUser, undefined);
  assert.equal(f.student.fields.status.stringValue, "disabled");
  assert.equal(f.studentUser.disabled, true);
  assert.equal(JSON.stringify(f.student).includes(password), false);
});

test("all new actions reject revoked teachers and protected or mismatched targets before any writes", async () => {
  const changes = [
    (f) => {
      f.claims.admin = false;
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
      f.admin.fields.status.stringValue = "disabled";
    },
    (f) => {
      f.student.fields.role.stringValue = "admin";
    },
    (f) => {
      f.studentUser.customAttributes = '{"admin":true}';
    },
    (f) => {
      f.studentUser.email = "unrelated@example.com";
    },
    (f) => {
      f.reservation.fields.uid.stringValue = "different-uid";
    },
    (f) => {
      f.firebase.getAuthUser = async (uid) =>
        uid === "admin-uid" ? f.adminUser : null;
    },
  ];
  for (const action of ["disable", "enable", "resetPassword"]) {
    for (const change of changes) {
      const f = fixture();
      change(f);
      await assert.rejects(
        f.service("token", {
          uid: "student-uid",
          action,
          ...(action === "resetPassword"
            ? { password: "Test-password-123" }
            : {}),
        }),
      );
      assert.deepEqual(f.calls, []);
    }
    const f = fixture();
    await assert.rejects(
      f.service("token", {
        uid: "admin-uid",
        action,
        ...(action === "resetPassword"
          ? { password: "Test-password-123" }
          : {}),
      }),
    );
    assert.deepEqual(f.calls, []);
  }
});

test("management rejects unexpected fields and invalid password lengths before touching Firebase", async () => {
  const f = fixture();
  const invalid = [
    null,
    [],
    "text",
    {},
    { uid: "../student", action: "disable" },
    { uid: "student-uid", action: "create" },
    { uid: "student-uid", action: "enable", password: "ignored-password" },
    {
      uid: "student-uid",
      action: "resetPassword",
      admin: true,
      password: "Test-password-123",
    },
    ...[undefined, null, 123, "1234567", "x".repeat(129)].map((password) => ({
      uid: "student-uid",
      action: "resetPassword",
      password,
    })),
  ];
  for (const data of invalid)
    await assert.rejects(f.service("token", data), {
      code: "invalid-argument",
    });
  assert.deepEqual(f.calls, []);
});

test("failed locking and unlocking stay denied at the profile; retries can recover", async () => {
  const f = fixture();
  const updateAuth = f.firebase.updateAuth;
  f.firebase.updateAuth = async () => {
    throw new Error("Auth unavailable");
  };
  await assert.rejects(
    f.service("token", { uid: "student-uid", action: "disable" }),
  );
  assert.equal(f.student.fields.status.stringValue, "disabled");
  f.calls.length = 0;
  await assert.rejects(
    f.service("token", { uid: "student-uid", action: "enable" }),
  );
  assert.deepEqual(f.calls, []);
  assert.equal(f.student.fields.status.stringValue, "disabled");
  f.firebase.updateAuth = updateAuth;
  const setProfileStatus = f.firebase.setProfileStatus;
  f.firebase.setProfileStatus = async () => {
    throw new Error("Profile changed concurrently");
  };
  await assert.rejects(
    f.service("token", { uid: "student-uid", action: "enable" }),
  );
  assert.equal(f.student.fields.status.stringValue, "disabled");
  f.firebase.setProfileStatus = setProfileStatus;
  await f.service("token", { uid: "student-uid", action: "enable" });
  assert.equal(f.student.fields.status.stringValue, "active");
});

test("HTTP management supports all actions and never returns submitted passwords or raw failures", async () => {
  const f = fixture();
  const env = {
    ALLOWED_ORIGIN: "https://school.example",
    FIREBASE_SERVICE_ACCOUNT: "secret",
  };
  const handler = makeHandler({
    makeFirebaseClient: () => f.firebase,
    verifyIdToken: async () => f.claims,
  });
  const request = (data) =>
    new Request("https://worker.example/api/admin/manageStudent", {
      method: "POST",
      headers: {
        Origin: env.ALLOWED_ORIGIN,
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
  const password = "Test-password-123";
  for (const action of ["disable", "enable", "resetPassword"]) {
    const response = await handler(
      request({
        uid: "student-uid",
        action,
        ...(action === "resetPassword" ? { password } : {}),
      }),
      env,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
  }
  f.firebase.updateAuth = async () => {
    throw new Error(password);
  };
  const failure = await handler(
    request({ uid: "student-uid", action: "resetPassword", password }),
    env,
  );
  assert.equal(failure.status, 500);
  assert.equal((await failure.text()).includes(password), false);
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

test("production Vercel and GitHub CORS accept exact origins while rejecting preview URLs, cancelled domains and anonymous requests", async () => {
  const handler = makeHandler();
  const env = {
    ALLOWED_ORIGIN: "https://lumenpelagi.vercel.app",
    ALLOWED_ORIGINS: " https://phamhaiquang2003-sudo.github.io, ",
  };
  const paths = [
    "/api/admin/manageStudent",
    "/api/quiz/start",
    "/api/quiz/profileOverview",
  ];
  for (const path of paths) {
    for (const origin of [
      env.ALLOWED_ORIGIN,
      "https://phamhaiquang2003-sudo.github.io",
    ]) {
      const response = await handler(
        new Request("https://worker.example" + path, {
          method: "OPTIONS",
          headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
        }),
        env,
      );
      assert.equal(response.status, 204);
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
      assert.equal(response.headers.get("Vary"), "Origin");
      const anonymous = await handler(
        new Request("https://worker.example" + path, {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: "{}",
        }),
        env,
      );
      assert.equal(anonymous.status, 401);
      assert.equal(
        anonymous.headers.get("Access-Control-Allow-Origin"),
        origin,
      );
    }
    for (const origin of [
      "https://other.vercel.app",
      "https://lumenpelagi-preview.vercel.app",
      "https://lumenpelagi.id.vn",
      "https://www.lumenpelagi.id.vn",
      "https://lumenpelagi.vercel.app.example",
      "http://lumenpelagi.vercel.app",
      "https://lumenpelagi.vercel.app:444",
      "null",
    ]) {
      const response = await handler(
        new Request("https://worker.example" + path, {
          method: "OPTIONS",
          headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
        }),
        env,
      );
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
