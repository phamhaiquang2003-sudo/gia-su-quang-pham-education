import { ServiceError } from "./errors.js";

export async function requireQuizUser(
  token,
  firebase,
  verifyToken,
  adminOnly = false,
) {
  const claims = await verifyToken(token);
  const [user, doc] = await Promise.all([
    firebase.getAuthUser(claims.sub),
    firebase.getProfile(claims.sub),
  ]);
  if (!user || user.disabled || claims.auth_time < Number(user.validSince || 0))
    throw new ServiceError(
      "unauthenticated",
      "Phiên đăng nhập đã hết hiệu lực.",
      401,
    );
  const profile = Object.fromEntries(
    Object.entries(doc?.fields || {}).map(([key, value]) => [
      key,
      value.stringValue,
    ]),
  );
  if (
    profile.status !== "active" ||
    !["student", "admin"].includes(profile.role)
  )
    throw new ServiceError(
      "permission-denied",
      "Tài khoản không còn quyền truy cập.",
      403,
    );
  let admin = false;
  try {
    admin =
      profile.role === "admin" &&
      claims.admin === true &&
      JSON.parse(user.customAttributes || "{}").admin === true;
  } catch {
    /* deny */
  }
  if ((adminOnly || profile.role === "admin") && !admin)
    throw new ServiceError(
      "permission-denied",
      "Chỉ quản trị viên được quản lý đề và đáp án.",
      403,
    );
  return {
    uid: claims.sub,
    admin,
    role: profile.role,
    displayName: profile.displayName || profile.username || "",
    username: profile.username || "",
  };
}
