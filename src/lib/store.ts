"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { GUIDE_ID, LIMITS, WORLDS, type Vec3, type WorldId } from "./world/catalog";
import { initialObjects, objectKind, objectName, type Character, type SceneObject } from "./world/scene";
import { getMolecule, molarMass } from "./engine/chemistry";
import { CELL_NAMES, ORGANELLES, type OrganelleId } from "./engine/biology";
import { PERIODIC_ELEMENTS } from "./periodic-table";
import { livePosition } from "./world/runtime";
import { mapSummaries, readMaps } from "./builder/maps";
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
  /** Fit all of these on screen (the subject and the speaking guide), keeping the viewing angle. */
  points?: Vec3[];
  /** Smallest framed radius (m) for points framing. */
  radius?: number;
}

export type EnglishVoice = "gemini" | "speechify";

export interface Settings {
  motion: "auto" | "on" | "off";
  quality: "auto" | "low" | "medium" | "high";
  voice: boolean;
  voiceRate: number;
  /** Who voices English lines (Indonesian is always Gemini). Missing in older saved settings: Gemini. */
  englishVoice?: EnglishVoice;
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

/**
 * What the student last pointed at: a part they clicked, an atom, an element,
 * a slider they moved. Sent with every question so "what is this?" has an answer.
 */
export interface Attention {
  /** object, character, atom, cell_part, cell, element, planet, optic, circuit, signal, control, action… */
  kind: string;
  /** Human-readable name, e.g. "Mitochondria in a Sperm cell". */
  label: string;
  /** Extra facts the guide can use, e.g. what the part does. */
  detail?: string;
  /** Scene object id, when it is one. */
  id?: string;
  at: number;
}

export interface SimState extends SceneData {
  selectedId: string | null;
  attention: Attention | null;
  /** Earlier picks, newest first (at most 4). */
  recentAttention: Attention[];
  speech: Speech | null;
  question: Question | null;
  explanation: Explanation | null;
  messages: ChatMessage[];
  followUps: string[];
  aiStatus: "idle" | "thinking" | "playing";
  aiError: string | null;
  /** A button the error toast offers, e.g. when the student is out of credits. */
  aiErrorAction: "buy_credits" | null;
  camera: CameraRequest;
  lastPlan: ScenePlan | null;
  /** Scene as it was right before the last plan ran (for replay). */
  prePlanScene: SceneData | null;
  settings: Settings;
  menuOpen: boolean;
  settingsOpen: boolean;
  transcriptOpen: boolean;
  /** Account card (shares the top-right card with settings). */
  accountOpen: boolean;
  /** Phones and the periodic table view: Simu's answer opened from its bar or pill. */
  explanationOpen: boolean;
  /** A guest used their free question: this one waits behind the sign-in card. */
  signInGate: { question: string } | null;
  /** Asked once the new account finishes the welcome (first sign-in). */
  pendingQuestion: string | null;
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
  mechanics: "mechanics",
  math_studio: "maths",
  anatomy: "anatomy",
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
  optics: "light",
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
      attention: null,
      recentAttention: [],
      speech: null,
      question: null,
      explanation: null,
      messages: [],
      followUps: [],
      aiStatus: "idle",
      aiError: null,
      aiErrorAction: null,
      camera: { nonce: 0, preset: "home" },
      lastPlan: null,
      prePlanScene: null,
      settings: { motion: "auto", quality: "auto", voice: true, voiceRate: 1, englishVoice: "gemini", language: "auto", gradeBand: "middle" },
      menuOpen: false,
      settingsOpen: false,
      transcriptOpen: false,
      accountOpen: false,
      explanationOpen: false,
      signInGate: null,
      pendingQuestion: null,
      experimentId: null,
      experimentTitle: null,
      draft: "",
      thinking: null,
      topic: null,
      lessonSuggestions: [],

