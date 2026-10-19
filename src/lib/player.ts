"use client";

// SimuPlayer: executes validated SSP plans against the live scene, one
// command at a time. A new plan (or reset) aborts the running one at once.

import { Euler, Quaternion } from "three";
import { create } from "zustand";
import { ASSETS, GUIDE_ID, LIMITS, WORLDS, type Vec3 } from "./world/catalog";
import { assetObject, type SceneObject } from "./world/scene";
import { allSettled, emit, getBody, liveBodies, livePosition, markFresh, view, waitFor } from "./world/runtime";
import { fmt, PROJECTILE_LIMITS, toMetersPerSecond } from "./engine/projectile";
import { fillPlaceholders, fillProse } from "./ssp/validate";
import { MODULE_FIELDS, type Command, type ScenePlan, type Step } from "./ssp/schema";
import { applyEnvironment } from "./environment";
import { noteFocus, pickScene, projectileResult, useSim, type Explanation } from "./store";
import { prefetchLine, speak, stopSpeaking, type VoiceRole } from "./tts";
import { ALL_PLANETS, MODULE_DEFAULTS, circuitBoard, OPTIC_SIZE, OPTICS_TABLE, RIPPLE_TANK, massFor, moduleValue, objectVolume, patchOptics, patchSignal, signalDefaults, type Modules } from "./modules";
import { MAX_OPTICS, TABLE, opticsPreset, sourcePosition, type OpticElement } from "./engine/optics";
import { PLACES } from "./engine/geo";
import { legacyBoard, placePart, presetBoard, type Part, type Pt } from "./engine/circuit";
import { magnetPreset } from "./engine/magnet";
import { loadCompound } from "./engine/chemistry";
import type { ShapeKind } from "./engine/geometry";
import { EMPTY_TABLE } from "./periodic-table";
import { DEFAULT_MECHANICS, DEFAULT_MATH, MechanicsFields, MathFields, mathSetupError, type MathState } from "./experiments";

let controller: AbortController | null = null;
let skipLine: (() => void) | null = null;
let speechKey = 0;

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    signal.addEventListener("abort", done);
    function done() {
      clearTimeout(t);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });

const st = () => useSim.getState();

export function cancelPlayback() {
  controller?.abort();
  controller = null;
  stopSpeaking();
  settleLessonText();
  st().set({ speech: null, aiStatus: st().aiStatus === "playing" ? "idle" : st().aiStatus });
}

/**
 * Simu's reply may carry {{placeholders}}; the answer card fills them live
 * while the lesson plays. Once it stops, the numbers are written in for good
 * (the scene that computed them may change later), and the transcript too.
 */
export function settleLessonText() {
  const s = st();
  const fill = (t: string) => fillProse(t, resolvePlaceholder, true);
  const ex = s.explanation;
  if (ex && (ex.reply.includes("{{") || ex.details?.includes("{{"))) {
    s.set({ explanation: { ...ex, reply: fill(ex.reply) || ex.title, details: ex.details && (fill(ex.details) || undefined) } });
  }
  const raw = (m: (typeof s.messages)[number]) => m.role === "assistant" && m.text.includes("{{");
  if (s.messages.some(raw)) {
    s.set({ messages: s.messages.map((m) => (raw(m) ? { ...m, text: fill(m.text) || m.text.replace(/\{\{[^}]*\}\}/g, "").trim() } : m)) });
  }
}

/** Ends the current speech line early (click on bubble / caption). */
export function skipSpeech() {
  skipLine?.();
}

function explanationOf(plan: ScenePlan, source: Explanation["source"]): Explanation {
  return { title: plan.title, reply: plan.reply, details: plan.details, assumptions: plan.assumptions, limitations: plan.limitations, supportLevel: plan.supportLevel, scope: plan.scope, source };
}

/**
 * Plays a plan. With `steps`, the plan is only its envelope and the steps
 * arrive while it plays (streamed from the director); finishPlan() later
 * fills in what was written after them (follow-ups, details).
 */
export async function runPlan(plan: ScenePlan, source: Explanation["source"], opts: { replay?: boolean; steps?: AsyncIterable<Step> } = {}) {
  cancelPlayback();
  const ctl = new AbortController();
  controller = ctl;
  subject = null;
  const s = st();
  s.set({
    prePlanScene: opts.replay ? s.prePlanScene : pickScene(s),
    lastPlan: plan,
    question: null,
    // Cards belong to the lesson that made them.
    cards: [],
    explanation: explanationOf(plan, source),
    followUps: plan.followUps,
    aiStatus: "playing",
    selectedId: null,
  });
  if (plan.capability !== "none") s.set({ capability: plan.capability });
  if (plan.question) s.set({ topic: plan.question });
  if (!opts.replay) s.addMessage("assistant", plan.reply);
  const kinds = new Map<string, VoiceRole>([["simu", "robot"]]);
  // Voice is fetched one step ahead: ready in time, and a lesson the student
  // interrupts pays for at most one step it never played.
  const stepSource = opts.steps ?? (async function* () {
    yield* plan.steps;
  })();
  const it = stepSource[Symbol.asyncIterator]();
  const pull = () =>
    it.next().then((r) => {
      if (!r.done && !ctl.signal.aborted && st().settings.voice) prefetchVoices(r.value, kinds, plan.language);
      return r;
    });

  try {
    let next = pull();
    for (;;) {
      const r = await next;
      if (r.done || ctl.signal.aborted) return;
      const step = r.value;
      next = pull();
      for (const cmd of step.commands) {
        if (ctl.signal.aborted) return;
        await exec(cmd, ctl.signal, plan.language);
      }
    }
  } finally {
    if (controller === ctl) {
      controller = null;
      st().set({ aiStatus: "idle", speech: null });
      settleLessonText();
    }
  }
}

/** The rest of a streamed plan arrived: keep it for replay/saving and show its follow-ups. */
export function finishPlan(plan: ScenePlan, source: Explanation["source"]) {
  const s = st();
  s.set({ lastPlan: plan, followUps: plan.followUps, explanation: explanationOf(plan, source) });
  if (plan.question) s.set({ topic: plan.question });
  // Normally the lesson is still playing and settles when it ends.
  if (!controller) settleLessonText();
}

/** Warm the voice cache for a step's lines that have no engine placeholders. */
function prefetchVoices(step: Step, kinds: Map<string, VoiceRole>, lang: "en" | "id") {
  for (const c of step.commands) {
    if (c.op === "spawn_character") kinds.set(c.id, c.character);
    if (c.op === "speak" && !c.text.includes("{{")) {
      const role = c.speaker === "narrator" ? "narrator" : (kinds.get(c.speaker) ?? (st().characters[c.speaker]?.kind as VoiceRole | undefined) ?? "robot");
      prefetchLine(c.text, role, lang);
    }
  }
}

/** Restore the scene from before the last plan and play it again. */
export async function replay() {
  const s = st();
  if (!s.lastPlan) return;
  cancelPlayback();
  if (s.prePlanScene) s.set({ ...s.prePlanScene, worldNonce: s.worldNonce + 1, camera: { nonce: s.camera.nonce + 1, preset: "home" } });
  await sleep(250, new AbortController().signal);
  await runPlan(s.lastPlan, s.explanation?.source ?? "gemini", { replay: true });
}

