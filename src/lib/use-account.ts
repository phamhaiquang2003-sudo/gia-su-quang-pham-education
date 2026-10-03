import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { accountError, readAccount, type AccountProfile } from "./accounts";
import {
  configurationMessage,
  firebaseConfigured,
  getFirebase,
} from "./firebase";

export function useAccount() {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured);
  const [error, setError] = useState(
    firebaseConfigured ? "" : configurationMessage,
  );

  useEffect(() => {
    if (!firebaseConfigured) return;
    const { auth, db } = getFirebase();
    let stopProfile: (() => void) | undefined;
    let generation = 0;
    const stopAuth = onAuthStateChanged(auth, async (user) => {
      const current = ++generation;
      stopProfile?.();
      setProfile(null);
      setError("");
      setLoading(Boolean(user));
      if (!user) return;
      try {
        const account = await readAccount(user);
        if (current !== generation) return;
        setProfile(account);
        stopProfile = onSnapshot(
          doc(db, "users", user.uid),
          (snapshot) => {
            if (current !== generation) return;
            const updated = snapshot.data();
            if (
              !updated ||
              updated.status !== "active" ||
              updated.role !== account.role
            ) {
              setProfile(null);
              setError(
                "Tài khoản không còn quyền truy cập. Vui lòng liên hệ giáo viên.",
              );
            } else {
              setProfile({ ...updated, uid: user.uid } as AccountProfile);
            }
          },
          (failure) => {
            if (current !== generation) return;
            setProfile(null);
            setError(accountError(failure));
          },
        );
      } catch (failure) {
        if (current !== generation) return;
        setError(accountError(failure));
      } finally {
        if (current === generation) setLoading(false);
      }
    });
    return () => {
      generation++;
      stopProfile?.();
      stopAuth();
    };
  }, []);

  async function logout() {
    await signOut(getFirebase().auth);
    window.location.assign(`${import.meta.env.BASE_URL}dang-nhap.html`);
  }

  return { profile, loading, error, logout };
}
