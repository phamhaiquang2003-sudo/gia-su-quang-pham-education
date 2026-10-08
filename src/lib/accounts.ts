import { FirebaseError } from "firebase/app";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  EmailAuthProvider,
  getIdTokenResult,
  reauthenticateWithCredential,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type User,
} from "firebase/auth";
import { doc, getDoc, type Timestamp } from "firebase/firestore";
import { getFirebase } from "./firebase";
import { usernamePattern } from "./student-validation";
import { adminApiUrl } from "./admin-config";
import type { SchoolClassId } from "./school-classes";
export { usernamePattern } from "./student-validation";

export interface AccountProfile {
  uid: string;
  username: string;
  displayName: string;
  role: "student" | "admin";
  status: "active" | "disabled";
  classIds: string[];
  createdAt?: Timestamp;
}

export interface NewStudent {
  username: string;
  password: string;
  displayName: string;
  classId?: SchoolClassId | "";
}

export interface CreationResult {
  username: string;
  success: boolean;
  message: string;
}

export const studentManagementEnabled = Boolean(adminApiUrl);

async function callAdmin<T>(
  operation: "manageStudent",
  data: unknown,
): Promise<T> {
  if (!studentManagementEnabled)
    throw new Error("Dịch vụ quản trị online chưa được cấu hình.");
  const user = getFirebase().auth.currentUser;
  if (!user)
    throw new FirebaseError("functions/unauthenticated", "Vui lòng đăng nhập.");
  const token = await user.getIdToken();
  let response: Response;
  try {
    response = await fetch(`${adminApiUrl}/api/admin/${operation}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new Error(
      "Không kết nối được dịch vụ quản trị online. Vui lòng tải lại danh sách rồi thử lại.",
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "Dịch vụ quản trị online chưa sẵn sàng. Vui lòng thử lại sau.",
    );
  }
  if (!response.ok) {
    throw new FirebaseError(
      `functions/${result.error?.code || "internal"}`,
      result.error?.message || "Không thể thực hiện yêu cầu.",
    );
  }
  return result as T;
}

export function accountError(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/invalid-credential":
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-email":
        return "Tên đăng nhập hoặc mật khẩu không đúng.";
      case "auth/user-disabled":
        return "Tài khoản đã bị khóa. Vui lòng liên hệ giáo viên.";
      case "auth/weak-password":
      case "auth/password-does-not-meet-requirements":
        return "Mật khẩu mới chưa đáp ứng yêu cầu bảo mật. Hãy chọn mật khẩu mạnh hơn.";
      case "auth/requires-recent-login":
      case "auth/user-token-expired":
      case "auth/invalid-user-token":
        return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi thử lại.";
      case "auth/too-many-requests":
      case "functions/resource-exhausted":
        return "Có quá nhiều yêu cầu. Vui lòng thử lại sau.";
      case "auth/network-request-failed":
      case "unavailable":
      case "functions/unavailable":
        return "Không thể kết nối. Kiểm tra mạng rồi thử lại.";
      case "permission-denied":
      case "functions/permission-denied":
        return "Tài khoản chưa được cấp quyền hoặc đã bị khóa.";
      case "functions/unauthenticated":
        return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
      case "functions/not-found":
        return error.message;
      case "functions/invalid-argument":
      case "functions/failed-precondition":
        return error.message;
      case "functions/internal":
        return "Dịch vụ chưa xử lý được yêu cầu. Vui lòng thử lại sau.";
      default:
        return "Không thể thực hiện yêu cầu. Vui lòng thử lại hoặc liên hệ giáo viên.";
    }
  }
  return error instanceof Error
    ? error.message
    : "Có lỗi xảy ra. Vui lòng thử lại.";
}

export async function readAccount(user: User): Promise<AccountProfile> {
  const snapshot = await getDoc(doc(getFirebase().db, "users", user.uid));
  const profile = snapshot.data();
  if (!profile || !["student", "admin"].includes(profile.role)) {
    throw new Error("Tài khoản chưa được giáo viên cấp quyền vào hệ thống.");
  }
  if (profile.status !== "active") {
    throw new Error("Tài khoản đã bị khóa. Vui lòng liên hệ giáo viên.");
  }
  if (
    profile.role === "admin" &&
    (await getIdTokenResult(user)).claims.admin !== true
  ) {
    throw new Error("Tài khoản chưa được cấp quyền quản trị.");
  }
  return { ...profile, uid: user.uid } as AccountProfile;
}

export async function loginAccount(
  username: string,
  password: string,
  remember: boolean,
) {
  const { auth } = getFirebase();
  const normalized = username.trim().toLowerCase();
  if (!normalized.includes("@") && !usernamePattern.test(normalized)) {
    throw new Error("Tên đăng nhập hoặc mật khẩu không đúng.");
  }
  const email = normalized.includes("@")
    ? normalized
    : `${normalized}@${auth.app.options.projectId}.firebaseapp.com`;
  await setPersistence(
    auth,
    remember ? browserLocalPersistence : browserSessionPersistence,
  );
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  try {
    return await readAccount(user);
  } catch (error) {
    await signOut(auth);
    throw error;
  }
}

export function accountDestination(profile: AccountProfile) {
  return profile.role === "admin"
    ? `${import.meta.env.BASE_URL}quan-tri.html`
    : import.meta.env.BASE_URL;
}

export async function changeOwnPassword(
  uid: string,
  currentPassword: string,
  newPassword: string,
) {
  const { auth } = getFirebase();
  const user = auth.currentUser;
  if (!user || user.uid !== uid || !user.email)
    throw new Error("Phiên đăng nhập đã thay đổi. Vui lòng đăng nhập lại.");
  if (!currentPassword) throw new Error("Hãy nhập mật khẩu hiện tại.");
  if (newPassword.length < 8 || newPassword.length > 128)
    throw new Error("Mật khẩu mới cần từ 8 đến 128 ký tự.");
  try {
    await reauthenticateWithCredential(
      user,
      EmailAuthProvider.credential(user.email, currentPassword),
    );
  } catch (error) {
    if (
      error instanceof FirebaseError &&
      ["auth/invalid-credential", "auth/wrong-password"].includes(error.code)
    )
      throw new Error("Mật khẩu hiện tại không đúng.");
    throw error;
  }
  if (auth.currentUser?.uid !== user.uid)
    throw new Error("Phiên đăng nhập đã thay đổi. Vui lòng đăng nhập lại.");
  await updatePassword(user, newPassword);
}

export async function createStudents(students: NewStudent[]) {
  const { createStudentsOnline } = await import("./create-students-online");
  return createStudentsOnline(students);
}

export async function manageStudent(
  uid: string,
  action: "disable" | "enable" | "resetPassword" | "delete",
  password?: string,
) {
  await callAdmin("manageStudent", {
    uid,
    action,
    ...(password !== undefined ? { password } : {}),
  });
}
