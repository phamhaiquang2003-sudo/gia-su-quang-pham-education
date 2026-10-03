const fs = require("node:fs");
const {
  initializeApp,
  applicationDefault,
  cert,
} = require("firebase-admin/app");

function initializeLocalFirebase() {
  const projectId = process.env.GCLOUD_PROJECT || "phq-education";
  const authEmulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
  const dbEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  if (authEmulator !== dbEmulator)
    throw new Error("Auth and Firestore emulators must be enabled together.");
  const emulator = authEmulator && dbEmulator;
  if (
    projectId !== "phq-education" &&
    !(projectId === "demo-phq-education" && emulator)
  ) {
    throw new Error("Unexpected Firebase project ID.");
  }
  let credential;
  if (!emulator) {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const key = JSON.parse(
        fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"),
      );
      if (key.type !== "service_account" || key.project_id !== projectId) {
        throw new Error("Chọn khóa Service Account của dự án phq-education.");
      }
      credential = cert(key);
    } else {
      credential = applicationDefault();
    }
  }
  return initializeApp({ projectId, ...(credential ? { credential } : {}) });
}

module.exports = { initializeLocalFirebase };
