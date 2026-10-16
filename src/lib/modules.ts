// State for the science modules (orbits, fluids, graphs, circuits, waves,
// levers, particles, cells, globe) plus the resolver that turns
// {{placeholders}} into engine-computed text.

import { MOON, PLANETS, moonIllumination, moonPhaseName, seasonNorth, subsolarLatitude, type PlanetId } from "./engine/astro";
import { PLACES, distanceKm } from "./engine/geo";
import { FLUIDS, MATERIALS, floatFraction, phaseAt, rmsSpeed, solveCircuit, solveLever, wavePeriod, waveSpeed, type FluidId, type MaterialId, type SubstanceId } from "./engine/physics2";
import { measureShape } from "./engine/geometry";
import type { CellKind } from "./engine/biology";
import { EMPTY_TABLE, type PeriodicTableState } from "./periodic-table";
import type { SceneObject } from "./world/scene";
import { ASSETS, type WorldId } from "./world/catalog";

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

export interface Modules {
  periodicTable: PeriodicTableState | null;
  orbits: { mode: "solar_system" | "earth_moon" | "seasons"; planets: PlanetId[]; focus: PlanetId | "sun" | "moon" | null; daysPerSecond: number; labels: boolean } | null;
  fluid: FluidId | null;
  plot: { functions: PlotFn[]; points: PlotPoint[]; vectors: PlotVec[] } | null;
  circuit: { layout: "series" | "parallel"; voltage: number; bulbs: number; resistance: number; closed: boolean; /** blown bulbs, 0-based */ broken: number[] } | null;
  wave: { kind: "transverse" | "longitudinal"; amplitude: number; frequency: number; wavelength: number } | null;
  lever: { leftMass: number; leftDistance: number; rightMass: number; rightDistance: number } | null;
  particles: { substance: SubstanceId; temperatureC: number } | null;
  cell: { kind: CellKind; highlight: string | null } | null;
  globe: { view: "globe" | "map"; spin: boolean; focus: string | null; marks: Mark[]; routes: { id: string; from: string; to: string }[] } | null;
}

export const ALL_PLANETS = Object.keys(PLANETS) as PlanetId[];

/** Starting state for each module when something switches it on. */
export const MODULE_DEFAULTS: { [K in keyof Modules]-?: NonNullable<Modules[K]> } = {
  periodicTable: EMPTY_TABLE,
  orbits: { mode: "solar_system", planets: ALL_PLANETS, focus: null, daysPerSecond: 20, labels: true },
  fluid: "fresh_water",
  plot: { functions: [], points: [], vectors: [] },
  circuit: { layout: "series", voltage: 6, bulbs: 2, resistance: 10, closed: true, broken: [] },
  wave: { kind: "transverse", amplitude: 0.5, frequency: 1, wavelength: 2 },
  lever: { leftMass: 4, leftDistance: 1, rightMass: 2, rightDistance: 1.5 },
  particles: { substance: "water", temperatureC: 20 },
  cell: { kind: "animal", highlight: null },
  globe: { view: "globe", spin: true, focus: null, marks: [], routes: [] },
};

export function defaultModules(world: WorldId): Modules {
  return {
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
  };
}

/** Ohm's-law result for the circuit module's state. */
export function circuitResult(c: NonNullable<Modules["circuit"]>) {
  return solveCircuit({ layout: c.layout, voltage: c.voltage, resistances: Array(c.bulbs).fill(c.resistance), closed: c.closed, broken: Array.from({ length: c.bulbs }, (_, i) => c.broken.includes(i)) });
}

/** Simulation clock for the orbit module (days since start); advanced by the renderer. */
export const orbitClock = { day: 80 };

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

/** Value for {{name}} / {{name:arg}} from module state; undefined if not applicable. */
export function moduleValue(name: string, arg: string | undefined, m: Modules, objects: Record<string, SceneObject>): string | undefined {
  switch (name) {
    case "current":
    case "total_resistance":
    case "power":
    case "voltage": {
      const c = m.circuit;
      if (!c) return undefined;
      const r = circuitResult(c);
      if (name === "current") return `${f(r.current)} A`;
      if (name === "total_resistance") return Number.isFinite(r.totalResistance) ? `${f(r.totalResistance, 1)} Ω` : "infinite (the path is broken)";
      if (name === "power") return `${f(r.totalPower)} W`;
      return `${f(c.voltage, 1)} V`;
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
    case "radius_km": {
      const p = arg ? PLANETS[arg as PlanetId] : undefined;
      if (!p) return undefined;
      if (name === "period") return p.periodDays < 1000 ? `${f(p.periodDays, 0)} Earth days` : `${f(p.periodDays / 365.26, 1)} Earth years`;
      if (name === "planet_gravity") return `${f(p.gravity)} m/s²`;
      if (name === "distance_au") return `${f(p.distanceAU)} AU`;
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
  for (const [k, v] of Object.entries(m)) if (v !== null) out[k] = v;
  if (m.orbits) out.orbitDay = Math.floor(orbitClock.day);
  return out;
}
