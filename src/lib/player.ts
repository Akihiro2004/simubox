"use client";

// SimuPlayer: executes validated SSP plans against the live scene, one
// command at a time. A new plan (or reset) aborts the running one at once.

import { Euler, Quaternion } from "three";
import { ASSETS, LIMITS, WORLDS, type Vec3 } from "./world/catalog";
import { assetObject, type SceneObject } from "./world/scene";
import { allSettled, emit, getBody, liveBodies, livePosition, markFresh, waitFor } from "./world/runtime";
import { fmt, toMetersPerSecond } from "./engine/projectile";
import { fillPlaceholders } from "./ssp/validate";
import { MODULE_FIELDS, type Command, type ScenePlan, type Step } from "./ssp/schema";
import { applyEnvironment } from "./environment";
import { pickScene, projectileResult, useSim, type Explanation } from "./store";
import { prefetchLine, speak, stopSpeaking, type VoiceRole } from "./tts";
import { ALL_PLANETS, MODULE_DEFAULTS, massFor, moduleValue, objectVolume, type Modules } from "./modules";
import { PLACES } from "./engine/geo";
import type { ShapeKind } from "./engine/geometry";
import { EMPTY_TABLE } from "./periodic-table";

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
  st().set({ speech: null, aiStatus: st().aiStatus === "playing" ? "idle" : st().aiStatus });
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
    }
  }
}

