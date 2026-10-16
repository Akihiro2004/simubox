import "server-only";
import { getApps, initializeApp } from "firebase-admin/app";
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

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

const projectId = (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID);

/** Verified Firebase uid from `Authorization: Bearer <idToken>`, or null for guests / bad tokens. */
export async function verifyUser(req: Request): Promise<string | null> {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ") || !projectId) return null;
  try {
    if (!getApps().length) initializeApp({ projectId });
    const decoded = await getAuth().verifyIdToken(h.slice(7));
    return decoded.uid;
  } catch {
    return null;
  }
}
