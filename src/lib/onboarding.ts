"use client";

// Whether a signed-in student has been through the welcome flow. The flag
// lives on the account (users/{uid}/meta/profile, through /api/profile) so it follows it to
// any device, with a local copy so it never flashes again on this one and
// still works offline.

import { accountFetch } from "./firebase";
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
    const res = await accountFetch("/api/profile");
    if (res.ok && ((await res.json()) as { onboarded?: boolean }).onboarded) {
      rememberHere(uid);
      return false;
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
    await accountFetch("/api/profile", { method: "POST", body: JSON.stringify(prefs) });
  } catch {
    // The local flag is enough to not show it again here.
  }
}
