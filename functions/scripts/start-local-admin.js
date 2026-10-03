const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { createInterface } = require("node:readline/promises");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { initializeLocalFirebase } = require("../local-firebase");
const { makeAccountService } = require("../account-service");
const { createLocalAdminServer } = require("../local-server");

async function main() {
  const root = path.resolve(__dirname, "../..");
  const input = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    console.log("PHQ Education - Quan tri mien phi tren Firebase Spark");
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const filename = await input.question(
        "Duong dan tep JSON Service Account da tai ve (giu tren may): ",
      );
      process.env.GOOGLE_APPLICATION_CREDENTIALS = filename
        .trim()
        .replace(/^"|"$/g, "");
      if (!process.env.GOOGLE_APPLICATION_CREDENTIALS)
        throw new Error("Can chon tep Service Account de quan ly tai khoan.");
    }
    // Validate the credential's project before running the bootstrap helper.
    const app = initializeLocalFirebase();
    const uid = (
      await input.question(
        "UID tai khoan giao vien (bo trong neu da cap quyen quan tri): ",
      )
    ).trim();
    if (uid) {
      const result = spawnSync(
        process.execPath,
        [
          path.join(__dirname, "bootstrap-admin.js"),
          uid,
          "admin",
          "Phạm Hải Quang",
        ],
        { stdio: "inherit", env: process.env },
      );
      if (result.status !== 0)
        throw new Error(
          "Chua cap duoc quyen quan tri. Kiem tra UID va tep Service Account.",
        );
    }
    const auth = getAuth(app);
    const db = getFirestore(app);
    const service = makeAccountService({
      auth,
      db,
      projectId: app.options.projectId,
      logger: { error: (message, detail) => console.error(message, detail) },
    });
    const server = createLocalAdminServer({ auth, service });
    server.requestTimeout = 300_000;
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(8787, "127.0.0.1", resolve);
    });
    const vite = spawn(
      process.execPath,
      [
        path.join(root, "node_modules/vite/bin/vite.js"),
        "--host",
        "127.0.0.1",
        "--port",
        "5173",
        "--strictPort",
        "--open",
        "/quan-tri.html",
      ],
      {
        cwd: root,
        stdio: "inherit",
        env: {
          ...process.env,
          VITE_LOCAL_ADMIN: "true",
          VITE_USE_FIREBASE_EMULATORS: "false",
        },
      },
    );
    console.log("Quan tri: http://127.0.0.1:5173/quan-tri.html");
    console.log(
      "Dang nhap bang tai khoan giao vien. Giu cua so nay mo khi quan ly hoc sinh.",
    );
    let stopping = false;
    function stop(code = 0) {
      if (stopping) return;
      stopping = true;
      vite.kill();
      server.close();
      void db.terminate().finally(() => process.exit(code));
    }
    vite.once("error", () => stop(1));
    vite.once("exit", (code) => stop(code || 0));
    process.once("SIGINT", () => stop());
    process.once("SIGTERM", () => stop());
  } finally {
    input.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
