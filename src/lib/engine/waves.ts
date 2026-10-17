// Water waves and signals: the exact numbers behind the ripple tank and the
// signal floor plan. Water waves follow the real dispersion relation
// ω² = g·k·tanh(k·d); signals use free-space path loss (radio), spherical
// spreading (sound, light) and typical per-wall losses (a multi-wall model,
// as Wi-Fi planning tools use).

export type V2 = [number, number];

export const G = 9.81;
export const LIGHT = 299_792_458;
export const SOUND_IN_AIR = 343; // m/s at 20 °C

// ---------- water waves ----------

export interface WaterWave {
  frequency: number;
  depth: number;
  wavelength: number;
  speed: number;
  period: number;
  /** Shallow when the depth is under 1/20 of a wavelength, deep over 1/2. */
  regime: "shallow" | "intermediate" | "deep";
}

/** Wavelength and speed of a water wave of this frequency (Hz) in water this deep (m). */
export function waterWave(frequency: number, depth: number): WaterWave {
  const w = 2 * Math.PI * frequency;
  const f = (k: number) => G * k * Math.tanh(k * depth) - w * w;
  // f grows with k, so bisection always finds the one root.
  let lo = 0, hi = Math.max((w * w) / G, w / Math.sqrt(G * depth), 1);
  while (f(hi) < 0) hi *= 2;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid;
    else hi = mid;
  }
  const k = (lo + hi) / 2;
  const wavelength = (2 * Math.PI) / k;
  const ratio = depth / wavelength;
  return { frequency, depth, wavelength, speed: wavelength * frequency, period: 1 / frequency, regime: ratio < 0.05 ? "shallow" : ratio > 0.5 ? "deep" : "intermediate" };
}

/** Speed of long waves in shallow water, √(g·d). */
export const shallowWaterSpeed = (depth: number) => Math.sqrt(G * depth);

/** Path difference from two sources to a point, in wavelengths: whole numbers add up, halves cancel. */
export function pathDifference(p: V2, a: V2, b: V2, wavelength: number): { wavelengths: number; kind: "constructive" | "destructive" | "in between" } {
  const n = Math.abs(Math.hypot(p[0] - a[0], p[1] - a[1]) - Math.hypot(p[0] - b[0], p[1] - b[1])) / wavelength;
  const off = Math.abs(n - Math.round(n));
  return { wavelengths: n, kind: off < 0.15 ? "constructive" : off > 0.35 ? "destructive" : "in between" };
}

/** How much a wave spreads through a gap: first dark direction sin θ = λ / gap (none when the gap is narrower than a wavelength). */
export function gapSpread(wavelength: number, gap: number): { gapInWavelengths: number; firstMinimumDeg: number | null } {
  return { gapInWavelengths: gap / wavelength, firstMinimumDeg: wavelength < gap ? (Math.asin(wavelength / gap) * 180) / Math.PI : null };
}

/** Doppler effect for a moving source (slower than the waves). */
export function doppler(frequency: number, waveSpeed: number, sourceSpeed: number) {
  const vs = Math.min(Math.abs(sourceSpeed), waveSpeed * 0.95);
  return { ahead: (frequency * waveSpeed) / (waveSpeed - vs), behind: (frequency * waveSpeed) / (waveSpeed + vs), aheadWavelength: (waveSpeed - vs) / frequency, behindWavelength: (waveSpeed + vs) / frequency };
}

// ---------- signals ----------

export type Band = "low_radio" | "radio_2ghz" | "radio_5ghz" | "mmwave" | "sound" | "light";

