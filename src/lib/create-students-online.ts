import { deleteApp, FirebaseError, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  deleteUser,
  getIdTokenResult,
  initializeAuth,
  inMemoryPersistence,
  signOut,
  type User,
} from "firebase/auth";
import {
  doc,
  getDocFromServer,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import type { CreationResult, NewStudent } from "./accounts";
import { getFirebase } from "./firebase";
import { normalizeStudents } from "./student-validation";

function creationError(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/email-already-in-use":
      case "already-exists":
        return "Tên đăng nhập đã tồn tại; đã bỏ qua.";
      case "auth/weak-password":
      case "auth/password-does-not-meet-requirements":
        return "Mật khẩu chưa đáp ứng chính sách Firebase.";
      case "permission-denied":
      case "unauthenticated":
        return "Chưa được cấp quyền tạo hồ sơ. Hãy đăng nhập lại hoặc kiểm tra quy tắc Firestore.";
      case "auth/too-many-requests":
      case "auth/quota-exceeded":
      case "resource-exhausted":
        return "Firebase đang giới hạn số yêu cầu. Vui lòng thử lại sau.";
      case "auth/operation-not-allowed":
        return "Firebase chưa cho phép tạo tài khoản Email/Mật khẩu.";
      case "auth/network-request-failed":
      case "unavailable":
      case "deadline-exceeded":
        return "Kết nối bị gián đoạn. Hãy tải lại danh sách để kiểm tra trước khi tạo lại.";
    }
  }
  return "Chưa tạo được tài khoản. Vui lòng thử lại hoặc kiểm tra kết nối Firebase.";
}

export async function createStudentsOnline(
  input: NewStudent[],
): Promise<CreationResult[]> {
  const students = normalizeStudents(input);
  const { auth, db } = getFirebase();
  const admin = auth.currentUser;
  if (!admin) throw new Error("Vui lòng đăng nhập tài khoản quản trị.");
  const [adminProfile, token] = await Promise.all([
    getDocFromServer(doc(db, "users", admin.uid)),
    getIdTokenResult(admin),
  ]);
  if (
    token.claims.admin !== true ||
    adminProfile.data()?.role !== "admin" ||
    adminProfile.data()?.status !== "active"
  ) {
    throw new Error(
      "Chỉ quản trị viên đang hoạt động được tạo tài khoản học sinh.",
    );
  }

  // This separate Auth instance never replaces the teacher's session. Student
  // credentials are kept in memory only, then discarded after provisioning.
  const secondaryApp = initializeApp(
    auth.app.options,
    `student-provisioning-${crypto.randomUUID()}`,
  );
  const secondaryAuth = initializeAuth(secondaryApp, {
    persistence: inMemoryPersistence,
  });
  const emulator = auth.emulatorConfig;
  if (emulator)
    connectAuthEmulator(
      secondaryAuth,
      `${emulator.protocol}://${emulator.host}:${emulator.port}`,
      { disableWarnings: true },
    );

  const results: CreationResult[] = [];
  try {
    for (const student of students) {
      let newUser: User | null = null;
      let message = "";
      try {
        if (auth.currentUser?.uid !== admin.uid)
          throw new FirebaseError(
            "unauthenticated",
            "Phiên quản trị đã thay đổi.",
          );
        const reservationRef = doc(db, "usernames", student.username);
        if ((await getDocFromServer(reservationRef)).exists())
          throw new FirebaseError(
            "already-exists",
            "Tên đăng nhập đã tồn tại.",
          );

        const credential = await createUserWithEmailAndPassword(
          secondaryAuth,
          `${student.username}@${auth.app.options.projectId}.firebaseapp.com`,
          student.password,
        );
        newUser = credential.user;
        const profileRef = doc(db, "users", newUser.uid);
        const uid = newUser.uid;
        try {
          await runTransaction(db, async (transaction) => {
            const [existingName, existingProfile] = await Promise.all([
              transaction.get(reservationRef),
              transaction.get(profileRef),
            ]);
            if (existingName.exists() || existingProfile.exists())
              throw new FirebaseError(
                "already-exists",
                "Tên đăng nhập đã tồn tại.",
              );
            transaction.set(profileRef, {
              username: student.username,
              displayName: student.displayName,
              role: "student",
              status: "active",
              classIds: [],
              createdBy: admin.uid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            transaction.set(reservationRef, {
              uid,
              state: "active",
              createdAt: serverTimestamp(),
            });
          });
          results.push({
            username: student.username,
            success: true,
            message: "Đã tạo tài khoản học sinh.",
          });
        } catch (error) {
          let canRollback =
            error instanceof FirebaseError &&
            [
              "permission-denied",
              "unauthenticated",
              "invalid-argument",
              "already-exists",
            ].includes(error.code);
          let committed = false;
          if (!canRollback) {
            try {
              const [profile, reservation] = await Promise.all([
                getDocFromServer(profileRef),
                getDocFromServer(reservationRef),
              ]);
              committed =
                profile.data()?.username === student.username &&
                profile.data()?.createdBy === admin.uid &&
                profile.data()?.role === "student" &&
                profile.data()?.status === "active" &&
                reservation.data()?.uid === uid;
              canRollback = !profile.exists();
            } catch {
              // Do not delete Auth when a lost response might hide a successful
              // Firestore commit. An unapproved Auth account has no data access.
            }
          }
          if (committed) {
            results.push({
              username: student.username,
              success: true,
              message: "Đã tạo tài khoản học sinh.",
            });
          } else {
            message = creationError(error);
            if (canRollback) {
              try {
                await deleteUser(newUser);
              } catch {
                message =
                  "Chưa hoàn tất cấp hồ sơ và dọn tài khoản. Hãy kiểm tra Authentication bằng công cụ quản trị trên máy.";
              }
            } else {
              message =
                "Chưa xác nhận được kết quả. Hãy tải lại danh sách để kiểm tra; nếu thiếu hồ sơ, kiểm tra tài khoản trong Authentication trước khi tạo lại.";
            }
            results.push({
              username: student.username,
              success: false,
              message,
            });
          }
        }
      } catch (error) {
        results.push({
          username: student.username,
          success: false,
          message: creationError(error),
        });
      } finally {
        await signOut(secondaryAuth).catch(() => {});
      }
    }
  } finally {
    await deleteApp(secondaryApp);
  }
  return results;
}
