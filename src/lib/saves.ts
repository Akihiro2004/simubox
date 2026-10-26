"use client";

// Saved experiments: the account's own list (users/{uid}/experiments, through
// /api/experiments) when signed in, otherwise localStorage in this browser. Only plain data is stored (no live
// physics objects); restoring re-creates the scene from catalog ids.

import { z } from "zod";
import { accountFetch, useAuth } from "./firebase";
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
  if (useAuth.getState().user) {
    const res = await accountFetch("/api/experiments", { method: "POST", body: JSON.stringify(exp) });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save the experiment.");
  } else {
    writeLocal([exp, ...readLocal().filter((e) => e.id !== id)]);
  }
  useSim.getState().set({ experimentId: id, experimentTitle: exp.title });
  return exp;
}

export async function listExperiments(): Promise<SavedExperiment[]> {
  if (useAuth.getState().user) {
    const res = await accountFetch("/api/experiments");
    if (!res.ok) throw new Error("Couldn't load saved experiments.");
    return ((await res.json()) as { experiments: SavedExperiment[] }).experiments;
  }
  return readLocal();
}

export async function deleteExperiment(id: string) {
  if (useAuth.getState().user) {
    const res = await accountFetch(`/api/experiments?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Couldn't delete the experiment.");
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