export const SIGNAL_KINDS = {
  wifi_2_4: { name: "Wi-Fi 2.4 GHz", frequency: 2.4e9, speed: LIGHT, power: 20, band: "radio_2ghz", source: "Wi-Fi router", device: "phone" },
  wifi_5: { name: "Wi-Fi 5 GHz", frequency: 5e9, speed: LIGHT, power: 20, band: "radio_5ghz", source: "Wi-Fi router", device: "phone" },
  bluetooth: { name: "Bluetooth", frequency: 2.44e9, speed: LIGHT, power: 4, band: "radio_2ghz", source: "Bluetooth speaker", device: "phone" },
  mobile_4g: { name: "4G mobile", frequency: 1.8e9, speed: LIGHT, power: 23, band: "radio_2ghz", source: "small mobile mast", device: "phone" },
  mobile_5g: { name: "5G millimetre wave", frequency: 28e9, speed: LIGHT, power: 23, band: "mmwave", source: "5G mast", device: "phone" },
  fm_radio: { name: "FM radio", frequency: 100e6, speed: LIGHT, power: 30, band: "low_radio", source: "FM transmitter", device: "radio" },
  am_radio: { name: "AM radio", frequency: 1e6, speed: LIGHT, power: 30, band: "low_radio", source: "AM transmitter", device: "radio" },
  sound: { name: "Sound", frequency: 500, speed: SOUND_IN_AIR, power: 80, band: "sound", source: "speaker", device: "listener" },
  light: { name: "Light", frequency: 5.45e14, speed: LIGHT, power: 100, band: "light", source: "lamp", device: "light meter" },
} as const satisfies Record<string, { name: string; frequency: number; speed: number; power: number; band: Band; source: string; device: string }>;
export type SignalKind = keyof typeof SIGNAL_KINDS;
export const SIGNAL_KIND_IDS = Object.keys(SIGNAL_KINDS) as [SignalKind, ...SignalKind[]];

export const WALL_MATERIALS = ["drywall", "wood", "glass", "brick", "concrete", "metal"] as const;
export type WallMaterial = (typeof WALL_MATERIALS)[number];

/** Typical loss (dB) for one wall, by kind of wave. Light passes clear glass only. */
export const WALL_LOSS: Record<Band, Record<WallMaterial, number>> = {
  low_radio: { drywall: 2, wood: 2, glass: 1, brick: 4, concrete: 8, metal: 30 },
  radio_2ghz: { drywall: 3, wood: 4, glass: 2, brick: 8, concrete: 13, metal: 50 },
  radio_5ghz: { drywall: 4, wood: 6, glass: 3, brick: 12, concrete: 20, metal: 55 },
  mmwave: { drywall: 8, wood: 12, glass: 6, brick: 30, concrete: 45, metal: 70 },
  sound: { drywall: 35, wood: 28, glass: 28, brick: 45, concrete: 50, metal: 40 },
  light: { drywall: Infinity, wood: Infinity, glass: 0.4, brick: Infinity, concrete: Infinity, metal: Infinity },
};

export interface Wall {
  id: string;
  from: V2;
  to: V2;
  material: WallMaterial;
}

export const SIGNAL_LAYOUTS = ["room", "apartment", "open_field", "elevator"] as const;
export type SignalLayout = (typeof SIGNAL_LAYOUTS)[number];
/** The floor plan's half-extents (m). */
export const PLAN = { x: 3.6, z: 2.6 } as const;

const w = (id: string, from: V2, to: V2, material: WallMaterial): Wall => ({ id, from, to, material });

