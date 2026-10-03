const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { initializeLocalFirebase } = require("../local-firebase");

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("local admin refuses a credential file from a different Firebase project before initializing SDK access", () => {
  const directory = fs.mkdtempSync(
    path.join(process.env.PHQ_EMULATOR_TEMP || os.tmpdir(), "phq-config-test-"),
  );
  const filename = path.join(directory, "wrong-project.json");
  fs.writeFileSync(
    filename,
    JSON.stringify({ type: "service_account", project_id: "other-project" }),
  );
  try {
    withEnvironment(
      {
        GCLOUD_PROJECT: "phq-education",
        FIREBASE_AUTH_EMULATOR_HOST: undefined,
        FIRESTORE_EMULATOR_HOST: undefined,
        GOOGLE_APPLICATION_CREDENTIALS: filename,
      },
      () => {
        assert.throws(initializeLocalFirebase, /phq-education/);
      },
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("local admin refuses mixed production/emulator targets and unexpected project IDs", () => {
  withEnvironment(
    {
      GCLOUD_PROJECT: "demo-phq-education",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      FIRESTORE_EMULATOR_HOST: undefined,
    },
    () => {
      assert.throws(initializeLocalFirebase, /enabled together/);
    },
  );
  withEnvironment(
    {
      GCLOUD_PROJECT: "other-project",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
    },
    () => {
      assert.throws(initializeLocalFirebase, /Unexpected Firebase project/);
    },
  );
});
