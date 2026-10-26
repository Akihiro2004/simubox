import "server-only";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// ponytail: in-memory buckets are per Cloud Run instance; with max-instances
// > 1 limits are per instance. Move to Firestore/Redis counters if abused.
const buckets = new Map<string, { tokens: number; at: number }>();

/** Token bucket: `perMinute` refill, `burst` capacity. */
export function rateLimit(key: string, perMinute: number, burst: number): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: burst, at: now };
  b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 60_000) * perMinute);
  b.at = now;
  if (buckets.size > 10_000) buckets.clear();
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}

/**
 * The caller's address. Clients can put anything at the start of
 * X-Forwarded-For, so this takes the last entry, which Cloud Run's front end
 * appends. ponytail: assumes one trusted proxy; behind another load balancer, skip its hops too.
 */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || req.headers.get("x-real-ip") || "local";
}

// Same order as /api/config, so tokens are checked against the project the browser signs in to.
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
export const firebaseProjectId = projectId;
/**
 * The one Firebase Admin app. Google Cloud supplies its own identity; other
 * hosts (Vercel, Lambda...) pass the service-account key JSON in FIREBASE_SERVICE_ACCOUNT.
 */
export function adminApp() {
  if (getApps().length) return;
  const key = process.env.FIREBASE_SERVICE_ACCOUNT;
  initializeApp(key ? { projectId, credential: cert(JSON.parse(key)) } : { projectId });
}

/** False when this server has no Firebase project, so nobody can sign in. */
export const signInConfigured = Boolean(projectId);

/**
 * Verified Firebase uid from `Authorization: Bearer <idToken>`, or null for guests / bad tokens.
 * The first check downloads Google's signing keys; if that is slow (it once
 * held a question for ~a minute) the caller gets a guest answer after 2.5 s
 * instead of waiting. The keys keep downloading and later checks are instant.
 */
export async function verifyUser(req: Request, timeoutMs = 2500): Promise<string | null> {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ") || !projectId) return null;
  try {
    adminApp();
    const check = getAuth().verifyIdToken(h.slice(7)).then((d) => d.uid, () => null);
    return await Promise.race([check, new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))]);
  } catch {
    return null;
  }
}
