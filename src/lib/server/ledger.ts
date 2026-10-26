import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getFirestore } from "firebase-admin/firestore";
import { freshAccount, readAccount, settleOrder, type Account } from "../builder/economy";
import { GUEST_CREDITS, SIGNUP_BONUS } from "../credits";
import { adminApp, clientIp, firebaseProjectId, signInConfigured, verifyUser } from "./guard";

// Server-side credit accounts. Every charge and grant runs as one atomic
// read-modify-write, so a balance can't be spent twice or go below zero.
//   Whenever Firebase is set up (any host, serverless included): Firestore `credits/{accountId}`,
//     closed to browsers by firestore.rules; only this server writes it.
//     On Google Cloud the runtime identity is used; elsewhere (Vercel, Lambda...)
//     set FIREBASE_SERVICE_ACCOUNT to the service-account key JSON.
//     Locally, run `gcloud auth application-default login` once (or set FIREBASE_SERVICE_ACCOUNT).
//   No Firebase project, or CREDITS_STORE=file: a JSON file in .data/ (gitignored).
// ponytail: the file store locks per process; it is for one local server, never
// serverless, where the disk is read-only or wiped between calls.

export interface Who {
  id: string;
  /** Guests can spend their free lesson but must sign in to buy or unlock. */
  signedIn: boolean;
}

/** Signed-in students by uid; guests share one account per network; a server without sign-in has one local account. */
export async function whoIs(req: Request): Promise<Who> {
  // Longer than the plan route's usual wait: charging the wrong account is worse than a slow first check.
  const uid = req.headers.get("authorization") ? await verifyUser(req, 15_000) : null;
  if (uid) return { id: `u:${uid}`, signedIn: true };
  if (!signInConfigured) return { id: "local", signedIn: true };
  return { id: `guest:${clientIp(req)}`, signedIn: false };
}

const starting = (id: string) => (id.startsWith("guest:") ? freshAccount(GUEST_CREDITS, "Free guest lesson") : freshAccount(SIGNUP_BONUS, "Welcome bonus"));

type Change<T> = (a: Account) => { account: Account; out: T };

const useFirestore = process.env.CREDITS_STORE ? process.env.CREDITS_STORE === "firestore" : signInConfigured || process.env.NODE_ENV === "production";

/** The balance database can't be reached; routes answer 503 instead of crashing. */
export class StoreUnavailable extends Error {}

export const storeDown = () =>
  Response.json({ error: "Your credit balance can't be loaded right now. Please try again in a minute.", code: "store_unavailable" }, { status: 503 });

/** Runs a route handler, answering 503 when the balance database is down. */
export async function orStoreDown(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof StoreUnavailable) return storeDown();
    throw e;
  }
}

/** Logs why Firestore failed, with the fix, once per kind of failure. */
const reported = new Set<string>();
function reportStoreError(e: unknown) {
  const code = (e as { code?: number | string }).code;
  const message = String((e as Error).message ?? e).slice(0, 300);
  const project = firebaseProjectId ?? "(no FIREBASE_PROJECT_ID set)";
  const fix =
    code === 7 || /PERMISSION_DENIED|permission/i.test(message)
      ? `give this server's service account the "Cloud Datastore User" role (roles/datastore.user) in project ${project}`
      : code === 5 || /NOT_FOUND|does not exist/i.test(message)
        ? `create the Firestore database (Native mode) in project ${project}`
        : /default credentials|credential/i.test(message)
          ? "run `gcloud auth application-default login` (local) or set FIREBASE_SERVICE_ACCOUNT"
          : "check that Firestore is enabled and reachable";
  const key = `${code}:${fix}`;
  if (!reported.has(key)) console.error(JSON.stringify({ event: "credits_store_error", project, code, message, fix }));
  reported.add(key);
}

/** Firestore rejects `undefined` fields (e.g. an order's unset last4); drop them as the file store does. */
export const firestoreSafe = (account: Account): Account => JSON.parse(JSON.stringify(account));

async function firestoreTransact<T>(id: string, change: Change<T>): Promise<T> {
  adminApp();
  const db = getFirestore();
  const ref = db.collection("credits").doc(id);
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const { account, out } = change(readAccount(snap.data()) ?? starting(id));
    t.set(ref, firestoreSafe(account));
    return out;
  });
}

let queue: Promise<unknown> = Promise.resolve();

function fileTransact<T>(id: string, change: Change<T>): Promise<T> {
  const file = process.env.CREDITS_FILE || path.join(process.cwd(), ".data", "credits.json");
  const run = queue.then(async () => {
    const all: Record<string, unknown> = await readFile(/*turbopackIgnore: true*/ file, "utf8").then(JSON.parse, () => ({}));
    const { account, out } = change(readAccount(all[id]) ?? starting(id));
    all[id] = account;
    await mkdir(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
    await writeFile(/*turbopackIgnore: true*/ file, JSON.stringify(all));
    return out;
  });
  queue = run.catch(() => {});
  return run;
}

export async function transact<T>(id: string, change: Change<T>): Promise<T> {
  if (!useFirestore) return fileTransact(id, change);
  try {
    return await firestoreTransact(id, change);
  } catch (e) {
    reportStoreError(e);
    throw new StoreUnavailable(String(e));
  }
}

export const getAccount = (id: string) => transact(id, (a) => ({ account: a, out: a }));

/** Credits an order the real gateway confirmed as paid; repeat calls change nothing. */
export async function grantPaidOrder(accountId: string, orderId: string) {
  const r = await transact(accountId, (acc) => {
    const s = settleOrder(acc, orderId, { ok: true, method: "creem" });
    return { account: s.account, out: s };
  });
  if (r.order) console.log(JSON.stringify({ event: "payment", sandbox: false, status: r.order.status, pack: r.order.pack, price: r.order.price }));
  return r;
}

export const newOrderId = () => `ord_${randomUUID().replace(/-/g, "").slice(0, 20)}`;

/**
 * The simulated payment gateway. It behaves like a real one in test mode:
 * fixed test card numbers decide the outcome and nothing is ever charged.
 * The card number is checked here and dropped; only the last four digits are kept.
 */
export function sandboxCharge(method: "card" | "qris" | "ewallet", card?: { number: string; expiry: string; cvc: string }): { ok: true; method: string; last4?: string } | { ok: false; method: string; failure: string } {
  if (method !== "card") return { ok: true, method };
  const number = (card?.number ?? "").replace(/\D/g, "");
  const [mm, yy] = (card?.expiry ?? "").split("/").map((s) => Number(s.trim()));
  const expires = new Date(2000 + (yy || 0), mm || 0, 1);
  if (!luhn(number)) return { ok: false, method, failure: "The card number is not valid." };
  if (!(mm >= 1 && mm <= 12) || expires <= new Date()) return { ok: false, method, failure: "The card has expired." };
  if (!/^\d{3,4}$/.test(card?.cvc ?? "")) return { ok: false, method, failure: "The security code is not valid." };
  const last4 = number.slice(-4);
  if (number === "4000000000009995") return { ok: false, method, failure: "The card has insufficient funds." };
  if (number === "4000000000000002") return { ok: false, method, failure: "The card was declined." };
  if (number !== "4242424242424242" && number !== "5555555555554444") return { ok: false, method, failure: "Sandbox mode: use a test card number." };
  return { ok: true, method, last4 };
}

export function luhn(n: string): boolean {
  if (!/^\d{12,19}$/.test(n)) return false;
  let sum = 0;
  for (let i = 0; i < n.length; i++) {
    let d = Number(n[n.length - 1 - i]);
    if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
}
