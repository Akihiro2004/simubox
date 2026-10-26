import { z } from "zod";
import { isValidExpression } from "./engine/expr";
import { BREATH_DEFAULTS, FIBERS, HEART_DEFAULTS, type FiberId } from "./engine/physiology";
import { ANATOMY_SYSTEMS, anatomyLooks, STRUCTURE_IDS, STRUCTURES, type AnatomySystem } from "./world/anatomy";

const n = (lo: number, hi: number) => z.number().finite().min(lo).max(hi);
export const MECHANICS_MODES = ["force", "collision", "impulse", "ramp", "spring", "pendulum"] as const;
export const MechanicsFields = z.strictObject({
  mode: z.enum(MECHANICS_MODES), massKg: n(.1, 50), mass2Kg: n(.1, 50),
  forceN: n(-100, 100), opposingN: n(-100, 100), velocity: n(-20, 20), velocity2: n(-20, 20),
  friction: n(0, 1), gravity: n(0, 100), restitution: n(0, 1), impulseNs: n(-50, 50),
  durationS: n(.1, 10), contactS: n(.05, 2), angleDeg: n(0, 60), springK: n(.1, 100),
  displacementM: n(-2, 2), lengthM: n(.5, 3), pendulumDeg: n(-15, 15), playing: z.boolean(),
});
export type MechanicsState = z.infer<typeof MechanicsFields>;
export const DEFAULT_MECHANICS: MechanicsState = {
  mode: "force", massKg: 2, mass2Kg: 2, forceN: 4, opposingN: 0, velocity: 0, velocity2: 0,
  friction: 0, gravity: 9.81, restitution: 1, impulseNs: 4, durationS: 4, contactS: .5,
  angleDeg: 25, springK: 8, displacementM: 1, lengthM: 2, pendulumDeg: 12, playing: true,
};
export const MATH_MODES = ["number_line", "arithmetic", "place_value", "measurement", "angles", "fractions", "ratio", "percent", "equation", "inequality", "quadratic", "linear_system", "functions", "geometry", "trigonometry", "statistics", "probability", "sequence", "transform"] as const;
export const SCHOOL_UNITS = { mm: ["length", .001], cm: ["length", .01], m: ["length", 1], km: ["length", 1000], g: ["mass", .001], kg: ["mass", 1], s: ["time", 1], min: ["time", 60], h: ["time", 3600], mL: ["volume", .001], L: ["volume", 1] } as const;
export const UNIT_IDS = Object.keys(SCHOOL_UNITS) as [keyof typeof SCHOOL_UNITS, ...(keyof typeof SCHOOL_UNITS)[]];
export const MathFields = z.strictObject({
  mode: z.enum(MATH_MODES), operation: z.enum(["add", "subtract", "multiply", "divide", "power"]),
  a: n(-1000, 1000), b: n(-1000, 1000), c: n(-1000, 1000), d: n(-1000, 1000),
  numerator: n(-96, 96).int(), denominator: n(1, 24).int(), numerator2: n(-96, 96).int(), denominator2: n(1, 24).int(),
  shape: z.enum(["rectangle", "triangle", "circle", "cuboid", "cylinder", "sphere"]),
  width: n(.1, 10), height: n(.1, 10), depth: n(.1, 10), angleDeg: n(-360, 360),
  data: z.array(n(-100, 100)).min(1).max(32), coefficients: z.array(n(-100, 100)).length(6),
  favourable: n(0, 100).int(), total: n(1, 100).int(), draws: n(1, 10).int(), replacement: z.boolean(),
  sequence: z.enum(["arithmetic", "geometric"]), index: n(1, 30).int(),
  expression: z.string().min(1).max(100).refine(isValidExpression, "Use a supported expression in x"),
  transform: z.enum(["translate", "reflect_x", "reflect_y", "rotate"]),
  unitFrom: z.enum(UNIT_IDS), unitTo: z.enum(UNIT_IDS),
});
export type MathState = z.infer<typeof MathFields>;
export const DEFAULT_MATH: MathState = {
  mode: "fractions", operation: "add", a: 2, b: 3, c: 7, d: 1,
  numerator: 1, denominator: 2, numerator2: 1, denominator2: 3,
  shape: "rectangle", width: 4, height: 3, depth: 2, angleDeg: 30,
  data: [2, 3, 3, 5, 7], coefficients: [1, 1, 5, 1, -1, 1],
  favourable: 3, total: 6, draws: 1, replacement: true,
  sequence: "arithmetic", index: 5, expression: "x^2 - 3", transform: "translate",
  unitFrom: "m", unitTo: "cm",
};
export function mathSetupError(s: MathState): string | null {
  if (s.mode === "measurement" && SCHOOL_UNITS[s.unitFrom][0] !== SCHOOL_UNITS[s.unitTo][0]) return "Choose units that measure the same quantity.";
  if (s.mode === "fractions" && s.operation === "power") return "Choose add, subtract, multiply or divide for fraction strips.";
  if (s.mode === "probability" && s.favourable > s.total) return "Favourable outcomes cannot exceed total outcomes.";
  if (s.mode === "probability" && !s.replacement && s.draws > s.total) return "Cannot draw more objects than exist without replacement.";
  if (s.mode === "arithmetic" && s.operation === "power" && (!Number.isInteger(s.b) || Math.abs(s.b) > 8)) return "Use an integer exponent from -8 to 8.";
  return null;
}

