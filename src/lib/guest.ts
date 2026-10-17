"use client";

// Guests get one free question; after that SimuBox asks them to sign in
// (only when sign-in exists at all, so a server without Firebase still works).
// ponytail: counted in this browser, so clearing site data resets it; the
// plan route's per-IP rate limit still caps abuse server-side.

export const GUEST_FREE_QUESTIONS = 1;
const KEY = "simubox-guest-questions";

export function guestQuestionsUsed(): number {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}

export function countGuestQuestion() {
  try {
    localStorage.setItem(KEY, String(guestQuestionsUsed() + 1));
  } catch {
    // Private mode: the question still goes through.
  }
}

/** True when this question needs a signed-in student. */
export function mustSignIn(signedIn: boolean, signInAvailable: boolean, used: number): boolean {
  return !signedIn && signInAvailable && used >= GUEST_FREE_QUESTIONS;
}
