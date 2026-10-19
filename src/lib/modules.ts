// State for the science modules (orbits, fluids, graphs, circuits, waves,
// levers, particles, cells, globe) plus the resolver that turns
// {{placeholders}} into engine-computed text.

import { MOON, PLANETS, orbitOf, sunlightVsEarth, moonIllumination, moonPhaseName, seasonNorth, subsolarLatitude, type PlanetId } from "./engine/astro";
import { PLACES, distanceKm } from "./engine/geo";
import { FLUIDS, MATERIALS, floatFraction, phaseAt, rmsSpeed, solveLever, wavePeriod, waveSpeed, type FluidId, type MaterialId, type SubstanceId } from "./engine/physics2";
import { PART_INFO, legacyBoard, presetBoard, solveCircuit, type Board, type CircuitResult } from "./engine/circuit";
import { coilMagnetisation, compassReading, fieldAt, forceOn, formatTesla, magnetPreset, type MagnetLab } from "./engine/magnet";
import { measureShape } from "./engine/geometry";
import { getMolecule, molarMass } from "./engine/chemistry";
import type { CellKind } from "./engine/biology";
import { EMPTY_TABLE, type PeriodicTableState } from "./periodic-table";
import { DEFAULT_MECHANICS, DEFAULT_MATH, type MechanicsState, type MathState } from "./experiments";
import { mechanicsAt } from "./engine/mechanics";
import { DEFAULT_REACTION, balance, collisionFraction, CATALYST_FACTOR, type ReactionState } from "./engine/reactions";
import { DEFAULT_POPULATION, cyclePeriod, solvePopulation, type PopulationState } from "./engine/ecology";
import { DEFAULT_GENETICS, phenotype, punnett, ratio, sampleOffspring, type GeneticsState } from "./engine/genetics";
import { DEFAULT_OSMOSIS, isotonicPosition, type OsmosisState } from "./engine/osmosis";
import { schoolMath } from "./engine/school-math";
import type { SceneObject } from "./world/scene";
import { ASSETS, type WorldId } from "./world/catalog";
import { TABLE, criticalAngle, elementImage, fresnelReflectance, lightSpeedIn, opticsPreset, refractiveIndex, signedFocal, sourcePosition, sourceWavelength, traceOptics, turningHits, type LightSource, type OpticKind, type OpticsSetup, type TraceResult } from "./engine/optics";
import { PLAN, SIGNAL_KINDS, doppler, formatFrequency, formatLength, formatSpeed, formatStrength, gapSpread, reception, signalFrequency, signalLayout, signalWavelength, waterWave, type Reception, type SignalKind, type SignalLayout, type Wall, type WallMaterial } from "./engine/waves";

export interface PlotFn {
  id: string;
  expression: string;
  xMin: number;
  xMax: number;
  color: string;
  label?: string;
}
export interface PlotPoint {
  id: string;
  x: number;
  y: number;
  color: string;
  label?: string;
}
export interface PlotVec {
  id: string;
  from: [number, number];
  to: [number, number];
  color: string;
  label?: string;
}
export interface Mark {
  id: string;
  lat: number;
  lon: number;
  label: string;
  color: string;
}

export interface RippleState {
  /** Qualitative wind driver, not an ocean wave-height forecast. */
  windSpeed?: number;
  frequency: number; // Hz
  /** Height of the ripples drawn (m); it doesn't change their speed. */
  amplitude: number;
  depth: number; // m
  source: "point" | "two_point" | "plane";
  /** Two dippers: distance between them (m). */
  separation: number;
  barrier: "none" | "wall" | "gap" | "double_slit" | "reflector";
  gapWidth: number; // m
  /** Where the barrier stands along the tank (m from the middle). */
  barrierX: number;
  reflectorAngle: number; // degrees
  /** A glass plate makes the far half of the tank shallow (refraction). */
  shallow: boolean;
  shallowDepth: number; // m
  /** A moving dipper (m/s) shows the Doppler effect. */
  sourceSpeed: number;
  view: "waves" | "intensity";
}

export interface SignalState {
  kind: SignalKind;
  /** Pitch of the sound (Hz); only used for sound. */
  soundHz: number;
  layout: SignalLayout;
  walls: Wall[];
  /** Where the router, speaker, mast or lamp is, on the floor plan (x, z in m). */
  source: [number, number];
  /** The phone, radio, listener or light meter. */
  device: [number, number];
  view: "both" | "waves" | "strength";
}

export function windDrivenRipple(r: RippleState): RippleState {
  if (r.windSpeed === undefined) return r;
  return { ...r, source: "plane", sourceSpeed: 0, amplitude: .03 * Math.min(1, Math.max(0, r.windSpeed) / 20) };
}