/** Walls of a ready-made floor plan, with where the source and the receiving device start. */
export function signalLayout(layout: SignalLayout): { walls: Wall[]; source: V2; device: V2 } {
  switch (layout) {
    case "room":
      return {
        walls: [
          w("north_wall_left", [-3, -2.2], [-0.8, -2.2], "brick"),
          w("window", [-0.8, -2.2], [0.8, -2.2], "glass"),
          w("north_wall_right", [0.8, -2.2], [3, -2.2], "brick"),
          w("west_wall", [-3, -2.2], [-3, 2.2], "brick"),
          w("east_wall", [3, -2.2], [3, 2.2], "brick"),
          w("south_wall_left", [-3, 2.2], [0.6, 2.2], "brick"),
          w("south_wall_right", [1.5, 2.2], [3, 2.2], "brick"),
        ],
        source: [-1.9, -1.1],
        device: [1.9, 1.1],
      };
    case "apartment":
      return {
        walls: [
          w("outer_north_left", [-3.5, -2.5], [-1.4, -2.5], "brick"),
          w("window", [-1.4, -2.5], [-0.2, -2.5], "glass"),
          w("outer_north_right", [-0.2, -2.5], [3.5, -2.5], "brick"),
          w("outer_south", [-3.5, 2.5], [3.5, 2.5], "brick"),
          w("outer_west", [-3.5, -2.5], [-3.5, 2.5], "brick"),
          w("outer_east", [3.5, -2.5], [3.5, 2.5], "brick"),
          w("hall_wall_back", [0.5, -2.5], [0.5, 0.3], "drywall"),
          w("hall_wall_front", [0.5, 1.2], [0.5, 2.5], "drywall"),
          w("kitchen_wall_left", [0.5, 0], [1.6, 0], "concrete"),
          w("kitchen_wall_right", [2.4, 0], [3.5, 0], "concrete"),
        ],
        source: [-2.3, -1.3],
        device: [2.6, -1.4],
      };
    case "open_field":
      return { walls: [], source: [-2.6, 0], device: [2.6, 0] };
    case "elevator":
      return {
        walls: [
          w("lift_back", [0.9, -0.8], [2.5, -0.8], "metal"),
          w("lift_front", [0.9, 0.8], [2.5, 0.8], "metal"),
          w("lift_left", [0.9, -0.8], [0.9, 0.8], "metal"),
          w("lift_right", [2.5, -0.8], [2.5, 0.8], "metal"),
        ],
        source: [-2.4, 0],
        device: [1.7, 0],
      };
  }
}

