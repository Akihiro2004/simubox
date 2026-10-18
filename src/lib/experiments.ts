import { z } from "zod";
import { isValidExpression } from "./engine/expr";

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
