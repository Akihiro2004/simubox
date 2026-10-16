// Small, exact physics models: buoyancy, circuits, waves, levers, states of
// matter. Each one is the only source of the numbers shown to students.

// ---------- buoyancy ----------

/** Densities in kg/m³ (typical values). */
export const MATERIALS = {
  foam: { name: "Foam", density: 50, color: "#f5f5f4" },
  cork: { name: "Cork", density: 240, color: "#c69a6d" },
  wood: { name: "Wood (pine)", density: 500, color: "#c08a5a" },
  apple: { name: "Apple", density: 800, color: "#dc2626" },
  plastic: { name: "Plastic", density: 900, color: "#60a5fa" },
  ice: { name: "Ice", density: 917, color: "#bae6fd" },
  egg: { name: "Egg", density: 1030, color: "#fef3c7" },
  rubber: { name: "Rubber", density: 1150, color: "#f97316" },
  glass: { name: "Glass", density: 2500, color: "#a7f3d0" },
  stone: { name: "Stone", density: 2600, color: "#9ca3af" },
  aluminium: { name: "Aluminium", density: 2700, color: "#d1d5db" },
  steel: { name: "Steel", density: 7850, color: "#6b7280" },
  gold: { name: "Gold", density: 19300, color: "#facc15" },
} as const;
export type MaterialId = keyof typeof MATERIALS;
export const MATERIAL_IDS = Object.keys(MATERIALS) as [MaterialId, ...MaterialId[]];

export const FLUIDS = {
  fresh_water: { name: "Fresh water", density: 1000, color: "#7cc7f2" },
  sea_water: { name: "Sea water", density: 1025, color: "#4fa3d9" },
  very_salty_water: { name: "Very salty water (Dead Sea)", density: 1240, color: "#8fd3e8" },
  oil: { name: "Cooking oil", density: 920, color: "#f3d36b" },
  honey: { name: "Honey", density: 1420, color: "#e3a72f" },
} as const;
export type FluidId = keyof typeof FLUIDS;
export const FLUID_IDS = Object.keys(FLUIDS) as [FluidId, ...FluidId[]];

/** Fraction of an object below the surface when floating (1 = it sinks). */
export function floatFraction(objectDensity: number, fluidDensity: number): number {
  if (objectDensity <= 0 || fluidDensity <= 0) throw new RangeError("densities must be positive");
  return Math.min(1, objectDensity / fluidDensity);
}

export function floats(objectDensity: number, fluidDensity: number): boolean {
  return objectDensity < fluidDensity;
}

/** Volume of a sphere of radius r submerged to `depth` measured up from its bottom (spherical cap). */
export function sphereSubmerged(r: number, depth: number): number {
  const d = Math.min(Math.max(depth, 0), 2 * r);
  return (Math.PI * d * d * (3 * r - d)) / 3;
}

/** Archimedes: upward force (N) from displaced fluid. */
export function buoyantForce(fluidDensity: number, g: number, submergedVolume: number): number {
  return fluidDensity * g * submergedVolume;
}

// ---------- circuits ----------

export interface CircuitInput {
  layout: "series" | "parallel";
  voltage: number; // V
  resistances: number[]; // Ω, one per bulb
  closed: boolean;
  /** Blown bulbs (same order as resistances): an open gap in that bulb's path. */
  broken?: boolean[];
}
export interface CircuitResult {
  totalResistance: number;
  current: number; // A from the battery
  branches: { resistance: number; current: number; voltage: number; power: number; brightness: number }[];
  totalPower: number;
}

