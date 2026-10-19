// Magnetic fields from real sources, in SI units, on a tabletop plane.
//
// Permanent magnets and coils are modelled by their "magnetic surface charge"
// (the method behind Magpylib and Furlani's Permanent Magnet and
// Electromechanical Devices): a uniformly magnetised block is equivalent to
// pole faces carrying charge ±M, and a rectangular charged face has an exact
// closed-form field. A solenoid's outside field equals that of a magnetised
// rod with M = nI; an iron core multiplies it by its apparent permeability.
// A straight wire uses B = μ0 I / 2πr. Distances are real metres: a school bar
// magnet is 7.5 cm long; the renderer draws the table 8× larger.

export const MU0 = 4e-7 * Math.PI;

/** Remanence Br (T) of common magnet materials (manufacturer typical values). */
export const MAGNET_MATERIALS = {
  ferrite: { name: "Ferrite (ceramic)", br: 0.39 },
  alnico: { name: "Alnico", br: 1.25 },
  neodymium: { name: "Neodymium (N42)", br: 1.32 },
} as const;
export type MagnetMaterial = keyof typeof MAGNET_MATERIALS;
export const MAGNET_MATERIAL_IDS = Object.keys(MAGNET_MATERIALS) as [MagnetMaterial, ...MagnetMaterial[]];

/** Earth's horizontal field, about 20 µT pointing north (−z on the table). */
export const EARTH_FIELD = 20e-6;

export const TEST_MATERIALS = {
  steel_clip: { name: "Steel paper clip", magnetic: true },
  iron_nail: { name: "Iron nail", magnetic: true },
  nickel: { name: "Nickel coin", magnetic: true },
  copper: { name: "Copper coin", magnetic: false },
  aluminium: { name: "Aluminium foil", magnetic: false },
  plastic: { name: "Plastic button", magnetic: false },
  wood: { name: "Wooden stick", magnetic: false },
} as const;
export type TestMaterial = keyof typeof TEST_MATERIALS;
export const TEST_MATERIAL_IDS = Object.keys(TEST_MATERIALS) as [TestMaterial, ...TestMaterial[]];

export const MAGNET_ITEM_KINDS = ["bar", "horseshoe", "coil", "wire", "compass", "object"] as const;
export type MagnetItemKind = (typeof MAGNET_ITEM_KINDS)[number];

export interface MagnetItem {
  id: string;
  kind: MagnetItemKind;
  /** Position on the table (m, real scale). */
  x: number;
  z: number;
  /** Direction its north pole (or a coil's axis) points, degrees from +x. */
  angleDeg: number;
  material?: MagnetMaterial;
  /** Coil: current (A, negative reverses), turns, iron core. Wire: current up out of the table (A). */
  current?: number;
  turns?: number;
  core?: boolean;
  /** Test object material. */
  test?: TestMaterial;
}

export interface MagnetLab {
  items: MagnetItem[];
  lines: boolean;
  filings: boolean;
  compasses: boolean;
  earth: boolean;
}

/** Real sizes (m): bar 75×15×8 mm, horseshoe arms 60 mm with 25 mm gap, coil 60 mm long, 12 mm radius. */
export const SIZES = { bar: [0.075, 0.015, 0.008], horseshoe: { arm: 0.06, width: 0.012, gap: 0.025, height: 0.008 }, coil: { length: 0.06, radius: 0.012 } } as const;
/** Table area (half extents, m) the lab occupies. */
export const TABLE_HALF: [number, number] = [0.25, 0.17];

type V3 = [number, number, number];

/**
 * H field (A/m) of a uniformly charged rectangle, exact. The face lies in the
 * u–v plane of a local frame, centred at the origin, spanning ±a by ±b, normal n.
 * (pu, pv, pn) is the field point in that frame. Returns [Hu, Hv, Hn].
 */