      set: (p) => set(p),
      loadWorld: (w) =>
        set((s) => {
          const layout = readMaps()[w];
          return {
            ...freshScene(w, s.worldNonce + 1),
            ...(layout ? { objects: layout.objects } : {}),
            selectedId: null,
            speech: null,
            question: null,
            camera: { nonce: s.camera.nonce + 1, preset: "home" },
          };
        }),
      resetSimulation: () =>
        set((s) => {
          // Back to the world's starting layout, keeping spawned extras, the
          // projectile parameters and the current gravity setting.
          const base = freshScene(s.world);
          base.objects = readMaps()[s.world]?.objects ?? base.objects;
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
          return { projectile: next, ...(relaunch ? { paused: false } : {}), ...(s.world === "court" && p.gravity !== undefined ? { gravity: [0, -next.gravity, 0] as Vec3 } : {}) };
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

function focusSummary(s: SimState): Pick<SceneSnapshot, "focus" | "recentFocus"> {
  const now = Date.now();
  const fresh = (f: Attention) => now - f.at < FOCUS_TTL_MS;
  const out: Pick<SceneSnapshot, "focus" | "recentFocus"> = {};
  const a = s.attention;
  if (a && fresh(a)) out.focus = { kind: a.kind.slice(0, 24), label: a.label, ...(a.detail ? { detail: a.detail } : {}), ...(a.id ? { id: a.id } : {}), secondsAgo: Math.round((now - a.at) / 1000) };
  const recent = s.recentAttention.filter(fresh).map((f) => f.label);
  if (recent.length) out.recentFocus = recent;
  return out;
}
const finiteOrNull = (n: number | undefined) => (n !== undefined && Number.isFinite(n) ? r2(n) : null);

/** Record what the student just pointed at (UI clicks, picks and panel changes; never the lesson's own actions). */
export function noteFocus(f: Omit<Attention, "at">) {
  const s = useSim.getState();
  const prev = s.attention;
  const recent = prev && prev.label !== f.label ? [prev, ...s.recentAttention.filter((r) => r.label !== f.label && r.label !== prev.label)].slice(0, 4) : s.recentAttention;
  s.set({ attention: { ...f, label: f.label.slice(0, 120), detail: f.detail?.slice(0, 300), at: Date.now() }, recentAttention: recent });
}

/** Highlight a part of the cell on the bench (or clear it) and remember the student picked it. */
export function pickCellPart(part: OrganelleId | null) {
  const s = useSim.getState();
  const cell = s.modules.cell;
  if (!cell) return;
  s.set({ modules: { ...s.modules, cell: { ...cell, highlight: part } } });
  if (part) noteFocus({ kind: "cell_part", label: `${ORGANELLES[part].name} (part of the ${CELL_NAMES[cell.kind]})`, detail: ORGANELLES[part].job });
}

/** Remember the student picked an element on the periodic table. */
export function noteElement(n: number) {
  const el = PERIODIC_ELEMENTS[n - 1];
  if (el) noteFocus({ kind: "element", label: `${el.name} (${el.symbol}), element ${el.number} on the periodic table`, detail: `${el.group ? `Group ${el.group}` : el.series}, period ${el.period}, atomic weight ${el.weight}` });
}

/** What a selected scene object or character is, in words the guide can use. */
function describeSelection(s: SimState, id: string): Omit<Attention, "at"> | null {
  const o = s.objects[id];
  if (o?.type === "molecule") {
    const m = getMolecule(o.molecule);
    return m ? { kind: "molecule", id, label: `${m.name} molecule (${m.formula})`, detail: `${molarMass(m)} g/mol, ${m.atoms.length} atoms${m.shape ? `, ${m.shape} shape` : ""}` } : null;
  }
  if (o) return { kind: o.type === "atom" ? "atom_model" : "object", id, label: objectName(o), detail: `${objectKind(o)}${o.physics === "dynamic" ? ", moves with physics" : ""}${o.learnerPlaced ? ", placed by the student" : ""}` };
  const c = s.characters[id];
  return c ? { kind: "character", id, label: `${c.name} (${c.kind})` } : null;
}

/** Older than this, a pick is no longer what "this" means. */
const FOCUS_TTL_MS = 10 * 60_000;

// Every click that selects something in the world (objects, molecules, characters, the
// builder's list) goes through selectedId, which only the student sets: remember it.
useSim.subscribe((s, prev) => {
  if (s.selectedId && s.selectedId !== prev.selectedId) {
    const d = describeSelection(s, s.selectedId);
    if (d) noteFocus(d);
  }
});

/** Compact scene description sent to the director with each prompt. */
export function snapshot(s: SimState): SceneSnapshot {
  const pr = projectileResult(s.projectile);
  return {
    world: s.world,
    layouts: mapSummaries(),
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
        ...(o.learnerPlaced ? { learnerPlaced: true } : {}),
      })),
    characters: Object.values(s.characters).map((c) => ({ id: c.id, kind: c.kind, name: c.name })),
    selected: s.selectedId,
    ...focusSummary(s),
    modules: modulesSummary(s.modules),
    ...(s.environment ? { environment: { ...s.environment } } : {}),
  };
}