export function solveCircuit(c: CircuitInput): CircuitResult {
  if (!c.resistances.length || c.resistances.some((r) => !(r > 0)) || !(c.voltage >= 0)) throw new RangeError("invalid circuit");
  const series = c.layout === "series";
  const ok = c.resistances.map((_, i) => !c.broken?.[i]);
  const working = c.resistances.filter((_, i) => ok[i]);
  // One gap stops a series loop; in parallel only that branch goes dark.
  const totalResistance = series ? (ok.every(Boolean) ? working.reduce((a, b) => a + b, 0) : Infinity) : working.length ? 1 / working.reduce((a, r) => a + 1 / r, 0) : Infinity;
  const V = c.closed ? c.voltage : 0;
  const loop = series ? V / totalResistance : 0; // 0 when the loop is open (V / Infinity)
  const branches = c.resistances.map((r, i) => {
    const current = !ok[i] ? 0 : series ? loop : V / r;
    // Across a gap the whole battery voltage appears (nothing else drops it).
    const voltage = ok[i] ? current * r : V;
    const power = current * current * r;
    // Brightness is relative to one bulb on 6 V across 10 Ω (3.6 W).
    return { resistance: r, current, voltage, power, brightness: Math.min(1, power / 3.6) };
  });
  const current = series ? loop : branches.reduce((a, b) => a + b.current, 0);
  return { totalResistance, current, branches, totalPower: branches.reduce((a, b) => a + b.power, 0) };
}

// ---------- waves ----------

export interface WaveInput {
  amplitude: number; // m
  frequency: number; // Hz
  wavelength: number; // m
}
export const waveSpeed = (w: WaveInput) => w.frequency * w.wavelength;
export const wavePeriod = (w: WaveInput) => 1 / w.frequency;
/** Displacement at position x (m) and time t (s) for a wave moving to +x. */
export function waveDisplacement(w: WaveInput, x: number, t: number): number {
  return w.amplitude * Math.sin(2 * Math.PI * (x / w.wavelength - w.frequency * t));
}

// ---------- levers ----------

export interface LeverInput {
  leftMass: number; // kg
  leftDistance: number; // m from fulcrum
  rightMass: number;
  rightDistance: number;
  g?: number;
}
export function solveLever(l: LeverInput) {
  const g = l.g ?? 9.81;
  const leftTorque = l.leftMass * g * l.leftDistance;
  const rightTorque = l.rightMass * g * l.rightDistance;
  const net = rightTorque - leftTorque; // > 0 tips right side down
  const balanced = Math.abs(net) <= 1e-9 * Math.max(1, leftTorque, rightTorque);
  return {
    leftTorque,
    rightTorque,
    net,
    balanced,
    heavierSide: balanced ? ("none" as const) : net > 0 ? ("right" as const) : ("left" as const),
    /** Where the right mass would have to sit to balance. */
    balanceRightDistance: l.rightMass > 0 ? (l.leftMass * l.leftDistance) / l.rightMass : Infinity,
  };
}

// ---------- states of matter ----------

export const SUBSTANCES = {
  water: { name: "Water", melt: 0, boil: 100, molarMass: 0.018 },
  iron: { name: "Iron", melt: 1538, boil: 2862, molarMass: 0.0558 },
  nitrogen: { name: "Nitrogen", melt: -210, boil: -196, molarMass: 0.028 },
  chocolate: { name: "Chocolate", melt: 34, boil: Infinity, molarMass: 0.3 },
} as const;
export type SubstanceId = keyof typeof SUBSTANCES;
export const SUBSTANCE_IDS = Object.keys(SUBSTANCES) as [SubstanceId, ...SubstanceId[]];

export function phaseAt(substance: SubstanceId, tempC: number): "solid" | "liquid" | "gas" {
  const s = SUBSTANCES[substance];
  if (tempC < s.melt) return "solid";
  if (tempC < s.boil) return "liquid";
  return "gas";
}

/** Root-mean-square speed of gas particles (m/s), √(3RT/M). */
export function rmsSpeed(substance: SubstanceId, tempC: number): number {
  const T = tempC + 273.15;
  if (T <= 0) return 0;
  return Math.sqrt((3 * 8.314 * T) / SUBSTANCES[substance].molarMass);
}

/** Relative jiggle of particles for the animation (1 at room temperature). */
export function agitation(tempC: number): number {
  return Math.sqrt(Math.max(tempC + 273.15, 1) / 293.15);
}