export function rectFaceH(sigma: number, a: number, b: number, pu: number, pv: number, pn: number): V3 {
  let hu = 0, hv = 0, hn = 0;
  const z = Math.abs(pn) < 1e-12 ? 1e-12 : pn;
  for (let i = 0; i < 2; i++) {
    const X = pu - (i ? a : -a);
    for (let j = 0; j < 2; j++) {
      const Y = pv - (j ? b : -b);
      const R = Math.sqrt(X * X + Y * Y + z * z);
      // ∫∫ over the face = G(X1,Y1) − G(X1,Y2) − G(X2,Y1) + G(X2,Y2), with X_k = p − corner.
      const s = i === j ? 1 : -1;
      hn += s * Math.atan((X * Y) / (z * R));
      hu += s * -Math.log(Math.max(R + Y, 1e-15));
      hv += s * -Math.log(Math.max(R + X, 1e-15));
    }
  }
  const k = sigma / (4 * Math.PI);
  return [k * hu, k * hv, k * hn];
}

interface Face {
  /** Centre (x, y, z), normal and in-plane axes as unit vectors. */
  c: V3;
  n: V3;
  u: V3;
  v: V3;
  a: number;
  b: number;
  sigma: number;
}

const dot = (p: V3, q: V3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const UP: V3 = [0, 1, 0];

/** Apparent permeability of an iron rod (μr ≈ 5000) of length/diameter p: μr / (1 + N(μr − 1)), N ≈ (ln 2p − 1)/p². */
export function coreFactor(lengthOverDiameter: number): number {
  const p = Math.max(lengthOverDiameter, 1.1), N = (Math.log(2 * p) - 1) / (p * p), mu = 5000;
  return mu / (1 + N * (mu - 1));
}

/** Magnetisation (A/m) of a coil's equivalent rod: M = μ_app · n · I. */
export function coilMagnetisation(it: MagnetItem): number {
  const n = (it.turns ?? 200) / SIZES.coil.length;
  return n * (it.current ?? 2) * (it.core ? coreFactor(SIZES.coil.length / (2 * SIZES.coil.radius)) : 1);
}

/** The pole faces (magnetic surface charge) of every source on the table. */
export function facesOf(items: MagnetItem[]): Face[] {
  const faces: Face[] = [];
  for (const it of items) {
    const t = (it.angleDeg * Math.PI) / 180;
    const ax: V3 = [Math.cos(t), 0, -Math.sin(t)]; // N direction on the table (angle counter-clockwise seen from above)
    const side: V3 = [Math.sin(t), 0, Math.cos(t)];
    const at = (d: number, s = 0): V3 => [it.x + ax[0] * d + side[0] * s, 0, it.z + ax[2] * d + side[2] * s];
    if (it.kind === "bar") {
      const [L, W, H] = SIZES.bar, M = MAGNET_MATERIALS[it.material ?? "alnico"].br / MU0;
      faces.push({ c: at(L / 2), n: ax, u: side, v: UP, a: W / 2, b: H / 2, sigma: M });
      faces.push({ c: at(-L / 2), n: ax, u: side, v: UP, a: W / 2, b: H / 2, sigma: -M });
    } else if (it.kind === "horseshoe") {
      // Ideal U magnet: magnetisation follows the U, so only the two tips carry charge; both face along ax.
      const h = SIZES.horseshoe, M = MAGNET_MATERIALS[it.material ?? "alnico"].br / MU0, off = h.gap / 2 + h.width / 2;
      faces.push({ c: at(h.arm / 2, -off), n: ax, u: side, v: UP, a: h.width / 2, b: h.height / 2, sigma: M });
      faces.push({ c: at(h.arm / 2, off), n: ax, u: side, v: UP, a: h.width / 2, b: h.height / 2, sigma: -M });
    } else if (it.kind === "coil") {
      // Equivalent rod with the same end area as the coil (a square of side r√π).
      const { length, radius } = SIZES.coil, s = (radius * Math.sqrt(Math.PI)) / 2, M = coilMagnetisation(it);
      faces.push({ c: at(length / 2), n: ax, u: side, v: UP, a: s, b: s, sigma: M });
      faces.push({ c: at(-length / 2), n: ax, u: side, v: UP, a: s, b: s, sigma: -M });
    }
  }
  return faces;
}

/** Is a point inside a magnet's body (where B also includes μ0·M along its axis)? */
function insideMagnetisation(items: MagnetItem[], x: number, z: number): V3 {
  const B: V3 = [0, 0, 0];
  for (const it of items) {
    if (it.kind !== "bar" && it.kind !== "coil") continue;
    const t = (it.angleDeg * Math.PI) / 180, ax: V3 = [Math.cos(t), 0, -Math.sin(t)];
    const dx = x - it.x, dz = z - it.z;
    const along = dx * ax[0] + dz * ax[2], across = dx * Math.sin(t) + dz * Math.cos(t);
    const [L, W] = it.kind === "bar" ? SIZES.bar : [SIZES.coil.length, SIZES.coil.radius * 2];
    if (Math.abs(along) < L / 2 && Math.abs(across) < W / 2) {
      const M = it.kind === "bar" ? MAGNET_MATERIALS[it.material ?? "alnico"].br / MU0 : coilMagnetisation(it);
      B[0] += MU0 * M * ax[0];
      B[2] += MU0 * M * ax[2];
    }
  }
  return B;
}

/** B (tesla) at a point on the table plane (height y, default mid-height of the magnets). */
export function fieldAt(lab: Pick<MagnetLab, "items" | "earth">, x: number, z: number, faces = facesOf(lab.items), y = 0): V3 {
  const B: V3 = [0, 0, 0];
  for (const f of faces) {
    const d: V3 = [x - f.c[0], y - f.c[1], z - f.c[2]];
    const [hu, hv, hn] = rectFaceH(f.sigma, f.a, f.b, dot(d, f.u), dot(d, f.v), dot(d, f.n));
    for (let k = 0; k < 3; k++) B[k] += MU0 * (hu * f.u[k] + hv * f.v[k] + hn * f.n[k]);
  }
  for (const it of lab.items) {
    if (it.kind !== "wire") continue;
    // Current up out of the table: B circles anticlockwise seen from above (right-hand grip rule).
    const dx = x - it.x, dz = z - it.z, r2 = Math.max(dx * dx + dz * dz, 1e-8);
    const k = (MU0 * (it.current ?? 5)) / (2 * Math.PI * r2);
    B[0] += k * dz;
    B[2] += -k * dx;
  }
  const inside = insideMagnetisation(lab.items, x, z);
  B[0] += inside[0];
  B[2] += inside[2];
  if (lab.earth) B[2] -= EARTH_FIELD;
  return B;
}

/** Trace field lines from just outside every north face (2D, on the table plane). */
export function traceFieldLines(lab: Pick<MagnetLab, "items" | "earth">, perFace = 7, maxSteps = 700): [number, number][][] {
  const faces = facesOf(lab.items);
  const lines: [number, number][][] = [];
  const step = 0.0016;
  const inTable = (x: number, z: number) => Math.abs(x) < TABLE_HALF[0] && Math.abs(z) < TABLE_HALF[1];
  const seeds: [number, number][] = [];
  for (const f of faces) {
    if (f.sigma <= 0) continue;
    for (let k = 0; k < perFace; k++) {
      const s = (k / (perFace - 1) - 0.5) * 2 * f.a * 0.95;
      seeds.push([f.c[0] + f.n[0] * 0.0008 + f.u[0] * s, f.c[2] + f.n[2] * 0.0008 + f.u[2] * s]);
    }
  }
  // Wires: concentric circles, traced like any other line (they close on themselves).
  for (const it of lab.items) if (it.kind === "wire") for (const r of [0.012, 0.025, 0.045, 0.075]) seeds.push([it.x + r, it.z]);
  const sNear = (x: number, z: number) => faces.some((f) => f.sigma < 0 && Math.hypot(x - f.c[0], z - f.c[2]) < Math.max(f.a, 0.003) * 1.05);
  for (const [sx, sz] of seeds) {
    const pts: [number, number][] = [[sx, sz]];
    let x = sx, z = sz;
    for (let i = 0; i < maxSteps; i++) {
      // Midpoint (RK2) step along the field direction.
      const b1 = fieldAt(lab, x, z, faces), m1 = Math.hypot(b1[0], b1[2]) || 1;
      const mx = x + (b1[0] / m1) * step * 0.5, mz = z + (b1[2] / m1) * step * 0.5;
      const b2 = fieldAt(lab, mx, mz, faces), m2 = Math.hypot(b2[0], b2[2]) || 1;
      x += (b2[0] / m2) * step;
      z += (b2[2] / m2) * step;
      pts.push([x, z]);
      if (!inTable(x, z) || sNear(x, z)) break;
      if (i > 30 && Math.hypot(x - sx, z - sz) < step * 1.5) break; // closed loop (a wire's circle)
    }
    lines.push(pts);
  }
  return lines;
}

/** Force (N) on one magnet from all the others: each of its pole faces sits in their field (F = μ0 σ ∫ H dA). */
export function forceOn(lab: Pick<MagnetLab, "items">, id: string): [number, number] {
  const self = lab.items.find((i) => i.id === id);
  if (!self) return [0, 0];
  const others = facesOf(lab.items.filter((i) => i.id !== id));
  const mine = facesOf([self]);
  let fx = 0, fz = 0;
  for (const f of mine) {
    // 3×3 sample points over the face.
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const p: V3 = [f.c[0] + f.u[0] * f.a * i * 0.66 + f.v[0] * f.b * j * 0.66, f.c[1] + f.v[1] * f.b * j * 0.66, f.c[2] + f.u[2] * f.a * i * 0.66];
      const B = fieldAt({ items: [], earth: false }, p[0], p[2], others, p[1]);
      const dA = (4 * f.a * f.b) / 9;
      fx += f.sigma * B[0] * dA;
      fz += f.sigma * B[2] * dA;
    }
  }
  return [fx, fz];
}

