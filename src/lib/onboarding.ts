"use client";

// Whether a signed-in student has been through the welcome flow. The flag
// lives in Firestore (users/{uid}/meta/profile) so it follows the account to
// any device, with a local copy so it never flashes again on this one and
// still works offline.

import { firestore } from "./firebase";
import type { Settings } from "./store";

export type OnboardingPrefs = Pick<Settings, "gradeBand" | "language" | "voice">;

const localKey = (uid: string) => `simubox-onboarded:${uid}`;

function seenHere(uid: string): boolean {
  try {
    return localStorage.getItem(localKey(uid)) === "1";
  } catch {
    return false;
  }
}

function rememberHere(uid: string) {
  try {
    localStorage.setItem(localKey(uid), "1");
  } catch {
    // Private mode: the Firestore flag still covers it.
  }
}

/** True the first time this account signs in (on any device). */
export async function needsOnboarding(uid: string): Promise<boolean> {
  if (seenHere(uid)) return false;
  try {
    const db = await firestore();
    if (db) {
      const f = await import("firebase/firestore");
      const snap = await f.getDoc(f.doc(db, "users", uid, "meta", "profile"));
      if (snap.exists() && typeof snap.data().onboardedAt === "number") {
        rememberHere(uid);
        return false;
      }
    }
  } catch {
    // Offline or blocked: decide from this device alone.
  }
  return true;
}

/** Saves that the welcome is done, with the choices made in it. */
export async function markOnboarded(uid: string, prefs: OnboardingPrefs): Promise<void> {
  rememberHere(uid);
  try {
    const db = await firestore();
    if (!db) return;
    const f = await import("firebase/firestore");
    await f.setDoc(f.doc(db, "users", uid, "meta", "profile"), { onboardedAt: Date.now(), ...prefs }, { merge: true });
  } catch {
    // The local flag is enough to not show it again here.
  }
}