/** The rest of a streamed plan arrived: keep it for replay/saving and show its follow-ups. */
export function finishPlan(plan: ScenePlan, source: Explanation["source"]) {
  const s = st();
  s.set({ lastPlan: plan, followUps: plan.followUps, explanation: explanationOf(plan, source) });
  if (plan.question) s.set({ topic: plan.question });
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
  const g = s.capability === "projectile" && p ? p.gravity : Math.abs(s.gravity[1]);
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

/** Molecules, atoms, particles and cells share the lab pedestal: one at a time. */
function clearPedestal(keep: "chem" | "particles" | "cell" | "table") {
  const s = st();
  if (keep !== "table" && s.camera.preset === "periodic_table") s.focus({ preset: "home" });
  if (keep !== "chem") for (const o of Object.values(s.objects)) if (o.type === "molecule" || o.type === "atom") s.removeObject(o.id);
  setModules({ particles: keep === "particles" ? st().modules.particles : null, cell: keep === "cell" ? st().modules.cell : null });
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

function defaultMoleculeSpot(): Vec3 {
  const s = st();
  const taken = Object.values(s.objects).filter((o) => o.type === "molecule" || o.type === "atom").length;
  const y = s.world === "lab" ? 2.1 : 1.6;
  return [[0, -1.9, 1.9][taken % 3], y, 0];
}

export async function exec(c: Command, signal: AbortSignal, lang: "en" | "id" = "en"): Promise<void> {
  const s = st();
  switch (c.op) {
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
      if (s.world !== "court") {
        s.loadWorld("court");
        await sleep(450, signal);
      }
      st().set({ capability: "projectile" });
      st().setProjectile(
        {
          speed: toMetersPerSecond(c.speed, c.unit),
          angleDeg: c.angleDeg,
          gravity: c.gravity ?? 9.81,
          height: c.heightM ?? 0,
          ball: c.ball ?? "basketball",
        },
        true,
      );
      return;
    }
    case "set_parameter": {
      const p = s.projectile;
      if (s.world === "court" && p) {
        const patch = c.name === "speed" ? { speed: Math.min(c.value, 100) } : c.name === "angle" ? { angleDeg: Math.min(c.value, 90) } : c.name === "height" ? { height: Math.min(c.value, 20) } : { gravity: Math.min(c.value, 30) };
        s.setProjectile(patch, true);
      } else if (c.name === "gravity") {
        s.set({ gravity: [0, -Math.min(Math.max(c.value, 0), LIMITS.maxGravity), 0], paused: false });
        wakeAll();
      } else {
        const m = s.modules;
        const v = c.value;
        if (c.name === "time_speed" && m.orbits) setModules({ orbits: { ...m.orbits, daysPerSecond: Math.min(Math.max(v, 0), 400) } });
        if (c.name === "voltage" && m.circuit) setModules({ circuit: { ...m.circuit, voltage: Math.min(Math.max(v, 0), 24) } });
        if ((c.name === "frequency" || c.name === "amplitude" || c.name === "wavelength") && m.wave) {
          const lim = { frequency: [0.1, 4], amplitude: [0.05, 1.2], wavelength: [0.5, 6] }[c.name];
          setModules({ wave: { ...m.wave, [c.name]: Math.min(Math.max(v, lim[0]), lim[1]) } });
        }
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
        case "orbits":
          setModules({ orbits: { ...(m.orbits ?? MODULE_DEFAULTS.orbits), ...MODULE_FIELDS.orbits.parse(c.set) } });
          break;
        case "fluid":
          setModules({ fluid: MODULE_FIELDS.fluid.parse(c.set).fluid ?? m.fluid ?? MODULE_DEFAULTS.fluid });
          wakeAll();
          break;
        case "circuit": {
          const p = MODULE_FIELDS.circuit.parse(c.set);
          const cur = m.circuit ?? MODULE_DEFAULTS.circuit;
          const bulbs = p.bulbs ?? cur.bulbs;
          const broken = p.brokenBulbs ? p.brokenBulbs.map((n) => n - 1) : cur.broken;
          setModules({ circuit: { layout: p.layout ?? cur.layout, voltage: p.voltage ?? cur.voltage, bulbs, resistance: p.resistanceOhms ?? cur.resistance, closed: p.switchClosed ?? cur.closed, broken: broken.filter((i) => i < bulbs) } });
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
        case "globe":
          setModules({ globe: { ...(m.globe ?? MODULE_DEFAULTS.globe), ...MODULE_FIELDS.globe.parse(c.set) } });
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
      setModules({ circuit: { layout: c.layout, voltage: c.voltage, bulbs: c.bulbs, resistance: c.resistanceOhms ?? 10, closed: c.switchClosed ?? true, broken: [] } });
      s.set({ capability: "circuit" });
      await sleep(600, signal);
      return;
    case "show_wave":
      setModules({ wave: { kind: c.kind, amplitude: c.amplitude, frequency: c.frequency, wavelength: c.wavelength } });
      s.set({ capability: "waves" });
      await sleep(500, signal);
      return;
    case "build_lever":
      setModules({ lever: { leftMass: c.leftMassKg, leftDistance: c.leftDistanceM, rightMass: c.rightMassKg, rightDistance: c.rightDistanceM } });
      s.set({ capability: "lever" });
      await sleep(900, signal);
      return;
    case "show_particles":
      // First appearance: bring the camera in so the particles are big enough to see.
      if (!s.modules.particles) s.focus({ target: [0, 1.7, 0], distance: 6 });
      clearPedestal("particles");
      setModules({ particles: { substance: c.substance, temperatureC: c.temperatureC } });
      s.set({ capability: "matter" });
      await sleep(500, signal);
      return;
    case "show_cell":
      if (!s.modules.cell) s.focus({ target: [0, 2, 0], distance: 8.5 });
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
      const target = c.target ? (livePosition(c.target) ?? s.objects[c.target]?.position ?? s.characters[c.target]?.position) : (c.position as Vec3 | undefined);
      s.focus({ target: target ?? WORLDS[s.world].camera.target, zoom: c.zoom ?? "medium" });
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
      clearPedestal("chem");
      const base = { id: c.id, position: (c.position as Vec3 | undefined) ?? defaultMoleculeSpot(), rotation: [0, 0, 0] as Vec3, scale: 1, physics: "none" as const, massKg: 1, bounciness: 0, drag: 0, visible: true, version: 0 };
      s.upsertObject(c.op === "build_molecule" ? { ...base, type: "molecule", molecule: c.molecule } : { ...base, type: "atom", element: c.element });
      s.set({ capability: c.op === "build_molecule" ? "molecule" : "atom" });
      await sleep(500, signal);
      return;
    }
  }
}

/** Run a single command from the UI (sliders, buttons) outside any plan. */
export function execNow(c: Command) {
  void exec(c, new AbortController().signal);
}

export function answerQuestion(i: number) {
  const q = st().question;
  if (!q || q.picked !== null) return;
  st().set({ question: { ...q, picked: i } });
  emit("answer", i);
}
