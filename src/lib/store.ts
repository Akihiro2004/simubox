"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { GUIDE_ID, LIMITS, WORLDS, type Vec3, type WorldId } from "./world/catalog";
import { initialObjects, objectKind, type Character, type SceneObject } from "./world/scene";
import { livePosition } from "./world/runtime";
import { solveProjectile, type ProjectileResult } from "./engine/projectile";
import { defaultModules, modulesSummary, type Modules } from "./modules";
import type { Environment } from "./environment";
import type { CapabilityId, ScenePlan, SceneSnapshot } from "./ssp/schema";

export const EARTH_G: Vec3 = [0, -9.81, 0];

export interface Annotation {
  id: string;
  text: string;
  target?: string;
  position?: Vec3;
  tone: "info" | "fact" | "warning" | "question";
}
export interface VectorDef {
  id: string;
  target?: string;
  origin?: Vec3;
  vector: Vec3;
  color: string;
  label?: string;
}
export interface InfoCard {
  id: string;
  title: string;
  subtitle?: string;
  rows: { label: string; value: string }[];
  bullets: string[];
  placement: "center" | "object";
  target?: string;
  tone: "info" | "fact" | "warning" | "question";
}
export interface Formula {
  title: string;
  formula: string;
  variables: { symbol: string; meaning: string; unit?: string }[];
}
export interface ProjectileState {
  speed: number; // m/s
  angleDeg: number;
  gravity: number;
  height: number;
  ball: "basketball" | "soccer_ball" | "tennis_ball" | "bowling_ball" | "ball_red";
  /** Bumped to (re)launch. 0 = never launched. */
  launchNonce: number;
  status: "idle" | "flying" | "landed";
}
export interface Speech {
  key: number;
  speaker: string;
  text: string;
  emotion?: string;
}
export interface Question {
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  picked: number | null;
}
export interface Explanation {
  title: string;
  reply: string;
  details?: string;
  assumptions: string[];
  limitations: string[];
  supportLevel: ScenePlan["supportLevel"];
  scope: ScenePlan["scope"];
  source: "gemini" | "offline-demo" | "local";
}
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: number;
  /** Spoken lesson lines; shown in the transcript but not sent as AI history. */
  speech?: boolean;
}
export interface CameraRequest {
  nonce: number;
  target?: Vec3;
  position?: Vec3;
  zoom?: "close" | "medium" | "wide";
  /** Explicit camera distance (overrides zoom), e.g. to frame a trajectory. */
  distance?: number;
  preset?: "iso" | "top" | "front" | "side" | "home" | "periodic_table";
}

export interface Settings {
  motion: "auto" | "on" | "off";
  quality: "auto" | "low" | "medium" | "high";
  voice: boolean;
  voiceRate: number;
  language: "auto" | "en" | "id";
  gradeBand: "elementary" | "middle" | "high";
}

interface SceneData {
  world: WorldId;
  /** Bumped on world load / reset so physics remounts cleanly. */
  worldNonce: number;
  gravity: Vec3;
  paused: boolean;
  timeScale: number;
  capability: CapabilityId;
  objects: Record<string, SceneObject>;
  characters: Record<string, Character>;
  annotations: Annotation[];
  vectors: VectorDef[];
  highlighted: string[];
  formula: Formula | null;
  metrics: string[];
  projectile: ProjectileState | null;
  /** Science modules active in this world (orbits, circuits, plots...). */
  modules: Modules;
  /** Restyled look (sky, light, ground, scenery); null = the template as designed. */
  environment: Environment | null;
  /** Info cards the lesson is showing. */
  cards: InfoCard[];
}

