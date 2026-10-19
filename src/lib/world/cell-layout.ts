// Cell model layouts in micrometres, from the measured sizes in CELL_SCALE.
// Seeded, so a cell always looks the same; pure geometry, so it can be tested.

import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { rng } from "../engine/md";
import { CELL_SCALE, type CellKind, type OrganelleId } from "../engine/biology";

type V = [number, number, number];

export interface Layout {
  span: number;
  shift: V;
  nucleus?: { at: V; r: number };
  er: { at: V; radii: number[] } | null;
  golgi: { at: V; r: number }[];
  mito: Matrix4[];
  chloro: Matrix4[];
  lyso: Matrix4[];
  vac: Matrix4[];
  ribo: Float32Array;
  nucleoid: Vector3[] | null;
  flagella: Vector3[][];
  labels: Partial<Record<OrganelleId, V>>;
  barY: number;
  /** Generic real-size primitives (the specialised cells are built from these). */
  shapes?: Shape[];
}

/** shell = a see-through surface with that opacity; otherwise solid. rot is Euler XYZ (radians). */
export type Shape =
  | { id: OrganelleId; kind: "ellipsoid"; at: V; r: V; rot?: V; shell?: number }
  | { id: OrganelleId; kind: "capsule"; at: V; r: number; len: number; rot?: V; shell?: number }
  | { id: OrganelleId; kind: "cylinder"; at: V; r: number; len: number; rot?: V; shell?: number }
  | { id: OrganelleId; kind: "box"; at: V; size: V; rot?: V; shell?: number }
  | { id: OrganelleId; kind: "tube"; pts: V[]; r: number; shell?: number }
  | { id: OrganelleId; kind: "lathe"; at: V; profile: [number, number][]; rot?: V; shell?: number; scale?: number }
  | { id: OrganelleId; kind: "torus"; at: V; R: number; r: number; arc: number; rot?: V; scale?: V; shell?: number }
  | { id: OrganelleId; kind: "inst"; geo: "sphere" | "capsule" | "cylinder"; args: number[]; matrices: Matrix4[]; color?: string }
  | { id: OrganelleId; kind: "points"; pts: Float32Array; size: number };