export interface Modules {
  mechanics?: MechanicsState | null;
  maths?: MathState | null;
  periodicTable: PeriodicTableState | null;
  orbits: { mode: "solar_system" | "earth_moon" | "seasons"; planets: PlanetId[]; focus: PlanetId | "sun" | "moon" | null; daysPerSecond: number; labels: boolean; /** Planets moved to another distance (AU), e.g. "what if Earth and Neptune swapped?" */ distances: Partial<Record<PlanetId, number>> } | null;
  fluid: FluidId | null;
  plot: { functions: PlotFn[]; points: PlotPoint[]; vectors: PlotVec[] } | null;
  /** The circuit board on the workshop mat (older saves hold a series/parallel object; read it with circuitBoard). */
  circuit: Board | null;
  wave: { kind: "transverse" | "longitudinal"; amplitude: number; frequency: number; wavelength: number } | null;
  lever: { leftMass: number; leftDistance: number; rightMass: number; rightDistance: number } | null;
  particles: { substance: SubstanceId; temperatureC: number } | null;
  cell: { kind: CellKind; highlight: string | null } | null;
  globe: { view: "globe" | "map"; spin: boolean; focus: string | null; marks: Mark[]; routes: { id: string; from: string; to: string }[] } | null;
  /** Ripple tank (water waves) in the workshop. Older saves don't have the new modules. */
  ripple?: RippleState | null;
  /** Signals spreading through a floor plan, on the stage. */
  signal?: SignalState | null;
  /** The Light Lab's optics table. */
  optics?: OpticsSetup | null;
  /** Magnet lab on the workshop mat: magnets, coils, wires, compasses and test objects. */
  magnet?: MagnetLab | null;
  /** Lab pedestal: equation balancing and the collision-theory reaction box. */
  reaction?: ReactionState | null;
  /** Lab pedestal: population graph (logistic or predator–prey). */
  population?: PopulationState | null;
  /** Lab pedestal: Punnett square and grown offspring. */
  genetics?: GeneticsState | null;
  /** Lab pedestal: diffusion / osmosis particle tank. */
  osmosis?: OsmosisState | null;
}

export const ALL_PLANETS = Object.keys(PLANETS) as PlanetId[];

export function signalDefaults(kind: SignalKind = "wifi_2_4", layout: SignalLayout = "apartment"): SignalState {
  const plan = signalLayout(layout);
  return { kind, soundHz: 500, layout, walls: plan.walls, source: plan.source, device: plan.device, view: "both" };
}

/** Starting state for each module when something switches it on. */
export const MODULE_DEFAULTS: { [K in keyof Modules]-?: NonNullable<Modules[K]> } = {
  mechanics: DEFAULT_MECHANICS,
  maths: DEFAULT_MATH,
  periodicTable: EMPTY_TABLE,
  orbits: { mode: "solar_system", planets: ALL_PLANETS, focus: null, daysPerSecond: 20, labels: true, distances: {} },
  fluid: "fresh_water",
  plot: { functions: [], points: [], vectors: [] },
  circuit: presetBoard("series_bulbs"),
  wave: { kind: "transverse", amplitude: 0.5, frequency: 1, wavelength: 2 },
  lever: { leftMass: 4, leftDistance: 1, rightMass: 2, rightDistance: 1.5 },
  particles: { substance: "water", temperatureC: 20 },
  cell: { kind: "animal", highlight: null },
  globe: { view: "globe", spin: true, focus: null, marks: [], routes: [] },
  ripple: { frequency: 1.5, amplitude: 0.012, depth: 0.08, source: "point", separation: 0.5, barrier: "none", gapWidth: 0.3, barrierX: 0.2, reflectorAngle: 30, shallow: false, shallowDepth: 0.02, sourceSpeed: 0, view: "waves" },
  signal: signalDefaults(),
  optics: opticsPreset("reflection"),
  magnet: magnetPreset("bar_magnet"),
  reaction: DEFAULT_REACTION,
  population: DEFAULT_POPULATION,
  genetics: DEFAULT_GENETICS,
  osmosis: DEFAULT_OSMOSIS,
};

export function defaultModules(world: WorldId): Modules {
  return {
    mechanics: world === "mechanics" ? { ...DEFAULT_MECHANICS } : null,
    maths: world === "math_studio" ? { ...DEFAULT_MATH } : null,
    periodicTable: world === "lab" ? EMPTY_TABLE : null,
    orbits: world === "space" ? MODULE_DEFAULTS.orbits : null,
    fluid: world === "ocean" ? MODULE_DEFAULTS.fluid : null,
    plot: world === "math" ? MODULE_DEFAULTS.plot : null,
    circuit: world === "workshop" ? MODULE_DEFAULTS.circuit : null,
    wave: null,
    lever: null,
    particles: null,
    cell: null,
    globe: world === "globe" ? MODULE_DEFAULTS.globe : null,
    ripple: null,
    signal: null,
    // The Light Lab opens with a laser and a mirror ready to play with.
    optics: world === "optics" ? MODULE_DEFAULTS.optics : null,
    magnet: null,
    reaction: null,
    population: null,
    genetics: null,
    osmosis: null,
  };
}

