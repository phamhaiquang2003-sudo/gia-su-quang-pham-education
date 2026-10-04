import { makeDeletionService } from "./deletion-service.js";
import { ServiceError } from "./errors.js";
import { makeFirebase, verifyToken } from "./firebase.js";
import { requireQuizUser } from "./quiz-auth.js";
import {
  makeQuizService,
  readLimitedBody,
  finalizeExpired,
} from "./quiz-service.js";

export function makeHandler({
  makeFirebaseClient = makeFirebase,
  verifyIdToken = verifyToken,
} = {}) {
  return async (request, env) => {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
    };
    const respond = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers });
    if (origin && origin !== env.ALLOWED_ORIGIN)
      return respond(
        {
          error: {
            code: "permission-denied",
            message: "Nguồn truy cập không được phép.",
          },
        },
        403,
      );
    if (origin) headers["Access-Control-Allow-Origin"] = origin;
    if (request.method === "GET" && url.pathname === "/health")
      return respond({
        service: "phq-education-admin",
        configured: Boolean(env.FIREBASE_SERVICE_ACCOUNT),
      });
    const quizOperation = url.pathname.startsWith("/api/quiz/")
      ? url.pathname.slice("/api/quiz/".length)
      : "";
    if (url.pathname !== "/api/admin/manageStudent" && !quizOperation)
      return respond(
        { error: { code: "not-found", message: "Không tìm thấy dịch vụ." } },
        404,
      );
    if (request.method === "OPTIONS") {
      if (
        !origin ||
        request.headers.get("Access-Control-Request-Method") !== "POST"
      )
        return respond(
          {
            error: {
              code: "permission-denied",
              message: "Yêu cầu không được phép.",
            },
          },
          403,
        );
      headers["Access-Control-Allow-Methods"] = "POST";
      headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
      headers["Access-Control-Max-Age"] = "600";
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST")
      return respond(
        { error: { code: "invalid-argument", message: "Chỉ chấp nhận POST." } },
        405,
      );
    const authorization = request.headers.get("Authorization") || "";
    if (!/^Bearer \S{1,8192}$/.test(authorization))
      return respond(
        {
          error: {
            code: "unauthenticated",
            message: "Vui lòng đăng nhập quản trị.",
          },
        },
        401,
      );
    try {
      if (quizOperation) {
        if (!env.QUIZ_DB)
          throw new ServiceError(
            "failed-precondition",
            "Kho bài tập đang được thiết lập.",
            503,
          );
        const firebase = makeFirebaseClient(env.FIREBASE_SERVICE_ACCOUNT);
        const user = await requireQuizUser(
          authorization.slice(7),
          firebase,
          verifyIdToken,
          [
            "save",
            "listAdmin",
            "adminDetail",
            "hide",
            "deleteQuiz",
            "allowRetake",
            "results",
            "upload",
            "manualGrade",
          ].includes(quizOperation),
        );
        const service = makeQuizService(env.QUIZ_DB, user);
        const operations = [
          "list",
          "listAdmin",
          "adminDetail",
          "save",
          "hide",
          "deleteQuiz",
          "allowRetake",
          "detail",
          "start",
          "progress",
          "submit",
          "results",
          "upload",
          "file",
          "submissionUpload",
          "removeSubmissionFile",
          "manualGrade",
        ];
        if (!operations.includes(quizOperation))
          throw new ServiceError("not-found", "Không tìm thấy chức năng.", 404);
        let data = {};
        if (!["upload", "submissionUpload"].includes(quizOperation)) {
          if (
            request.headers
              .get("Content-Type")
              ?.split(";")[0]
              .trim()
              .toLowerCase() !== "application/json"
          )
            throw new ServiceError(
              "invalid-argument",
              "Yêu cầu cần dùng JSON.",
              415,
            );
          try {
            data = JSON.parse(
              new TextDecoder().decode(await readLimitedBody(request, 400_000)),
            );
          } catch (error) {
            if (error instanceof ServiceError) throw error;
            throw new ServiceError("invalid-argument", "JSON không hợp lệ.");
          }
          if (!data || typeof data !== "object" || Array.isArray(data))
            throw new ServiceError(
              "invalid-argument",
              "Dữ liệu cần là một đối tượng JSON.",
            );
        }
        const result = await service[quizOperation](
          ["upload", "submissionUpload"].includes(quizOperation)
            ? request
            : data,
        );
        if (result instanceof Response) {
          const h = new Headers(result.headers);
          for (const [key, value] of Object.entries(headers))
            if (key !== "Content-Type") h.set(key, value);
          return new Response(result.body, {
            status: result.status,
            headers: h,
          });
        }
        return respond(result);
      }
      if (
        request.headers
          .get("Content-Type")
          ?.split(";")[0]
          .trim()
          .toLowerCase() !== "application/json"
      )
        throw new ServiceError(
          "invalid-argument",
          "Yêu cầu cần dùng JSON.",
          415,
        );
      if (Number(request.headers.get("Content-Length") || 0) > 4096)
        throw new ServiceError("invalid-argument", "Yêu cầu quá lớn.", 413);
      let size = 0;
      const chunks = [];
      const reader = request.body?.getReader();
      if (!reader)
        throw new ServiceError("invalid-argument", "Thiếu dữ liệu yêu cầu.");
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          throw new ServiceError("invalid-argument", "Yêu cầu quá lớn.", 413);
        }
        chunks.push(value);
      }
      let data;
      try {
        data = JSON.parse(await new Blob(chunks).text());
      } catch {
        throw new ServiceError(
          "invalid-argument",
          "Dữ liệu JSON không hợp lệ.",
        );
      }
      const service = makeDeletionService({
        firebase: makeFirebaseClient(env.FIREBASE_SERVICE_ACCOUNT),
        verifyToken: verifyIdToken,
      });
      return respond(await service(authorization.slice(7), data));
    } catch (error) {
      if (error instanceof ServiceError)
        return respond(
          { error: { code: error.code, message: error.message } },
          error.status,
        );
      return respond(
        {
          error: {
            code: "internal",
            message:
              "Thao tác chưa hoàn tất. Vui lòng tải lại danh sách rồi thử lại.",
          },
        },
        500,
      );
    }
  };
}

export default {
  fetch: makeHandler(),
  async scheduled(_event, env, ctx) {
    if (env.QUIZ_DB) ctx.waitUntil(finalizeExpired(env.QUIZ_DB));
  },
};