function wakeAll() {
  for (const [, b] of liveBodies()) b.wakeUp();
}

function remount(id: string, patch: Partial<SceneObject> = {}) {
  const o = st().objects[id];
  if (!o) return;
  st().patchObject(id, { ...patch, position: livePosition(id) ?? o.position, version: o.version + 1 });
}

const PITCH: Record<string, number> = { robot: 1.35, kid: 1.45, teacher: 1.0, scientist: 0.9, astronaut: 1.05 };

export function placeholderValues(): Record<string, string> {
  const s = st();
  const p = s.projectile;
  const r = projectileResult(p);
  const g = s.capability === "projectile" && p ? p.gravity : Math.hypot(...s.gravity);
  return {
    range: r ? fmt(r.range, "m") : "?",
    flight_time: r ? fmt(r.flightTime, "s") : "?",
    max_height: r ? fmt(r.maxHeight, "m") : "?",
    impact_speed: r ? fmt(r.impactSpeed, "m/s") : "?",
    speed: p ? `${fmt(p.speed, "m/s")} (${fmt(p.speed * 3.6, "km/h", 1)})` : "?",
    angle: p ? `${fmt(p.angleDeg, "", 0)}°` : "?",
    gravity: fmt(g, "m/s²"),
  };
}

/** Resolves {{name}} and {{name:arg}} from every engine. */
export function resolvePlaceholder(name: string, arg?: string): string | undefined {
  if (!arg) {
    const base = placeholderValues()[name];
    if (base && base !== "?") return base;
  }
  const s = st();
  return moduleValue(name, arg, s.modules, s.objects);
}

const PLOT_COLORS = ["#2f80ed", "#e5484d", "#30a46c", "#f0a800", "#8e4ec6", "#12a594"];

function setModules(patch: Partial<Modules>) {
  const s = st();
  s.set({ modules: { ...s.modules, ...patch } });
}

function setMaths(next: MathState) {
  const error = mathSetupError(next);
  if (error) { st().set({ aiError: error }); return; }
  setModules({ maths: next, plot: next.mode === "functions" ? {
    functions: [{ id: "math_function", expression: next.expression, xMin: -10, xMax: 10, color: "#267e87" }], points: [], vectors: [],
  } : null });
}

/** Molecules, atoms, particles and cells share the lab pedestal: one at a time. */
function clearPedestal(keep: "chem" | "particles" | "cell" | "table" | "reaction" | "population" | "genetics" | "osmosis") {
  const s = st();
  if (keep !== "table" && s.camera.preset === "periodic_table") s.focus({ preset: "home" });
  if (keep !== "chem") for (const o of Object.values(s.objects)) if (o.type === "molecule" || o.type === "atom") s.removeObject(o.id);
  const m = st().modules;
  setModules({
    particles: keep === "particles" ? m.particles : null,
    cell: keep === "cell" ? m.cell : null,
    reaction: keep === "reaction" ? m.reaction : null,
    population: keep === "population" ? m.population : null,
    genetics: keep === "genetics" ? m.genetics : null,
    osmosis: keep === "osmosis" ? m.osmosis : null,
  });
}

/**
 * Illustrations placed inside a tree, bed or desk can't be seen. Slide them
 * out toward the camera until they clear the big object's footprint.
 */
export function clearOfScenery(pos: Vec3, size: Vec3): Vec3 {
  const s = st();
  const cam = WORLDS[s.world].camera.position;
  const reach = Math.max(size[0], size[2]) / 2;
  const out: Vec3 = [...pos];
  for (const o of Object.values(s.objects)) {
    if (o.type !== "asset") continue;
    const [w, h, d] = ASSETS[o.asset].size.map((v) => v * o.scale);
    if (Math.max(w, d) < 1 || h < 1) continue; // small props don't hide anything
    const [x, y, z] = o.position;
    if (out[1] - size[1] / 2 > y + h) continue; // above it
    const r = Math.max(w, d) / 2 + reach + 0.2;
    const dx = out[0] - x;
    const dz = out[2] - z;
    if (Math.hypot(dx, dz) >= r) continue;
    // Push along the line from the object toward the camera (in plan view).
    const cx = cam[0] - x;
    const cz = cam[2] - z;
    const len = Math.hypot(cx, cz) || 1;
    out[0] = x + (cx / len) * r;
    out[2] = z + (cz / len) * r;
  }
  return out;
}

/** The compound being fetched for the bench (drives the 3D loading animation and the panel). */
export const useCompoundJob = create<{ job: { name: string; at: Vec3; error?: string } | null }>(() => ({ job: null }));
let compoundSeq = 0;

function defaultMoleculeSpot(): Vec3 {
  const s = st();
  const taken = Object.values(s.objects).filter((o) => o.type === "molecule" || o.type === "atom").length;
  const y = s.world === "lab" ? 2.1 : 1.6;
  return [[0, -1.9, 1.9][taken % 3], y, 0];
}

// ---------- keeping the subject and the speaker on screen ----------

/** What the lesson is currently about: an object/character id or a spot. */
let subject: string | Vec3 | null = null;

/** The thing a command acts on, if it acts on one specific thing. */
function subjectOf(c: Command): string | Vec3 | null {
  switch (c.op) {
    case "show_mechanics": return [0, 1, 0];
    case "show_math": return [0, 2, 0];
    case "spawn_asset":
    case "spawn_primitive":
    case "spawn_shape":
    case "morph_shape":
    case "move_object":
    case "build_molecule":
    case "build_atom":
      return c.id;
    case "highlight_object":
      return c.on ? c.id : null;
    case "apply_impulse":
    case "apply_force":
    case "set_velocity":
      return c.id === "all" ? null : c.id;
    case "show_annotation":
      return c.target ?? (c.position as Vec3 | undefined) ?? null;
    case "show_vector":
      return c.target ?? (c.origin as Vec3 | undefined) ?? null;
    case "focus_camera":
      return c.target ?? (c.position as Vec3 | undefined) ?? null;
    default:
      return null;
  }
}

/** Points that must be visible for a thing: its box corners, roughly. */
function pointsOf(what: string | Vec3): Vec3[] {
  const s = st();
  if (typeof what !== "string") return [what];
  const o = s.objects[what];
  const ch = s.characters[what];
  const optic = s.world === "optics" ? s.modules.optics?.elements.find((element) => element.id === what) : undefined;
  const at = livePosition(what) ?? o?.position ?? ch?.position ?? (optic ? [optic.x, OPTICS_TABLE.center[1] + 0.1, optic.z] as Vec3 : undefined);
  if (!at) return [];
  let r = 0.4;
  if (optic) r = Math.max(0.3, optic.size / 2);
  if (ch) return [at, [at[0], at[1] + 2.4, at[2]]]; // feet to the top of the speech bubble
  if (o?.type === "shape" || o?.type === "primitive") r = Math.max(...o.size) / 2;
  else if (o?.type === "asset") r = (Math.max(...ASSETS[o.asset].size) * o.scale) / 2;
  else if (o?.type === "molecule" || o?.type === "atom") r = 0.9;
  return [
    [at[0] - r, at[1] - r, at[2]],
    [at[0] + r, at[1] + r, at[2]],
    [at[0], at[1], at[2] - r],
    [at[0], at[1], at[2] + r],
  ];
}

