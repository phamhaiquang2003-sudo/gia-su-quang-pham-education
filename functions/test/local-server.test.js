const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createLocalAdminServer } = require("../local-server");

let server;
const calls = [];
const base = "http://127.0.0.1:8791";
const origin = "http://127.0.0.1:5173";

before(async () => {
  server = createLocalAdminServer({
    port: 8791,
    auth: {
      async verifyIdToken(token, checkRevoked) {
        assert.equal(checkRevoked, true);
        if (token === "valid-admin") return { uid: "teacher", admin: true };
        if (token === "valid-student") return { uid: "student" };
        throw new Error("Invalid token");
      },
    },
    service: {
      async createStudents(request) {
        if (request.data.fail) throw new Error("Sensitive internal detail");
        calls.push(request);
        return { results: [{ username: "hs001", success: true }] };
      },
      async manageStudent(request) {
        calls.push(request);
        return { success: true };
      },
    },
  });
  await new Promise((resolve) => server.listen(8791, "127.0.0.1", resolve));
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function post(
  headers = {},
  payload = {
    students: [
      {
        username: "hs001",
        password: "Demo-password-123",
        displayName: "Nguyễn Văn A",
      },
    ],
  },
) {
  return fetch(`${base}/api/admin/createStudents`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
}

test("local admin refuses cross-origin requests, preflights, DNS-rebinding hosts and anonymous access", async () => {
  assert.equal(
    (
      await post({
        Origin: "https://untrusted.example",
        Authorization: "Bearer valid-admin",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${base}/api/admin/createStudents`, {
        method: "OPTIONS",
        headers: { Origin: "https://untrusted.example" },
      })
    ).status,
    403,
  );
  const invalidHost = await new Promise((resolve, reject) => {
    const request = http.request(
      `${base}/api/admin/createStudents`,
      {
        method: "POST",
        headers: {
          Host: "untrusted.example:8791",
          Origin: origin,
          Authorization: "Bearer valid-admin",
          "Content-Type": "application/json",
        },
      },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    request.on("error", reject);
    request.end("{}");
  });
  assert.equal(invalidHost, 403);
  assert.equal((await post()).status, 401);
  assert.equal(
    (await post({ Authorization: "Bearer invalid-token" })).status,
    401,
  );
  assert.equal(
    (await post({ Authorization: "Bearer valid-student" })).status,
    403,
  );
  assert.equal(calls.length, 0);
});

test("valid admin requests preserve password data and forward the verified identity only to the account service", async () => {
  const response = await post({ Authorization: "Bearer valid-admin" });
  assert.equal(response.status, 200);
  const result = await response.text();
  assert.equal(result.includes("Demo-password"), false);
  assert.equal(calls.at(-1).auth.uid, "teacher");
  assert.equal(calls.at(-1).auth.token.admin, true);
  assert.equal(calls.at(-1).data.students[0].password, "Demo-password-123");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const mutation = await fetch(`${base}/api/admin/manageStudent`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Authorization: "Bearer valid-admin",
    },
    body: JSON.stringify({ uid: "hs001", action: "disable" }),
  });
  assert.equal(mutation.status, 200);
  assert.equal(calls.at(-1).data.action, "disable");
});

test("local admin validates JSON transport and hides internal errors", async () => {
  assert.equal(
    (
      await post({
        Authorization: "Bearer valid-admin",
        "Content-Type": "text/plain",
      })
    ).status,
    400,
  );
  const response = await fetch(`${base}/api/admin/createStudents`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Authorization: "Bearer valid-admin",
    },
    body: "{",
  });
  assert.equal(response.status, 400);
  const failure = await post(
    { Authorization: "Bearer valid-admin" },
    { fail: true },
  );
  assert.equal(failure.status, 500);
  assert.equal(
    (await failure.text()).includes("Sensitive internal detail"),
    false,
  );
  assert.equal((await fetch(`${base}/api/admin/health`)).status, 200);
});