const v3 = (p: V) => new Vector3(...p);
const dist = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function cellLayout(kind: CellKind): Layout {
  if (kind !== "animal" && kind !== "plant" && kind !== "bacteria") return specialLayout(kind);
  const R = rng(kind === "animal" ? 11 : kind === "plant" ? 23 : 37);
  const rand = (a: number, b: number) => a + R() * (b - a);
  const randomQuat = () => new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize());
  const place = (n: number, ok: (p: V) => boolean, sample: () => V, minGap = 0) => {
    const out: V[] = [];
    for (let tries = 0; out.length < n && tries < n * 60; tries++) {
      const p = sample();
      if (ok(p) && out.every((q) => dist(p, q) >= minGap)) out.push(p);
    }
    return out;
  };
  const one = new Vector3(1, 1, 1);

  if (kind === "animal") {
    const S = CELL_SCALE.animal;
    const [a, b, c] = S.size.map((x) => x / 2);
    const inCell = (p: V, inset = 0) => (p[0] / (a - inset)) ** 2 + (p[1] / (b - inset)) ** 2 + (p[2] / (c - inset)) ** 2 < 1;
    const any = (): V => [rand(-a, a), rand(-b, b), rand(-c, c)];
    const nucleus = { at: [2, 0.5, 0] as V, r: S.nucleus / 2 };
    const golgi: V = [-5, 3.2, 0.5];
    const free = (p: V, gap = 1) => inCell(p, 1) && dist(p, nucleus.at) > nucleus.r + 2.8 && dist(p, golgi) > 2.6 + gap;
    const mito = place(S.mitochondria.shown, (p) => free(p), any, 0.9).map((p) => new Matrix4().compose(v3(p), randomQuat(), one));
    const lyso = place(S.lysosomes.shown, (p) => free(p), any, 0.8).map((p) => new Matrix4().compose(v3(p), new Quaternion(), one));
    const vac = place(4, (p) => free(p, 2), any, 3).map((p) => new Matrix4().compose(v3(p), new Quaternion(), one));
    // Ribosomes: most stud the rough ER around the nucleus, the rest float freely.
    const ribo = new Float32Array(S.ribosomes.shown * 3);
    for (let i = 0; i < S.ribosomes.shown; i++) {
      let p: V;
      if (i % 5 < 3) {
        const r = [4.8, 5.6, 6.4][i % 3] + rand(-0.08, 0.08), th = rand(0.5, 2.6), ph = rand(-1.9, 1.9);
        p = [nucleus.at[0] + r * Math.sin(th) * Math.cos(ph), nucleus.at[1] + r * Math.cos(th), nucleus.at[2] + r * Math.sin(th) * Math.sin(ph)];
      } else do p = any(); while (!free(p, -2));
      ribo.set(p, i * 3);
    }
    return {
      span: S.size[0], shift: [0, 0, 0], nucleus, er: { at: nucleus.at, radii: [4.8, 5.6, 6.4] }, golgi: [{ at: golgi, r: 1.6 }], mito, chloro: [], lyso, vac, ribo, nucleoid: null, flagella: [],
      labels: { membrane: [-a * 0.75, b * 0.8, 0], nucleus: [nucleus.at[0], nucleus.at[1] + nucleus.r + 0.6, 2], er: [nucleus.at[0] + 6.6, nucleus.at[1] + 2, 1], golgi: [golgi[0], golgi[1] + 2.2, 0], mitochondria: [-6.5, -4, 4], lysosomes: [4, -6, 3], vacuole: vac[0] ? [vac[0].elements[12], vac[0].elements[13] + 1.3, vac[0].elements[14]] : [-3, -4, 0], ribosomes: [5, 3.5, 5] },
      barY: -b - 1.5,
    };
  }

  if (kind === "plant") {
    const S = CELL_SCALE.plant;
    const h = S.size.map((x) => x / 2) as V;
    // Faces weighted by area; chloroplasts and the thin cytoplasm hug the walls around the vacuole.
    const faces = [0, 1, 2].flatMap((axis) => [-1, 1].map((sign) => ({ axis, sign, area: (2 * h[(axis + 1) % 3]) * (2 * h[(axis + 2) % 3]) })));
    const total = faces.reduce((s, f) => s + f.area, 0);
    const onWall = (inset: number): { p: V; n: Vector3 } => {
      let r = R() * total, f = faces[0];
      for (const g of faces) if ((r -= g.area) <= 0) { f = g; break; }
      const p: V = [rand(-h[0] + 2, h[0] - 2), rand(-h[1] + 2, h[1] - 2), rand(-h[2] + 2, h[2] - 2)];
      p[f.axis] = f.sign * (h[f.axis] - inset);
      const n = new Vector3();
      n.setComponent(f.axis, f.sign);
      return { p, n };
    };
    const nucleus = { at: [-14, -3, -h[2] + 0.8 + S.nucleus / 2] as V, r: S.nucleus / 2 };
    const clearOfNucleus = (p: V, gap: number) => dist(p, nucleus.at) > nucleus.r + gap;
    const chloro: Matrix4[] = [];
    const spots: V[] = [];
    for (let tries = 0; chloro.length < S.chloroplasts.shown && tries < 6000; tries++) {
      const { p, n } = onWall(1.5);
      if (!clearOfNucleus(p, 3) || spots.some((q) => dist(p, q) < 5.4)) continue;
      spots.push(p);
      const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), n).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rand(0, Math.PI)));
      chloro.push(new Matrix4().compose(v3(p), q, new Vector3(S.chloroplast[0] / 2, S.chloroplast[1] / 2, S.chloroplast[0] / 2 * 0.8)));
    }
    const layer = () => onWall(rand(0.6, 1.9)).p;
    const mito = place(S.mitochondria.shown, (p) => clearOfNucleus(p, 1) && spots.every((q) => dist(p, q) > 2.4), layer, 1.2).map((p) => new Matrix4().compose(v3(p), randomQuat(), one));
    const golgi = place(6, (p) => clearOfNucleus(p, 2) && spots.every((q) => dist(p, q) > 2.8), () => onWall(1.6).p, 8).map((at) => ({ at, r: 0.9 }));
    const ribo = new Float32Array(S.ribosomes.shown * 3);
    for (let i = 0; i < S.ribosomes.shown; i++) ribo.set(i % 4 === 0 ? (() => { const r = nucleus.r + rand(0.8, 1.8), th = rand(0.3, 2.8), ph = rand(0, 6.28); return [nucleus.at[0] + r * Math.sin(th) * Math.cos(ph), nucleus.at[1] + r * Math.cos(th), nucleus.at[2] + Math.abs(r * Math.sin(th) * Math.sin(ph))] as V; })() : layer(), i * 3);
    const chl = spots.find((p) => p[2] > h[2] - 3) ?? spots[0];
    return {
      span: S.size[0], shift: [0, 0, 0], nucleus, er: { at: nucleus.at, radii: [nucleus.r + 1, nucleus.r + 1.8] }, golgi, mito, chloro, lyso: [], vac: [], ribo, nucleoid: null, flagella: [],
      labels: { wall: [h[0] - 4, h[1] + 2.2, h[2]], membrane: [-h[0] + 6, h[1] + 2.2, h[2]], vacuole: [6, 2, 0], nucleus: [nucleus.at[0], nucleus.at[1] + nucleus.r + 1.5, nucleus.at[2] + 2], chloroplasts: [chl[0], chl[1] + 3, chl[2] + 1], mitochondria: [16, -h[1] + 3, h[2]], er: [nucleus.at[0] + 7, nucleus.at[1] - 3, nucleus.at[2] + 2], golgi: golgi[0] ? [golgi[0].at[0], golgi[0].at[1] + 2.5, golgi[0].at[2]] : undefined, ribosomes: [-4, -h[1] + 1.5, h[2]] },
      barY: -h[1] - 4,
    };
  }

  // E. coli: a 2 µm rod along x, its flagella trailing behind as a bundle.
  const S = CELL_SCALE.bacteria;
  const half = S.size[0] / 2, r = S.size[1] / 2, cyl = half - r;
  const inRod = (p: V, inset: number) => {
    const x = Math.max(Math.abs(p[0]) - cyl, 0);
    return x * x + p[1] * p[1] + p[2] * p[2] < (r - inset) ** 2;
  };
  const inNucleoid = (p: V) => (p[0] / 0.55) ** 2 + (p[1] / 0.22) ** 2 + (p[2] / 0.22) ** 2 < 1;
  // The chromosome: a confined random walk, drawn as one tube.
  const walk: Vector3[] = [];
  let cur = new Vector3();
  for (let i = 0; i < 160; i++) {
    let next: Vector3;
    do next = cur.clone().add(new Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(0.09)); while (!inNucleoid([next.x, next.y, next.z]));
    walk.push((cur = next));
  }
  const ribo = new Float32Array(S.ribosomes.shown * 3);
  for (let i = 0; i < S.ribosomes.shown; i++) {
    let p: V;
    do p = [rand(-half, half), rand(-r, r), rand(-r, r)]; while (!inRod(p, 0.05) || inNucleoid(p));
    ribo.set(p, i * 3);
  }
  const flagella: Vector3[][] = [];
  for (let k = 0; k < S.flagella.shown; k++) {
    const a = (k / S.flagella.shown) * Math.PI * 2 + rand(-0.3, 0.3);
    const bx = rand(-cyl, cyl * 0.6);
    const base = new Vector3(bx, Math.cos(a) * r, Math.sin(a) * r);
    const pts: Vector3[] = [];
    // Normal-form flagellum: a left-handed helix about 0.4 µm wide with a 2.3 µm pitch.
    for (let i = 0; i <= 90; i++) {
      const t = i / 90, len = t * S.flagellum;
      const axis = new Vector3(base.x - len, base.y * (1 - t) * 1.4 * (1 - t) + base.y * 0.15, base.z * (1 - t) * 1.4 * (1 - t) + base.z * 0.15);
      const ph = (len / 2.3) * Math.PI * 2 + k;
      const amp = 0.2 * Math.min(1, t * 6);
      pts.push(axis.add(new Vector3(0, Math.cos(ph) * amp, Math.sin(ph) * amp)));
    }
    flagella.push(pts);
  }
  const span = S.size[0] + S.flagellum;
  return {
    span, shift: [S.flagellum / 2, 0, 0], er: null, golgi: [], mito: [], chloro: [], lyso: [], vac: [], ribo, nucleoid: walk, flagella,
    labels: { capsule: [0.6, 0.75, 0.3], wall: [-0.2, 0.75, 0.4], membrane: [-0.8, -0.75, 0.3], nucleoid: [0, 0.32, 0.3], ribosomes: [0.8, -0.5, 0.4], flagellum: [-4.5, 0.6, 0] },
    barY: -1.1,
  };
}