export const ANATOMY_INSTRUMENTS = ["none", "heart", "breathing", "nerve", "digestion", "kidney"] as const;
export const AnatomyFields = z.strictObject({
  system: z.enum(ANATOMY_SYSTEMS),
  /** Whole-body peel: 0 skin, 1 muscles, 2 skeleton and organs, 3 organs only. */
  depth: z.number().int().min(0).max(3),
  highlight: z.enum(STRUCTURE_IDS).nullable(),
  labels: z.boolean(),
  instrument: z.enum(ANATOMY_INSTRUMENTS),
  heartRateBpm: n(30, 200), contractility: n(.3, 2), resistance: n(.4, 2.5), arterialStiffness: n(.5, 3), fillingMmHg: n(3, 20),
  breathsPerMin: n(4, 40), effortCmH2O: n(1, 30), airwayResistance: n(.5, 30), compliance: n(.02, .3),
  /** Body activity in METs (1 = resting, ~6 = running): sets oxygen use and CO2 made. */
  metabolicRate: n(1, 12),
  /** Water drunk per day, litres. */
  waterIntakeL: n(.5, 5),
  fiber: z.enum(Object.keys(FIBERS) as [FiberId, ...FiberId[]]), stimulusUA: n(0, 40),
  hoursAfterMeal: n(0, 72),
  /** Slow motion for the live models: 1 = real time. */
  speed: n(.05, 1), playing: z.boolean(),
});
export type AnatomyState = z.infer<typeof AnatomyFields>;
export const DEFAULT_ANATOMY: AnatomyState = {
  system: "all", depth: 0, highlight: null, labels: false, instrument: "none",
  ...HEART_DEFAULTS, ...BREATH_DEFAULTS, metabolicRate: 1, waterIntakeL: 2, fiber: "A_alpha", stimulusUA: 15, hoursAfterMeal: 0, speed: 1, playing: true,
};
/** The body system each live model is about. */
export const INSTRUMENT_SYSTEM: Record<AnatomyState["instrument"], AnatomySystem | null> = { none: null, heart: "cardiovascular", breathing: "respiratory", nerve: "nervous", digestion: "digestive", kidney: "urinary" };

/**
 * Applies a change to the Anatomy Lab. Starting a live model shows its body
 * system, and highlighting a structure the current layers hide switches to
 * its system, unless the same change names a system itself.
 */
export function anatomySetup(cur: AnatomyState, patch: Partial<AnatomyState>, fresh: boolean): AnatomyState {
  const next = { ...cur, ...(fresh ? { highlight: null } : {}), ...patch };
  if (patch.system === undefined && patch.instrument && INSTRUMENT_SYSTEM[patch.instrument]) next.system = INSTRUMENT_SYSTEM[patch.instrument]!;
  if (patch.system === undefined && next.highlight && anatomyLooks(next.system, next.depth).get(next.highlight) !== "solid") next.system = STRUCTURES[next.highlight].system;
  return next;
}
