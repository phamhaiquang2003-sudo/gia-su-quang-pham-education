const http = require("node:http");

const statusCodes = {
  unauthenticated: 401,
  "permission-denied": 403,
  "invalid-argument": 400,
  "not-found": 404,
  "already-exists": 409,
  "failed-precondition": 409,
  "resource-exhausted": 413,
};

function createLocalAdminServer({
  auth,
  service,
  origin = "http://127.0.0.1:5173",
  port = 8787,
}) {
  function send(response, status, data) {
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(JSON.stringify(data));
  }

  return http.createServer(async (request, response) => {
    if (
      ![`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host)
    ) {
      send(response, 403, {
        error: {
          code: "permission-denied",
          message: "Địa chỉ truy cập không hợp lệ.",
        },
      });
      return;
    }
    if (request.method === "GET" && request.url === "/api/admin/health") {
      send(response, 200, { ready: true });
      return;
    }
    if (request.headers.origin !== origin) {
      send(response, 403, {
        error: {
          code: "permission-denied",
          message: "Chỉ trang quản trị trên máy được truy cập.",
        },
      });
      return;
    }
    const operation = request.url?.split("/").at(-1);
    if (
      request.method !== "POST" ||
      !["/api/admin/createStudents", "/api/admin/manageStudent"].includes(
        request.url,
      )
    ) {
      send(response, 404, {
        error: { code: "not-found", message: "Không tìm thấy thao tác." },
      });
      return;
    }
    if (!request.headers["content-type"]?.startsWith("application/json")) {
      send(response, 400, {
        error: {
          code: "invalid-argument",
          message: "Dữ liệu phải ở dạng JSON.",
        },
      });
      return;
    }
    try {
      const bearer =
        request.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
      if (!bearer)
        throw Object.assign(
          new Error("Vui lòng đăng nhập tài khoản quản trị."),
          { code: "unauthenticated" },
        );
      let decoded;
      try {
        decoded = await auth.verifyIdToken(bearer, true);
      } catch {
        throw Object.assign(
          new Error("Phiên đăng nhập không hợp lệ hoặc đã hết hạn."),
          { code: "unauthenticated" },
        );
      }
      if (decoded.admin !== true)
        throw Object.assign(
          new Error("Chỉ quản trị viên được thực hiện thao tác này."),
          { code: "permission-denied" },
        );
      let size = 0;
      const chunks = [];
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 100_000) {
          throw Object.assign(
            new Error("Danh sách quá lớn. Tối đa 50 tài khoản mỗi lần."),
            { code: "resource-exhausted" },
          );
        }
        chunks.push(chunk);
      }
      let data;
      try {
        data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw Object.assign(new Error("Dữ liệu JSON không hợp lệ."), {
          code: "invalid-argument",
        });
      }
      const result = await service[operation]({
        auth: { uid: decoded.uid, token: decoded },
        data,
      });
      send(response, 200, result);
    } catch (error) {
      const status = statusCodes[error.code] || 500;
      send(response, status, {
        error: {
          code: status === 500 ? "internal" : error.code,
          message:
            status === 500
              ? "Không xử lý được yêu cầu. Vui lòng thử lại."
              : error.message,
        },
      });
    }
  });
}

module.exports = { createLocalAdminServer };