const traces = new WeakMap<OpticsSetup, TraceResult>();
/** The traced light for the optics table (cached: the state object changes whenever the setup does). */
export function opticsTrace(o: OpticsSetup): TraceResult {
  let r = traces.get(o);
  if (!r) traces.set(o, (r = traceOptics(o)));
  return r;
}

/** What the signal's device receives right now. */
export function signalReception(s: SignalState): Reception {
  return reception(s.kind, s.source, s.device, s.walls, s.soundHz);
}

/** The ripple tank on the workshop mat: centre of its water surface and its half-extents (m). */
export const RIPPLE_TANK = { center: [0, 0.92, 0.35] as [number, number, number], half: [1.6, 1.0] as [number, number] };
/** The Light Lab's optical table: centre of its top (the rays run just above it). */
export const OPTICS_TABLE = { center: [0, 0.86, 0] as [number, number, number] };
/** Size an element gets when nothing says otherwise. */
export const OPTIC_SIZE: Record<OpticKind, number> = { plane_mirror: 1, concave_mirror: 1.2, convex_mirror: 1.2, convex_lens: 1.2, concave_lens: 1.2, glass_block: 1.2, prism: 1.1, semicircle: 1.4, screen: 1.4, blocker: 0.4 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const onPlan = (p: readonly number[] | undefined): [number, number] | undefined => (p ? [clamp(p[0], -PLAN.x, PLAN.x), clamp(p[1], -PLAN.z, PLAN.z)] : undefined);
const onTable = (p: readonly number[]): [number, number] => [clamp(p[0], -TABLE.x, TABLE.x), clamp(p[1], -TABLE.z, TABLE.z)];

export interface SignalPatch {
  kind?: SignalKind;
  soundHz?: number;
  layout?: SignalLayout;
  walls?: { id: string; from: readonly number[]; to: readonly number[]; material: WallMaterial }[];
  allWalls?: WallMaterial;
  source?: readonly number[];
  device?: readonly number[];
  view?: SignalState["view"];
}
/** A signal setup with some fields changed; a new layout brings its own walls and starting spots. */
export function patchSignal(cur: SignalState, p: SignalPatch): SignalState {
  let next: SignalState = { ...cur };
  if (p.layout && p.layout !== cur.layout) {
    const plan = signalLayout(p.layout);
    next = { ...next, layout: p.layout, walls: plan.walls, source: plan.source, device: plan.device };
  }
  if (p.walls) next.walls = p.walls.map((x) => ({ id: x.id, from: onPlan(x.from)!, to: onPlan(x.to)!, material: x.material }));
  if (p.allWalls) next.walls = next.walls.map((x) => ({ ...x, material: p.allWalls! }));
  if (p.kind) next.kind = p.kind;
  if (p.soundHz !== undefined) next.soundHz = p.soundHz;
  next.source = onPlan(p.source) ?? next.source;
  next.device = onPlan(p.device) ?? next.device;
  if (p.view) next.view = p.view;
  return next;
}

export interface OpticsPatch {
  wavelengthNm?: number | null;
  reachM?: number;
  reflections?: boolean;
  lighting?: "bright" | "dim";
  sourceKind?: LightSource["kind"];
  sourcePosition?: readonly number[];
  angleDeg?: number;
  color?: LightSource["color"];
  rays?: number;
  spread?: number;
  aimAt?: string | null;
  medium?: OpticsSetup["medium"];
  normals?: boolean;
  object?: { target: string; distanceM: number; heightM: number } | null;
  mixing?: OpticsSetup["mixing"];
}
/** An optics setup with some fields changed. Placing the source by hand stops it aiming at an element. */
export function patchOptics(cur: OpticsSetup, p: OpticsPatch): OpticsSetup {
  const source: LightSource = { ...cur.source };
  if (p.sourceKind) source.kind = p.sourceKind;
  if (p.sourcePosition) {
    [source.x, source.z] = onTable(p.sourcePosition);
    source.aimAt = null;
  }
  if (p.angleDeg !== undefined) source.angleDeg = p.angleDeg;
  if (p.color) { source.color = p.color; source.wavelengthNm = null; }
  if (p.wavelengthNm !== undefined) source.wavelengthNm = p.wavelengthNm;
  if (p.reachM !== undefined) source.reach = p.reachM;
  if (p.rays !== undefined) source.rays = p.rays;
  if (p.spread !== undefined) source.spread = p.spread;
  if (p.aimAt !== undefined) {
    if (!p.aimAt && cur.source.aimAt && !p.sourcePosition) [source.x, source.z] = sourcePosition(cur.source, cur.elements);
    source.aimAt = p.aimAt;
  }
  const object = p.object === undefined ? cur.object : p.object && { target: p.object.target, distance: p.object.distanceM, height: p.object.heightM };
  return { ...cur, source, medium: p.medium ?? cur.medium, normals: p.normals ?? cur.normals, object, mixing: p.mixing === undefined ? cur.mixing : p.mixing, reflections: p.reflections ?? cur.reflections, lighting: p.lighting ?? cur.lighting };
}

/** The circuit board, whichever shape it was saved in. */
export function circuitBoard(c: unknown): Board | null {
  if (!c || typeof c !== "object") return null;
  if ("parts" in c) return c as Board;
  const old = c as { layout?: "series" | "parallel"; voltage?: number; bulbs?: number; closed?: boolean; broken?: number[] };
  return old.layout ? legacyBoard({ layout: old.layout, voltage: old.voltage ?? 6, bulbs: old.bulbs ?? 2, closed: old.closed ?? true, broken: old.broken ?? [] }) : null;
}

/** What the circuit renderer last solved (it carries capacitor charge over time); readings use it when it matches. */
export const circuitLive: { board: Board | null; result: CircuitResult | null } = { board: null, result: null };
const steady = new WeakMap<Board, CircuitResult>();
/** Readings for a board: the live (time-stepped) result when it is on screen, otherwise a steady solve. */
export function circuitResult(board: Board): CircuitResult {
  if (circuitLive.board === board && circuitLive.result) return circuitLive.result;
  let r = steady.get(board);
  if (!r) steady.set(board, (r = solveCircuit(board)));
  return r;
}

/** A reading with a sensible unit prefix (2 mA, 1.5 kΩ, 3.0 V). */
export function siFormat(v: number, unit: string, digits = 2): string {
  const a = Math.abs(v);
  if (!Number.isFinite(v)) return `∞ ${unit}`;
  if (a !== 0 && a < 1e-3) return `${(v * 1e6).toFixed(a < 1e-5 ? 1 : 0)} µ${unit}`;
  if (a !== 0 && a < 1) return `${(v * 1e3).toFixed(a < 0.01 ? 1 : 0)} m${unit}`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)} M${unit}`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)} k${unit}`;
  return `${v.toFixed(a >= 100 ? 0 : digits)} ${unit}`;
}

