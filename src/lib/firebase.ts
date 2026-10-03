import { initializeApp, type FirebaseOptions } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { firebaseWebConfig } from "./firebase-config";

function readConfiguration(): FirebaseOptions | null {
  try {
    const config = import.meta.env.VITE_FIREBASE_CONFIG
      ? JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG)
      : firebaseWebConfig;
    if (
      !config ||
      typeof config.apiKey !== "string" ||
      !config.apiKey ||
      !(
        config.projectId === "phq-education" ||
        (import.meta.env.DEV &&
          import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true" &&
          config.projectId === "demo-phq-education")
      ) ||
      typeof config.authDomain !== "string" ||
      !config.authDomain ||
      typeof config.appId !== "string" ||
      !config.appId
    ) {
      return null;
    }
    return config;
  } catch {
    return null;
  }
}

const config = readConfiguration();
export const firebaseConfigured = Boolean(config);
export const configurationMessage =
  "Hệ thống chưa được cấu hình kết nối Firebase. Vui lòng liên hệ giáo viên để được hỗ trợ.";

function initializeServices() {
  if (!config) throw new Error(configurationMessage);
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (
    import.meta.env.DEV &&
    import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true"
  ) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
  return { auth, db };
}

let services: ReturnType<typeof initializeServices> | undefined;
export function getFirebase() {
  services ??= initializeServices();
  return services;
}
