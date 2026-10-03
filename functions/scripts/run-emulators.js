const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// The Java emulator can misread non-ASCII Windows paths. Stage the test code
// in a temporary directory and link installed dependencies instead of copying them.
const source = path.resolve(__dirname, "..");
const root = path.resolve(source, "..");
const base = process.env.PHQ_EMULATOR_TEMP || os.tmpdir();
fs.mkdirSync(base, { recursive: true });
const temporary = fs.mkdtempSync(path.join(base, "phq-emulator-"));
const staged = path.join(temporary, "functions");
const includeFunctions = process.argv.includes("--functions");
const serve = process.argv.includes("--serve");
try {
  fs.cpSync(source, staged, {
    recursive: true,
    filter: (file) =>
      !file.includes(`${path.sep}node_modules`) && !file.endsWith(".log"),
  });
  fs.symlinkSync(
    path.join(source, "node_modules"),
    path.join(staged, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  fs.copyFileSync(
    path.join(root, "firestore.rules"),
    path.join(temporary, "firestore.rules"),
  );
  const config = JSON.parse(
    fs.readFileSync(path.join(root, "firebase.json"), "utf8"),
  );
  fs.writeFileSync(
    path.join(temporary, "firebase.json"),
    JSON.stringify(config),
  );
  const cli = require.resolve("firebase-tools/lib/bin/firebase.js");
  const command =
    process.argv.slice(2).find((argument) => !argument.startsWith("--")) ||
    "npm test";
  const result = spawnSync(
    process.execPath,
    [
      cli,
      "--config",
      path.join(temporary, "firebase.json"),
      "--project",
      "demo-phq-education",
      serve ? "emulators:start" : "emulators:exec",
      "--only",
      includeFunctions ? "auth,firestore,functions" : "auth,firestore",
      ...(serve ? [] : [command]),
    ],
    { cwd: staged, stdio: "inherit", env: process.env },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
