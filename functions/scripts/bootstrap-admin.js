// Run on a trusted local machine using Application Default Credentials.
// Never bundle this file or service-account credentials into the website.
const { initializeLocalFirebase } = require("../local-firebase");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { usernamePattern } = require("../validation");

let database;

async function main() {
  const [uid, rawUsername, displayName] = process.argv.slice(2);
  const username = rawUsername?.trim().toLowerCase();
  if (
    !uid ||
    uid.includes("/") ||
    !usernamePattern.test(username || "") ||
    !displayName?.trim()
  ) {
    throw new Error(
      'Usage: npm run bootstrap-admin -- "AUTH_UID" "admin" "Phạm Hải Quang"',
    );
  }
  const app = initializeLocalFirebase();
  const auth = getAuth(app);
  const db = getFirestore(app);
  database = db;
  const user = await auth.getUser(uid);
  if (user.disabled)
    throw new Error(
      "Enable this account in Authentication before granting admin access.",
    );
  // Create the profile first; a partial run cannot grant backend access without a profile.
  await db.runTransaction(async (transaction) => {
    const reservation = db.doc(`usernames/${username}`);
    const profile = db.doc(`users/${uid}`);
    const [existingReservation, existingProfile] = await Promise.all([
      transaction.get(reservation),
      transaction.get(profile),
    ]);
    if (existingReservation.exists && existingReservation.data().uid !== uid)
      throw new Error("Username already belongs to another account.");
    if (existingProfile.exists && existingProfile.data().username !== username)
      throw new Error("Existing account has a different username.");
    transaction.set(reservation, { uid, state: "active" });
    transaction.set(profile, {
      username,
      displayName: displayName.trim(),
      role: "admin",
      status: "active",
      classIds: [],
      createdAt:
        existingProfile.data()?.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  await auth.setCustomUserClaims(uid, { ...user.customClaims, admin: true });
  console.log(
    "Admin profile and claim created. Sign out and sign in again to refresh your token.",
  );
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => database?.terminate());
