"use client";

// Firebase is optional: without a Firebase config the app runs as a guest-only
// demo and saves to this browser. The config comes from /api/config at runtime
// (so one build serves any project) and the SDKs load lazily.

import { create } from "zustand";
import type { Auth, User } from "firebase/auth";
import type { Firestore } from "firebase/firestore";

export interface AuthState {
  user: { uid: string; name: string | null; photo: string | null; email: string | null } | null;
  /** True once a Firebase config was found and the SDK initialised. */
  available: boolean;
  ready: boolean;
  error: string | null;
}
export const useAuth = create<AuthState>(() => ({ user: null, available: false, ready: false, error: null }));

let auth: Auth | null = null;
let db: Firestore | null = null;
let init: Promise<void> | null = null;
let current: User | null = null;

export function initFirebase(): Promise<void> {
  init ??= (async () => {
    const res = await fetch("/api/config");
    const { firebase: config } = (await res.json()) as { firebase: Record<string, string> | null };
    if (!config) {
      useAuth.setState({ ready: true, available: false });
      return;
    }
    const [{ initializeApp, getApps }, a, f] = await Promise.all([import("firebase/app"), import("firebase/auth"), import("firebase/firestore")]);
    const app = getApps()[0] ?? initializeApp(config);
    useAuth.setState({ available: true });
    auth = a.getAuth(app);
    db = f.getFirestore(app);
    a.onAuthStateChanged(auth, (u) => {
      current = u;
      useAuth.setState({ ready: true, user: u ? { uid: u.uid, name: u.displayName, photo: u.photoURL, email: u.email } : null });
    });
  })().catch((e) => {
    useAuth.setState({ ready: true, error: `Sign-in unavailable: ${String(e).slice(0, 120)}` });
  });
  return init;
}

export async function signIn() {
  await initFirebase();
  if (!auth) return;
  const a = await import("firebase/auth");
  try {
    useAuth.setState({ error: null });
    await a.signInWithPopup(auth, new a.GoogleAuthProvider());
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    const msg =
      code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request"
        ? null
        : code === "auth/unauthorized-domain"
          ? "This domain isn't authorized for sign-in yet (add it in Firebase Auth settings)."
          : code === "auth/operation-not-allowed"
            ? "Google sign-in isn't enabled for this Firebase project."
            : "Sign-in failed. Please try again.";
    useAuth.setState({ error: msg });
  }
}

export async function signOutUser() {
  if (!auth) return;
  const a = await import("firebase/auth");
  await a.signOut(auth);
}

/**
 * Fresh Firebase ID token for API calls, or null for guests. A token refresh
 * needs Google's servers; on a bad connection it gives up after 2.5 s so the
 * question still goes out (the server then treats it like a guest's).
 */
export async function idToken(): Promise<string | null> {
  if (!current) return null;
  try {
    return await Promise.race([current.getIdToken(), new Promise<null>((r) => setTimeout(() => r(null), 2500))]);
  } catch {
    return null;
  }
}

export async function firestore(): Promise<Firestore | null> {
  await initFirebase();
  return db;
}