/** Simulation clock for the orbit module (days since start); advanced by the renderer. */
export const orbitClock = { day: 80 };
/** Live readings the lab renderers measure (reactions per second, share reacted, membrane position 0–1). */
export const labGauge = { reactionRate: 0, reactionProgress: 0, membrane: 0.5 };

/** Volume of an object in m³ (used for density and buoyancy). */
export function objectVolume(o: SceneObject): number {
  if (o.type === "shape") return measureShape(o.shape, o.size.map((v) => v * o.scale) as [number, number, number], o.sides).volume ?? 0;
  if (o.type === "asset") {
    const [w, h, d] = ASSETS[o.asset].size.map((v) => v * o.scale);
    return ASSETS[o.asset].collider === "ball" ? (4 / 3) * Math.PI * (w / 2) ** 3 : w * h * d;
  }
  if (o.type === "primitive") return o.size[0] * o.size[1] * o.size[2] * o.scale ** 3;
  return 0;
}

/** Mass for a material filling a volume, within the physics engine's comfortable range. */
export function massFor(material: MaterialId, volume: number): number {
  return Math.min(500, Math.max(0.001, MATERIALS[material].density * volume));
}

const f = (v: number, d = 2) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(d));
const places = new Map(PLACES.map((p) => [p.id, p]));
const deg1 = (v: number) => `${v.toFixed(1)}°`;

export const REFRACTORS = ["glass_block", "prism", "semicircle"] as const;
const isRefractor = (k: string) => (REFRACTORS as readonly string[]).includes(k);