/** Direction a compass needle points (degrees from +x, anticlockwise from above) and the field strength (T). */
export function compassReading(lab: Pick<MagnetLab, "items" | "earth">, x: number, z: number): { angleDeg: number; tesla: number } {
  const B = fieldAt(lab, x, z);
  return { angleDeg: (Math.atan2(-B[2], B[0]) * 180) / Math.PI, tesla: Math.hypot(B[0], B[2]) };
}

export function formatTesla(t: number): string {
  if (t >= 0.1) return `${t.toFixed(2)} T`;
  if (t >= 1e-3) return `${(t * 1e3).toFixed(t >= 0.01 ? 0 : 1)} mT`;
  return `${(t * 1e6).toFixed(t >= 1e-5 ? 0 : 1)} µT`;
}

// ---------- examples ----------

let seq = 0;
const id = (k: string) => `${k}_${++seq}`;
const bar = (x: number, z: number, angleDeg = 0, material: MagnetMaterial = "alnico"): MagnetItem => ({ id: id("magnet"), kind: "bar", x, z, angleDeg, material });
const compass = (x: number, z: number): MagnetItem => ({ id: id("compass"), kind: "compass", x, z, angleDeg: 0 });

export const MAGNET_PRESETS = {
  bar_magnet: { title: "Bar magnet", build: (): Partial<MagnetLab> => ({ items: [bar(0, 0)], lines: true, filings: true }) },
  attract: { title: "Opposite poles attract (N–S)", build: (): Partial<MagnetLab> => ({ items: [bar(-0.055, 0), bar(0.055, 0)], lines: true, filings: false }) },
  repel: { title: "Like poles repel (N–N)", build: (): Partial<MagnetLab> => ({ items: [bar(-0.055, 0), bar(0.055, 0, 180)], lines: true, filings: false }) },
  horseshoe: { title: "Horseshoe magnet", build: (): Partial<MagnetLab> => ({ items: [{ id: id("horseshoe"), kind: "horseshoe", x: -0.02, z: 0, angleDeg: 0, material: "alnico" }], lines: true, filings: true }) },
  compasses: { title: "Compasses around a magnet", build: (): Partial<MagnetLab> => ({ items: [bar(0, 0), ...Array.from({ length: 8 }, (_, k) => compass(Math.cos((k * Math.PI) / 4) * 0.09, Math.sin((k * Math.PI) / 4) * 0.07))], lines: false, filings: false }) },
  earth: { title: "Compass and Earth's field", build: (): Partial<MagnetLab> => ({ items: [compass(0, 0), bar(0.17, 0.1, 90, "ferrite")], earth: true, lines: false, filings: false }) },
  electromagnet: { title: "Electromagnet (coil)", build: (): Partial<MagnetLab> => ({ items: [{ id: id("coil"), kind: "coil", x: 0, z: 0, angleDeg: 0, current: 2, turns: 200, core: false }, compass(0.08, 0), compass(-0.08, 0)], lines: true, filings: false }) },
  iron_core: { title: "Electromagnet with an iron core", build: (): Partial<MagnetLab> => ({ items: [{ id: id("coil"), kind: "coil", x: 0, z: 0, angleDeg: 0, current: 2, turns: 200, core: true }, { id: id("object"), kind: "object", x: 0.06, z: 0.04, angleDeg: 0, test: "steel_clip" }], lines: true, filings: false }) },
  wire: { title: "Wire carrying a current", build: (): Partial<MagnetLab> => ({ items: [{ id: id("wire"), kind: "wire", x: 0, z: 0, angleDeg: 0, current: 5 }, compass(0.03, 0), compass(0, 0.03), compass(-0.03, 0), compass(0, -0.03)], lines: true, filings: true }) },
  materials: {
    title: "Magnetic or not?",
    build: (): Partial<MagnetLab> => ({
      // An arc 5.5 cm from the magnet's end, where the field is a few millitesla: enough to pull iron and steel.
      items: [bar(0, -0.08, 90), ...(["steel_clip", "copper", "iron_nail", "plastic", "nickel", "aluminium", "wood"] as TestMaterial[]).map((test, k): MagnetItem => { const a = ((20 + k * 23) * Math.PI) / 180; return { id: id("object"), kind: "object", x: Math.cos(a) * 0.055, z: -0.0425 + Math.sin(a) * 0.055, angleDeg: 0, test }; })],
      lines: false,
      filings: false,
    }),
  },
} as const satisfies Record<string, { title: string; build: () => Partial<MagnetLab> }>;
export type MagnetPreset = keyof typeof MAGNET_PRESETS;
export const MAGNET_PRESET_IDS = Object.keys(MAGNET_PRESETS) as [MagnetPreset, ...MagnetPreset[]];

