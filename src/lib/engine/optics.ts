// Ray optics on the Light Lab table, worked out in the table plane (x, z in
// metres). Reflection and refraction are exact: the law of reflection, Snell's
// law with Fresnel partial reflection, total internal reflection and colour
// dispersion. Lenses are ideal thin lenses, as in school ray diagrams. Every
// angle, refractive index and image distance shown to students comes from here.

export type V2 = [number, number];

export const LIGHT_SPEED = 299_792_458; // m/s in a vacuum

/** Cauchy coefficients, n(λ) = A + B/λ² with λ in micrometres (typical values; n at 589 nm noted). */
export const OPTIC_MATERIALS = {
  air: { name: "Air", A: 1.000293, B: 0 }, // 1.000
  water: { name: "Water", A: 1.324, B: 0.00313 }, // 1.333
  acrylic: { name: "Acrylic", A: 1.4799, B: 0.00368 }, // 1.491
  glass: { name: "Glass", A: 1.5046, B: 0.0042 }, // 1.517 (crown glass)
  diamond: { name: "Diamond", A: 2.3792, B: 0.0133 }, // 2.418
} as const;
export type OpticMaterialId = keyof typeof OPTIC_MATERIALS;
export const OPTIC_MATERIAL_IDS = Object.keys(OPTIC_MATERIALS) as [OpticMaterialId, ...OpticMaterialId[]];

/** Light colours by wavelength (nm); white is a spread of wavelengths. */
export const LIGHT_COLORS = { red: 650, orange: 600, yellow: 580, green: 532, cyan: 490, blue: 450, violet: 405, white: 0 } as const;
export type LightColor = keyof typeof LIGHT_COLORS;
export const LIGHT_COLOR_IDS = Object.keys(LIGHT_COLORS) as [LightColor, ...LightColor[]];
/** The wavelengths a white beam is split into (red to violet). */
export const WHITE_SPECTRUM = [700, 650, 610, 580, 550, 510, 475, 440, 405];

export const OPTIC_KINDS = ["plane_mirror", "concave_mirror", "convex_mirror", "convex_lens", "concave_lens", "glass_block", "prism", "semicircle", "screen", "blocker"] as const;
export type OpticKind = (typeof OPTIC_KINDS)[number];
export const SOURCE_KINDS = ["laser", "ray_box", "lamp", "off"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** Where the rays live: the table's top, as half-extents from its centre (m). */
export const TABLE = { x: 2.8, z: 1.6 } as const;
export const MAX_OPTICS = 8;

export interface OpticElement {
  id: string;
  kind: OpticKind;
  x: number;
  z: number;
  /** Turns the element on the table; 0 = its axis (or normal) points along +x. */
  rotationDeg: number;
  /** Length across the element's face (m). */
  size: number;
  /** Glass blocks: thickness along the axis (m); default 0.6 × size. */
  width?: number;
  /** Lenses and curved mirrors (m, always positive; concave lenses and convex mirrors diverge). */
  focalLength: number;
  /** Blocks, prisms and semicircles. */
  material: OpticMaterialId;
}

export interface LightSource {
  kind: SourceKind;
  x: number;
  z: number;
  /** Beam direction on the table: 0 = +x, 90 = +z. */
  angleDeg: number;
  color: LightColor;
  /** Ray box / lamp: number of rays. */
  rays: number;
  /** Ray box: beam width (m). Lamp: fan angle (degrees). */
  spread: number;
  /** Keep the beam pointed at this element's centre (the source circles it as the angle changes). */
  aimAt: string | null;
  /** Distance from the aimed-at element (m). */
  reach: number;
  /** Optional monochromatic wavelength; absent keeps named colours and white spectra compatible. */
  wavelengthNm?: number | null;
}

/** An object arrow in front of a lens or curved mirror, for image formation. */
export interface OpticObject {
  target: string;
  distance: number;
  height: number;
}

export interface OpticsSetup {
  source: LightSource;
  elements: OpticElement[];
  object: OpticObject | null;
  /** What the table is immersed in. */
  medium: "air" | "water";
  /** Draw the normal and angles where the main beam meets a surface. */
  normals: boolean;
  /** Red, green and blue spotlights on the wall screen (colour mixing). */
  mixing: { red: boolean; green: boolean; blue: boolean } | null;
  reflections?: boolean;
  lighting?: "bright" | "dim";
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const dot = (a: V2, b: V2) => a[0] * b[0] + a[1] * b[1];
const norm = (a: V2): V2 => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};
const add = (a: V2, b: V2, k = 1): V2 => [a[0] + b[0] * k, a[1] + b[1] * k];
export const dirOf = (angleDeg: number): V2 => [Math.cos(rad(angleDeg)), Math.sin(rad(angleDeg))];
const angleBetween = (a: V2, b: V2) => deg(Math.acos(Math.min(1, Math.max(-1, dot(norm(a), norm(b))))));

// ---------- physics ----------

export function refractiveIndex(m: OpticMaterialId, nm = 589): number {
  const { A, B } = OPTIC_MATERIALS[m];
  const um = (nm || 589) / 1000;
  return A + B / (um * um);
}

/** Snell's law n1 sin θ1 = n2 sin θ2, in degrees; null when the light is totally internally reflected. */
export function snellAngle(n1: number, n2: number, incidenceDeg: number): number | null {
  const s = (n1 / n2) * Math.sin(rad(incidenceDeg));
  return Math.abs(s) > 1 + 1e-12 ? null : deg(Math.asin(Math.max(-1, Math.min(1, s))));
}

/** Smallest angle (degrees) at which light going from n1 into n2 is totally reflected; null if it can't be (n1 ≤ n2). */
export function criticalAngle(n1: number, n2: number): number | null {
  return n1 > n2 ? deg(Math.asin(n2 / n1)) : null;
}

/** Fraction of unpolarised light reflected at a boundary (Fresnel equations). */
export function fresnelReflectance(n1: number, n2: number, cosI: number): number {
  if (Math.abs(n1 - n2) < 1e-12) return 0;
  cosI = Math.max(0, Math.min(1, cosI));
  const sinT = (n1 / n2) * Math.sqrt(Math.max(0, 1 - cosI * cosI));
  if (sinT >= 1) return 1;
  const cosT = Math.sqrt(1 - sinT * sinT);
  const rs = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT);
  const rp = (n2 * cosI - n1 * cosT) / (n2 * cosI + n1 * cosT);
  return (rs * rs + rp * rp) / 2;
}

