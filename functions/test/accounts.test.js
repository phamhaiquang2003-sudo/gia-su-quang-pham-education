const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} = require("firebase/firestore");
const { makeAccountService } = require("../account-service");

const projectId = "demo-phq-education";
const adminUid = "teacher-admin";
const adminRequest = { auth: { uid: adminUid, token: { admin: true } } };
const studentInput = (username = "hs001") => ({
  username,
  password: "Initial-password-123",
  displayName: "Nguyễn Văn A",
});
let app, auth, db, service, environment;

before(async () => {
  if (
    !process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.FIREBASE_AUTH_EMULATOR_HOST
  ) {
    throw new Error(
      "Run these tests with Firebase emulators: npm run test:emulators",
    );
  }
  app = initializeApp({ projectId }, "account-tests");
  auth = getAuth(app);
  db = getFirestore(app);
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: fs.readFileSync(
        path.join(__dirname, "../../firestore.rules"),
        "utf8",
      ),
    },
  });
  service = makeAccountService({ auth, db, projectId, logger: { error() {} } });
});

beforeEach(async () => {
  await environment.clearFirestore();
  const list = await auth.listUsers(1000);
  if (list.users.length)
    await auth.deleteUsers(list.users.map((user) => user.uid));
  await auth.createUser({
    uid: adminUid,
    email: `admin@${projectId}.firebaseapp.com`,
    password: "Admin-password-123",
  });
  await auth.setCustomUserClaims(adminUid, { admin: true });
  await db.doc(`users/${adminUid}`).set({
    username: "admin",
    displayName: "Giáo viên",
    role: "admin",
    status: "active",
    classIds: [],
  });
});

after(async () => {
  await environment?.cleanup();
  await db?.terminate();
  if (app) await deleteApp(app);
});

test("only an active admin with a server-issued claim can create or manage accounts", async () => {
  const data = { students: [studentInput()] };
  await assert.rejects(service.createStudents({ data }), {
    code: "unauthenticated",
  });
  await assert.rejects(
    service.createStudents({ auth: { uid: adminUid, token: {} }, data }),
    { code: "permission-denied" },
  );
  await db.doc(`users/${adminUid}`).update({ status: "disabled" });
  await assert.rejects(service.createStudents({ ...adminRequest, data }), {
    code: "permission-denied",
  });
  await assert.rejects(
    service.manageStudent({
      auth: { uid: "student", token: {} },
      data: { uid: "someone", action: "delete" },
    }),
    { code: "permission-denied" },
  );
  assert.equal((await auth.listUsers()).users.length, 1);
});

test("provisioning creates Auth and a UID-linked profile without passwords or client-selected roles", async () => {
  const response = await service.createStudents({
    ...adminRequest,
    data: {
      students: [
        { ...studentInput("HS001"), role: "admin", status: "disabled" },
      ],
    },
  });
  assert.equal(response.results[0].success, true);
  const user = await auth.getUserByEmail(`hs001@${projectId}.firebaseapp.com`);
  const profile = (await db.doc(`users/${user.uid}`).get()).data();
  assert.equal(profile.username, "hs001");
  assert.equal(profile.role, "student");
  assert.equal(profile.status, "active");
  assert.equal(profile.password, undefined);
  assert.equal(profile.createdBy, adminUid);
  assert.equal((await db.doc("usernames/hs001").get()).data().uid, user.uid);
  assert.equal(JSON.stringify(response).includes("Initial-password"), false);
});

test("concurrent duplicate usernames create exactly one Auth account and preserve the winning reservation", async () => {
  const request = { ...adminRequest, data: { students: [studentInput()] } };
  const responses = await Promise.all([
    service.createStudents(request),
    service.createStudents(request),
  ]);
  assert.equal(
    responses
      .flatMap((response) => response.results)
      .filter((result) => result.success).length,
    1,
  );
  const user = await auth.getUserByEmail(`hs001@${projectId}.firebaseapp.com`);
  assert.equal((await db.doc("usernames/hs001").get()).data().uid, user.uid);
  assert.equal((await auth.listUsers()).users.length, 2);
});

test("bulk reports individual duplicates and validates the entire input before creating accounts", async () => {
  await service.createStudents({
    ...adminRequest,
    data: { students: [studentInput()] },
  });
  const response = await service.createStudents({
    ...adminRequest,
    data: { students: [studentInput(), studentInput("hs002")] },
  });
  assert.deepEqual(
    response.results.map((result) => result.success),
    [false, true],
  );
  await assert.rejects(
    service.createStudents({
      ...adminRequest,
      data: {
        students: [
          studentInput("hs003"),
          { ...studentInput("hs004"), password: "short" },
        ],
      },
    }),
    { code: "invalid-argument" },
  );
  await assert.rejects(
    auth.getUserByEmail(`hs003@${projectId}.firebaseapp.com`),
    { code: "auth/user-not-found" },
  );
  await assert.rejects(
    service.createStudents({
      ...adminRequest,
      data: {
        students: Array.from({ length: 51 }, (_, index) =>
          studentInput(`hs${index}`),
        ),
      },
    }),
    { code: "invalid-argument" },
  );
});