export function magnetPreset(p: MagnetPreset): MagnetLab {
  return { items: [], lines: true, filings: false, compasses: false, earth: false, ...MAGNET_PRESETS[p].build() };
}

/**
 * One step of a magnetic object being pulled across the table: it slides up
 * the gradient of B² (the force on soft iron grows with B·∇B) while the field
 * is strong enough to beat friction (≈1.5 mT here), and stops on touching a magnet.
 * The speed is a teaching pace, not a computed one.
 */
export function pullStep(lab: Pick<MagnetLab, "items" | "earth">, x: number, z: number, dt: number): { x: number; z: number; stuck: boolean; moving: boolean } {
  const faces = facesOf(lab.items);
  const b2 = (px: number, pz: number) => { const B = fieldAt(lab, px, pz, faces); return B[0] * B[0] + B[2] * B[2]; };
  const here = Math.sqrt(b2(x, z));
  if (here <= 1.5e-3) return { x, z, stuck: false, moving: false };
  const h = 0.002;
  const gx = (b2(x + h, z) - b2(x - h, z)) / (2 * h), gz = (b2(x, z + h) - b2(x, z - h)) / (2 * h), g = Math.hypot(gx, gz) || 1;
  const speed = Math.min(0.06, here * 3);
  const nx = x + (gx / g) * speed * dt, nz = z + (gz / g) * speed * dt;
  const touching = lab.items.some((o) => (o.kind === "bar" || o.kind === "horseshoe" || o.kind === "coil") && Math.hypot(nx - o.x, nz - o.z) < (o.kind === "coil" ? SIZES.coil.length : SIZES.bar[0]) / 2 + 0.006);
  return { x: nx, z: nz, stuck: touching, moving: true };
}
