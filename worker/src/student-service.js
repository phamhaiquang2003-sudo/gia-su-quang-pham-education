import { ServiceError } from "./errors.js";
import { projectId, validUid } from "./firebase.js";

const field = (document, key) => document?.fields?.[key]?.stringValue;
function hasAdminClaim(user) {
  try {
    return JSON.parse(user?.customAttributes || "{}").admin === true;
  } catch {
    return false;
  }
}

export function makeStudentService({ firebase, verifyToken }) {
  return async (token, data) => {
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      !validUid(data.uid) ||
      !["disable", "enable", "resetPassword", "delete"].includes(data.action) ||
      Object.keys(data).some(
        (key) =>
          !(
            data.action === "resetPassword"
              ? ["uid", "action", "password"]
              : ["uid", "action"]
          ).includes(key),
      ) ||
      (data.action === "resetPassword" &&
        (typeof data.password !== "string" ||
          data.password.length < 8 ||
          data.password.length > 128))
    ) {
      throw new ServiceError(
        "invalid-argument",
        "Yêu cầu quản lý tài khoản không hợp lệ. Mật khẩu mới cần từ 8 đến 128 ký tự.",
      );
    }
    const claims = await verifyToken(token);
    if (claims.admin !== true)
      throw new ServiceError(
        "permission-denied",
        "Chỉ quản trị viên được quản lý tài khoản.",
        403,
      );
    const [adminUser, adminProfile] = await Promise.all([
      firebase.getAuthUser(claims.sub),
      firebase.getProfile(claims.sub),
    ]);
    if (
      !adminUser ||
      adminUser.disabled ||
      !hasAdminClaim(adminUser) ||
      !Number.isFinite(Number(adminUser.validSince || 0)) ||
      claims.auth_time < Number(adminUser.validSince || 0)
    ) {
      throw new ServiceError(
        "unauthenticated",
        "Phiên quản trị đã hết hiệu lực. Vui lòng đăng nhập lại.",
        401,
      );
    }
    if (
      field(adminProfile, "role") !== "admin" ||
      field(adminProfile, "status") !== "active"
    )
      throw new ServiceError(
        "permission-denied",
        "Tài khoản quản trị không còn hoạt động.",
        403,
      );
    if (data.uid === claims.sub)
      throw new ServiceError(
        "permission-denied",
        "Chỉ được quản lý tài khoản học sinh.",
        403,
      );

    const profile = await firebase.getProfile(data.uid);
    if (!profile)
      throw new ServiceError(
        "not-found",
        "Không tìm thấy hồ sơ học sinh.",
        404,
      );
    if (field(profile, "role") !== "student")
      throw new ServiceError(
        "permission-denied",
        "Chỉ được quản lý tài khoản học sinh.",
        403,
      );
    const username = field(profile, "username");
    if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(username || ""))
      throw new ServiceError(
        "failed-precondition",
        "Hồ sơ học sinh chưa có tên đăng nhập hợp lệ.",
      );
    const [studentUser, reservation] = await Promise.all([
      firebase.getAuthUser(data.uid),
      firebase.getReservation(username),
    ]);
    if (
      studentUser &&
      (hasAdminClaim(studentUser) ||
        studentUser.email !== `${username}@${projectId}.firebaseapp.com`)
    )
      throw new ServiceError(
        "permission-denied",
        "Tài khoản không khớp hồ sơ học sinh.",
        403,
      );
    if (reservation && field(reservation, "uid") !== data.uid)
      throw new ServiceError(
        "failed-precondition",
        "Tên đăng nhập đang liên kết với hồ sơ khác. Vui lòng kiểm tra lại.",
      );

    if (data.action !== "delete") {
      if (!studentUser)
        throw new ServiceError(
          "not-found",
          "Không tìm thấy tài khoản đăng nhập của học sinh.",
          404,
        );
      if (!["active", "disabled"].includes(field(profile, "status")))
        throw new ServiceError(
          "failed-precondition",
          "Trạng thái hồ sơ học sinh không hợp lệ.",
        );
      if (data.action === "disable") {
        // Deny existing sessions immediately, even if the Auth write fails.
        await firebase.disableProfile(profile);
        await firebase.updateAuth(data.uid, {
          disableUser: true,
          validSince: String(Math.floor(Date.now() / 1000)),
        });
      } else if (data.action === "enable") {
        // Keep the profile locked until Auth is available again.
        await firebase.updateAuth(data.uid, { disableUser: false });
        await firebase.setProfileStatus(profile, "active");
      } else {
        await firebase.updateAuth(data.uid, {
          password: data.password,
          validSince: String(Math.floor(Date.now() / 1000)),
        });
        await firebase.touchProfile(profile);
      }
      return { success: true };
    }

    // Revoke profile access before touching Auth. A partial failure stays locked
    // and can be retried, including when Auth has already been removed.
    const disabledUpdateTime = await firebase.disableProfile(profile);
    if (studentUser) await firebase.deleteAuth(data.uid);
    await firebase.deleteDocuments(profile, disabledUpdateTime, reservation);
    return { success: true };
  };
}