export interface SimState extends SceneData {
  selectedId: string | null;
  speech: Speech | null;
  question: Question | null;
  explanation: Explanation | null;
  messages: ChatMessage[];
  followUps: string[];
  aiStatus: "idle" | "thinking" | "playing";
  aiError: string | null;
  camera: CameraRequest;
  lastPlan: ScenePlan | null;
  /** Scene as it was right before the last plan ran (for replay). */
  prePlanScene: SceneData | null;
  settings: Settings;
  menuOpen: boolean;
  settingsOpen: boolean;
  transcriptOpen: boolean;
  experimentId: string | null;
  experimentTitle: string | null;
  /** Composer text, so other UI (inspector, chips) can prefill it. */
  draft: string;
  /** Live progress while Gemini plans a lesson (null when idle). */
  thinking: { status: string; steps: string[]; thoughts: { title: string; text: string }[]; startedAt: number } | null;
  /** Main point of the student's current question, shown beside the menu button. */
  topic: string | null;
  lessonSuggestions: { label: string; prompt: string }[];

  set: (p: Partial<SimState>) => void;
  loadWorld: (w: WorldId) => void;
  resetSimulation: () => void;
  upsertObject: (o: SceneObject) => void;
  patchObject: (id: string, p: Partial<SceneObject>) => void;
  removeObject: (id: string) => void;
  upsertCharacter: (c: Character) => void;
  patchCharacter: (id: string, p: Partial<Character>) => void;
  setProjectile: (p: Partial<ProjectileState>, relaunch?: boolean) => void;
  focus: (r: Omit<CameraRequest, "nonce">) => void;
  addMessage: (role: ChatMessage["role"], text: string, speech?: boolean) => void;
  updateSettings: (p: Partial<Settings>) => void;
}

const guide = (world: WorldId): Character => ({
  id: GUIDE_ID,
  kind: "robot",
  name: "Simu",
  position: WORLDS[world].guideSpot,
  animation: "idle",
  animNonce: 0,
});

const WORLD_CAPABILITY: Record<WorldId, CapabilityId> = {
  bedroom: "gravity",
  court: "projectile",
  lab: "molecule",
  park: "concept",
  stage: "concept",
  space: "orbits",
  ocean: "buoyancy",
  math: "graph",
  globe: "globe",
  workshop: "circuit",
};

export function freshScene(world: WorldId, nonce = 0): SceneData {
  return {
    world,
    worldNonce: nonce,
    gravity: EARTH_G,
    paused: false,
    timeScale: 1,
    capability: WORLD_CAPABILITY[world],
    objects: Object.fromEntries(initialObjects(world).map((o) => [o.id, o])),
    characters: { [GUIDE_ID]: guide(world) },
    annotations: [],
    vectors: [],
    highlighted: [],
    formula: null,
    metrics: [],
    projectile: world === "court" ? { speed: 10, angleDeg: 45, gravity: 9.81, height: 0, ball: "basketball", launchNonce: 0, status: "idle" } : null,
    modules: defaultModules(world),
    environment: null,
    cards: [],
  };
}

export const SCENE_KEYS = Object.keys(freshScene("bedroom")) as (keyof SceneData)[];
export function pickScene(s: SimState): SceneData {
  return Object.fromEntries(SCENE_KEYS.map((k) => [k, s[k]])) as unknown as SceneData;
}
export type { SceneData };

let msgSeq = 0;

