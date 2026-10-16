// Curated molecule and atom data. Gemini picks an id; it never supplies
// coordinates. Geometry comes from experimental bond lengths/angles
// (NIST CCCBDB, https://cccbdb.nist.gov) and is built here deterministically.

import type { Vec3 } from "../world/catalog";

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

export const ELEMENT_COLORS: Record<string, string> = {
  H: "#f8fafc",
  C: "#475569",
  N: "#3b82f6",
  O: "#ef4444",
  Cl: "#22c55e",
};
export const ELEMENT_RADII: Record<string, number> = { H: 0.25, C: 0.38, N: 0.37, O: 0.36, Cl: 0.45 };

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

export const MOLECULE_IDS = ["H2O", "CO2", "CH4", "NH3", "O2", "N2", "H2", "HCl"] as const;
export type MoleculeId = (typeof MOLECULE_IDS)[number];

function build(): Record<MoleculeId, Molecule> {
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

export const MOLECULES = build();

export function measureAngle(m: Molecule, [a, c, b]: [number, number, number]): number {
  const A = m.atoms[a].pos, C = m.atoms[c].pos, B = m.atoms[b].pos;
  const u = [A[0] - C[0], A[1] - C[1], A[2] - C[2]];
  const v = [B[0] - C[0], B[1] - C[1], B[2] - C[2]];
  const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  return (Math.acos(dot / (Math.hypot(...u) * Math.hypot(...v))) * 180) / Math.PI;
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