/** Do segments ab and cd cross? */
export function segmentsCross(a: V2, b: V2, c: V2, d: V2): boolean {
  const cross = (o: V2, p: V2, q: V2) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export const signalFrequency = (kind: SignalKind, soundHz?: number) => (kind === "sound" && soundHz ? soundHz : SIGNAL_KINDS[kind].frequency);
export const signalWavelength = (kind: SignalKind, soundHz?: number) => SIGNAL_KINDS[kind].speed / signalFrequency(kind, soundHz);

/** Free-space path loss (dB) for radio: 20·log10(d) + 20·log10(f) − 147.55, d in m and f in Hz. */
export const freeSpaceLoss = (d: number, f: number) => 20 * Math.log10(d) + 20 * Math.log10(f) - 147.55;

export interface Reception {
  distance: number;
  pathLoss: number;
  wallLoss: number;
  walls: Wall[];
  /** dBm for radio, dB SPL for sound, % of the brightness 1 m from the lamp for light. */
  strength: number;
  bars: 0 | 1 | 2 | 3 | 4;
  quality: string;
}

/** What arrives at `at` from a source at `from`. */
export function reception(kind: SignalKind, from: V2, at: V2, walls: Wall[], soundHz?: number): Reception {
  const k = SIGNAL_KINDS[kind];
  const distance = Math.max(0.25, Math.hypot(at[0] - from[0], at[1] - from[1]));
  // Sound and light spread over a sphere: 6 dB weaker each time the distance doubles.
  const pathLoss = k.band === "sound" || k.band === "light" ? 20 * Math.log10(distance) : freeSpaceLoss(distance, signalFrequency(kind, soundHz));
  const crossed = walls.filter((x) => segmentsCross(from, at, x.from, x.to));
  const wallLoss = crossed.reduce((s, x) => s + WALL_LOSS[k.band][x.material], 0);
  const db = k.power - pathLoss - wallLoss;
  if (k.band === "light") {
    const pct = Number.isFinite(wallLoss) ? 100 * Math.pow(10, -(pathLoss + wallLoss) / 10) : 0;
    const bars = pct >= 25 ? 4 : pct >= 8 ? 3 : pct >= 2 ? 2 : pct > 0.2 ? 1 : 0;
    return { distance, pathLoss, wallLoss, walls: crossed, strength: pct, bars, quality: ["dark", "very dim", "dim", "bright", "very bright"][bars] };
  }
  if (k.band === "sound") {
    const bars = db >= 60 ? 4 : db >= 45 ? 3 : db >= 30 ? 2 : db >= 15 ? 1 : 0;
    return { distance, pathLoss, wallLoss, walls: crossed, strength: db, bars, quality: ["silent", "faint", "quiet", "clear", "loud"][bars] };
  }
  const bars = db >= -50 ? 4 : db >= -60 ? 3 : db >= -70 ? 2 : db >= -80 ? 1 : 0;
  return { distance, pathLoss, wallLoss, walls: crossed, strength: db, bars, quality: ["no signal", "weak", "fair", "good", "excellent"][bars] };
}

/** Signal strength 0..1 for colouring a map (1 = 4 bars and better, 0 = nothing). */
export function strengthLevel(kind: SignalKind, r: Reception): number {
  const band = SIGNAL_KINDS[kind].band;
  if (band === "light") return Math.min(1, Math.max(0, (Math.log10(Math.max(r.strength, 1e-3)) + 1) / 3));
  if (band === "sound") return Math.min(1, Math.max(0, (r.strength - 10) / 55));
  return Math.min(1, Math.max(0, (r.strength + 90) / 45));
}

/**
 * How a wall looks to the wave animation: its speed factor inside the wall
 * (contrast sets how much bounces back) and how strongly it absorbs.
 * Metal reflects everything; light is not animated as waves.
 */
export function wallWaveProps(kind: SignalKind, material: WallMaterial): { rigid: boolean; speed: number; absorb: number } {
  const band = SIGNAL_KINDS[kind].band;
  if (material === "metal") return { rigid: true, speed: 1, absorb: 0 };
  const loss = WALL_LOSS[band][material];
  if (!Number.isFinite(loss)) return { rigid: false, speed: 0.3, absorb: 60 };
  const speed = band === "sound" ? 0.2 : material === "glass" ? 0.65 : material === "drywall" || material === "wood" ? 0.6 : 0.4;
  return { rigid: false, speed, absorb: Math.min(60, loss * 0.9) };
}

/**
 * The wavelength drawn by the wave animation: true to scale when it fits the
 * floor plan's grid, otherwise the nearest size that can be seen (and flagged).
 */
export function shownWavelength(kind: SignalKind, soundHz?: number): { real: number; shown: number; toScale: boolean } {
  const real = signalWavelength(kind, soundHz);
  const shown = Math.min(1.6, Math.max(0.32, real));
  return { real, shown, toScale: Math.abs(shown - real) / real < 0.02 };
}

// ---------- formatting ----------

const trim = (v: number, d: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(Math.min(d, 1)) : v.toFixed(d));
/** Drops trailing zeros after a decimal point only ("2.40" → "2.4", "500" stays). */
const tidy = (s: string) => (s.includes(".") ? s.replace(/\.?0+$/, "") : s);

export function formatFrequency(f: number): string {
  if (f >= 1e12) return `${trim(f / 1e12, 0)} THz`;
  if (f >= 1e9) return `${tidy(trim(f / 1e9, 2))} GHz`;
  if (f >= 1e6) return `${tidy(trim(f / 1e6, 1))} MHz`;
  if (f >= 1e3) return `${tidy(trim(f / 1e3, 1))} kHz`;
  return `${tidy(trim(f, 2))} Hz`;
}

export function formatLength(m: number): string {
  if (m >= 1000) return `${tidy(trim(m / 1000, 1))} km`;
  if (m >= 1) return `${trim(m, 2)} m`;
  if (m >= 0.01) return `${tidy(trim(m * 100, 1))} cm`;
  if (m >= 1e-3) return `${tidy(trim(m * 1000, 1))} mm`;
  return `${Math.round(m * 1e9)} nm`;
}

export function formatSpeed(v: number): string {
  return v > 1e6 ? `${Math.round(v / 1000).toLocaleString("en-US")} km/s` : `${trim(v, 2)} m/s`;
}

export function formatStrength(kind: SignalKind, r: Reception): string {
  const band = SIGNAL_KINDS[kind].band;
  if (band === "light") return r.strength >= 1 ? `${trim(r.strength, 1)}% of the brightness 1 m from the lamp` : r.strength > 0 ? `${r.strength.toFixed(2)}% of the brightness 1 m from the lamp` : "no light at all";
  if (band === "sound") return `${Math.round(r.strength)} dB`;
  return `${Math.round(r.strength)} dBm`;
}