/** Optics readouts: of one element (arg), or of the first thing the main beam meets. */
export const OPTICS_VALUES = ["incidence_angle", "reflection_angle", "refraction_angle", "critical_angle", "refractive_index", "light_speed_in", "deviation", "spread_angle", "focal_length", "object_distance", "image_distance", "magnification", "image_type", "beam_wavelength", "screen_power", "reflectance"] as const;
function opticsValue(name: string, arg: string | undefined, o: OpticsSetup): string | undefined {
  const tr = opticsTrace(o);
  const hits = turningHits(arg ? tr.hits.filter((h) => h.elementId === arg) : tr.hits);
  const byId = (id: string) => o.elements.find((e) => e.id === id);
  switch (name) {
    case "beam_wavelength":
      return o.source.kind === "off" ? undefined : o.source.color === "white" && o.source.wavelengthNm == null ? "405–700 nm (9 wavelength samples)" : `${sourceWavelength(o.source).toFixed(0)} nm`;
    case "screen_power": {
      if (o.source.kind === "off") return undefined;
      const spots = tr.spots.filter((spot) => !spot.diagram && (!arg || spot.elementId === arg));
      if (arg && byId(arg)?.kind !== "screen") return undefined;
      return `${(spots.reduce((total, spot) => total + spot.intensity, 0) * 100).toFixed(1)}%`;
    }
    case "reflectance": {
      const hit = hits[0];
      if (!hit || hit.kind === "absorb" || hit.kind === "lens") return undefined;
      const fraction = hit.kind === "refract" ? fresnelReflectance(hit.n1, hit.n2, Math.cos(hit.incidenceDeg * Math.PI / 180)) : 1;
      return `${(fraction * 100).toFixed(1)}%`;
    }
    case "incidence_angle": {
      const h = hits[0];
      return h && deg1(h.incidenceDeg);
    }
    case "reflection_angle": {
      const h = hits.find((x) => x.kind === "reflect" || x.kind === "total_internal_reflection");
      return h && h.outDeg !== null ? deg1(h.outDeg) : undefined;
    }
    case "refraction_angle": {
      const h = hits.find((x) => x.kind === "refract");
      return h && h.outDeg !== null ? deg1(h.outDeg) : undefined;
    }
    case "critical_angle":
    case "refractive_index":
    case "light_speed_in": {
      const lit = o.elements.filter((e) => isRefractor(e.kind));
      const target = arg ? byId(arg) : (lit.find((e) => tr.hits.some((h) => h.elementId === e.id)) ?? lit[0]);
      if (!target || !isRefractor(target.kind)) return undefined;
      const nm = sourceWavelength(o.source);
      const n = refractiveIndex(target.material, nm);
      if (name === "refractive_index") return n.toFixed(2);
      if (name === "light_speed_in") return formatSpeed(lightSpeedIn(n));
      const c = criticalAngle(n, refractiveIndex(o.medium, nm));
      return c === null ? undefined : deg1(c);
    }
    case "deviation":
      return tr.deviation === null ? undefined : deg1(tr.deviation);
    case "spread_angle":
      return tr.spread === null ? undefined : deg1(tr.spread);
    case "focal_length": {
      const target = arg ? byId(arg) : o.elements.find((e) => signedFocal(e) !== null);
      return target && signedFocal(target) !== null ? `${target.focalLength.toFixed(2)} m` : undefined;
    }
    case "object_distance":
    case "image_distance":
    case "magnification":
    case "image_type": {
      const obj = o.object;
      const target = obj ? byId(obj.target) : undefined;
      const fs = target ? signedFocal(target) : null;
      if (!obj || !target || (fs === null && target.kind !== "plane_mirror") || (arg && arg !== obj.target)) return undefined;
      const r = elementImage(target, obj.distance);
      if (name === "object_distance") return `${obj.distance.toFixed(2)} m`;
      if (name === "image_type") return r.description;
      if (r.imageDistance === null || r.magnification === null) return name === "image_distance" ? "infinitely far away" : undefined;
      if (name === "magnification") return `${Math.abs(r.magnification).toFixed(2)}×`;
      const mirror = target.kind.endsWith("mirror");
      const where = r.real ? (mirror ? "in front of the mirror" : "behind the lens") : mirror ? "behind the mirror" : "on the same side as the object";
      return `${Math.abs(r.imageDistance).toFixed(2)} m ${where}`;
    }
  }
  return undefined;
}

export const WATER_VALUES = ["water_wave_speed", "water_wavelength", "water_period", "water_frequency", "water_depth", "water_regime", "shallow_wave_speed", "shallow_wavelength", "gap_width", "gap_wavelengths", "doppler_ahead", "doppler_behind"] as const;
function waterValue(name: string, r: RippleState): string | undefined {
  const w = waterWave(r.frequency, r.depth);
  switch (name) {
    case "water_wave_speed":
      return formatSpeed(w.speed);
    case "water_wavelength":
      return formatLength(w.wavelength);
    case "water_period":
      return `${f(w.period)} s`;
    case "water_frequency":
      return formatFrequency(r.frequency);
    case "water_depth":
      return formatLength(r.depth);
    case "water_regime":
      return w.regime === "intermediate" ? "in between shallow and deep water" : `${w.regime} water`;
    case "shallow_wave_speed":
    case "shallow_wavelength": {
      if (!r.shallow) return undefined;
      const s = waterWave(r.frequency, r.shallowDepth);
      return name === "shallow_wave_speed" ? formatSpeed(s.speed) : formatLength(s.wavelength);
    }
    case "gap_width":
    case "gap_wavelengths":
      if (r.barrier !== "gap" && r.barrier !== "double_slit") return undefined;
      return name === "gap_width" ? formatLength(r.gapWidth) : `${gapSpread(w.wavelength, r.gapWidth).gapInWavelengths.toFixed(1)} wavelengths`;
    case "doppler_ahead":
    case "doppler_behind": {
      if (!(r.sourceSpeed > 0) || r.source !== "point") return undefined;
      const d = doppler(r.frequency, w.speed, r.sourceSpeed);
      return formatFrequency(name === "doppler_ahead" ? d.ahead : d.behind);
    }
  }
  return undefined;
}