test("a failed Firestore finalization rolls back Auth and the username reservation", async () => {
  let calls = 0;
  const brokenDb = {
    doc: (...args) => db.doc(...args),
    runTransaction: (...args) => {
      if (++calls === 2)
        return Promise.reject(new Error("Simulated Firestore failure"));
      return db.runTransaction(...args);
    },
  };
  const brokenService = makeAccountService({
    auth,
    db: brokenDb,
    projectId,
    logger: { error() {} },
  });
  const response = await brokenService.createStudents({
    ...adminRequest,
    data: { students: [studentInput()] },
  });
  assert.equal(response.results[0].success, false);
  await assert.rejects(
    auth.getUserByEmail(`hs001@${projectId}.firebaseapp.com`),
    { code: "auth/user-not-found" },
  );
  assert.equal((await db.doc("usernames/hs001").get()).exists, false);
  assert.equal((await db.collection("users").get()).size, 1);
});

test("students can only read their own profile; no client can grant itself roles or modify account data", async () => {
  await service.createStudents({
    ...adminRequest,
    data: { students: [studentInput(), studentInput("hs002")] },
  });
  const first = await auth.getUserByEmail(`hs001@${projectId}.firebaseapp.com`);
  const second = await auth.getUserByEmail(
    `hs002@${projectId}.firebaseapp.com`,
  );
  const client = environment.authenticatedContext(first.uid).firestore();
  await assertSucceeds(getDoc(doc(client, "users", first.uid)));
  await assertFails(getDoc(doc(client, "users", second.uid)));
  await assertFails(getDocs(collection(client, "users")));
  await assertFails(
    updateDoc(doc(client, "users", first.uid), { role: "admin" }),
  );
  await assertFails(
    setDoc(doc(client, "usernames", "newuser"), { uid: first.uid }),
  );
  await assertFails(deleteDoc(doc(client, "users", first.uid)));
  const anonymous = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anonymous, "users", first.uid)));
  const unapproved = environment
    .authenticatedContext("self-registered")
    .firestore();
  await assertFails(getDocs(collection(unapproved, "users")));
  await assertFails(
    setDoc(doc(unapproved, "users", "self-registered"), {
      role: "student",
      status: "active",
    }),
  );
});

test("admin reads require both claim and active profile, and edits remain denied", async () => {
  const client = environment
    .authenticatedContext(adminUid, { admin: true })
    .firestore();
  await assertSucceeds(getDocs(collection(client, "users")));
  await assertFails(
    updateDoc(doc(client, "users", adminUid), { status: "disabled" }),
  );
  const noClaim = environment.authenticatedContext(adminUid).firestore();
  await assertFails(getDocs(collection(noClaim, "users")));
  const forged = environment
    .authenticatedContext("forged-admin", { admin: true })
    .firestore();
  await assertFails(getDocs(collection(forged, "users")));
  await db.doc(`users/${adminUid}`).update({ status: "disabled" });
  await assertFails(getDocs(collection(client, "users")));
});

const onlineProfile = (username, extra = {}) => ({
  username,
  displayName: "Học sinh trực tuyến",
  role: "student",
  status: "active",
  classIds: [],
  createdBy: adminUid,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...extra,
});
function provisionOnline(
  client,
  uid,
  username,
  profile = {},
  reservation = {},
) {
  const batch = writeBatch(client);
  batch.set(doc(client, "users", uid), onlineProfile(username, profile));
  batch.set(doc(client, "usernames", username), {
    uid,
    state: "active",
    createdAt: serverTimestamp(),
    ...reservation,
  });
  return batch.commit();
}

