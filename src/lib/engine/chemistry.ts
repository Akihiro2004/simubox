// Curated molecule and atom data. Gemini picks an id; it never supplies
// coordinates. Geometry comes from experimental bond lengths/angles
// (NIST CCCBDB, https://cccbdb.nist.gov) and is built here deterministically.

import type { Vec3 } from "../world/catalog";
import GENERATED from "./molecules.generated.json";
import { PERIODIC_ELEMENTS } from "../periodic-table";

export interface Atom {
  el: string;
  pos: Vec3; // Å, molecule centred near origin
}
export interface Bond {
  a: number;
  b: number;
  order: 1 | 2 | 3;
}
export interface Molecule {
  id: MoleculeId;
  /** g/mol, when known. */
  molarMass?: number;
  /** PubChem compound id, for compounds looked up at runtime. */
  cid?: number;
  name: string;
  formula: string;
  shape: string;
  atoms: Atom[];
  bonds: Bond[];
  /** Directions (unit vectors from atom index `atom`) of lone pairs, schematic. */
  lonePairs: { atom: number; dir: Vec3 }[];
  /** Bond angles worth annotating: [a, center, b] atom indices with the angle in degrees. */
  angles: { atoms: [number, number, number]; deg: number }[];
  facts: string[];
  source: string;
}

// Jmol/CPK colours and Cordero (2008) covalent radii in Å for elements found in
// everyday and school chemistry. Others fall back to a neutral colour and 1.5 Å.
const EL_DATA: Record<string, [string, number]> = {
  H: ["#f8fafc", 0.31], He: ["#d9ffff", 0.28], Li: ["#cc80ff", 1.28], Be: ["#c2ff00", 0.96], B: ["#ffb5b5", 0.84], C: ["#475569", 0.76], N: ["#3b82f6", 0.71], O: ["#ef4444", 0.66], F: ["#90e050", 0.57], Ne: ["#b3e3f5", 0.58],
  Na: ["#ab5cf2", 1.66], Mg: ["#8aff00", 1.41], Al: ["#bfa6a6", 1.21], Si: ["#f0c8a0", 1.11], P: ["#ff8000", 1.07], S: ["#facc15", 1.05], Cl: ["#22c55e", 1.02], Ar: ["#80d1e3", 1.06], K: ["#8f40d4", 2.03], Ca: ["#3dff00", 1.76],
  Ti: ["#bfc2c7", 1.6], Cr: ["#8a99c7", 1.39], Mn: ["#9c7ac7", 1.39], Fe: ["#e06633", 1.32], Co: ["#f090a0", 1.26], Ni: ["#50d050", 1.24], Cu: ["#c88033", 1.32], Zn: ["#7d80b0", 1.22], Se: ["#ffa100", 1.2], Br: ["#a62929", 1.2],
  Ag: ["#c0c0c0", 1.45], Sn: ["#668080", 1.39], I: ["#940094", 1.39], Pt: ["#d0d0e0", 1.36], Au: ["#ffd123", 1.36], Hg: ["#b8b8d0", 1.32], Pb: ["#575961", 1.46],
};
const elementData = (el: string): [string, number] => EL_DATA[el] ?? ["#a78bfa", 1.5];
export const elementColor = (el: string) => elementData(el)[0];
/** Ball radius for drawing (Å): grows with the covalent radius (H 0.25, C 0.38, Cl 0.45). */
export const elementRadius = (el: string) => 0.17 + 0.27 * elementData(el)[1];
export const ELEMENT_COLORS: Record<string, string> = Object.fromEntries(Object.keys(EL_DATA).map((e) => [e, elementColor(e)]));
export const ELEMENT_RADII: Record<string, number> = Object.fromEntries(Object.keys(EL_DATA).map((e) => [e, elementRadius(e)]));

const rad = (d: number) => (d * Math.PI) / 180;
const SRC = "NIST CCCBDB experimental geometry";