export const SIGNAL_VALUES = ["signal_strength", "signal_bars", "signal_distance", "signal_walls", "wall_loss", "path_loss", "signal_wavelength", "signal_frequency", "signal_speed"] as const;
function signalValue(name: string, s: SignalState): string | undefined {
  const r = signalReception(s);
  const band = SIGNAL_KINDS[s.kind].band;
  switch (name) {
    case "signal_strength":
      return formatStrength(s.kind, r);
    case "signal_bars":
      return band === "sound" || band === "light" ? r.quality : `${r.bars} of 4 bars (${r.quality})`;
    case "signal_distance":
      return formatLength(r.distance);
    case "signal_walls":
      return r.walls.length ? `${r.walls.length} wall${r.walls.length > 1 ? "s" : ""} (${r.walls.map((x) => x.material).join(", ")})` : "no walls";
    case "wall_loss":
      return Number.isFinite(r.wallLoss) ? `${Math.round(r.wallLoss)} dB` : "all of it, because solid walls block light";
    case "path_loss":
      return `${Math.round(r.pathLoss)} dB`;
    case "signal_wavelength":
      return formatLength(signalWavelength(s.kind, s.soundHz));
    case "signal_frequency":
      return formatFrequency(signalFrequency(s.kind, s.soundHz));
    case "signal_speed":
      return formatSpeed(SIGNAL_KINDS[s.kind].speed);
  }
  return undefined;
}