export const lightSpeedIn = (n: number) => LIGHT_SPEED / n;

/** Approximate screen colour of a wavelength (visible range 380-780 nm). */
export function wavelengthColor(nm: number): string {
  const w = Math.min(780, Math.max(380, nm));
  let r = 0, g = 0, b = 0;
  if (w < 440) [r, b] = [(440 - w) / 60, 1];
  else if (w < 490) [g, b] = [(w - 440) / 50, 1];
  else if (w < 510) [g, b] = [1, (510 - w) / 20];
  else if (w < 580) [r, g] = [(w - 510) / 70, 1];
  else if (w < 645) [r, g] = [1, (645 - w) / 65];
  else r = 1;
  const edge = w < 420 ? 0.3 + (0.7 * (w - 380)) / 40 : w > 700 ? 0.3 + (0.7 * (780 - w)) / 80 : 1;
  const hex = (v: number) => Math.round(255 * Math.pow(v * edge, 0.8)).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Focal length with its sign: converging elements positive, diverging negative; null for the rest. */
export function signedFocal(e: OpticElement): number | null {
  if (e.kind === "convex_lens" || e.kind === "concave_mirror") return e.focalLength;
  if (e.kind === "concave_lens" || e.kind === "convex_mirror") return -e.focalLength;
  return null;
}

export const sourceWavelength = (source: LightSource) => source.wavelengthNm ?? (LIGHT_COLORS[source.color] || 550);
export const elementImage = (e: OpticElement, distance: number) => imageFormation(e.kind === "plane_mirror" ? Infinity : signedFocal(e)!, distance);

export interface ImageResult {
  objectDistance: number;
  /** null when the rays leave parallel (object at the focal point). Negative = virtual. */
  imageDistance: number | null;
  magnification: number | null;
  real: boolean;
  upright: boolean;
  description: string;
}

/**
 * Thin lens / mirror equation 1/f = 1/u + 1/v (real-is-positive), with
 * magnification m = −v/u. A negative v is a virtual image: behind a mirror,
 * or on the object's side of a lens.
 */
export function imageFormation(f: number, u: number): ImageResult {
  if (Math.abs(1 / f - 1 / u) < 1e-9) return { objectDistance: u, imageDistance: null, magnification: null, real: false, upright: false, description: "no image: the rays come out parallel" };
  const v = 1 / (1 / f - 1 / u);
  const m = -v / u;
  const real = v > 0;
  const size = Math.abs(Math.abs(m) - 1) < 0.02 ? "the same size" : Math.abs(m) > 1 ? "larger" : "smaller";
  return { objectDistance: u, imageDistance: v, magnification: m, real, upright: m > 0, description: `${real ? "real" : "virtual"}, ${m > 0 ? "upright" : "upside down"} and ${size}` };
}

// ---------- element geometry ----------

interface Frame {
  c: V2;
  u: V2;
  v: V2;
}
export function frameOf(e: Pick<OpticElement, "x" | "z" | "rotationDeg">): Frame {
  const a = rad(e.rotationDeg);
  return { c: [e.x, e.z], u: [Math.cos(a), Math.sin(a)], v: [-Math.sin(a), Math.cos(a)] };
}
const toWorld = (f: Frame, lu: number, lv: number): V2 => [f.c[0] + f.u[0] * lu + f.v[0] * lv, f.c[1] + f.u[1] * lu + f.v[1] * lv];
const toLocal = (f: Frame, p: V2): V2 => {
  const d: V2 = [p[0] - f.c[0], p[1] - f.c[1]];
  return [dot(d, f.u), dot(d, f.v)];
};

export const blockWidth = (e: OpticElement) => e.width ?? e.size * 0.6;

/** Find the material at the ray origin, including rays launched inside a block. */
function mediumAt(p: V2, elements: OpticElement[], ambient: number, nm: number): number {
  let medium = ambient;
  for (const e of elements) {
    const [u, v] = toLocal(frameOf(e), p);
    if (e.kind === "semicircle") {
      if (u <= 0 && u * u + v * v < (e.size / 2) ** 2) medium = refractiveIndex(e.material, nm);
      continue;
    }
    if (e.kind !== "glass_block" && e.kind !== "prism") continue;
    const outline = outlineOf(e);
    let inside = false;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const a = outline[i], b = outline[j];
      if ((a[1] > v) !== (b[1] > v) && u < (b[0] - a[0]) * (v - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    if (inside) medium = refractiveIndex(e.material, nm);
  }
  return medium;
}

/** Outline in the element's own frame [along axis, across face]; refractors are closed polygons. */
export function outlineOf(e: OpticElement): V2[] {
  const h = e.size / 2;
  switch (e.kind) {
    case "glass_block": {
      const w = blockWidth(e) / 2;
      return [[-w, -h], [w, -h], [w, h], [-w, h]];
    }
    case "prism": {
      // Equilateral, centred on its centroid, apex pointing to −v.
      const s = e.size;
      return [[-s / 2, s / (2 * Math.sqrt(3))], [0, -s / Math.sqrt(3)], [s / 2, s / (2 * Math.sqrt(3))]];
    }
    case "semicircle": {
      // Curved side toward −u, flat face at u = 0 facing +u.
      const pts: V2[] = [];
      for (let i = 0; i <= 24; i++) {
        const a = Math.PI / 2 + (i / 24) * Math.PI;
        pts.push([h * Math.cos(a), h * Math.sin(a)]);
      }
      return pts;
    }
    case "concave_mirror":
    case "convex_mirror": {
      const R = 2 * e.focalLength;
      const aperture = Math.min(h, R * 0.98);
      const sign = e.kind === "concave_mirror" ? 1 : -1;
      const pts: V2[] = [];
      for (let i = 0; i <= 32; i++) {
        const lv = -aperture + (i / 32) * aperture * 2;
        pts.push([sign * (R - Math.sqrt(Math.max(0, R * R - lv * lv))), lv]);
      }
      return pts;
    }
    default:
      return [[0, -h], [0, h]];
  }
}

// ---------- the ray tracer ----------

const EPS = 1e-7;

type Surface = { t: number; p: V2; n: V2; el: OpticElement; type: "mirror" | "absorb" | "refract" | "lens"; entering?: boolean; h?: number };

function raySegment(o: V2, d: V2, a: V2, b: V2): { t: number; s: number } | null {
  const ex = b[0] - a[0], ez = b[1] - a[1];
  const den = d[0] * ez - d[1] * ex;
  if (Math.abs(den) < 1e-12) return null;
  const ax = a[0] - o[0], az = a[1] - o[1];
  const t = (ax * ez - az * ex) / den;
  const s = (ax * d[1] - az * d[0]) / den;
  return t > EPS && s >= 0 && s <= 1 ? { t, s } : null;
}

function rayCircle(o: V2, d: V2, c: V2, r: number): number[] {
  const oc: V2 = [o[0] - c[0], o[1] - c[1]];
  const b = dot(oc, d);
  const disc = b * b - (dot(oc, oc) - r * r);
  if (disc < 0) return [];
  const sq = Math.sqrt(disc);
  return [-b - sq, -b + sq].filter((t) => t > EPS);
}

function hitElement(o: V2, d: V2, e: OpticElement): Surface | null {
  const f = frameOf(e);
  const h = e.size / 2;
  const facing = (n: V2): V2 => (dot(d, n) < 0 ? n : [-n[0], -n[1]]);
  switch (e.kind) {
    case "plane_mirror":
    case "screen":
    case "blocker":
    case "convex_lens":
    case "concave_lens": {
      const r = raySegment(o, d, toWorld(f, 0, -h), toWorld(f, 0, h));
      if (!r) return null;
      const type = e.kind === "plane_mirror" ? "mirror" : e.kind.endsWith("lens") ? "lens" : "absorb";
      return { t: r.t, p: add(o, d, r.t), n: facing(f.u), el: e, type, h: r.s * e.size - h };
    }
    case "concave_mirror":
    case "convex_mirror": {
      const R = 2 * e.focalLength;
      const aperture = Math.min(h, R * 0.98);
      const concave = e.kind === "concave_mirror";
      const C = toWorld(f, concave ? R : -R, 0);
      let best: Surface | null = null;
      for (const t of rayCircle(o, d, C, R)) {
        const p = add(o, d, t);
        const [lu, lv] = toLocal(f, p);
        if (Math.abs(lv) > aperture || (concave ? lu >= R : lu <= -R)) continue;
        if (best && best.t <= t) continue;
        // The reflective side faces +u; the back of the mirror is opaque.
        const front = norm(concave ? [C[0] - p[0], C[1] - p[1]] : [p[0] - C[0], p[1] - C[1]]);
        best = dot(d, front) < 0 ? { t, p, n: front, el: e, type: "mirror" } : { t, p, n: facing(front), el: e, type: "absorb" };
      }
      return best;
    }
    case "glass_block":
    case "prism":
    case "semicircle": {
      let best: Surface | null = null;
      const consider = (t: number, p: V2, outward: V2) => {
        if (best && best.t <= t) return;
        const entering = dot(d, outward) < 0;
        best = { t, p, n: entering ? outward : [-outward[0], -outward[1]], el: e, type: "refract", entering };
      };
      if (e.kind === "semicircle") {
        const r = raySegment(o, d, toWorld(f, 0, -h), toWorld(f, 0, h));
        if (r) consider(r.t, add(o, d, r.t), f.u);
        for (const t of rayCircle(o, d, f.c, h)) {
          const p = add(o, d, t);
          if (toLocal(f, p)[0] <= 1e-9) consider(t, p, norm([p[0] - f.c[0], p[1] - f.c[1]]));
        }
        return best;
      }
      const pts = outlineOf(e).map(([lu, lv]) => toWorld(f, lu, lv));
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const r = raySegment(o, d, a, b);
        if (!r) continue;
        let n = norm([-(b[1] - a[1]), b[0] - a[0]]);
        const mid: V2 = [(a[0] + b[0]) / 2 - f.c[0], (a[1] + b[1]) / 2 - f.c[1]];
        if (dot(n, mid) < 0) n = [-n[0], -n[1]];
        consider(r.t, add(o, d, r.t), n);
      }
      return best;
    }
  }
}

/** Where a ray leaves the table. */
function tableExit(o: V2, d: V2): V2 {
  let t = Infinity;
  if (d[0] > 1e-12) t = Math.min(t, (TABLE.x - o[0]) / d[0]);
  if (d[0] < -1e-12) t = Math.min(t, (-TABLE.x - o[0]) / d[0]);
  if (d[1] > 1e-12) t = Math.min(t, (TABLE.z - o[1]) / d[1]);
  if (d[1] < -1e-12) t = Math.min(t, (-TABLE.z - o[1]) / d[1]);
  return add(o, d, Math.max(0, Number.isFinite(t) ? t : 0));
}

const clampTable = (p: V2): V2 => [Math.min(TABLE.x, Math.max(-TABLE.x, p[0])), Math.min(TABLE.z, Math.max(-TABLE.z, p[1]))];
const insideTable = (p: V2) => Math.abs(p[0]) <= TABLE.x + 1e-9 && Math.abs(p[1]) <= TABLE.z + 1e-9;

/** Clip construction lines to the breadboard, even when the predicted image is far away. */
export function clipTableSegment(a: V2, b: V2): [V2, V2] | null {
  const d: V2 = [b[0] - a[0], b[1] - a[1]];
  let enter = 0, exit = 1;
  for (const [p, q] of [[-d[0], a[0] + TABLE.x], [d[0], TABLE.x - a[0]], [-d[1], a[1] + TABLE.z], [d[1], TABLE.z - a[1]]]) {
    if (Math.abs(p) < EPS) { if (q < 0) return null; continue; }
    if (p < 0) enter = Math.max(enter, q / p);
    else exit = Math.min(exit, q / p);
    if (enter > exit) return null;
  }
  return [add(a, d, enter), add(a, d, exit)];
}

/** The source's real position: an aimed source circles its target, pulled in until it stays on the table. */
export function sourcePosition(s: LightSource, elements: OpticElement[]): V2 {
  const target = s.aimAt ? elements.find((e) => e.id === s.aimAt) : undefined;
  if (!target) return clampTable([s.x, s.z]);
  const d = dirOf(s.angleDeg);
  const xLimit = Math.abs(d[0]) < EPS ? Infinity : (TABLE.x + Math.sign(d[0]) * target.x) / Math.abs(d[0]);
  const zLimit = Math.abs(d[1]) < EPS ? Infinity : (TABLE.z + Math.sign(d[1]) * target.z) / Math.abs(d[1]);
  const reach = Math.max(0, Math.min(Number.isFinite(s.reach) ? s.reach : 2.2, xLimit, zLimit));
  return clampTable([target.x - d[0] * reach, target.z - d[1] * reach]);
}

export interface TracedRay {
  points: V2[];
  /** Actual source-power fraction along each consecutive segment. */
  segmentIntensities: number[];
  nm: number;
  color: string;
  intensity: number;
  main: boolean;
  /** Rays drawn for an object's ray diagram rather than from the light source. */
  diagram?: boolean;
  secondary: boolean;
}
export interface TraceHit {
  elementId: string;
  kind: "reflect" | "refract" | "total_internal_reflection" | "lens" | "absorb";
  point: V2;
  /** Unit normal on the side the light came from. */
  normal: V2;
  incidenceDeg: number;
  /** Reflection or refraction angle from the normal; for lenses, the angle to the axis after the lens. */
  outDeg: number | null;
  n1: number;
  n2: number;
  intensity: number;
}
export interface TraceResult {
  rays: TracedRay[];
  /** Everything the main beam met, in order. */
  hits: TraceHit[];
  /** Light landing on screens. */
  spots: { point: V2; color: string; intensity: number; elementId: string; diagram?: boolean }[];
  source: V2;
  /** Main beam's turn from start to finish (degrees). */
  deviation: number | null;
  /** White light only: angle between the red and violet ends of the main beam. */
  spread: number | null;
  truncated: boolean;
}

/** Hits where the beam really turns: a beam meeting glass head-on (like entering a semicircle's curved side) isn't bent, so it doesn't count. */
export function turningHits(hits: TraceHit[]): TraceHit[] {
  const all = hits.filter((h) => h.kind !== "lens" && h.kind !== "absorb");
  const turning = all.filter((h) => !(h.kind === "refract" && h.incidenceDeg < 1));
  return turning.length ? turning : all;
}

interface Pending {
  o: V2;
  d: V2;
  nm: number;
  I: number;
  n: number;
  main: boolean;
  depth: number;
  diagram?: boolean;
  central?: boolean;
}

const MAX_RAYS = 160;
const MAX_SEGMENTS = 40;

function startRays(setup: OpticsSetup, at: V2): Pending[] {
  const s = setup.source;
  if (s.kind === "off") return [];
  const nmList = s.wavelengthNm != null ? [s.wavelengthNm] : s.color === "white" ? WHITE_SPECTRUM : [LIGHT_COLORS[s.color]];
  const ambient = (nm: number) => refractiveIndex(setup.medium, nm);
  const count = s.kind === "laser" ? 1 : Math.max(1, Math.min(9, Math.round(s.rays)));
  const mid = (count - 1) / 2;
  const out: Pending[] = [];
  const d0 = dirOf(s.angleDeg);
  const perp: V2 = [-d0[1], d0[0]];
  for (let i = 0; i < count; i++) {
    const off = count === 1 ? 0 : i - mid;
    let o = at, d = d0;
    if (s.kind === "ray_box") o = add(at, perp, (off / Math.max(1, mid)) * (Math.min(s.spread, 2.4) / 2));
    if (s.kind === "lamp") d = dirOf(s.angleDeg + (count === 1 ? 0 : (off / mid) * (Math.min(s.spread, 120) / 2)));
    // The main ray: the middle one, and for white light its green-yellow part.
    const visible = clipTableSegment(o, add(o, d, 20));
    if (!visible) continue;
    const origin = visible[0];
    for (const nm of nmList) out.push({ o: origin, d, nm, I: 1 / (count * nmList.length), n: mediumAt(origin, setup.elements, ambient(nm), nm), main: i === Math.round(mid) && (nmList.length === 1 || nm === 550), central: i === Math.round(mid), depth: 0 });
  }
  return out;
}

/** Principal rays from the tip of an object arrow toward its lens or mirror. */
export function objectRays(setup: OpticsSetup): { base: V2; tip: V2; image: { base: V2; tip: V2; real: boolean } | null; result: ImageResult; travel: V2; rays: { o: V2; d: V2 }[] } | null {
  const obj = setup.object;
  const e = obj && setup.elements.find((x) => x.id === obj.target);
  const fs = e && signedFocal(e);
  if (!obj || !e || (fs === null && e.kind !== "plane_mirror")) return null;
  const f = frameOf(e);
  const mirror = e.kind.endsWith("mirror");
  // Lenses: the object sits behind (−u) and light travels +u. Mirrors: in front (+u), light travels −u.
  const side = mirror ? 1 : -1;
  const travel: V2 = mirror ? [-f.u[0], -f.u[1]] : f.u;
  const base = toWorld(f, side * obj.distance, 0);
  const tip = add(base, f.v, obj.height);
  const result = elementImage(e, obj.distance);
  const v = result.imageDistance;
  const image = v === null || result.magnification === null ? null : (() => {
    // In front of a mirror / past a lens when real (v > 0), the other way when virtual.
    const ib = toWorld(f, v, 0);
    return { base: ib, tip: add(ib, f.v, obj.height * result.magnification), real: result.real };
  })();
  const toward = (X: V2): V2 | null => {
    const g: V2 = [X[0] - tip[0], X[1] - tip[1]];
    if (Math.hypot(g[0], g[1]) < 1e-3) return null;
    const n = norm(g);
    return dot(n, travel) > 0 ? n : [-n[0], -n[1]];
  };
  const C = toWorld(f, mirror ? 2 * (fs ?? 0) : 0, 0);
  const F = toWorld(f, mirror ? (fs ?? 0) : -(fs ?? 0), 0);
  const dirs = (e.kind === "plane_mirror" ? [-0.3, 0, 0.3].map((t) => toward(toWorld(f, 0, t * e.size))) : [travel, toward(C), toward(F)]).filter((x): x is V2 => x !== null && dot(x, travel) > 0.05);
  return { base, tip, image, result, travel, rays: dirs.map((d) => ({ o: tip, d })) };
}

/** Traces every ray of the setup across the table. */
export function traceOptics(setup: OpticsSetup): TraceResult {
  const els = setup.elements;
  const at = sourcePosition(setup.source, els);
  const queue = startRays(setup, at);
  const diagram = objectRays(setup);
  if (diagram) for (const r of diagram.rays) {
    const visible = clipTableSegment(r.o, add(r.o, r.d, 50));
    if (visible) queue.push({ ...r, o: visible[0], nm: 0, I: 1, n: mediumAt(visible[0], els, refractiveIndex(setup.medium), 589), main: false, depth: 0, diagram: true });
  }
  const rays: TracedRay[] = [];
  const hits: TraceHit[] = [];
  const spots: TraceResult["spots"] = [];
  const ends = new Map<number, V2>();
  let truncated = false;
  let mainStart: V2 | null = null, mainEnd: V2 | null = null;
  while (queue.length && rays.length < MAX_RAYS) {
    const r = queue.shift()!;
    const points: V2[] = [r.o];
    const segmentIntensities: number[] = [];
    let { o, d, n, I } = r;
    if (r.main) mainStart = d;
    const ambient = r.diagram ? refractiveIndex(setup.medium) : refractiveIndex(setup.medium, r.nm);
    const record = (h: Omit<TraceHit, "intensity">) => r.main && hits.push({ ...h, intensity: I });
    for (let seg = 0; seg < MAX_SEGMENTS; seg++) {
      segmentIntensities.push(I);
      let hit: Surface | null = null;
      for (const e of els) {
        const s = hitElement(o, d, e);
        if (s && (!hit || s.t < hit.t)) hit = s;
      }
      if (!hit || !insideTable(hit.p)) {
        points.push(tableExit(o, d));
        break;
      }
      points.push(hit.p);
      const cosI = Math.min(1, -dot(d, hit.n));
      const incidence = deg(Math.acos(cosI));
      if (hit.type === "absorb") {
        if (hit.el.kind === "screen") spots.push({ point: hit.p, color: r.diagram ? "#ffb020" : wavelengthColor(r.nm || 550), intensity: I, elementId: hit.el.id, diagram: r.diagram });
        record({ elementId: hit.el.id, kind: "absorb", point: hit.p, normal: hit.n, incidenceDeg: incidence, outDeg: null, n1: n, n2: n });
        break;
      }
      if (hit.type === "mirror") {
        d = norm(add(d, hit.n, 2 * cosI));
        record({ elementId: hit.el.id, kind: "reflect", point: hit.p, normal: hit.n, incidenceDeg: incidence, outDeg: incidence, n1: n, n2: n });
      } else if (hit.type === "lens") {
        const f = frameOf(hit.el);
        const du = dot(d, f.u), dv = dot(d, f.v);
        if (Math.abs(du) > 1e-6) {
          const sign = du > 0 ? 1 : -1;
          const slope = dv / Math.abs(du) - (hit.h ?? 0) / signedFocal(hit.el)!;
          d = norm([f.u[0] * sign + f.v[0] * slope, f.u[1] * sign + f.v[1] * slope]);
        }
        record({ elementId: hit.el.id, kind: "lens", point: hit.p, normal: hit.n, incidenceDeg: incidence, outDeg: angleBetween(d, [hit.n[0] * -1, hit.n[1] * -1]), n1: n, n2: n });
      } else {
        const n1 = n;
        const n2 = mediumAt(add(hit.p, d, EPS * 16), els, ambient, r.nm || 589);
        const eta = n1 / n2;
        const sin2T = eta * eta * (1 - cosI * cosI);
        if (sin2T > 1) {
          d = norm(add(d, hit.n, 2 * cosI));
          record({ elementId: hit.el.id, kind: "total_internal_reflection", point: hit.p, normal: hit.n, incidenceDeg: incidence, outDeg: incidence, n1, n2 });
        } else {
          const cosT = Math.sqrt(1 - sin2T);
          const R = fresnelReflectance(n1, n2, cosI);
          if (I * R > r.I * 0.005 && r.depth < 3) queue.push({ o: hit.p, d: norm(add(d, hit.n, 2 * cosI)), nm: r.nm, I: I * R, n: n1, main: false, depth: r.depth + 1, diagram: r.diagram });
          d = norm([eta * d[0] + (eta * cosI - cosT) * hit.n[0], eta * d[1] + (eta * cosI - cosT) * hit.n[1]]);
          n = n2;
          I *= 1 - R;
          record({ elementId: hit.el.id, kind: "refract", point: hit.p, normal: hit.n, incidenceDeg: incidence, outDeg: deg(Math.acos(cosT)), n1, n2 });
        }
      }
      o = hit.p;
      if (I < r.I * 0.005) break;
      if (seg === MAX_SEGMENTS - 1) truncated = true;
    }
    if (r.main && (d[0] || d[1])) mainEnd = d;
    if (setup.source.color === "white" && setup.source.wavelengthNm == null && r.central && !r.diagram && (d[0] || d[1]) && r.depth === 0) ends.set(r.nm, d);
    rays.push({ points, segmentIntensities: segmentIntensities.slice(0, points.length - 1), nm: r.nm, color: r.diagram ? "#dd8b13" : wavelengthColor(r.nm || 550), intensity: r.I, main: r.main, diagram: r.diagram, secondary: r.depth > 0 });
  }
  const red = ends.get(700), violet = ends.get(405);
  return {
    rays,
    hits,
    spots,
    source: at,
    deviation: mainStart && mainEnd ? angleBetween(mainStart, mainEnd) : null,
    spread: red && violet ? angleBetween(red, violet) : null,
    truncated: truncated || queue.length > 0,
  };
}

// ---------- ready-made experiments ----------

export const OPTIC_PRESETS = ["reflection", "plane_image", "periscope", "refraction", "total_internal_reflection", "optical_fibre", "prism", "convex_lens", "concave_lens", "lens_image", "magnifier", "concave_mirror", "convex_mirror", "mirror_image", "shadows", "colour_mixing", "free"] as const;
export type OpticPreset = (typeof OPTIC_PRESETS)[number];

const el = (id: string, kind: OpticKind, x: number, z: number, rotationDeg = 0, size = 1.2, extra: Partial<OpticElement> = {}): OpticElement => ({ id, kind, x, z, rotationDeg, size, focalLength: 0.8, material: "glass", ...extra });
const laser = (extra: Partial<LightSource> = {}): LightSource => ({ kind: "laser", x: -2.2, z: 0, angleDeg: 0, color: "red", rays: 1, spread: 0.8, aimAt: null, reach: 2.2, ...extra });

/** Element ids each preset creates (the AI may refer to them). */
export function presetIds(p: OpticPreset): string[] {
  return opticsPreset(p).elements.map((e) => e.id);
}

/**
 * A ready-made experiment. `angleDeg` turns the beam (the source keeps aiming
 * at the main element), `material` fills the blocks and prisms, `color` picks the light.
 */
export function opticsPreset(p: OpticPreset, opts: { color?: LightColor; angleDeg?: number; material?: OpticMaterialId } = {}): OpticsSetup {
  const base: OpticsSetup = { source: laser(), elements: [], object: null, medium: "air", normals: true, mixing: null };
  let s: OpticsSetup;
  switch (p) {
    case "plane_image":
      s = { ...base, elements: [el("mirror", "plane_mirror", 0.8, 0, 180, 1.5)], source: { ...laser(), kind: "off" }, object: { target: "mirror", distance: 1.2, height: 0.3 } };
      break;
    case "reflection":
      s = { ...base, elements: [el("mirror", "plane_mirror", 0.9, 0)], source: laser({ aimAt: "mirror", angleDeg: 30 }) };
      break;
    case "periscope":
      s = { ...base, elements: [el("mirror_top", "plane_mirror", -0.6, 0.9, 45, 0.9), el("mirror_bottom", "plane_mirror", -0.6, -0.9, 45, 0.9), el("screen", "screen", 2.4, -0.9, 0, 1)], source: laser({ x: -2.5, z: 0.9, angleDeg: 0 }) };
      break;
    case "refraction":
      s = { ...base, elements: [el("block", "glass_block", 0, 0, 0, 1.3)], source: laser({ aimAt: "block", angleDeg: 40, reach: 2.4 }) };
      break;
    case "total_internal_reflection":
      s = { ...base, elements: [el("block", "semicircle", 0.6, 0, 0, 1.6)], source: laser({ aimAt: "block", angleDeg: 50, reach: 2.3 }) };
      break;
    case "optical_fibre":
      s = { ...base, elements: [el("fibre", "glass_block", 0.1, 0, 90, 4.6, { width: 0.26 })], source: laser({ x: -2.75, z: 0.13, angleDeg: -16 }) };
      break;
    case "prism":
      s = { ...base, elements: [el("prism", "prism", -0.3, 0.05, 0, 1.2), el("screen", "screen", 2.45, 0.7, 0, 1.4)], source: laser({ aimAt: "prism", angleDeg: -19, color: "white", reach: 2.1 }) };
      break;
    case "convex_lens":
      s = { ...base, elements: [el("lens", "convex_lens", 0.2, 0, 0, 1.3, { focalLength: 0.9 })], source: { ...laser({ x: -2.5 }), kind: "ray_box", rays: 5, spread: 0.9 } };
      break;
    case "concave_lens":
      s = { ...base, elements: [el("lens", "concave_lens", 0.2, 0, 0, 1.3, { focalLength: 0.9 })], source: { ...laser({ x: -2.5 }), kind: "ray_box", rays: 5, spread: 0.9 } };
      break;
    case "lens_image":
      s = { ...base, elements: [el("lens", "convex_lens", 0.3, 0, 0, 1.4, { focalLength: 0.7 })], source: { ...laser(), kind: "off" }, object: { target: "lens", distance: 1.7, height: 0.35 } };
      break;
    case "magnifier":
      s = { ...base, elements: [el("lens", "convex_lens", 0.6, 0, 0, 1.4, { focalLength: 0.9 })], source: { ...laser(), kind: "off" }, object: { target: "lens", distance: 0.5, height: 0.25 } };
      break;
    case "concave_mirror":
      s = { ...base, elements: [el("mirror", "concave_mirror", 1.9, 0, 180, 1.3, { focalLength: 1 })], source: { ...laser({ x: -2.5 }), kind: "ray_box", rays: 5, spread: 0.9 } };
      break;
    case "convex_mirror":
      s = { ...base, elements: [el("mirror", "convex_mirror", 1.9, 0, 180, 1.3, { focalLength: 1 })], source: { ...laser({ x: -2.5 }), kind: "ray_box", rays: 5, spread: 0.9 } };
      break;
    case "mirror_image":
      s = { ...base, elements: [el("mirror", "concave_mirror", 1.9, 0, 180, 1.4, { focalLength: 0.8 })], source: { ...laser(), kind: "off" }, object: { target: "mirror", distance: 2.0, height: 0.3 } };
      break;
    case "shadows":
      s = { ...base, normals: false, elements: [el("card", "blocker", -0.7, 0, 0, 0.45), el("screen", "screen", 2.45, 0, 0, 2.8)], source: { ...laser({ x: -2.3 }), kind: "lamp", color: "yellow", rays: 9, spread: 56 } };
      break;
    case "colour_mixing":
      s = { ...base, normals: false, source: { ...laser(), kind: "off" }, mixing: { red: true, green: true, blue: true } };
      break;
    case "free":
      s = { ...base, source: laser({ x: -2.3, angleDeg: 0 }) };
      break;
  }
  if (opts.material) s.elements = s.elements.map((e) => (["glass_block", "prism", "semicircle"].includes(e.kind) ? { ...e, material: opts.material! } : e));
  if (opts.color && s.source.kind !== "off") s.source = { ...s.source, color: opts.color };
  if (opts.angleDeg !== undefined) s.source = { ...s.source, angleDeg: opts.angleDeg };
  return s;
}
