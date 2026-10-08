import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";
import { ServiceError } from "./errors.js";

export const projectId = "phq-education";
const signingKeys = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);
const documentRoot = `projects/${projectId}/databases/(default)/documents`;
let oauthCache;

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, signingKeys, {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      requiredClaims: ["sub", "iat", "exp", "auth_time"],
    });
    const now = Math.floor(Date.now() / 1000);
    if (
      !validUid(payload.sub) ||
      typeof payload.iat !== "number" ||
      payload.iat > now ||
      typeof payload.auth_time !== "number" ||
      payload.auth_time > now
    )
      throw new Error("Invalid claims");
    return payload;
  } catch {
    throw new ServiceError(
      "unauthenticated",
      "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.",
      401,
    );
  }
}

export function validUid(uid) {
  return typeof uid === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(uid);
}

async function accessToken(secret) {
  if (
    oauthCache?.secret === secret &&
    oauthCache.expiresAt > Date.now() + 60_000
  )
    return oauthCache.token;
  let credential;
  try {
    credential = JSON.parse(secret);
  } catch {
    /* validated below */
  }
  if (
    credential?.type !== "service_account" ||
    credential.project_id !== projectId ||
    typeof credential.private_key !== "string" ||
    !credential.client_email?.endsWith(`@${projectId}.iam.gserviceaccount.com`)
  ) {
    throw new ServiceError(
      "failed-precondition",
      "Dịch vụ quản trị chưa được cấu hình đúng dự án Firebase.",
      503,
    );
  }
  const key = await importPKCS8(credential.private_key, "RS256");
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/cloud-platform",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(credential.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json();
  if (!response.ok || typeof result.access_token !== "string")
    throw new ServiceError(
      "unavailable",
      "Chưa kết nối được dịch vụ quản trị Firebase.",
      503,
    );
  oauthCache = {
    secret,
    token: result.access_token,
    expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000,
  };
  return oauthCache.token;
}

export function makeFirebase(secret) {
  async function request(url, body, allowMissing = false) {
    const token = await accessToken(secret);
    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json();
    if (!response.ok) {
      if (
        allowMissing &&
        (response.status === 404 || data.error?.message === "USER_NOT_FOUND")
      )
        return null;
      if (
        ["INVALID_PASSWORD", "PASSWORD_DOES_NOT_MEET_REQUIREMENTS"].some(
          (code) => data.error?.message?.startsWith(code),
        )
      )
        throw new ServiceError(
          "invalid-argument",
          "Mật khẩu mới chưa đáp ứng chính sách Firebase. Hãy chọn mật khẩu mạnh hơn.",
        );
      throw new ServiceError(
        "failed-precondition",
        "Thao tác chưa hoàn tất. Vui lòng tải lại danh sách rồi thử lại.",
        503,
      );
    }
    return data;
  }
  const name = (collection, id) => `${documentRoot}/${collection}/${id}`;
  async function setProfileStatus(profile, status) {
    const result = await request(
      `https://firestore.googleapis.com/v1/${documentRoot}:commit`,
      {
        writes: [
          {
            update: {
              name: profile.name,
              fields: { status: { stringValue: status } },
            },
            updateMask: { fieldPaths: ["status"] },
            updateTransforms: [
              { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" },
            ],
            currentDocument: { updateTime: profile.updateTime },
          },
        ],
      },
    );
    return result.writeResults[0].updateTime;
  }
  return {
    async getProfile(uid) {
      return request(
        `https://firestore.googleapis.com/v1/${name("users", uid)}`,
        undefined,
        true,
      );
    },
    async getReservation(username) {
      return request(
        `https://firestore.googleapis.com/v1/${name("usernames", username)}`,
        undefined,
        true,
      );
    },
    async getAuthUser(uid) {
      const result = await request(
        `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`,
        { localId: [uid] },
      );
      return result.users?.find((user) => user.localId === uid) || null;
    },
    async disableProfile(profile) {
      return setProfileStatus(profile, "disabled");
    },
    setProfileStatus,
    async touchProfile(profile) {
      await request(
        `https://firestore.googleapis.com/v1/${documentRoot}:commit`,
        {
          writes: [
            {
              transform: {
                document: profile.name,
                fieldTransforms: [
                  { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" },
                ],
              },
              currentDocument: { updateTime: profile.updateTime },
            },
          ],
        },
      );
    },
    async updateAuth(uid, changes) {
      await request(
        `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`,
        { localId: uid, ...changes },
      );
    },
    async deleteAuth(uid) {
      await request(
        `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:delete`,
        { localId: uid },
        true,
      );
    },
    async deleteDocuments(profile, disabledUpdateTime, reservation) {
      const writes = [
        {
          delete: profile.name,
          currentDocument: { updateTime: disabledUpdateTime },
        },
      ];
      if (reservation)
        writes.push({
          delete: reservation.name,
          currentDocument: { updateTime: reservation.updateTime },
        });
      await request(
        `https://firestore.googleapis.com/v1/${documentRoot}:commit`,
        { writes },
      );
    },
  };
}