/** Unit vectors for n atoms on a cone pointing down, separated by angle `alpha` (deg). */
function cone(n: 3, alpha: number): Vec3[] {
  const cos2b = (Math.cos(rad(alpha)) + 0.5) / 1.5;
  const cb = Math.sqrt(cos2b);
  const sb = Math.sqrt(1 - cos2b);
  return [0, 1, 2].map((i) => {
    const phi = rad(90 + 120 * i);
    return [sb * Math.cos(phi), -cb, sb * Math.sin(phi)];
  });
}
const scale = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];

function diatomic(id: MoleculeId, name: string, formula: string, el: [string, string], r: number, order: 1 | 2 | 3, facts: string[]): Molecule {
  return {
    id,
    name,
    formula,
    shape: "linear",
    atoms: [
      { el: el[0], pos: [-r / 2, 0, 0] },
      { el: el[1], pos: [r / 2, 0, 0] },
    ],
    bonds: [{ a: 0, b: 1, order }],
    lonePairs: [],
    angles: [],
    facts,
    source: SRC,
  };
}

const CURATED = ["H2O", "CO2", "CH4", "NH3", "O2", "N2", "H2", "HCl"] as const;
type GeneratedEntry = Omit<Molecule, "id" | "lonePairs" | "angles" | "source"> & { angles: { atoms: number[]; deg: number }[]; method: string };
const GEN = GENERATED as unknown as Record<string, GeneratedEntry>;
/** Library molecules: 8 with measured geometry, the rest computed at build time (scripts/build-molecules.mjs). */
export const MOLECULE_IDS = [...CURATED, ...Object.keys(GEN)] as [string, ...string[]];
/** Compound names the PubChem lookup accepts (letters in any language, digits, simple punctuation). */
export const COMPOUND_NAME = /^[\p{L}\p{N} ,()'\-+[\]]{1,80}$/u;
/** A library id, or "cid:<n>" for a PubChem compound fetched at runtime. */
export type MoleculeId = string;

function build(): Record<string, Molecule> {
  // Water: r(O-H) = 0.958 Å, angle 104.5°
  const wr = 0.958;
  const wa = rad(104.5 / 2);
  const water: Molecule = {
    id: "H2O",
    name: "Water",
    formula: "H₂O",
    shape: "bent",
    atoms: [
      { el: "O", pos: [0, 0.12, 0] },
      { el: "H", pos: [-wr * Math.sin(wa), 0.12 - wr * Math.cos(wa), 0] },
      { el: "H", pos: [wr * Math.sin(wa), 0.12 - wr * Math.cos(wa), 0] },
    ],
    bonds: [
      { a: 0, b: 1, order: 1 },
      { a: 0, b: 2, order: 1 },
    ],
    // Two lone pairs above oxygen, out of the H-O-H plane (schematic).
    lonePairs: [
      { atom: 0, dir: [0, Math.cos(rad(55)), Math.sin(rad(55))] },
      { atom: 0, dir: [0, Math.cos(rad(55)), -Math.sin(rad(55))] },
    ],
    angles: [{ atoms: [1, 0, 2], deg: 104.5 }],
    facts: [
      "Oxygen has 2 bonds and 2 lone pairs of electrons.",
      "Lone pairs push the hydrogens closer together, so water is bent (about 104.5°), not straight.",
      "The bent shape makes water polar, which is why it is so good at dissolving things.",
    ],
    source: SRC,
  };

  // Carbon dioxide: r(C=O) = 1.162 Å, linear
  const cr = 1.162;
  const co2: Molecule = {
    id: "CO2",
    name: "Carbon dioxide",
    formula: "CO₂",
    shape: "linear",
    atoms: [
      { el: "C", pos: [0, 0, 0] },
      { el: "O", pos: [-cr, 0, 0] },
      { el: "O", pos: [cr, 0, 0] },
    ],
    bonds: [
      { a: 0, b: 1, order: 2 },
      { a: 0, b: 2, order: 2 },
    ],
    lonePairs: [],
    angles: [{ atoms: [1, 0, 2], deg: 180 }],
    facts: [
      "Carbon makes two double bonds and has no lone pairs.",
      "With nothing pushing them, the two oxygens sit on opposite sides: a straight line (180°).",
      "Plants take in CO₂ during photosynthesis; we breathe it out.",
    ],
    source: SRC,
  };

  // Methane: r(C-H) = 1.087 Å, tetrahedral 109.47°
  const mr = 1.087;
  const mDirs: Vec3[] = [[0, 1, 0], ...cone(3, 109.47)];
  const methane: Molecule = {
    id: "CH4",
    name: "Methane",
    formula: "CH₄",
    shape: "tetrahedral",
    atoms: [{ el: "C", pos: [0, 0, 0] }, ...mDirs.map((d) => ({ el: "H", pos: scale(d, mr) }))],
    bonds: [1, 2, 3, 4].map((b) => ({ a: 0, b, order: 1 as const })),
    lonePairs: [],
    angles: [{ atoms: [1, 0, 2], deg: 109.5 }],
    facts: [
      "Carbon shares electrons with 4 hydrogens.",
      "The 4 bonds spread out as far as possible in 3D: a tetrahedron with 109.5° angles.",
      "Methane is the main part of natural gas.",
    ],
    source: SRC,
  };

  // Ammonia: r(N-H) = 1.012 Å, angle 106.7°
  const nr = 1.012;
  const nDirs = cone(3, 106.7);
  const ammonia: Molecule = {
    id: "NH3",
    name: "Ammonia",
    formula: "NH₃",
    shape: "trigonal pyramidal",
    atoms: [{ el: "N", pos: [0, 0.3, 0] }, ...nDirs.map((d) => ({ el: "H", pos: [d[0] * nr, 0.3 + d[1] * nr, d[2] * nr] as Vec3 }))],
    bonds: [1, 2, 3].map((b) => ({ a: 0, b, order: 1 as const })),
    lonePairs: [{ atom: 0, dir: [0, 1, 0] }],
    angles: [{ atoms: [1, 0, 2], deg: 106.7 }],
    facts: [
      "Nitrogen has 3 bonds and 1 lone pair.",
      "The lone pair pushes the hydrogens down into a pyramid (about 106.7°).",
      "Ammonia is used to make fertilizer for crops.",
    ],
    source: SRC,
  };

  return {
    H2O: water,
    CO2: co2,
    CH4: methane,
    NH3: ammonia,
    O2: diatomic("O2", "Oxygen gas", "O₂", ["O", "O"], 1.208, 2, ["Two oxygen atoms share a double bond.", "This is the oxygen we breathe."]),
    N2: diatomic("N2", "Nitrogen gas", "N₂", ["N", "N"], 1.098, 3, ["A very strong triple bond holds the two atoms together.", "About 78% of air is nitrogen."]),
    H2: diatomic("H2", "Hydrogen gas", "H₂", ["H", "H"], 0.741, 1, ["The smallest molecule: two hydrogen atoms sharing one pair of electrons."]),
    HCl: diatomic("HCl", "Hydrogen chloride", "HCl", ["H", "Cl"], 1.275, 1, ["Chlorine pulls the shared electrons harder than hydrogen, so the molecule is polar.", "Dissolved in water it forms hydrochloric acid."]),
  };
}

export const MOLECULES: Record<string, Molecule> = build();
for (const [id, g] of Object.entries(GEN)) {
  MOLECULES[id] = { ...g, id, lonePairs: [], angles: g.angles.map((a) => ({ atoms: a.atoms as [number, number, number], deg: a.deg })), source: g.method === "NIST CCCBDB experimental geometry" ? SRC : `Computed (${g.method}, OpenChemLib)` };
}

// Compounds fetched from PubChem at runtime, keyed "cid:<n>".
const compounds = new Map<string, Molecule>();
const listeners = new Set<() => void>();
export function registerCompound(m: Molecule) {
  compounds.set(m.id, m);
  listeners.forEach((f) => f());
}
export function onCompoundsChange(f: () => void) {
  listeners.add(f);
  return () => void listeners.delete(f);
}
/** Library molecule or an already-fetched PubChem compound. */
export function getMolecule(id: MoleculeId): Molecule | undefined {
  return MOLECULES[id] ?? compounds.get(id);
}

export function measureAngle(m: Molecule, [a, c, b]: [number, number, number]): number {
  const A = m.atoms[a].pos, C = m.atoms[c].pos, B = m.atoms[b].pos;
  const u = [A[0] - C[0], A[1] - C[1], A[2] - C[2]];
  const v = [B[0] - C[0], B[1] - C[1], B[2] - C[2]];
  const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  return (Math.acos(dot / (Math.hypot(...u) * Math.hypot(...v))) * 180) / Math.PI;
}

/** Molar mass (g/mol) from IUPAC standard atomic weights. */
export function molarMass(m: Molecule): number {
  if (m.molarMass) return m.molarMass;
  const w = (el: string) => parseFloat((PERIODIC_ELEMENTS.find((e) => e.symbol === el)?.weight ?? "0").replace(/[[]]/g, ""));
  return Math.round(m.atoms.reduce((s, a) => s + w(a.el), 0) * 100) / 100;
}

export function bondLength(m: Molecule, bond: Bond): number {
  const A = m.atoms[bond.a].pos, B = m.atoms[bond.b].pos;
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

// ---- Atoms (schematic Bohr model, Z = 1..20) -----------------------------

export interface ElementInfo {
  symbol: string;
  name: string;
  z: number;
  /** Mass number of the most abundant stable isotope. */
  massNumber: number;
  color: string;
}

const EL: [string, string, number][] = [
  ["H", "Hydrogen", 1], ["He", "Helium", 4], ["Li", "Lithium", 7], ["Be", "Beryllium", 9], ["B", "Boron", 11],
  ["C", "Carbon", 12], ["N", "Nitrogen", 14], ["O", "Oxygen", 16], ["F", "Fluorine", 19], ["Ne", "Neon", 20],
  ["Na", "Sodium", 23], ["Mg", "Magnesium", 24], ["Al", "Aluminium", 27], ["Si", "Silicon", 28], ["P", "Phosphorus", 31],
  ["S", "Sulfur", 32], ["Cl", "Chlorine", 35], ["Ar", "Argon", 40], ["K", "Potassium", 39], ["Ca", "Calcium", 40],
];
const EL_COLORS = ["#f8fafc", "#67e8f9", "#c084fc", "#a3e635", "#fda4af", "#475569", "#3b82f6", "#ef4444", "#86efac", "#f472b6", "#a78bfa", "#4ade80", "#cbd5e1", "#fbbf24", "#fb923c", "#facc15", "#22c55e", "#22d3ee", "#c4b5fd", "#e2e8f0"];

export const ELEMENTS: ElementInfo[] = EL.map(([symbol, name, massNumber], i) => ({ symbol, name, z: i + 1, massNumber, color: EL_COLORS[i] }));
export const ELEMENT_SYMBOLS = ELEMENTS.map((e) => e.symbol) as [string, ...string[]];

/** Electron shell occupancy for Z <= 20 (2, 8, 8, 2 filling). */
export function shells(z: number): number[] {
  if (!Number.isInteger(z) || z < 1 || z > 20) throw new RangeError("z must be 1..20");
  const caps = [2, 8, 8, 2];
  const out: number[] = [];
  let left = z;
  for (const c of caps) {
    if (left <= 0) break;
    out.push(Math.min(c, left));
    left -= c;
  }
  return out;
}

export function elementBySymbol(s: string): ElementInfo | undefined {
  return ELEMENTS.find((e) => e.symbol.toLowerCase() === s.toLowerCase());
}

const pending = new Map<string, Promise<Molecule>>();
/** Browser only: fetch a PubChem compound's 3D model through /api/chem/compound (deduplicated, then cached). */
export function loadCompound(q: { name: string } | { cid: number }): Promise<Molecule> {
  const key = "cid" in q ? `cid:${q.cid}` : `name:${q.name.toLowerCase()}`;
  const known = "cid" in q ? compounds.get(key) : [...compounds.values()].find((m) => m.name.toLowerCase() === key.slice(5));
  if (known) return Promise.resolve(known);
  let p = pending.get(key);
  if (!p) {
    p = fetch(`/api/chem/compound?${"cid" in q ? `cid=${q.cid}` : `name=${encodeURIComponent(q.name)}`}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Couldn't load that compound.");
        registerCompound(body as Molecule);
        return body as Molecule;
      })
      .finally(() => pending.delete(key));
    pending.set(key, p);
  }
  return p;
}
