const { randomUUID } = require("node:crypto");
const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { validateStudents, validateAction } = require("./validation");

function makeAccountService({ auth, db, projectId, logger }) {
  async function requireAdmin(request) {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Vui lòng đăng nhập.");
    if (request.auth.token.admin !== true) {
      throw new HttpsError(
        "permission-denied",
        "Chỉ quản trị viên được thực hiện thao tác này.",
      );
    }
    const profile = (await db.doc(`users/${request.auth.uid}`).get()).data();
    if (profile?.role !== "admin" || profile.status !== "active") {
      throw new HttpsError(
        "permission-denied",
        "Tài khoản quản trị không còn hoạt động.",
      );
    }
  }

  async function createOne(student, adminUid) {
    const uid = randomUUID();
    const reservation = db.doc(`usernames/${student.username}`);
    let reserved = false;
    try {
      await db.runTransaction(async (transaction) => {
        if ((await transaction.get(reservation)).exists) {
          throw new HttpsError("already-exists", "Tên đăng nhập đã tồn tại.");
        }
        transaction.create(reservation, {
          uid,
          state: "pending",
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      reserved = true;
      await auth.createUser({
        uid,
        email: `${student.username}@${projectId}.firebaseapp.com`,
        password: student.password,
        displayName: student.displayName,
        disabled: false,
      });
      await db.runTransaction(async (transaction) => {
        const current = await transaction.get(reservation);
        if (current.data()?.uid !== uid) throw new Error("Reservation changed");
        transaction.create(db.doc(`users/${uid}`), {
          username: student.username,
          displayName: student.displayName,
          role: "student",
          status: "active",
          classIds: [],
          createdBy: adminUid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(reservation, { state: "active" });
      });
      return {
        username: student.username,
        success: true,
        message: "Đã tạo tài khoản học sinh.",
      };
    } catch (error) {
      // Roll back only the resources reserved by this request. Retain the reservation
      // if Auth cleanup fails so another request cannot claim the same username.
      let cleanupSucceeded = true;
      if (reserved) {
        try {
          await auth.deleteUser(uid);
        } catch (cleanupError) {
          if (cleanupError.code !== "auth/user-not-found") {
            cleanupSucceeded = false;
            logger.error("Account Auth rollback failed", {
              uid,
              code: cleanupError.code || "unknown",
            });
          }
        }
      }
      if (reserved && cleanupSucceeded) {
        try {
          await db.runTransaction(async (transaction) => {
            const current = await transaction.get(reservation);
            if (current.data()?.uid === uid) {
              transaction.delete(reservation);
              transaction.delete(db.doc(`users/${uid}`));
            }
          });
        } catch (cleanupError) {
          logger.error("Username rollback failed", {
            uid,
            code: cleanupError.code || "unknown",
          });
        }
      }
      const duplicate =
        error.code === "already-exists" ||
        error.code === "auth/email-already-exists";
      const passwordRejected = [
        "auth/invalid-password",
        "auth/password-does-not-meet-requirements",
      ].includes(error.code);
      if (!duplicate && !passwordRejected)
        logger.error("Student creation failed", {
          uid,
          code: error.code || "unknown",
        });
      return {
        username: student.username,
        success: false,
        message: duplicate
          ? "Tên đăng nhập đã tồn tại; đã bỏ qua."
          : passwordRejected
            ? "Mật khẩu chưa đáp ứng chính sách Firebase."
            : "Chưa tạo được tài khoản. Vui lòng thử lại hoặc kiểm tra dịch vụ Firebase.",
      };
    }
  }

  async function createStudents(request) {
    await requireAdmin(request);
    const students = validateStudents(request.data);
    const results = [];
    for (const student of students) {
      // Recheck authorization between rows of a potentially long-running batch.
      await requireAdmin(request);
      results.push(await createOne(student, request.auth.uid));
    }
    return { results };
  }

  async function manageStudent(request) {
    await requireAdmin(request);
    const { uid, action, password } = validateAction(request.data);
    const profileRef = db.doc(`users/${uid}`);
    const student = (await profileRef.get()).data();
    if (!student)
      throw new HttpsError("not-found", "Không tìm thấy hồ sơ học sinh.");
    if (student.role !== "student" || uid === request.auth.uid) {
      throw new HttpsError(
        "permission-denied",
        "Trang này chỉ quản lý tài khoản học sinh.",
      );
    }
    try {
      if (action === "disable" || action === "delete") {
        // Firestore access is revoked immediately, including existing ID tokens.
        await profileRef.update({
          status: "disabled",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      if (action === "disable") {
        await auth.updateUser(uid, { disabled: true });
        await auth.revokeRefreshTokens(uid);
      } else if (action === "enable") {
        await auth.updateUser(uid, { disabled: false });
        await profileRef.update({
          status: "active",
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else if (action === "resetPassword") {
        await auth.updateUser(uid, { password });
        await auth.revokeRefreshTokens(uid);
        await profileRef.update({ updatedAt: FieldValue.serverTimestamp() });
      } else if (action === "delete") {
        try {
          await auth.deleteUser(uid);
        } catch (error) {
          if (error.code !== "auth/user-not-found") throw error;
        }
        await db.runTransaction(async (transaction) => {
          const reservation = db.doc(`usernames/${student.username}`);
          const reserved = await transaction.get(reservation);
          transaction.delete(profileRef);
          if (reserved.data()?.uid === uid) transaction.delete(reservation);
        });
      }
      return { success: true };
    } catch (error) {
      logger.error("Student management failed", {
        uid,
        action,
        code: error.code || "unknown",
      });
      throw new HttpsError(
        "failed-precondition",
        "Thao tác chưa hoàn tất. Vui lòng tải lại danh sách rồi thử lại.",
      );
    }
  }

  return { createStudents, manageStudent };
}

module.exports = { makeAccountService };
