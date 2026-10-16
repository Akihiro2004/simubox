"use client";

// Saved experiments: Firestore under users/{uid}/experiments when signed in,
// otherwise localStorage in this browser. Only plain data is stored (no live
// physics objects); restoring re-creates the scene from catalog ids.

import { z } from "zod";
import { firestore, useAuth } from "./firebase";
import { ScenePlan } from "./ssp/schema";
import { pickScene, useSim, type SceneData } from "./store";
import { livePosition } from "./world/runtime";

export const SAVE_VERSION = 1;

export interface SavedExperiment {
  id: string;
  title: string;
  world: string;
  updatedAt: number;
  scene: SceneData;
  messages: { role: "user" | "assistant"; text: string; speech?: boolean }[];
  plan: ScenePlan | null;
  version: number;
}

const LOCAL_KEY = "simubox-saves";
const Meta = z.object({ id: z.string(), title: z.string(), world: z.string(), updatedAt: z.number(), version: z.number() });

function readLocal(): SavedExperiment[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]") as unknown[];
    return raw.filter((r) => Meta.safeParse(r).success) as SavedExperiment[];
  } catch {
    return [];
  }
}
function writeLocal(list: SavedExperiment[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    /* storage full or blocked: saving is best-effort for guests */
  }
}

/** Current scene with live physics positions baked in. */
function captureScene(): SceneData {
  const s = useSim.getState();
  const scene = pickScene(s);
  const objects = Object.fromEntries(
    Object.entries(scene.objects).map(([id, o]) => {
      const p = livePosition(id);
      return [id, { ...o, position: p ? (p.map((n) => Math.round(n * 1000) / 1000) as typeof o.position) : o.position }];
    }),
  );
  return JSON.parse(JSON.stringify({ ...scene, objects })) as SceneData;
}

export async function saveExperiment(title?: string): Promise<SavedExperiment> {
  const s = useSim.getState();
  const id = s.experimentId ?? `exp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const exp: SavedExperiment = {
    id,
    title: (title || s.experimentTitle || s.lastPlan?.title || "My experiment").slice(0, 80),
    world: s.world,
    updatedAt: Date.now(),
    scene: captureScene(),
    messages: s.messages.slice(-40).map(({ role, text, speech }) => ({ role, text: text.slice(0, 1200), ...(speech ? { speech } : {}) })),
    plan: s.lastPlan,
    version: SAVE_VERSION,
  };
  const user = useAuth.getState().user;
  const db = user ? await firestore() : null;
  if (user && db) {
    const f = await import("firebase/firestore");
    // Firestore rejects undefined; JSON round-trip drops it.
    await f.setDoc(f.doc(db, "users", user.uid, "experiments", id), { ...JSON.parse(JSON.stringify(exp)), updatedAt: f.serverTimestamp(), updatedAtMs: exp.updatedAt });
  } else {
    writeLocal([exp, ...readLocal().filter((e) => e.id !== id)]);
  }
  useSim.getState().set({ experimentId: id, experimentTitle: exp.title });
  return exp;
}

export async function listExperiments(): Promise<SavedExperiment[]> {
  const user = useAuth.getState().user;
  const db = user ? await firestore() : null;
  if (user && db) {
    const f = await import("firebase/firestore");
    const snap = await f.getDocs(f.query(f.collection(db, "users", user.uid, "experiments"), f.orderBy("updatedAtMs", "desc"), f.limit(30)));
    return snap.docs.map((d) => {
      const data = d.data() as SavedExperiment & { updatedAtMs: number };
      return { ...data, id: d.id, updatedAt: data.updatedAtMs };
    });
  }
  return readLocal();
}

export async function deleteExperiment(id: string) {
  const user = useAuth.getState().user;
  const db = user ? await firestore() : null;
  if (user && db) {
    const f = await import("firebase/firestore");
    await f.deleteDoc(f.doc(db, "users", user.uid, "experiments", id));
  } else {
    writeLocal(readLocal().filter((e) => e.id !== id));
  }
  if (useSim.getState().experimentId === id) useSim.getState().set({ experimentId: null, experimentTitle: null });
}

export function restoreExperiment(exp: SavedExperiment) {
  const s = useSim.getState();
  const plan = exp.plan ? ScenePlan.safeParse(exp.plan) : null;
  s.set({
    ...exp.scene,
    worldNonce: s.worldNonce + 1,
    messages: exp.messages.map((m, i) => ({ ...m, id: `r${i}`, at: exp.updatedAt })),
    lastPlan: plan?.success ? plan.data : null,
    prePlanScene: null,
    explanation: null,
    followUps: plan?.success ? plan.data.followUps : [],
    selectedId: null,
    speech: null,
    question: null,
    experimentId: exp.id,
    experimentTitle: exp.title,
    topic: (plan?.success && plan.data.question) || exp.messages.findLast((m) => m.role === "user")?.text || null,
    camera: { nonce: s.camera.nonce + 1, preset: "home" },
  });
}
