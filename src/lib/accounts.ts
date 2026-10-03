import { FirebaseError } from "firebase/app";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getIdTokenResult,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, type Timestamp } from "firebase/firestore";
import { getFirebase } from "./firebase";
import { usernamePattern } from "./student-validation";
import { adminApiUrl } from "./admin-config";
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
}

export interface CreationResult {
  username: string;
  success: boolean;
  message: string;
}

export const localAdminEnabled =
  import.meta.env.DEV && import.meta.env.VITE_LOCAL_ADMIN === "true";
export const studentDeletionEnabled = localAdminEnabled || Boolean(adminApiUrl);

async function callAdmin<T>(
  operation: "createStudents" | "manageStudent",
  data: unknown,
  online = false,
): Promise<T> {
  if (!localAdminEnabled && !online) {
    throw new Error(
      "Mở quan-tri-mien-phi.bat trên máy tính để quản lý tài khoản bằng gói Spark.",
    );
  }
  const user = getFirebase().auth.currentUser;
  if (!user)
    throw new FirebaseError("functions/unauthenticated", "Vui lòng đăng nhập.");
  const token = await user.getIdToken();
  let response: Response;
  try {
    response = await fetch(
      `${online ? adminApiUrl : ""}/api/admin/${operation}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(online ? 60_000 : 300_000),
      },
    );
  } catch {
    throw new Error(
      online
        ? "Không kết nối được dịch vụ quản trị online. Vui lòng tải lại danh sách rồi thử lại."
        : "Không kết nối được công cụ quản trị trên máy. Hãy mở lại quan-tri-mien-phi.bat.",
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      online
        ? "Dịch vụ quản trị online chưa sẵn sàng. Vui lòng thử lại sau."
        : "Công cụ quản trị chưa sẵn sàng. Hãy mở lại quan-tri-mien-phi.bat.",
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

export async function createStudents(students: NewStudent[]) {
  if (!localAdminEnabled) {
    const { createStudentsOnline } = await import("./create-students-online");
    return createStudentsOnline(students);
  }
  return (
    await callAdmin<{ results: CreationResult[] }>("createStudents", {
      students,
    })
  ).results;
}

export async function manageStudent(
  uid: string,
  action: "disable" | "enable" | "resetPassword" | "delete",
  password?: string,
) {
  await callAdmin(
    "manageStudent",
    {
      uid,
      action,
      ...(password !== undefined ? { password } : {}),
    },
    !localAdminEnabled && action === "delete" && Boolean(adminApiUrl),
  );
}