export const useSim = create<SimState>()(
  persist(
    (set) => ({
      ...freshScene("bedroom"),
      selectedId: null,
      speech: null,
      question: null,
      explanation: null,
      messages: [],
      followUps: [],
      aiStatus: "idle",
      aiError: null,
      camera: { nonce: 0, preset: "home" },
      lastPlan: null,
      prePlanScene: null,
      settings: { motion: "auto", quality: "auto", voice: true, voiceRate: 1, language: "auto", gradeBand: "middle" },
      menuOpen: false,
      settingsOpen: false,
      transcriptOpen: false,
      experimentId: null,
      experimentTitle: null,
      draft: "",
      thinking: null,
      topic: null,
      lessonSuggestions: [],

      set: (p) => set(p),
      loadWorld: (w) =>
        set((s) => ({
          ...freshScene(w, s.worldNonce + 1),
          selectedId: null,
          speech: null,
          question: null,
          camera: { nonce: s.camera.nonce + 1, preset: "home" },
        })),
      resetSimulation: () =>
        set((s) => {
          // Back to the world's starting layout, keeping spawned extras, the
          // projectile parameters and the current gravity setting.
          const base = freshScene(s.world);
          const objects: Record<string, SceneObject> = {};
          for (const o of Object.values(s.objects)) {
            const orig = base.objects[o.id];
            objects[o.id] = { ...o, position: orig ? orig.position : o.position, rotation: orig ? orig.rotation : o.rotation, version: o.version + 1 };
          }
          return {
            objects,
            worldNonce: s.worldNonce + 1,
            paused: false,
            projectile: s.projectile ? { ...s.projectile, status: "idle", launchNonce: 0 } : null,
          };
        }),
      upsertObject: (o) =>
        set((s) => {
          if (!s.objects[o.id] && Object.keys(s.objects).length >= LIMITS.maxObjects) return {};
          return { objects: { ...s.objects, [o.id]: o } };
        }),
      patchObject: (id, p) =>
        set((s) => (s.objects[id] ? { objects: { ...s.objects, [id]: { ...s.objects[id], ...p } as SceneObject } } : {})),
      removeObject: (id) =>
        set((s) => {
          const objects = { ...s.objects };
          const characters = { ...s.characters };
          delete objects[id];
          if (id !== GUIDE_ID) delete characters[id];
          return {
            objects,
            characters,
            selectedId: s.selectedId === id ? null : s.selectedId,
            annotations: s.annotations.filter((a) => a.target !== id),
            vectors: s.vectors.filter((v) => v.target !== id),
          };
        }),
      upsertCharacter: (c) => set((s) => ({ characters: { ...s.characters, [c.id]: c } })),
      patchCharacter: (id, p) =>
        set((s) => (s.characters[id] ? { characters: { ...s.characters, [id]: { ...s.characters[id], ...p } } } : {})),
      setProjectile: (p, relaunch = false) =>
        set((s) => {
          const cur = s.projectile ?? freshScene("court").projectile!;
          const next = { ...cur, ...p };
          if (relaunch) {
            next.launchNonce = cur.launchNonce + 1;
            next.status = "flying";
          }
          return { projectile: next };
        }),
      focus: (r) => set((s) => ({ camera: { ...r, nonce: s.camera.nonce + 1 } })),
      addMessage: (role, text, speech) =>
        set((s) => ({ messages: [...s.messages.slice(-79), { id: `m${Date.now()}_${msgSeq++}`, role, text, at: Date.now(), speech }] })),
      updateSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
    }),
    {
      name: "simubox-settings",
      version: 1,
      partialize: (s) => ({ settings: s.settings }),
    },
  ),
);

export function projectileResult(p: ProjectileState | null): ProjectileResult | null {
  if (!p) return null;
  try {
    return solveProjectile({ speed: p.speed, angleDeg: p.angleDeg, gravity: p.gravity, height: p.height });
  } catch {
    return null;
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const finiteOrNull = (n: number | undefined) => (n !== undefined && Number.isFinite(n) ? r2(n) : null);

/** Compact scene description sent to the director with each prompt. */
export function snapshot(s: SimState): SceneSnapshot {
  const pr = projectileResult(s.projectile);
  return {
    world: s.world,
    gravity: s.gravity.map(r2),
    capability: s.capability,
    projectile: s.projectile
      ? {
          speed: r2(s.projectile.speed),
          angleDeg: r2(s.projectile.angleDeg),
          gravity: r2(s.projectile.gravity),
          height: r2(s.projectile.height),
          range: finiteOrNull(pr?.range),
          flightTime: finiteOrNull(pr?.flightTime),
          maxHeight: finiteOrNull(pr?.maxHeight),
        }
      : undefined,
    objects: Object.values(s.objects)
      .slice(0, 60)
      .map((o) => ({
        id: o.id,
        kind: objectKind(o),
        label: o.label,
        position: (livePosition(o.id) ?? o.position).map(r2),
        physics: o.physics,
      })),
    characters: Object.values(s.characters).map((c) => ({ id: c.id, kind: c.kind, name: c.name })),
    selected: s.selectedId,
    modules: modulesSummary(s.modules),
    ...(s.environment ? { environment: { ...s.environment } } : {}),
  };
}
