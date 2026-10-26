import "server-only";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import { WORLD_IDS } from "../world/catalog";
import { adminApp } from "./guard";

// A signed-in student's own data (saved experiments and the welcome-done flag),
// read and written by this server instead of the browser. Browser extensions
// (ad blockers) block Firestore's own connection, so the browser only ever
// talks to this site. Same paths and checks as firestore.rules.

const db = () => {
  adminApp();
  return getFirestore();
};

export const Experiment = z.object({
  id: z.string().regex(/^exp_[a-z0-9]{4,40}$/),
  title: z.string().min(1).max(80),
  world: z.enum(WORLD_IDS),
  updatedAt: z.number().int(),
  scene: z.record(z.string(), z.unknown()),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(1200), speech: z.boolean().optional() })).max(40),
  plan: z.unknown().nullable(),
  version: z.literal(1),
});
export type ExperimentData = z.infer<typeof Experiment>;

const experiments = (uid: string) => db().collection("users").doc(uid).collection("experiments");

export async function listExperiments(uid: string) {
  const snap = await experiments(uid).orderBy("updatedAtMs", "desc").limit(30).get();
  return snap.docs.map((d) => {
    const data = d.data();
    return { ...data, id: d.id, updatedAt: data.updatedAtMs as number };
  });
}

export async function saveExperiment(uid: string, exp: ExperimentData) {
  // Firestore rejects undefined; the JSON round-trip drops it.
  const plain = JSON.parse(JSON.stringify(exp)) as ExperimentData;
  await experiments(uid).doc(exp.id).set({ ...plain, updatedAt: FieldValue.serverTimestamp(), updatedAtMs: exp.updatedAt });
}

export const deleteExperiment = (uid: string, id: string) => experiments(uid).doc(id).delete();

export const Profile = z.object({
  gradeBand: z.enum(["elementary", "middle", "high"]).optional(),
  language: z.enum(["auto", "en", "id"]).optional(),
  voice: z.boolean().optional(),
});

const profile = (uid: string) => db().collection("users").doc(uid).collection("meta").doc("profile");

export async function isOnboarded(uid: string): Promise<boolean> {
  const snap = await profile(uid).get();
  return typeof snap.data()?.onboardedAt === "number";
}

export async function markOnboarded(uid: string, prefs: z.infer<typeof Profile>) {
  await profile(uid).set({ onboardedAt: Date.now(), ...JSON.parse(JSON.stringify(prefs)) }, { merge: true });
}