/**
 * Students with the sound off read the guide's bubble, so the speaker and
 * what the lesson is about must both be on screen. Moves the camera only
 * when one of them isn't. Returns true if it moved.
 */
export function keepInView(speakerId: string | null, extra: (string | Vec3)[] = [], radius?: number): boolean {
  const points = [...(speakerId ? pointsOf(speakerId) : []), ...(subject ? pointsOf(subject) : []), ...extra.flatMap(pointsOf)];
  if (!points.length || !view.inView || view.inView(points)) return false;
  st().focus({ points, radius });
  return true;
}

export async function exec(c: Command, signal: AbortSignal, lang: "en" | "id" = "en"): Promise<void> {
  const s = st();
  const about = subjectOf(c);
  if (about) subject = about;
  if (c.op === "load_world") subject = null;
  switch (c.op) {
    case "show_mechanics": {
      if (s.world !== "mechanics") s.loadWorld("mechanics");
      const setup = { ...DEFAULT_MECHANICS, ...MechanicsFields.partial().parse(Object.fromEntries(Object.entries(c).filter(([key]) => key !== "op"))) };
      setModules({ mechanics: setup });
      st().set({ capability: "mechanics", paused: false, gravity: [0, -setup.gravity, 0] });
      return;
    }
    case "show_math": {
      if (s.world !== "math_studio") s.loadWorld("math_studio");
      setMaths({ ...DEFAULT_MATH, ...MathFields.partial().parse(Object.fromEntries(Object.entries(c).filter(([key]) => key !== "op"))) });
      st().set({ capability: "maths" });
      return;
    }
    case "load_world":
      s.loadWorld(c.world);
      await sleep(450, signal);
      return;
    case "spawn_asset":
      markFresh(c.id);
      s.upsertObject(
        assetObject(c.id, c.asset, c.position as Vec3, {
          rotation: [0, c.rotationY ?? 0, 0],
          scale: c.scale ?? 1,
          color: c.color,
          physics: c.physics ?? ASSETS[c.asset].defaultPhysics,
          label: c.label,
        }),
      );
      if (c.material) {
        const o = st().objects[c.id];
        if (o) st().patchObject(c.id, { massKg: massFor(c.material, objectVolume(o)), color: c.color ?? o.color });
      }
      // A beat so several spawns build up one by one as they grow in.
      await sleep(300, signal);
      return;
    case "spawn_primitive": {
      const [w, h, d] = c.size;
      markFresh(c.id);
      s.upsertObject({
        id: c.id,
        type: "primitive",
        shape: c.shape,
        size: [w, h, d],
        position: (c.physics ?? "none") === "none" ? clearOfScenery(c.position as Vec3, [w, h, d]) : (c.position as Vec3),
        rotation: [0, 0, 0],
        scale: 1,
        physics: c.physics ?? "none",
        label: c.label,
        color: c.color,
        opacity: c.opacity ?? 1,
        glow: c.glow ?? false,
        massKg: Math.min(50, Math.max(0.05, w * h * d * 300)),
        bounciness: 0.3,
        drag: 0.05,
        visible: true,
        version: 0,
      });
      await sleep(120, signal);
      return;
    }
    case "remove_object":
      s.removeObject(c.id);
      return;
    case "move_object": {
      const b = getBody(c.id);
      if (b) {
        b.setTranslation({ x: c.position[0], y: c.position[1], z: c.position[2] }, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      s.patchObject(c.id, { position: c.position as Vec3 });
      await sleep(c.durationMs ?? 600, signal);
      return;
    }
    case "rotate_object": {
      const b = getBody(c.id);
      const rad = c.rotation.map((d) => (d * Math.PI) / 180) as Vec3;
      if (b) b.setRotation(new Quaternion().setFromEuler(new Euler(...rad)), true);
      s.patchObject(c.id, { rotation: c.rotation as Vec3 });
      return;
    }
    case "set_object_property": {
      const o = s.objects[c.id];
      if (!o) return;
      const v = c.value;
      switch (c.property) {
        case "color":
          if (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) s.patchObject(c.id, { color: v });
          return;
        case "label":
          if (typeof v === "string") s.patchObject(c.id, { label: v.slice(0, 40) });
          return;
        case "visible":
          s.patchObject(c.id, { visible: Boolean(v) });
          return;
        case "mass":
          if (typeof v === "number" && v > 0) remount(c.id, { massKg: Math.min(v, 500) });
          return;
        case "bounciness":
          if (typeof v === "number") remount(c.id, { bounciness: Math.min(Math.max(v, 0), 1.2) });
          return;
        case "drag":
          if (typeof v === "number") remount(c.id, { drag: Math.min(Math.max(v, 0), 20) });
          return;
        case "scale":
          if (typeof v === "number") remount(c.id, { scale: Math.min(Math.max(v, 0.2), 5) });
          return;
      }
      return;
    }
    case "highlight_object":
      s.set({ highlighted: c.on ? [...new Set([...s.highlighted, c.id])] : s.highlighted.filter((h) => h !== c.id) });
      return;
    case "set_gravity":
      s.set({ gravity: c.gravity as Vec3, paused: false });
      if (s.world === "mechanics" && s.modules.mechanics && c.gravity[0] === 0 && c.gravity[2] === 0 && c.gravity[1] <= 0 && c.gravity[1] >= -100) setModules({ mechanics: { ...s.modules.mechanics, gravity: -c.gravity[1] } });
      if (s.world === "court" && c.gravity[0] === 0 && c.gravity[2] === 0 && c.gravity[1] <= 0) s.setProjectile({ gravity: -c.gravity[1] }, true);
      wakeAll();
      return;
    case "apply_impulse": {
      if (c.id === "all") {
        // Velocity kick (m/s) for everything, with a little random spread so
        // objects don't move in lockstep.
        for (const [id, b] of liveBodies()) {
          if (!b.isDynamic()) continue;
          const m = s.objects[id]?.massKg ?? b.mass();
          const j = c.impulse.map((v) => (v + (Math.random() - 0.5) * Math.max(0.4, Math.abs(v) * 0.6)) * m);
          b.applyImpulse({ x: j[0], y: j[1], z: j[2] }, true);
          b.applyTorqueImpulse({ x: (Math.random() - 0.5) * m * 0.05, y: (Math.random() - 0.5) * m * 0.05, z: 0 }, true);
        }
      } else {
        const b = getBody(c.id);
        if (!b) return;
        // Real impulse (N·s), but never faster than the speed limit.
        const m = Math.max(b.mass(), 1e-3);
        const dv = Math.hypot(...c.impulse) / m;
        const k = dv > LIMITS.maxSpeed ? LIMITS.maxSpeed / dv : 1;
        b.applyImpulse({ x: c.impulse[0] * k, y: c.impulse[1] * k, z: c.impulse[2] * k }, true);
      }
      return;
    }
    case "apply_force": {
      const b = getBody(c.id);
      if (!b) return;
      b.addForce({ x: c.force[0], y: c.force[1], z: c.force[2] }, true);
      await sleep(c.durationMs, signal);
      getBody(c.id)?.resetForces(true);
      return;
    }
    case "set_velocity":
      getBody(c.id)?.setLinvel({ x: c.velocity[0], y: c.velocity[1], z: c.velocity[2] }, true);
      return;
    case "reset_simulation":
      s.resetSimulation();
      await sleep(300, signal);
      return;
    case "simulation":
      if (c.action === "step") {
        s.set({ paused: false });
        await sleep(100, signal);
        st().set({ paused: true });
      } else s.set({ paused: c.action === "pause" });
      return;
    case "launch_projectile": {
      const gravity = c.gravity ?? (s.world === "court" ? s.projectile?.gravity : Math.max(0, -s.gravity[1])) ?? 9.81;
      if (s.world !== "court") {
        s.loadWorld("court");
        await sleep(450, signal);
      }
      st().set({ capability: "projectile" });
      st().setProjectile(
        {
          speed: toMetersPerSecond(c.speed, c.unit),
          angleDeg: c.angleDeg,
          gravity,
          height: c.heightM ?? 0,
          ball: c.ball ?? "basketball",
        },
        true,
      );
      return;
    }
    case "set_parameter": {
      const p = s.projectile;
      if (s.world === "court" && p && ["speed", "angle", "height", "gravity"].includes(c.name)) {
        const bounded = (key: keyof typeof PROJECTILE_LIMITS) => Math.min(Math.max(c.value, PROJECTILE_LIMITS[key].min), PROJECTILE_LIMITS[key].max);
        const patch = c.name === "speed" ? { speed: bounded("speed") } : c.name === "angle" ? { angleDeg: bounded("angleDeg") } : c.name === "height" ? { height: bounded("height") } : { gravity: bounded("gravity") };
        s.setProjectile(patch, true);
        s.set({ paused: false });
      } else if (c.name === "gravity") {
        s.set({ gravity: [0, -Math.min(Math.max(c.value, 0), LIMITS.maxGravity), 0], paused: false });
        if (s.world === "mechanics" && s.modules.mechanics && c.value <= 100) setModules({ mechanics: { ...s.modules.mechanics, gravity: Math.max(c.value, 0) } });
        wakeAll();
      } else {
        const m = s.modules;
        const v = c.value;
        if (c.name === "time_speed" && m.orbits) setModules({ orbits: { ...m.orbits, daysPerSecond: Math.min(Math.max(v, 0), 400) } });
        const board = circuitBoard(m.circuit);
        if (c.name === "voltage" && board) setModules({ circuit: { ...board, parts: board.parts.map((p) => (p.kind === "battery" ? { ...p, value: Math.min(Math.max(v, 0.1), 24) } : p)) } });
        if ((c.name === "frequency" || c.name === "amplitude" || c.name === "wavelength") && m.wave) {
          const lim = { frequency: [0.1, 4], amplitude: [0.05, 1.2], wavelength: [0.5, 6] }[c.name];
          setModules({ wave: { ...m.wave, [c.name]: Math.min(Math.max(v, lim[0]), lim[1]) } });
        } else if (c.name === "frequency" && m.ripple) setModules({ ripple: { ...m.ripple, frequency: Math.min(Math.max(v, 0.3), 3) } });
        if (c.name === "temperature" && m.particles) setModules({ particles: { ...m.particles, temperatureC: Math.min(Math.max(v, -273), 3500) } });
        if (m.lever && (c.name === "left_mass" || c.name === "right_mass")) setModules({ lever: { ...m.lever, [c.name === "left_mass" ? "leftMass" : "rightMass"]: Math.min(Math.max(v, 0.1), 50) } });
        if (m.lever && (c.name === "left_distance" || c.name === "right_distance")) setModules({ lever: { ...m.lever, [c.name === "left_distance" ? "leftDistance" : "rightDistance"]: Math.min(Math.max(v, 0.1), 2.4) } });
      }
      return;
    }
    case "spawn_shape": {
      const base = {
        id: c.id,
        type: "shape" as const,
        shape: c.shape as ShapeKind,
        size: c.size as Vec3,
        sides: c.sides,
        points: c.points as [number, number][] | undefined,
        path: c.path as Vec3[] | undefined,
        // Drawn paths (arrows, lines) stay where they were drawn.
        position: (c.physics ?? "none") === "none" && !c.path ? clearOfScenery(c.position as Vec3, c.size as Vec3) : (c.position as Vec3),
        rotation: (c.rotation as Vec3 | undefined) ?? [0, 0, 0],
        scale: 1,
        physics: c.physics ?? "none",
        label: c.label,
        color: c.color,
        opacity: c.opacity ?? 1,
        glow: c.glow ?? false,
        wireframe: c.wireframe ?? false,
        material: c.material,
        morphMs: 700,
        massKg: 1,
        bounciness: 0.3,
        drag: 0.05,
        visible: true,
        version: 0,
      };
      const vol = objectVolume(base);
      markFresh(c.id);
      s.upsertObject({ ...base, massKg: c.material ? massFor(c.material, vol) : Math.min(50, Math.max(0.05, vol * 600)) });
      await sleep(380, signal);
      return;
    }
    case "morph_shape": {
      const o = s.objects[c.id];
      if (!o) return;
      const ms = c.durationMs ?? 1200;
      const patch: Partial<SceneObject> = {};
      if (o.type === "shape") Object.assign(patch, { morphMs: ms, ...(c.size ? { size: c.size as Vec3 } : {}), ...(c.sides ? { sides: c.sides } : {}), ...(c.opacity !== undefined ? { opacity: c.opacity } : {}) });
      if (c.color) patch.color = c.color;
      if (c.rotation) patch.rotation = c.rotation as Vec3;
      if (c.position) {
        const b = getBody(c.id);
        if (b) b.setTranslation({ x: c.position[0], y: c.position[1], z: c.position[2] }, true);
        patch.position = c.position as Vec3;
      }
      // Physics bodies rebuild their collider for a new size.
      if (o.physics !== "none" && c.size) patch.version = o.version + 1;
      s.patchObject(c.id, patch);
      await sleep(ms, signal);
      return;
    }
    case "show_card": {
      // Placeholders stay in the text; the card fills them as it renders, so
      // its numbers follow the simulation (e.g. after a bulb breaks).
      const card = {
        id: c.id,
        title: c.title,
        subtitle: c.subtitle,
        rows: c.rows ?? [],
        bullets: c.bullets ?? [],
        placement: c.placement ?? (c.target ? "object" : "center"),
        target: c.target,
        tone: c.tone ?? "info",
      } as const;
      s.set({ cards: [...s.cards.filter((k) => k.id !== c.id).slice(-3), card] });
      if (c.durationMs) {
        const id = c.id;
        setTimeout(() => useSim.getState().set({ cards: useSim.getState().cards.filter((k) => k.id !== id) }), c.durationMs);
      }
      await sleep(600, signal);
      return;
    }
    case "hide_card":
      s.set({ cards: c.id === "all" ? [] : s.cards.filter((k) => k.id !== c.id) });
      return;
    case "show_orbits":
      setModules({ orbits: { mode: c.mode, planets: c.planets?.length ? c.planets : ALL_PLANETS, focus: c.focus ?? null, daysPerSecond: c.daysPerSecond ?? (c.mode === "solar_system" ? 20 : c.mode === "earth_moon" ? 2 : 15), labels: c.labels ?? true, distances: s.modules.orbits?.distances ?? {} } });
      s.set({ capability: "orbits" });
      await sleep(500, signal);
      return;
    case "set_module": {
      const m = s.modules;
      switch (c.module) {
        case "mechanics": {
          const setup = { ...(m.mechanics ?? DEFAULT_MECHANICS), ...MODULE_FIELDS.mechanics.parse(c.set) };
          setModules({ mechanics: setup });
          s.set({ gravity: [0, -setup.gravity, 0] });
          break;
        }
        case "maths":
          setMaths({ ...(m.maths ?? DEFAULT_MATH), ...MODULE_FIELDS.maths.parse(c.set) });
          break;
        case "orbits":
          setModules({ orbits: { ...(m.orbits ?? MODULE_DEFAULTS.orbits), ...MODULE_FIELDS.orbits.parse(c.set) } });
          break;
        case "fluid":
          setModules({ fluid: MODULE_FIELDS.fluid.parse(c.set).fluid ?? m.fluid ?? MODULE_DEFAULTS.fluid });
          wakeAll();
          break;
        case "magnet":
          setModules({ magnet: { ...(m.magnet ?? MODULE_DEFAULTS.magnet), ...MODULE_FIELDS.magnet.parse(c.set) } });
          break;
        case "circuit": {
          const p = MODULE_FIELDS.circuit.parse(c.set);
          let board = circuitBoard(m.circuit) ?? MODULE_DEFAULTS.circuit;
          // The classic series/parallel fields still work: a layout or bulb count rebuilds that loop.
          if (p.layout || p.bulbs) {
            const battery = board.parts.find((x) => x.kind === "battery");
            board = { ...legacyBoard({ layout: p.layout ?? (board.parts.some((x) => x.kind === "bulb" && x.a[0] === x.b[0] && x.a[0] > 1) ? "parallel" : "series"), voltage: battery?.value ?? 6, bulbs: p.bulbs ?? Math.max(1, board.parts.filter((x) => x.kind === "bulb").length), closed: true, broken: [] }), flow: board.flow, readings: board.readings };
          }
          const bulbs = board.parts.filter((x) => x.kind === "bulb");
          const parts = board.parts.map((x) => {
            if (x.kind === "battery" && p.voltage !== undefined) return { ...x, value: Math.max(p.voltage, 0.1) };
            if (x.kind === "switch" && p.switchClosed !== undefined) return { ...x, closed: p.switchClosed };
            if (x.kind === "resistor" && p.resistanceOhms !== undefined) return { ...x, value: p.resistanceOhms };
            if (x.kind === "bulb" && p.brokenBulbs) return { ...x, broken: p.brokenBulbs.includes(bulbs.indexOf(x) + 1) };
            return x;
          });
          setModules({ circuit: { ...board, parts, flow: p.flow ?? board.flow, readings: p.readings ?? board.readings } });
          break;
        }
        case "wave":
          setModules({ wave: { ...(m.wave ?? MODULE_DEFAULTS.wave), ...MODULE_FIELDS.wave.parse(c.set) } });
          break;
        case "lever": {
          const p = MODULE_FIELDS.lever.parse(c.set);
          const cur = m.lever ?? MODULE_DEFAULTS.lever;
          setModules({ lever: { leftMass: p.leftMassKg ?? cur.leftMass, leftDistance: p.leftDistanceM ?? cur.leftDistance, rightMass: p.rightMassKg ?? cur.rightMass, rightDistance: p.rightDistanceM ?? cur.rightDistance } });
          break;
        }
        case "particles":
          setModules({ particles: { ...(m.particles ?? MODULE_DEFAULTS.particles), ...MODULE_FIELDS.particles.parse(c.set) } });
          break;
        case "cell":
          setModules({ cell: { ...(m.cell ?? MODULE_DEFAULTS.cell), ...MODULE_FIELDS.cell.parse(c.set) } });
          break;
        case "reaction":
          setModules({ reaction: { ...(m.reaction ?? MODULE_DEFAULTS.reaction), ...MODULE_FIELDS.reaction.parse(c.set) } });
          break;
        case "population":
          setModules({ population: { ...(m.population ?? MODULE_DEFAULTS.population), ...MODULE_FIELDS.population.parse(c.set) } });
          break;
        case "genetics":
          setModules({ genetics: { ...(m.genetics ?? MODULE_DEFAULTS.genetics), ...MODULE_FIELDS.genetics.parse(c.set) } });
          break;
        case "osmosis":
          setModules({ osmosis: { ...(m.osmosis ?? MODULE_DEFAULTS.osmosis), ...MODULE_FIELDS.osmosis.parse(c.set) } });
          break;
        case "globe":
          setModules({ globe: { ...(m.globe ?? MODULE_DEFAULTS.globe), ...MODULE_FIELDS.globe.parse(c.set) } });
          break;
        case "ripple": {
          const p = MODULE_FIELDS.ripple.parse(c.set);
          const cur = m.ripple ?? MODULE_DEFAULTS.ripple;
          const next = {
            ...cur,
            ...(p.windSpeedMps !== undefined ? { windSpeed: p.windSpeedMps === null ? undefined : p.windSpeedMps, ...(p.windSpeedMps === null ? {} : { source: "plane" as const, sourceSpeed: 0 }) } : {}),
            frequency: p.frequencyHz ?? cur.frequency,
            amplitude: p.amplitude ?? cur.amplitude,
            depth: p.depthM ?? cur.depth,
            source: p.windSpeedMps != null ? "plane" as const : p.source ?? cur.source,
            separation: p.separationM ?? cur.separation,
            barrier: p.barrier ?? cur.barrier,
            gapWidth: p.gapWidthM ?? cur.gapWidth,
            barrierX: p.barrierX ?? cur.barrierX,
            reflectorAngle: p.reflectorAngleDeg ?? cur.reflectorAngle,
            shallow: p.shallow ?? cur.shallow,
            shallowDepth: p.shallowDepthM ?? cur.shallowDepth,
            sourceSpeed: p.windSpeedMps != null ? 0 : p.sourceSpeed ?? cur.sourceSpeed,
            view: p.view ?? cur.view,
          };
          // The tank takes the middle of the workshop mat.
          setModules({ ripple: next, ...(m.ripple ? {} : { wave: null, lever: null, circuit: null }) });
          break;
        }
        case "signal":
          setModules({ signal: patchSignal(m.signal ?? MODULE_DEFAULTS.signal, MODULE_FIELDS.signal.parse(c.set)) });
          break;
        case "optics":
          setModules({ optics: patchOptics(m.optics ?? opticsPreset("free"), MODULE_FIELDS.optics.parse(c.set)) });
          break;
      }
      await sleep(500, signal);
      return;
    }
    case "set_environment": {
      s.set({ environment: applyEnvironment(s.environment, c) });
      await sleep(400, signal);
      return;
    }
    case "set_fluid":
      setModules({ fluid: c.fluid });
      s.set({ capability: "buoyancy" });
      wakeAll();
      return;
    case "plot_function": {
      if (s.world === "math_studio" && s.modules.maths?.mode === "functions") setModules({ maths: { ...s.modules.maths, expression: c.expression } });
      const plot = s.modules.plot ?? { functions: [], points: [], vectors: [] };
      const rest = plot.functions.filter((p) => p.id !== c.id).slice(-5);
      const fn = { id: c.id, expression: c.expression, xMin: c.xMin ?? -10, xMax: c.xMax ?? 10, color: c.color ?? PLOT_COLORS[rest.length % PLOT_COLORS.length], label: c.label };
      setModules({ plot: { ...plot, functions: [...rest, fn] } });
      s.set({ capability: "graph" });
      await sleep(900, signal);
      return;
    }
    case "plot_point": {
      const plot = s.modules.plot ?? { functions: [], points: [], vectors: [] };
      setModules({ plot: { ...plot, points: [...plot.points.filter((p) => p.id !== c.id).slice(-19), { id: c.id, x: c.x, y: c.y, label: c.label, color: c.color ?? "#e5484d" }] } });
      await sleep(250, signal);
      return;
    }
    case "plot_vector": {
      const plot = s.modules.plot ?? { functions: [], points: [], vectors: [] };
      const v = { id: c.id, from: c.from as [number, number], to: c.to as [number, number], label: c.label, color: c.color ?? "#2f80ed" };
      setModules({ plot: { ...plot, vectors: [...plot.vectors.filter((p) => p.id !== c.id).slice(-7), v] } });
      await sleep(400, signal);
      return;
    }
    case "clear_plot":
      setModules({ plot: { functions: [], points: [], vectors: [] } });
      return;
    case "build_circuit":
      setModules({ circuit: legacyBoard({ layout: c.layout, voltage: c.voltage, bulbs: c.bulbs, closed: c.switchClosed ?? true, broken: [] }), ripple: null, magnet: null });
      s.set({ capability: "circuit" });
      await sleep(600, signal);
      return;
    case "show_magnets": {
      const base = c.preset ? magnetPreset(c.preset) : { ...(s.modules.magnet ?? magnetPreset("bar_magnet")), items: [] };
      const items = c.items ? c.items.map((it, k) => ({ ...it, id: it.id ?? `${it.kind}_${k + 1}`, angleDeg: it.angleDeg ?? 0 })) : base.items;
      setModules({ magnet: { ...base, items }, circuit: null, ripple: null, wave: null, lever: null });
      s.set({ capability: "magnetism" });
      await sleep(600, signal);
      return;
    }
    case "place_magnet": {
      const lab = s.modules.magnet ?? { ...magnetPreset("bar_magnet"), items: [] };
      const old = lab.items.find((i) => i.id === c.id);
      const item = { ...old, ...c, angleDeg: c.angleDeg ?? old?.angleDeg ?? 0 };
      setModules({ magnet: { ...lab, items: old ? lab.items.map((i) => (i.id === c.id ? item : i)) : [...lab.items, item].slice(-30) }, circuit: null, ripple: null });
      s.set({ capability: "magnetism" });
      await sleep(500, signal);
      return;
    }
    case "remove_magnet": {
      const lab = s.modules.magnet;
      if (lab) setModules({ magnet: { ...lab, items: lab.items.filter((i) => i.id !== c.id) } });
      await sleep(300, signal);
      return;
    }
    case "show_circuit": {
      const flow = circuitBoard(s.modules.circuit)?.flow ?? "conventional";
      const board = c.parts ? { v: 2 as const, flow, readings: true, parts: c.parts.reduce<Part[]>((acc, p) => placePart(acc, { ...p, a: p.a as Pt, b: p.b as Pt }), []) } : presetBoard(c.preset ?? "series_bulbs", flow);
      setModules({ circuit: board, ripple: null, wave: null, lever: null, magnet: null });
      s.set({ capability: "circuit" });
      await sleep(600, signal);
      return;
    }
    case "place_part": {
      const board = circuitBoard(s.modules.circuit) ?? presetBoard("empty");
      setModules({ circuit: { ...board, parts: placePart(board.parts, { ...c, a: c.a as Pt, b: c.b as Pt }) }, ripple: null, magnet: null });
      s.set({ capability: "circuit" });
      await sleep(400, signal);
      return;
    }
    case "remove_part": {
      const board = circuitBoard(s.modules.circuit);
      if (board) setModules({ circuit: { ...board, parts: board.parts.filter((p) => p.id !== c.id && !p.id.startsWith(`${c.id}_`)) } });
      await sleep(300, signal);
      return;
    }
    case "set_part": {
      const board = circuitBoard(s.modules.circuit);
      if (!board) return;
      const parts = board.parts.map((p) => (p.id !== c.id ? p : { ...p, ...(c.value !== undefined ? { value: c.value } : {}), ...(c.closed !== undefined ? { closed: c.closed } : {}), ...(c.color ? { color: c.color } : {}), ...(c.broken !== undefined ? { broken: c.broken } : {}), ...(c.flip ? { a: p.b, b: p.a } : {}) }));
      setModules({ circuit: { ...board, parts } });
      await sleep(400, signal);
      return;
    }
    case "show_wave":
      setModules({ wave: { kind: c.kind, amplitude: c.amplitude, frequency: c.frequency, wavelength: c.wavelength }, ripple: null });
      s.set({ capability: "waves" });
      await sleep(500, signal);
      return;
    case "build_lever":
      setModules({ lever: { leftMass: c.leftMassKg, leftDistance: c.leftDistanceM, rightMass: c.rightMassKg, rightDistance: c.rightDistanceM }, ripple: null });
      s.set({ capability: "lever" });
      await sleep(900, signal);
      return;
    case "show_ripple_tank": {
      const d = MODULE_DEFAULTS.ripple;
      const first = !s.modules.ripple;
      setModules({
        ripple: { ...d, ...(c.windSpeedMps !== undefined ? { windSpeed: c.windSpeedMps } : {}), source: c.windSpeedMps !== undefined ? "plane" : c.source ?? d.source, frequency: c.frequencyHz ?? d.frequency, depth: c.depthM ?? d.depth, barrier: c.barrier ?? d.barrier, gapWidth: c.gapWidthM ?? d.gapWidth, separation: c.separationM ?? d.separation, shallow: c.shallow ?? d.shallow, sourceSpeed: c.sourceSpeed ?? d.sourceSpeed, view: c.view ?? d.view },
        wave: null,
        lever: null,
        circuit: null,
      });
      s.set({ capability: "waves" });
      if (first) s.focus({ target: RIPPLE_TANK.center, distance: 7.5 });
      await sleep(800, signal);
      return;
    }
    case "show_signal": {
      const first = !s.modules.signal;
      const base = signalDefaults(c.kind, c.layout ?? s.modules.signal?.layout ?? "apartment");
      setModules({ signal: patchSignal(base, { source: c.source, device: c.device, soundHz: c.soundHz, view: c.view }) });
      s.set({ capability: "signal" });
      if (first) {
        s.focus({ target: [0, 0.4, 0.2], distance: 13 });
        // The plan covers the guide's usual spot: stand at the stage's edge instead.
        if (s.world === "stage" && s.characters[GUIDE_ID]) s.patchCharacter(GUIDE_ID, { position: [3.75, 0, 3.15] });
      }
      await sleep(800, signal);
      return;
    }
    case "show_optics": {
      // The Light Lab's home view already frames the table.
      setModules({ optics: opticsPreset(c.preset, { color: c.color, angleDeg: c.angleDeg, material: c.material }) });
      s.set({ capability: "light" });
      await sleep(700, signal);
      return;
    }
    case "place_optic": {
      const o = s.modules.optics ?? opticsPreset("free");
      const old = o.elements.find((e) => e.id === c.id);
      const [x, z] = c.position as [number, number];
      const e: OpticElement = {
        id: c.id,
        kind: c.element,
        x: Math.min(TABLE.x, Math.max(-TABLE.x, x)),
        z: Math.min(TABLE.z, Math.max(-TABLE.z, z)),
        rotationDeg: c.rotationDeg ?? old?.rotationDeg ?? 0,
        size: c.sizeM ?? (old?.kind === c.element ? old.size : OPTIC_SIZE[c.element]),
        width: c.widthM ?? old?.width,
        focalLength: c.focalLengthM ?? old?.focalLength ?? 0.8,
        material: c.material ?? old?.material ?? "glass",
      };
      const elements = old ? o.elements.map((k) => (k.id === c.id ? e : k)) : [...o.elements, e].slice(-MAX_OPTICS);
      setModules({ optics: { ...o, elements } });
      s.set({ capability: "light" });
      await sleep(600, signal);
      return;
    }
    case "remove_optic": {
      const o = s.modules.optics;
      if (!o) return;
      const at = sourcePosition(o.source, o.elements);
      const source = o.source.aimAt === c.id ? { ...o.source, aimAt: null, x: at[0], z: at[1] } : o.source;
      setModules({ optics: { ...o, source, elements: o.elements.filter((e) => e.id !== c.id), object: o.object?.target === c.id ? null : o.object } });
      await sleep(400, signal);
      return;
    }
    case "show_particles":
      // First appearance: bring the camera in so the particles are big enough to see.
      if (!s.modules.particles) s.focus({ target: [0, 1.7, 0], distance: 6 });
      clearPedestal("particles");
      setModules({ particles: { substance: c.substance, temperatureC: c.temperatureC } });
      s.set({ capability: "matter" });
      await sleep(500, signal);
      return;
    case "show_reaction":
    case "show_population":
    case "show_genetics":
    case "show_osmosis": {
      const key = c.op.slice(5) as "reaction" | "population" | "genetics" | "osmosis";
      // Frame the bench: the reaction and Punnett boards stand tall, so step back further.
      if (!s.modules[key]) s.focus(key === "reaction" ? { target: [0, 2.1, 0], distance: 7 } : key === "genetics" ? { target: [0, 2.1, 0], distance: 6.8 } : { target: [0, 1.6, 0], distance: 5.5 });
      clearPedestal(key);
      const cur = st().modules;
      if (c.op === "show_reaction") setModules({ reaction: { ...(cur.reaction ?? MODULE_DEFAULTS.reaction), ...(c.equation ? { equation: c.equation } : {}) } });
      else if (c.op === "show_population") setModules({ population: { ...(cur.population ?? MODULE_DEFAULTS.population), model: c.model } });
      else if (c.op === "show_genetics") setModules({ genetics: { ...(cur.genetics ?? MODULE_DEFAULTS.genetics), parent1: c.parent1, parent2: c.parent2 } });
      else setModules({ osmosis: { ...(cur.osmosis ?? MODULE_DEFAULTS.osmosis), mode: c.mode } });
      s.set({ capability: key });
      await sleep(600, signal);
      return;
    }
    case "show_cell":
      clearPedestal("cell");
      setModules({ cell: { kind: c.kind, highlight: c.highlight ?? null } });
      s.set({ capability: "cell" });
      await sleep(600, signal);
      return;
    case "show_periodic_table": {
      const { op: _op, focus: face, ...patch } = c;
      void _op;
      // Switch teaching surfaces so a large atom/cell cannot obscure the board.
      if (face !== false) clearPedestal("table");
      setModules({ periodicTable: { ...(s.modules.periodicTable ?? EMPTY_TABLE), ...patch } });
      if (face !== false) s.focus({ preset: "periodic_table" });
      await sleep(600, signal);
      return;
    }
    case "show_globe": {
      const g = s.modules.globe ?? { view: "globe" as const, spin: true, focus: null, marks: [], routes: [] };
      setModules({ globe: { ...g, view: c.view, spin: c.spin ?? g.spin, focus: c.focus ?? g.focus } });
      s.set({ capability: "globe" });
      await sleep(500, signal);
      return;
    }
    case "mark_place": {
      const g = s.modules.globe ?? { view: "globe" as const, spin: false, focus: null, marks: [], routes: [] };
      const place = c.place ? PLACES.find((p) => p.id === c.place) : undefined;
      const lat = place?.lat ?? c.lat!, lon = place?.lon ?? c.lon!;
      const mark = { id: c.id, lat, lon, label: c.label ?? place?.name ?? `${lat.toFixed(1)}°, ${lon.toFixed(1)}°`, color: c.color ?? "#e5484d" };
      setModules({ globe: { ...g, spin: false, focus: c.id, marks: [...g.marks.filter((m) => m.id !== c.id).slice(-11), mark] } });
      await sleep(700, signal);
      return;
    }
    case "connect_places": {
      const g = s.modules.globe;
      if (!g) return;
      setModules({ globe: { ...g, routes: [...g.routes.filter((r) => r.id !== c.id).slice(-5), { id: c.id, from: c.from, to: c.to }] } });
      await sleep(900, signal);
      return;
    }
    case "show_annotation": {
      const rest = s.annotations.filter((a) => a.id !== c.id).slice(-(LIMITS.maxAnnotations - 1));
      s.set({ annotations: [...rest, { id: c.id, text: fillPlaceholders(c.text, resolvePlaceholder), target: c.target, position: c.position as Vec3 | undefined, tone: c.tone ?? "info" }] });
      await sleep(300, signal);
      return;
    }
    case "show_vector": {
      const rest = s.vectors.filter((v) => v.id !== c.id).slice(-(LIMITS.maxVectors - 1));
      s.set({ vectors: [...rest, { id: c.id, target: c.target, origin: c.origin as Vec3 | undefined, vector: c.vector as Vec3, color: c.color ?? "#facc15", label: c.label && fillPlaceholders(c.label, resolvePlaceholder) }] });
      // Arrows grow in one after another instead of all at once.
      await sleep(380, signal);
      return;
    }
    case "show_formula":
      s.set({ formula: { title: c.title, formula: c.formula, variables: c.variables } });
      return;
    case "show_measurement": {
      const key = c.target ? `${c.metric}:${c.target}` : c.metric;
      if (!s.metrics.includes(key)) s.set({ metrics: [...s.metrics.slice(-5), key] });
      return;
    }
    case "clear_annotations":
      if (s.modules.periodicTable) setModules({ periodicTable: EMPTY_TABLE });
      s.set({ annotations: [], vectors: [], metrics: [], formula: null, highlighted: [], cards: [] });
      return;
    case "focus_camera": {
      const optic = s.world === "optics" && c.target ? s.modules.optics?.elements.find((element) => element.id === c.target) : undefined;
      const target = c.target ? (livePosition(c.target) ?? s.objects[c.target]?.position ?? s.characters[c.target]?.position ?? (optic ? [optic.x, OPTICS_TABLE.center[1] + 0.1, optic.z] as Vec3 : undefined)) : (c.position as Vec3 | undefined);
      // Frame the target together with the guide, so the bubble stays readable.
      const guide = s.characters[GUIDE_ID] && target && s.camera.preset !== "periodic_table" ? pointsOf(GUIDE_ID) : [];
      if (guide.length && target) s.focus({ points: [...guide, ...pointsOf(c.target ?? target)], radius: { close: 1.2, medium: 2.2, wide: 4.5 }[c.zoom ?? "medium"] });
      else s.focus({ target: target ?? WORLDS[s.world].camera.target, zoom: c.zoom ?? "medium" });
      await sleep(500, signal);
      return;
    }
    case "set_camera":
      s.focus({ preset: c.preset });
      await sleep(400, signal);
      return;
    case "spawn_character":
      s.upsertCharacter({ id: c.id, kind: c.character, name: c.name, color: c.color, position: c.position as Vec3, animation: "wave", animNonce: 1 });
      await sleep(350, signal);
      return;
    case "animate_character": {
      const ch = s.characters[c.id];
      if (ch) s.patchCharacter(c.id, { animation: c.animation, animNonce: ch.animNonce + 1 });
      await sleep(250, signal);
      return;
    }
    case "walk_character": {
      const ch = s.characters[c.id];
      if (!ch) return;
      const dist = Math.hypot(c.position[0] - ch.position[0], c.position[2] - ch.position[2]);
      s.patchCharacter(c.id, { position: c.position as Vec3 });
      await sleep(Math.min(4000, (dist / 1.6) * 1000 + 200), signal);
      return;
    }
    case "speak": {
      const text = fillPlaceholders(c.text, resolvePlaceholder);
      const speaker = c.speaker === "narrator" ? null : s.characters[c.speaker];
      const key = ++speechKey;
      s.set({ speech: { key, speaker: c.speaker, text, emotion: c.emotion } });
      // The bubble is the only way a muted student hears this line.
      if (speaker && s.camera.preset !== "periodic_table") keepInView(speaker.id);
      if (speaker) s.patchCharacter(speaker.id, { animation: "talk", animNonce: speaker.animNonce + 1 });
      useSim.getState().addMessage("assistant", speaker ? `${speaker.name}: ${text}` : text, true);

      const line = new AbortController();
      const onAbort = () => line.abort();
      signal.addEventListener("abort", onAbort);
      skipLine = () => line.abort();
      const { voice, voiceRate } = st().settings;
      const reading = sleep(Math.max(1800, 500 + text.length * 55) / voiceRate, line.signal);
      const role: VoiceRole = speaker ? speaker.kind : "narrator";
      if (voice) {
        const [heard] = await Promise.all([speak(text, { lang, rate: voiceRate, pitch: PITCH[speaker?.kind ?? ""] ?? 1, role, signal: line.signal }), sleep(1200, line.signal)]);
        // Nothing played (no voice available): give the caption its reading time.
        if (!heard) await reading;
      } else await reading;
      signal.removeEventListener("abort", onAbort);
      skipLine = null;
      if (speaker && st().characters[speaker.id]?.animation === "talk") st().patchCharacter(speaker.id, { animation: "idle" });
      if (st().speech?.key === key) st().set({ speech: null });
      await sleep(150, signal);
      return;
    }
    case "wait":
      await sleep(c.ms, signal);
      return;
    case "wait_for": {
      const timeout = c.timeoutMs ?? 8000;
      if (c.event === "projectile_landed") {
        if (st().projectile?.status !== "flying") return;
        await waitFor("projectile_landed", timeout, signal);
      } else {
        await sleep(400, signal);
        const until = Date.now() + timeout;
        while (!signal.aborted && Date.now() < until && !allSettled()) await sleep(200, signal);
      }
      return;
    }
    case "ask_question":
      s.set({ question: { question: c.question, choices: c.choices, answerIndex: c.answerIndex, explanation: c.explanation, picked: null } });
      await waitFor("answer", 90_000, signal);
      await sleep(2600, signal);
      st().set({ question: null });
      return;
    case "build_molecule":
    case "build_atom": {
      // Any other compound: fetch its PubChem 3D model first (a few KB). Only the
      // latest request lands, so repeated clicks while it loads can't stack copies.
      let molecule = c.op === "build_molecule" ? c.molecule : undefined;
      if (c.op === "build_molecule" && c.compound) {
        const mine = ++compoundSeq;
        useCompoundJob.setState({ job: { name: c.compound, at: (c.position as Vec3 | undefined) ?? defaultMoleculeSpot() } });
        try {
          molecule = (await loadCompound({ name: c.compound })).id;
        } catch (e) {
          if (mine === compoundSeq) useCompoundJob.setState({ job: { name: c.compound, at: useCompoundJob.getState().job?.at ?? defaultMoleculeSpot(), error: e instanceof Error ? e.message : "Couldn't load that compound." } });
          return;
        }
        if (mine !== compoundSeq) return;
        useCompoundJob.setState({ job: null });
        if (signal.aborted) return;
      } else {
        // Anything else on the bench cancels a compound still loading.
        compoundSeq++;
        if (useCompoundJob.getState().job) useCompoundJob.setState({ job: null });
      }
      clearPedestal("chem");
      const base = { id: c.id, position: (c.position as Vec3 | undefined) ?? defaultMoleculeSpot(), rotation: [0, 0, 0] as Vec3, scale: 1, physics: "none" as const, massKg: 1, bounciness: 0, drag: 0, visible: true, version: 0 };
      s.upsertObject(c.op === "build_molecule" ? { ...base, type: "molecule", molecule: molecule! } : { ...base, type: "atom", element: c.element });
      s.set({ capability: c.op === "build_molecule" ? "molecule" : "atom" });
      await sleep(500, signal);
      return;
    }
  }
}

/** Run a single command from the UI (sliders, buttons) outside any plan. */
/** Runs a command from the student's own panel (never a lesson), so it is remembered as what they did. */
export function execNow(c: Command) {
  const { op, ...args } = c;
  const params = JSON.stringify(args).slice(0, 110);
  // A click that already said exactly what was picked (an element, a part) keeps that richer note.
  const last = useSim.getState().attention;
  if (!last || Date.now() - last.at > 400) noteFocus({ kind: "action", label: `Used the panel: ${op}${params === "{}" ? "" : ` ${params}`}` });
  void exec(c, new AbortController().signal);
}

export function answerQuestion(i: number) {
  const q = st().question;
  if (!q || q.picked !== null) return;
  st().set({ question: { ...q, picked: i } });
  emit("answer", i);
}
