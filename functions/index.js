const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { makeAccountService } = require("./account-service");

const app = initializeApp();
const projectId =
  app.options.projectId ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) throw new Error("Firebase project ID is required");
const service = makeAccountService({
  auth: getAuth(app),
  db: getFirestore(app),
  projectId,
  logger,
});

const options = {
  region: "asia-southeast1",
  maxInstances: 2,
  concurrency: 10,
  timeoutSeconds: 300,
  memory: "256MiB",
};

exports.createStudents = onCall(options, service.createStudents);
exports.manageStudent = onCall(options, service.manageStudent);