// ---- Specialised cells: real-size primitives (µm) ----

const NONE = { er: null, golgi: [], mito: [], chloro: [], lyso: [], vac: [], ribo: new Float32Array(0), nucleoid: null, flagella: [] };
const Y = new Vector3(0, 1, 0);
const compose = (p: V, q = new Quaternion(), s: V = [1, 1, 1]) => new Matrix4().compose(v3(p), q, v3(s));
const along = (d: Vector3) => new Quaternion().setFromUnitVectors(Y, d.clone().normalize());
const eulerOf = (q: Quaternion): V => { const e = new Euler().setFromQuaternion(q); return [e.x, e.y, e.z]; };
const X_AXIS: V = [0, 0, Math.PI / 2];

function specialLayout(kind: Exclude<CellKind, "animal" | "plant" | "bacteria">): Layout {
  const R = rng(kind.length * 97 + kind.charCodeAt(0));
  const rand = (a: number, b: number) => a + R() * (b - a);
  const shapes: Shape[] = [];
  const add = (s: Shape) => shapes.push(s);
  const anyDir = () => new Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1));

  switch (kind) {
    case "red_blood_cell": {
      // Evans & Fung (1972): thickness(x) = (D/2)·√(1−x²)·(C0 + C2x² + C4x⁴), x = 2r/D.
      const D = 7.82, f = (x: number) => Math.sqrt(Math.max(0, 1 - x * x)) * (0.207161 + 2.002558 * x * x - 1.122762 * x ** 4);
      const top: [number, number][] = Array.from({ length: 33 }, (_, i) => [(i / 32) * D / 2, (D / 2) * f(i / 32) / 2]);
      const profile: [number, number][] = [...top, ...[...top].reverse().map(([r, h]): [number, number] => [r, -h])];
      const views: [V, V][] = [[[-4.6, 0, 0], [Math.PI / 2, 0, 0]], [[4.6, 0, 0], [0.12, 0, 0]]];
      for (const [at, rot] of views) {
        add({ id: "haemoglobin", kind: "lathe", at, profile, rot });
        add({ id: "membrane", kind: "lathe", at, profile, rot, shell: 0.3, scale: 1.04 });
      }
      return { ...NONE, span: 18, shift: [0, 0, 0], shapes, labels: { membrane: [-4.6, 4.7, 0], haemoglobin: [4.6, 2.3, 0] }, barY: -5 };
    }
    case "neuron": {
      const S: V = [-250, 0, 0];
      const nuc: V = [S[0] + 1, 1, 2];
      add({ id: "membrane", kind: "ellipsoid", at: S, r: [13, 11, 11], shell: 0.3 });
      add({ id: "nucleus", kind: "ellipsoid", at: nuc, r: [5, 5, 5] });
      const inSoma = (): V => {
        let p: V;
        do p = [S[0] + rand(-11, 11), rand(-9, 9), rand(-9, 9)]; while (((p[0] - S[0]) / 11) ** 2 + (p[1] / 9) ** 2 + (p[2] / 9) ** 2 > 1 || dist(p, nuc) < 6.2);
        return p;
      };
      // Nissl bodies: stacks of rough ER typical of nerve cells.
      add({ id: "er", kind: "inst", geo: "sphere", args: [1, 8, 6], matrices: Array.from({ length: 28 }, () => compose(inSoma(), new Quaternion(), [1.4, 0.5, 1.1])) });
      add({ id: "mitochondria", kind: "inst", geo: "capsule", args: [0.25, 1.5, 2, 6], matrices: Array.from({ length: 40 }, () => compose(inSoma(), along(anyDir()))) });
      // Dendrites: six trunks that fork twice, tapering.
      const branch = (from: Vector3, dir: Vector3, len: number, r: number, depth: number) => {
        const pts: V[] = [];
        let p = from.clone();
        for (let i = 0; i <= 4; i++) {
          pts.push([p.x, p.y, p.z]);
          p = p.clone().add(dir.clone().multiplyScalar(len / 4)).add(new Vector3(rand(-2, 2), rand(-2, 2), rand(-2, 2)));
        }
        add({ id: "dendrites", kind: "tube", pts, r });
        if (depth > 0) for (const s of [-1, 1]) branch(v3(pts[4]), dir.clone().applyAxisAngle(anyDir().normalize(), s * 0.55).normalize(), len * 0.7, r * 0.65, depth - 1);
      };
      // Axon, myelin and dendrites are drawn 3× thicker than life (T) so they show at this scale.
      const T = 3;
      for (let k = 0; k < 6; k++) {
        const a = Math.PI * (0.45 + k * 0.22) + rand(-0.1, 0.1);
        const dir = new Vector3(Math.cos(a), Math.sin(a) * 0.9, rand(-0.6, 0.6)).normalize();
        branch(v3(S).add(dir.clone().multiplyScalar(11)), dir, 40, 1.5 * T, 2);
      }
      // Axon hillock, axon, one full 400 µm myelin segment, a node of Ranvier, then the next segment.
      add({ id: "axon", kind: "lathe", at: [S[0] + 11, 0, 0], profile: [[0, 0], [5, 0], [T, 12], [0, 12]], rot: [0, 0, -Math.PI / 2] });
      add({ id: "axon", kind: "cylinder", at: [(S[0] + 23 + 284) / 2, 0, 0], r: T, len: 284 - (S[0] + 23), rot: X_AXIS });
      add({ id: "myelin", kind: "cylinder", at: [-15, 0, 0], r: 2 * T, len: 400, rot: X_AXIS, shell: 0.75 });
      add({ id: "myelin", kind: "cylinder", at: [234, 0, 0], r: 2 * T, len: 92, rot: X_AXIS, shell: 0.75 });
      // A gap stands for the rest of the axon (up to 1 m), then it ends in terminals.
      add({ id: "axon", kind: "cylinder", at: [300, 0, 0], r: T, len: 10, rot: X_AXIS });
      const bulbs: Matrix4[] = [];
      for (let k = 0; k < 5; k++) {
        const end: V = [328 + rand(0, 14), (k - 2) * 9 + rand(-2, 2), rand(-6, 6)];
        add({ id: "terminals", kind: "tube", pts: [[305, 0, 0], [315, end[1] * 0.4, end[2] * 0.4], end], r: 0.6 * T });
        bulbs.push(compose(end, new Quaternion(), [2.4 * 1.5, 2.4 * 1.5, 2.4 * 1.5]));
      }
      add({ id: "terminals", kind: "inst", geo: "sphere", args: [1, 10, 8], matrices: bulbs });
      return {
        ...NONE, span: 610, shift: [-40, 0, 0], shapes, barY: -100,
        labels: { dendrites: [S[0] - 40, 85, 0], nucleus: [S[0] + 10, 26, 10], membrane: [S[0] - 10, -34, 0], er: [S[0] - 55, -12, 10], mitochondria: [S[0] + 45, -22, 10], axon: [-205, 14, 0], myelin: [-15, 16, 0], terminals: [335, 40, 0] },
      };
    }
    case "muscle": {
      const X = along(new Vector3(1, 0, 0));
      add({ id: "membrane", kind: "cylinder", at: [0, 0, 0], r: 25, len: 160, rot: X_AXIS, shell: 0.18 });
      // Myofibrils: 1.5 µm rods packed side by side; dark A-bands every 2.5 µm sarcomere make the stripes.
      const fib: Matrix4[] = [];
      for (let y = -24; y <= 24; y += 2.2) for (let z = -24; z <= 24; z += 2.2) {
        const zz = z + (Math.round(y / 2.2) % 2 ? 1.1 : 0);
        if (y * y + zz * zz < 23.5 ** 2) fib.push(compose([0, y, zz], X));
      }
      add({ id: "myofibrils", kind: "inst", geo: "cylinder", args: [0.75, 0.75, 160, 6], matrices: fib });
      add({ id: "myofibrils", kind: "inst", geo: "cylinder", args: [24.2, 24.2, 1.6, 32], matrices: Array.from({ length: 64 }, (_, k) => compose([-78.75 + k * 2.5, 0, 0], X)), color: "#b91c1c" });
      add({ id: "nucleus", kind: "inst", geo: "sphere", args: [1, 16, 10], matrices: [-65, -40, -15, 10, 35, 60].map((x, k) => compose([x, Math.cos(k * 2.1) * 24.3, Math.sin(k * 2.1) * 24.3], X, [1.8, 7, 1.8])) });
      add({ id: "mitochondria", kind: "inst", geo: "capsule", args: [0.4, 1, 2, 6], matrices: Array.from({ length: 140 }, () => { const a = rand(0, Math.PI * 2); return compose([rand(-78, 78), Math.cos(a) * 24.4, Math.sin(a) * 24.4], along(anyDir())); }) });
      return { ...NONE, span: 160, shift: [0, 0, 0], shapes, labels: { membrane: [0, 28, 8], myofibrils: [-82, 0, 12], nucleus: [-65, 30, 4], mitochondria: [30, -28, 8] }, barY: -32 };
    }
    case "epithelial": {
      add({ id: "membrane", kind: "box", at: [0, -3, 0], size: [8, 22, 8], shell: 0.25 });
      add({ id: "nucleus", kind: "ellipsoid", at: [0, -8.5, 0], r: [2.6, 3.8, 2.6] });
      add({ id: "mitochondria", kind: "inst", geo: "capsule", args: [0.25, 1.2, 2, 6], matrices: Array.from({ length: 45 }, () => compose([rand(-3.4, 3.4), rand(2, 7.4), rand(-3.4, 3.4)], along(anyDir()))) });
      const cilia: Matrix4[] = [];
      for (let i = 0; i < 14; i++) for (let j = 0; j < 14; j++) {
        const tilt = 0.25 + rand(-0.08, 0.08);
        const dir = new Vector3(Math.sin(tilt), Math.cos(tilt), rand(-0.05, 0.05)).normalize();
        cilia.push(compose([-3.6 + i * 0.55 + dir.x * 3, 8 + dir.y * 3, -3.6 + j * 0.55], along(dir)));
      }
      add({ id: "cilia", kind: "inst", geo: "cylinder", args: [0.125, 0.125, 6, 5], matrices: cilia });
      return { ...NONE, golgi: [{ at: [0, -2.5, 0], r: 1.4 }], span: 28, shift: [0, 0, 0], shapes, labels: { membrane: [-4.6, -12, 4], nucleus: [-4.2, -8.5, 3], golgi: [3.8, -2.5, 3], mitochondria: [-4.4, 5, 3], cilia: [0, 15.5, 0] }, barY: -16 };
    }
    case "sperm": {
      add({ id: "membrane", kind: "ellipsoid", at: [0, 0, 0], r: [2.6, 1.6, 0.85], shell: 0.25 });
      add({ id: "nucleus", kind: "ellipsoid", at: [-0.3, 0, 0], r: [2, 1.25, 0.6] });
      add({ id: "acrosome", kind: "ellipsoid", at: [1.1, 0, 0], r: [1.6, 1.4, 0.72], shell: 0.6 });
      add({ id: "midpiece", kind: "cylinder", at: [-5, 0, 0], r: 0.5, len: 5, rot: X_AXIS, shell: 0.35 });
      // About 60 mitochondria wound in a helix around the midpiece.
      add({ id: "mitochondria", kind: "inst", geo: "capsule", args: [0.17, 0.45, 2, 6], matrices: Array.from({ length: 60 }, (_, k) => { const x = -2.7 - (k / 59) * 4.6, a = k * 1.15; return compose([x, Math.cos(a) * 0.4, Math.sin(a) * 0.4], along(new Vector3(0, -Math.sin(a), Math.cos(a)))); }) });
      const tail: V[] = Array.from({ length: 60 }, (_, i) => { const x = -7.5 - (i / 59) * 50; return [x, 1.8 * Math.sin((2 * Math.PI * (x + 7.5)) / 22) * Math.min(1, (-x - 7.5) / 12), 0]; });
      add({ id: "flagellum", kind: "tube", pts: tail, r: 0.22 });
      return { ...NONE, span: 60, shift: [27.4, 0, 0], shapes, labels: { acrosome: [2.2, 2.3, 0], nucleus: [-0.6, -2.3, 0], membrane: [-1.8, 2.6, 0], midpiece: [-5, 1.7, 0], mitochondria: [-5.4, -1.7, 0], flagellum: [-36, 3.5, 0] }, barY: -5 };
    }
    case "egg": {
      const nuc: V = [18, 12, 10];
      add({ id: "zona", kind: "ellipsoid", at: [0, 0, 0], r: [75, 75, 75], shell: 0.22 });
      add({ id: "membrane", kind: "ellipsoid", at: [0, 0, 0], r: [60, 60, 60], shell: 0.25 });
      add({ id: "nucleus", kind: "ellipsoid", at: nuc, r: [12, 12, 12] });
      const grains = new Float32Array(2400 * 3);
      for (let i = 0; i < 2400; i++) {
        let p: V;
        do p = [rand(-58, 58), rand(-58, 58), rand(-58, 58)]; while (Math.hypot(...p) > 58 || dist(p, nuc) < 13);
        grains.set(p, i * 3);
      }
      add({ id: "cytoplasm", kind: "points", pts: grains, size: 1 });
      add({ id: "corona", kind: "inst", geo: "sphere", args: [1, 10, 8], matrices: Array.from({ length: 170 }, () => { const d = anyDir().normalize(), k = rand(80, 86); return compose([d.x * k, d.y * k, d.z * k], along(d), [5, 4, 5]); }) });
      return { ...NONE, span: 176, shift: [0, 0, 0], shapes, labels: { corona: [0, 93, 0], zona: [-50, 52, 12], membrane: [52, -32, 8], cytoplasm: [-22, -22, 40], nucleus: [18, 28, 12] }, barY: -96 };
    }
    case "root_hair": {
      const hair: V[] = [[-100, 0, 0], [-40, 2, 0], [20, 4, 0], [80, 5, 0], [144, 6, 0]];
      add({ id: "wall", kind: "box", at: [-120, 0, 0], size: [41, 23, 23], shell: 0.3 });
      add({ id: "root_hair", kind: "tube", pts: hair, r: 6.5, shell: 0.35 });
      add({ id: "root_hair", kind: "ellipsoid", at: [144, 6, 0], r: [6.5, 6.5, 6.5], shell: 0.35 });
      add({ id: "membrane", kind: "box", at: [-120, 0, 0], size: [39.5, 21.5, 21.5], shell: 0.12 });
      add({ id: "membrane", kind: "tube", pts: hair, r: 5.9, shell: 0.12 });
      add({ id: "vacuole", kind: "box", at: [-121, 0, 0], size: [33, 15, 15], shell: 0.35 });
      add({ id: "vacuole", kind: "tube", pts: [...hair.slice(0, 4), [110, 5.4, 0]], r: 4.2, shell: 0.35 });
      // The nucleus follows the growing tip, a few tens of µm behind it.
      add({ id: "nucleus", kind: "ellipsoid", at: [118, 5.6, 0], r: [7, 3.2, 3.2] });
      add({
        id: "mitochondria", kind: "inst", geo: "capsule", args: [0.3, 1, 2, 6],
        matrices: Array.from({ length: 36 }, (_, k) => {
          const a = rand(0, 6.28);
          const p: V = k < 20 ? [rand(126, 147), 6 + Math.cos(a) * rand(0, 4.6), Math.sin(a) * rand(0, 4.6)] : [rand(-138, -102), Math.cos(a) * 9.6, Math.sin(a) * 9.6];
          return compose(p, along(anyDir()));
        }),
      });
      return { ...NONE, span: 290, shift: [-2, 0, 0], shapes, labels: { wall: [-120, 14.5, 0], membrane: [-138, -13.5, 8], vacuole: [-112, 3, 13], nucleus: [118, 13, 0], mitochondria: [138, -6, 6], root_hair: [20, 14, 0] }, barY: -25 };
    }
    case "guard_cell": {
      // Two half-tori around the pore, stretched into kidney shapes (each ~45 µm long).
      const Rm = 9;
      const stretch: V = [1, 1.6, 1];
      for (const side of [-1, 1]) {
        const turn = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        add({ id: "wall", kind: "torus", at: [0, 0, 0], R: Rm, r: 5.6, arc: Math.PI, rot: [0, 0, turn], scale: stretch, shell: 0.3 });
        add({ id: "membrane", kind: "torus", at: [0, 0, 0], R: Rm, r: 5.1, arc: Math.PI, rot: [0, 0, turn], scale: stretch, shell: 0.12 });
        add({ id: "vacuole", kind: "torus", at: [0, 0, 0], R: Rm, r: 3, arc: Math.PI * 0.8, rot: [0, 0, turn + Math.PI * 0.1], scale: stretch, shell: 0.4 });
        add({ id: "nucleus", kind: "ellipsoid", at: [side * Rm, 0, 2.2], r: [2.4, 3.4, 2.2] });
      }
      const chl: Matrix4[] = [];
      for (let k = 0; k < 24; k++) {
        const a = Math.PI / 2 + (((k % 12) + 0.5) / 12) * Math.PI + (k >= 12 ? Math.PI : 0);
        if (Math.abs(Math.cos(a)) > 0.93) continue; // leave room for the nuclei
        chl.push(compose([Rm * Math.cos(a), 1.6 * Rm * Math.sin(a), k % 2 ? 2.8 : -2.8], new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2), [1.4, 0.7, 1.4]));
      }
      add({ id: "chloroplasts", kind: "inst", geo: "sphere", args: [1, 12, 8], matrices: chl });
      add({ id: "stoma", kind: "ellipsoid", at: [0, 0, 0], r: [Rm - 5.6, 1.6 * (Rm - 5.6), 0.5] });
      return { ...NONE, span: 45, shift: [0, 0, 0], shapes, labels: { wall: [0, 25, 0], membrane: [-17, -13, 4], vacuole: [15, -12, 4], nucleus: [-9, 7, 4], chloroplasts: [9, 14, 4], stoma: [0, 0, 3] }, barY: -26 };
    }
    case "yeast": {
      const M: V = [-1.2, 0, 0];
      add({ id: "wall", kind: "ellipsoid", at: M, r: [2.75, 2.35, 2.35], shell: 0.3 });
      add({ id: "membrane", kind: "ellipsoid", at: M, r: [2.6, 2.2, 2.2], shell: 0.12 });
      add({ id: "nucleus", kind: "ellipsoid", at: [-1.9, 0.5, 0.4], r: [0.95, 0.95, 0.95] });
      add({ id: "vacuole", kind: "ellipsoid", at: [-0.6, -0.5, -0.3], r: [1.25, 1.2, 1.2], shell: 0.45 });
      for (let k = 0; k < 4; k++) {
        const pts: V[] = Array.from({ length: 6 }, (_, i) => { const a = k * 1.6 + i * 0.5, b = rand(-0.6, 0.6); return [M[0] + 2.0 * Math.cos(a), 1.65 * Math.sin(a) * Math.cos(b), 1.65 * Math.sin(b)]; });
        add({ id: "mitochondria", kind: "tube", pts, r: 0.13 });
      }
      add({ id: "bud", kind: "ellipsoid", at: [2.6, 0.5, 0], r: [1.5, 1.35, 1.35], shell: 0.5 });
      return { ...NONE, span: 9, shift: [0, 0, 0], shapes, labels: { wall: [-1.2, 2.9, 0], membrane: [-3.7, -1.8, 1], nucleus: [-2.1, 1.7, 1.2], vacuole: [-0.4, -2.0, 1], mitochondria: [0.4, 1.9, 1.4], bud: [2.9, 2.3, 0] }, barY: -3 };
    }
    case "amoeba": {
      add({ id: "membrane", kind: "ellipsoid", at: [0, 0, 0], r: [140, 45, 100], shell: 0.28 });
      const tips: V[] = [];
      for (const a of [0.3, 1.8, 3.4, 4.9]) {
        const d = new Vector3(Math.cos(a), 0, Math.sin(a));
        add({ id: "pseudopodia", kind: "capsule", at: [d.x * 150, 0, d.z * 150], r: 32, len: 100, rot: eulerOf(along(d)), shell: 0.35 });
        tips.push([d.x * 230, 0, d.z * 230]);
      }
      const grains = new Float32Array(1800 * 3);
      for (let i = 0; i < 1800; i++) {
        let p: V;
        do p = [rand(-133, 133), rand(-42, 42), rand(-95, 95)]; while ((p[0] / 133) ** 2 + (p[1] / 42) ** 2 + (p[2] / 95) ** 2 > 1);
        grains.set(p, i * 3);
      }
      add({ id: "cytoplasm", kind: "points", pts: grains, size: 3 });
      add({ id: "nucleus", kind: "ellipsoid", at: [-30, 0, 10], r: [22, 8, 22] });
      add({ id: "contractile_vacuole", kind: "ellipsoid", at: [70, 0, -40], r: [24, 22, 24], shell: 0.5 });
      const food: V[] = [[-80, 5, -30], [20, -5, 50], [-10, 10, -55], [95, -8, 35], [-90, -6, 45], [45, 6, -5]];
      add({ id: "food_vacuoles", kind: "inst", geo: "sphere", args: [1, 14, 10], matrices: food.map((p, k) => { const r = 8 + (k % 3) * 2.5; return compose(p, new Quaternion(), [r, r, r]); }) });
      return { ...NONE, span: 500, shift: [0, 0, 0], shapes, labels: { membrane: [0, 54, -60], cytoplasm: [-60, 0, 60], nucleus: [-30, 16, 12], contractile_vacuole: [70, 32, -40], food_vacuoles: [-80, 22, -30], pseudopodia: [tips[0][0], 40, tips[0][2]] }, barY: -60 };
    }
  }
}
