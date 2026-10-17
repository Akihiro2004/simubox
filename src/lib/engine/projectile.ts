// Ideal projectile motion: no air drag, flat ground at y = 0, launch from
// height h >= 0. All values SI (m, s, m/s, m/s^2). Angles in degrees.

export type SpeedUnit = "m/s" | "km/h" | "mph";

export function toMetersPerSecond(value: number, unit: SpeedUnit): number {
  switch (unit) {
    case "m/s":
      return value;
    case "km/h":
      return value / 3.6;
    case "mph":
      return value * 0.44704;
  }
}

export interface ProjectileInput {
  speed: number; // m/s
  angleDeg: number; // 0..90 above horizontal
  gravity: number; // m/s^2, >= 0
  height?: number; // launch height above ground, m
}

export interface ProjectileResult {
  vx: number;
  vy: number;
  /** Time until y returns to 0. Infinity when it never lands (g = 0 and vy >= 0). */
  flightTime: number;
  range: number;
  maxHeight: number;
  timeToApex: number;
  impactSpeed: number;
  lands: boolean;
}

export const PROJECTILE_LIMITS = {
  speed: { min: 0, max: 100 },
  angleDeg: { min: 0, max: 90 },
  gravity: { min: 0, max: 1000 },
  height: { min: 0, max: 20 },
} as const;

export function validateProjectile(p: ProjectileInput): string | null {
  const h = p.height ?? 0;
  for (const [k, v] of [["speed", p.speed], ["angleDeg", p.angleDeg], ["gravity", p.gravity], ["height", h]] as const) {
    if (!Number.isFinite(v)) return `${k} must be a finite number`;
    const lim = PROJECTILE_LIMITS[k];
    if (v < lim.min || v > lim.max) return `${k} must be between ${lim.min} and ${lim.max}`;
  }
  return null;
}

export function solveProjectile(p: ProjectileInput): ProjectileResult {
  const err = validateProjectile(p);
  if (err) throw new RangeError(err);
  const h = p.height ?? 0;
  const g = p.gravity;
  const th = (p.angleDeg * Math.PI) / 180;
  // Snap tiny float noise from cos(90°) to an exact 0.
  const vx = Math.abs(Math.cos(th)) < 1e-12 ? 0 : p.speed * Math.cos(th);
  const vy = p.speed * Math.sin(th);

  if (g === 0) {
    // No gravity: straight line. It only lands if launched flat from the ground.
    return { vx, vy, flightTime: vy === 0 && h === 0 ? 0 : Infinity, range: vy === 0 && h === 0 ? 0 : Infinity, maxHeight: vy > 0 ? Infinity : h, timeToApex: Infinity, impactSpeed: p.speed, lands: vy === 0 && h === 0 };
  }

  // y(t) = h + vy t - g t^2 / 2 = 0  ->  t = (vy + sqrt(vy^2 + 2 g h)) / g
  const flightTime = (vy + Math.sqrt(vy * vy + 2 * g * h)) / g;
  const timeToApex = vy / g;
  const maxHeight = h + (vy * vy) / (2 * g);
  const vyImpact = vy - g * flightTime;
  return {
    vx,
    vy,
    flightTime,
    range: vx * flightTime,
    maxHeight,
    timeToApex,
    impactSpeed: Math.hypot(vx, vyImpact),
    lands: true,
  };
}

/** Position at time t (clamped to the flight). */
export function positionAt(p: ProjectileInput, r: ProjectileResult, t: number): [number, number] {
  const tt = Math.min(Math.max(t, 0), Number.isFinite(r.flightTime) ? r.flightTime : t);
  return [r.vx * tt, (p.height ?? 0) + r.vy * tt - 0.5 * p.gravity * tt * tt];
}

export function velocityAt(p: ProjectileInput, r: ProjectileResult, t: number): [number, number] {
  return [r.vx, r.vy - p.gravity * t];
}

/** Sampled path for drawing. For g = 0 the line is cut at `maxT` seconds. */
export function samplePath(p: ProjectileInput, r: ProjectileResult, n = 64, maxT = 3): [number, number][] {
  const T = Number.isFinite(r.flightTime) ? r.flightTime : maxT;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) pts.push(positionAt(p, r, (T * i) / n));
  return pts;
}

export const GRAVITY_PRESETS = [
  { id: "zero", label: "Zero", value: 0 },
  { id: "moon", label: "Moon", value: 1.62 },
  { id: "mars", label: "Mars", value: 3.71 },
  { id: "earth", label: "Earth", value: 9.81 },
  { id: "double", label: "2× Earth", value: 19.62 },
  { id: "jupiter", label: "Jupiter", value: 24.79 },
  { id: "tenfold", label: "10× Earth", value: 98.1 },
] as const;

export function fmt(value: number, unit = "", digits = 2): string {
  if (!Number.isFinite(value)) return "∞";
  const s = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(digits);
  return unit ? `${s} ${unit}` : s;
}