/** Value for {{name}} / {{name:arg}} from module state; undefined if not applicable. */
export function moduleValue(name: string, arg: string | undefined, m: Modules, objects: Record<string, SceneObject>): string | undefined {
  if (name === "wind_speed") return m.ripple?.windSpeed === undefined ? undefined : `${m.ripple.windSpeed} m/s (qualitative driver)`;
  if (m.maths && name === "math_answer") return schoolMath(m.maths).answer;
  if (m.maths && name === "math_formula") return schoolMath(m.maths).formula;
  if (m.mechanics && name.startsWith("mechanics_")) {
    const s = m.mechanics, r = mechanicsAt(s);
    if (s.mode === "pendulum" && ["mechanics_force", "mechanics_impulse", "mechanics_momentum", "mechanics_total_momentum", "mechanics_distance", "mechanics_velocity2"].includes(name)) return undefined;
    const values: Record<string, [number, string] | null> = {
      mechanics_time: [s.durationS, "s"], mechanics_velocity: [r.velocity, "m/s"], mechanics_velocity2: [r.velocity2, "m/s"],
      mechanics_acceleration: [r.acceleration, "m/s²"], mechanics_force: [r.netForce, "N"],
      mechanics_momentum: [r.momentum, "kg·m/s"], mechanics_total_momentum: [r.momentum + (s.mode === "collision" ? r.momentum2 : 0), "kg·m/s"],
      mechanics_kinetic: [r.kinetic, "J"], mechanics_potential: [r.potential, "J"], mechanics_impulse: [r.impulse, "N·s"],
      mechanics_distance: [r.x, "m"], mechanics_period: r.period === null ? null : [r.period, "s"],
    };
    const value = values[name];
    return value ? `${Number(value[0].toFixed(3))} ${value[1]}${s.mode === "pendulum" && ["mechanics_velocity", "mechanics_acceleration"].includes(name) ? " (tangential)" : ""}` : undefined;
  }
  if ((OPTICS_VALUES as readonly string[]).includes(name)) return m.optics ? opticsValue(name, arg, m.optics) : undefined;
  if ((WATER_VALUES as readonly string[]).includes(name)) return m.ripple ? waterValue(name, m.ripple) : undefined;
  if ((SIGNAL_VALUES as readonly string[]).includes(name)) return m.signal ? signalValue(name, m.signal) : undefined;
  switch (name) {
    case "current":
    case "total_resistance":
    case "power":
    case "voltage": {
      const board = circuitBoard(m.circuit);
      const battery = board?.parts.find((p) => p.kind === "battery" && !p.broken);
      if (!board || !battery) return undefined;
      const r = circuitResult(board);
      if (name === "current") return siFormat(r.current, "A");
      if (name === "power") return siFormat(r.power, "W");
      if (name === "voltage") return siFormat(battery.value ?? 6, "V", 1);
      // Resistance the batteries see outside themselves: terminal voltage / current.
      const terminal = r.parts[battery.id].v;
      return r.current > 1e-9 ? siFormat(terminal / r.current, "Ω", 1) : "infinite (the path is broken)";
    }
    case "field_strength":
    case "field_direction": {
      const lab = m.magnet;
      const it = lab?.items.find((i) => i.id === arg);
      if (!lab || !it) return undefined;
      const r = compassReading(lab, it.x, it.z);
      if (name === "field_strength") return formatTesla(r.tesla);
      const compass = ["east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east"][((Math.round(r.angleDeg / 45) % 8) + 8) % 8];
      return `towards the ${compass} (${Math.round(((r.angleDeg % 360) + 360) % 360)}°)`;
    }
    case "magnet_force": {
      const lab = m.magnet;
      const it = lab?.items.find((i) => i.id === arg);
      if (!lab || !it) return undefined;
      const [fx, fz] = forceOn(lab, it.id);
      const others = lab.items.filter((o) => o.id !== it.id && (o.kind === "bar" || o.kind === "horseshoe" || o.kind === "coil"));
      if (!others.length) return "no force (no other magnet)";
      // Attract when the force points towards the nearest other magnet.
      const o = others.reduce((a, b) => (Math.hypot(b.x - it.x, b.z - it.z) < Math.hypot(a.x - it.x, a.z - it.z) ? b : a));
      const toward = fx * (o.x - it.x) + fz * (o.z - it.z) > 0;
      return `${siFormat(Math.hypot(fx, fz), "N")} (${toward ? "attracting" : "repelling"})`;
    }
    case "coil_field": {
      const coil = m.magnet?.items.find((i) => i.kind === "coil" && (!arg || i.id === arg));
      if (!m.magnet || !coil) return undefined;
      const B = fieldAt({ items: [coil], earth: false }, coil.x, coil.z);
      return `${formatTesla(Math.hypot(B[0], B[2]))} inside (${Math.round(coilMagnetisation(coil))} A/m)`;
    }
    case "part_current":
    case "part_voltage":
    case "part_power":
    case "part_resistance": {
      const board = circuitBoard(m.circuit);
      const part = board?.parts.find((p) => p.id === arg);
      if (!board || !part) return undefined;
      const r = circuitResult(board).parts[part.id];
      if (name === "part_current") return siFormat(Math.abs(r.i), "A");
      if (name === "part_voltage") return siFormat(Math.abs(r.v), "V");
      if (name === "part_power") return siFormat(Math.abs(r.p), "W");
      return r.r === undefined || !Number.isFinite(r.r) ? `infinite (${PART_INFO[part.kind].name.toLowerCase()} is open)` : siFormat(r.r, "Ω");
    }
    case "wave_speed":
      return m.wave ? `${f(waveSpeed(m.wave))} m/s` : undefined;
    case "wave_period":
      return m.wave ? `${f(wavePeriod(m.wave))} s` : undefined;
    case "torque_left":
    case "torque_right":
    case "balance_distance": {
      if (!m.lever) return undefined;
      const r = solveLever(m.lever);
      if (name === "balance_distance") return `${f(r.balanceRightDistance)} m`;
      return `${f(name === "torque_left" ? r.leftTorque : r.rightTorque, 1)} N·m`;
    }
    case "phase":
      return m.particles ? phaseAt(m.particles.substance, m.particles.temperatureC) : undefined;
    case "rms_speed":
      return m.particles ? `${f(rmsSpeed(m.particles.substance, m.particles.temperatureC), 0)} m/s` : undefined;
    case "temperature":
      return m.particles ? `${f(m.particles.temperatureC, 0)} °C` : undefined;
    case "balanced_equation":
      if (!m.reaction) return undefined;
      try {
        return balance(m.reaction.equation).text;
      } catch (e) {
        return e instanceof Error ? e.message : undefined;
      }
    case "collision_fraction": {
      const r = m.reaction;
      if (!r) return undefined;
      const x = collisionFraction(r.activationKJ * (r.catalyst ? CATALYST_FACTOR : 1), r.temperatureC);
      return `${x < 0.001 ? x.toExponential(1) : f(x * 100, 2)}${x < 0.001 ? "" : "%"} of collisions`;
    }
    case "reaction_rate":
      return m.reaction ? `${f(labGauge.reactionRate, 1)} reactions per second in the box (sped up)` : undefined;
    case "reaction_progress":
      return m.reaction ? `${Math.round(labGauge.reactionProgress * 100)}%` : undefined;
    case "final_population":
    case "cycle_period":
    case "prey_peak":
    case "predator_peak": {
      const p = m.population;
      if (!p) return undefined;
      if (name === "cycle_period") return p.model === "predator_prey" ? `about ${f(cyclePeriod(p), 1)} years` : undefined;
      const s = solvePopulation(p);
      if (name === "final_population") return `${Math.round(s.y[0][s.y[0].length - 1])}`;
      const k = name === "prey_peak" ? 0 : 1;
      return p.model === "predator_prey" ? `${Math.round(Math.max(...s.y[k]))}` : undefined;
    }
    case "phenotype_ratio":
    case "genotype_ratio":
    case "offspring_counts": {
      const g = m.genetics;
      if (!g) return undefined;
      try {
        const p = punnett(g.parent1, g.parent2);
        if (name === "phenotype_ratio") return `${ratio(p.phenotypes.map((x) => x.count))} (${p.phenotypes.map((x) => x.phenotype).join(" : ")})`;
        if (name === "genotype_ratio") return `${ratio(p.genotypes.map((x) => x.count))} (${p.genotypes.map((x) => x.genotype).join(" : ")})`;
        const kids = sampleOffspring(g.parent1, g.parent2, g.offspring, g.seed);
        return p.phenotypes.map((x) => `${kids.filter((k) => phenotype(k) === x.phenotype).length} ${x.phenotype}`).join(", ");
      } catch {
        return undefined;
      }
    }
    case "isotonic_position":
      return m.osmosis?.mode === "osmosis" ? `${Math.round(isotonicPosition(m.osmosis) * 100)}% of the tank on the left` : undefined;
    case "day":
      return `day ${Math.floor(orbitClock.day % 365) + 1}`;
    case "season":
      return `${seasonNorth(orbitClock.day)} in the north (sun overhead at ${f(subsolarLatitude(orbitClock.day), 1)}°)`;
    case "moon_phase":
      return moonPhaseName(orbitClock.day % MOON.synodicDays);
    case "moon_lit":
      return `${Math.round(moonIllumination(orbitClock.day % MOON.synodicDays) * 100)}%`;
    case "period":
    case "planet_gravity":
    case "distance_au":
    case "sunlight":
    case "sunlight_change":
    case "radius_km": {
      const p = arg ? PLANETS[arg as PlanetId] : undefined;
      if (!p) return undefined;
      // Moved planets (set_module orbits distances) report their new orbit.
      const o = orbitOf(p.id, m.orbits?.distances);
      if (name === "period") return o.periodDays < 1000 ? `${f(o.periodDays, 0)} Earth days` : `${f(o.periodDays / 365.26, 1)} Earth years`;
      if (name === "planet_gravity") return `${f(p.gravity)} m/s²`;
      if (name === "distance_au") return `${f(o.distanceAU)} AU`;
      if (name === "sunlight_change") {
        // Compared with the planet's real orbit (inverse-square law).
        const x = sunlightVsEarth(o.distanceAU) / sunlightVsEarth(p.distanceAU);
        return x >= 0.995 && x <= 1.005 ? "the same sunlight as in its real orbit" : x > 1 ? `${f(x, 1)} times the sunlight it gets in its real orbit` : `${f(x * 100, x < 0.01 ? 2 : 1)}% of the sunlight it gets in its real orbit`;
      }
      if (name === "sunlight") {
        const x = sunlightVsEarth(o.distanceAU);
        return x >= 0.995 && x <= 1.005 ? "the same sunlight Earth gets" : x > 1 ? `${f(x, 1)} times the sunlight Earth gets` : `${f(x * 100, x < 0.01 ? 2 : 1)}% of the sunlight Earth gets`;
      }
      return `${p.radiusKm.toLocaleString("en-US")} km`;
    }
    case "volume":
    case "surface_area": {
      const o = arg ? objects[arg] : undefined;
      if (!o) return undefined;
      if (o.type !== "shape") return name === "volume" ? `${f(objectVolume(o), 4)} m³` : undefined;
      const meas = measureShape(o.shape, o.size.map((v) => v * o.scale) as [number, number, number], o.sides);
      const v = name === "volume" ? meas.volume : meas.surfaceArea;
      return v === undefined ? undefined : `${f(v, 3)} ${name === "volume" ? "m³" : "m²"}`;
    }
    case "molar_mass": {
      const o = arg ? objects[arg] : undefined;
      const mol = o?.type === "molecule" ? getMolecule(o.molecule) : undefined;
      return mol ? `${molarMass(mol).toFixed(2)} g/mol` : undefined;
    }
    case "mass": {
      const o = arg ? objects[arg] : undefined;
      if (!o) return undefined;
      return o.massKg < 1 ? `${f(o.massKg * 1000, 0)} g` : `${f(o.massKg, o.massKg < 10 ? 2 : 1)} kg`;
    }
    case "density":
    case "float_fraction": {
      const o = arg ? objects[arg] : undefined;
      if (!o) return undefined;
      const vol = objectVolume(o);
      if (!vol) return undefined;
      const rho = o.massKg / vol;
      if (name === "density") return `${f(rho, 0)} kg/m³`;
      const fluid = FLUIDS[m.fluid ?? "fresh_water"].density;
      const frac = floatFraction(rho, fluid);
      return frac >= 1 ? "100% (it sinks)" : `${Math.round(frac * 100)}%`;
    }
    case "distance_km": {
      const [a, b] = (arg ?? "").split("~");
      const at = (id: string) => m.globe?.marks.find((k) => k.id === id) ?? places.get(id);
      const pa = at(a), pb = at(b);
      return pa && pb ? `${Math.round(distanceKm(pa, pb)).toLocaleString("en-US")} km` : undefined;
    }
  }
  return undefined;
}

/** Compact module summary sent to the AI with follow-up questions. */
export function modulesSummary(m: Modules): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) if (v != null) out[k] = v;
  if (m.orbits) out.orbitDay = Math.floor(orbitClock.day);
  return out;
}