test("online provisioning requires an active claimed admin and creates an atomic profile/reservation pair", async () => {
  const adminClient = environment
    .authenticatedContext(adminUid, { admin: true })
    .firestore();
  await assertSucceeds(provisionOnline(adminClient, "online-one", "online01"));
  assert.equal((await db.doc("users/online-one").get()).data().role, "student");
  assert.equal(
    (await db.doc("usernames/online01").get()).data().uid,
    "online-one",
  );
  await assertFails(
    setDoc(
      doc(adminClient, "users", "profile-only"),
      onlineProfile("profileonly"),
    ),
  );
  await assertFails(
    setDoc(doc(adminClient, "usernames", "nameonly"), {
      uid: "name-only",
      state: "active",
      createdAt: serverTimestamp(),
    }),
  );
  await assertFails(
    provisionOnline(
      adminClient,
      "mismatched",
      "mismatch01",
      {},
      { uid: "wrong-uid" },
    ),
  );
  await assertFails(provisionOnline(adminClient, "duplicate", "online01"));
  await assertFails(provisionOnline(adminClient, "online-one", "replaced01"));
  assert.equal((await db.doc("users/duplicate").get()).exists, false);
  assert.equal((await db.doc("usernames/replaced01").get()).exists, false);

  for (const client of [
    environment.unauthenticatedContext().firestore(),
    environment.authenticatedContext("self-registered").firestore(),
    environment.authenticatedContext("online-one").firestore(),
    environment.authenticatedContext(adminUid).firestore(),
    environment.authenticatedContext("no-profile", { admin: true }).firestore(),
  ]) {
    await assertFails(
      provisionOnline(client, "not-authorized", "unauthorized01"),
    );
    await assertFails(getDoc(doc(client, "usernames", "online01")));
  }
  await db.doc(`users/${adminUid}`).update({ status: "disabled" });
  await assertFails(
    provisionOnline(adminClient, "disabled-admin-student", "blocked01"),
  );
});

test("online provisioning restricts role, status, initial classes, creator, timestamps and stored fields", async () => {
  const client = environment
    .authenticatedContext(adminUid, { admin: true })
    .firestore();
  const invalidProfiles = [
    { role: "admin" },
    { status: "disabled" },
    { classIds: ["class-one"] },
    { createdBy: "someone-else" },
    { createdAt: new Date(0) },
    { updatedAt: new Date(0) },
    { displayName: "" },
    { displayName: "x".repeat(101) },
    { password: "Must-never-be-stored" },
    { username: "Uppercase" },
  ];
  for (let index = 0; index < invalidProfiles.length; index++) {
    await assertFails(
      provisionOnline(
        client,
        `invalid-${index}`,
        `invalid${index}`,
        invalidProfiles[index],
      ),
    );
  }
  await assertFails(
    provisionOnline(
      client,
      "invalid-reservation",
      "invalidname",
      {},
      { extra: true },
    ),
  );
  await assertFails(
    provisionOnline(
      client,
      "inactive-reservation",
      "inactivename",
      {},
      { state: "pending" },
    ),
  );
  await assertSucceeds(provisionOnline(client, "valid-online", "validonline"));
  await assertFails(
    updateDoc(doc(client, "users", "valid-online"), { displayName: "Changed" }),
  );
  await assertFails(deleteDoc(doc(client, "users", "valid-online")));
  await assertFails(
    updateDoc(doc(client, "usernames", "validonline"), { uid: "changed" }),
  );
  await assertFails(deleteDoc(doc(client, "usernames", "validonline")));
});

test("lock, unlock, password reset and deletion update Auth and Firestore; admins cannot be deleted", async () => {
  await service.createStudents({
    ...adminRequest,
    data: { students: [studentInput()] },
  });
  const { uid } = await auth.getUserByEmail(
    `hs001@${projectId}.firebaseapp.com`,
  );
  const perform = (action, extra = {}) =>
    service.manageStudent({ ...adminRequest, data: { uid, action, ...extra } });
  await perform("disable");
  assert.equal((await auth.getUser(uid)).disabled, true);
  assert.equal((await db.doc(`users/${uid}`).get()).data().status, "disabled");
  await perform("enable");
  assert.equal((await auth.getUser(uid)).disabled, false);
  assert.equal((await db.doc(`users/${uid}`).get()).data().status, "active");
  await perform("resetPassword", { password: "Replacement-password-456" });
  const base = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`;
  const login = (password) =>
    fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `hs001@${projectId}.firebaseapp.com`,
        password,
        returnSecureToken: true,
      }),
    });
  assert.equal((await login("Initial-password-123")).ok, false);
  assert.equal((await login("Replacement-password-456")).ok, true);
  await assert.rejects(
    service.manageStudent({
      ...adminRequest,
      data: { uid: adminUid, action: "delete" },
    }),
    { code: "permission-denied" },
  );
  await perform("delete");
  await assert.rejects(auth.getUser(uid), { code: "auth/user-not-found" });
  assert.equal((await db.doc(`users/${uid}`).get()).exists, false);
  assert.equal((await db.doc("usernames/hs001").get()).exists, false);
});
