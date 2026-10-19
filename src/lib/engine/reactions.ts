// Chemical reactions: exact equation balancing (conservation of atoms) and a
// collision-theory reaction box on the molecular dynamics engine (md.ts).
//
// Balancing solves the atom-count matrix with exact rational arithmetic, so the
// coefficients are the true smallest whole numbers, never a guess.
//
// The reaction box runs NO + O₃ → NO₂ + O₂, a gas reaction whose measured rate
// constant is k = 3.0×10⁻¹² e^(−1500/T) cm³ s⁻¹ (JPL/NASA Chemical Kinetics
// Evaluation No. 19, 2020), i.e. Eₐ = 1500 K × R = 12.5 kJ/mol. Model temperature
// is real kelvin divided by TAU, and Eₐ is divided by R·TAU, so the share of
// collisions energetic enough to react, e^(−Eₐ/RT), is the real one.

import { PERIODIC_ELEMENTS } from "../periodic-table";
import { createMd, kineticTemperature, rng, stepMd, type Md } from "./md";

// ---------- formulas ----------

/** Atoms in a formula: "Ca(OH)2" → {Ca: 1, O: 2, H: 2}. Hydrates use "·" or "." (CuSO4·5H2O). */
export function parseFormula(formula: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of formula.replace(/\s+/g, "").split(/[·.*]/)) {
    const lead = /^(\d+)/.exec(part);
    const mult = lead ? Number(lead[1]) : 1;
    const body = lead ? part.slice(lead[1].length) : part;
    let i = 0;
    const group = (): Record<string, number> => {
      const g: Record<string, number> = {};
      while (i < body.length && body[i] !== ")" && body[i] !== "]") {
        let inner: Record<string, number>;
        if (body[i] === "(" || body[i] === "[") {
          i++;
          inner = group();
          if (body[i] !== ")" && body[i] !== "]") throw new SyntaxError(`Unclosed bracket in ${formula}`);
          i++;
        } else {
          const m = /^[A-Z][a-z]?/.exec(body.slice(i));
          if (!m) throw new SyntaxError(`Can't read "${body.slice(i)}" in ${formula}`);
          if (!PERIODIC_ELEMENTS.some((e) => e.symbol === m[0])) throw new SyntaxError(`${m[0]} is not an element`);
          inner = { [m[0]]: 1 };
          i += m[0].length;
        }
        const n = /^\d+/.exec(body.slice(i));
        const k = n ? Number(n[0]) : 1;
        if (n) i += n[0].length;
        for (const [el, c] of Object.entries(inner)) g[el] = (g[el] ?? 0) + c * k;
      }
      return g;
    };
    const atoms = group();
    if (i < body.length) throw new SyntaxError(`Unexpected "${body[i]}" in ${formula}`);
    for (const [el, c] of Object.entries(atoms)) out[el] = (out[el] ?? 0) + c * mult;
  }
  if (!Object.keys(out).length) throw new SyntaxError("Empty formula");
  return out;
}

/** g/mol from IUPAC standard atomic weights. */
export function formulaMass(formula: string): number {
  return Object.entries(parseFormula(formula)).reduce((s, [el, n]) => s + n * parseFloat((PERIODIC_ELEMENTS.find((e) => e.symbol === el)?.weight ?? "0").replace(/[[\]]/g, "")), 0);
}

// ---------- exact rational arithmetic ----------

type Q = [bigint, bigint]; // numerator, denominator > 0
// BigInt() calls, not 0n/1n literals: the project compiles to ES2017.
const B0 = BigInt(0), B1 = BigInt(1);
const gcd = (a: bigint, b: bigint): bigint => { a = a < B0 ? -a : a; b = b < B0 ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const q = (n: bigint, d = B1): Q => { if (d < B0) { n = -n; d = -d; } const g = gcd(n, d) || B1; return [n / g, d / g]; };
const sub = (a: Q, b: Q): Q => q(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
const mul = (a: Q, b: Q): Q => q(a[0] * b[0], a[1] * b[1]);
const div = (a: Q, b: Q): Q => q(a[0] * b[1], a[1] * b[0]);

// ---------- balancing ----------

export interface Balanced {
  reactants: { formula: string; coefficient: number }[];
  products: { formula: string; coefficient: number }[];
  /** e.g. "C₃H₈ + 5 O₂ → 3 CO₂ + 4 H₂O" */
  text: string;
  /** Atoms of each element on each side (equal when balanced). */
  atoms: Record<string, [number, number]>;
  /** Total mass of each side in g (per mole of reaction): equal, conservation of mass. */
  mass: [number, number];
  /** Atoms alone allow several balances (e.g. 3 NO + O₃ → 3 NO₂ also conserves atoms); this is the simplest. */
  simplest?: boolean;
}

/** Smallest positive whole numbers (by total) that conserve every element, searching 1..max. */
function simplestBalance(species: Record<string, number>[], nReactants: number, elements: string[], max = 9): number[] | null {
  let best: number[] | null = null, bestSum = Infinity;
  const c = Array(species.length).fill(1);
  const conserved = () => elements.every((el) => species.reduce((s, a, j) => s + (a[el] ?? 0) * c[j] * (j < nReactants ? 1 : -1), 0) === 0);
  const walk = (j: number, sum: number) => {
    if (sum + (species.length - j) >= bestSum) return;
    if (j === species.length) {
      if (conserved()) { best = [...c]; bestSum = sum; }
      return;
    }
    for (let v = 1; v <= max; v++) { c[j] = v; walk(j + 1, sum + v); }
  };
  walk(0, 0);
  return best;
}

const SUB = "₀₁₂₃₄₅₆₇₈₉";
export const pretty = (f: string) => f.replace(/\d/g, (d) => SUB[+d]);

/** Split "C3H8 + O2 -> CO2 + H2O" into formulas (any coefficients typed in are ignored). */
export function parseEquation(eq: string): { reactants: string[]; products: string[] } {
  const sides = eq.split(/\s*(?:->|→|⟶|=|⇌|<=>)\s*/);
  if (sides.length !== 2) throw new SyntaxError("Write it like: C3H8 + O2 -> CO2 + H2O");
  const list = (s: string) => s.split(/\s+\+\s+|\s*\+\s*(?=[A-Z(\d])/).map((x) => x.trim().replace(/^\d+\s*/, "")).filter(Boolean);
  const [reactants, products] = sides.map(list);
  if (!reactants.length || !products.length) throw new SyntaxError("Both sides need at least one substance");
  return { reactants, products };
}

/** Smallest whole-number coefficients that conserve every element (exact). */
export function balance(equation: string): Balanced {
  const { reactants, products } = parseEquation(equation);
  const species = [...reactants, ...products];
  const atoms = species.map(parseFormula);
  const elements = [...new Set(atoms.flatMap((a) => Object.keys(a)))];
  for (const el of elements) {
    if (!reactants.some((_, i) => atoms[i][el])) throw new Error(`${el} appears only among the products, so this can't balance`);
    if (!products.some((_, i) => atoms[reactants.length + i][el])) throw new Error(`${el} appears only among the reactants, so this can't balance`);
  }
  // Rows: elements; columns: species (products negative). Solve M·x = 0.
  const M: Q[][] = elements.map((el) => species.map((_, j) => q(BigInt((atoms[j][el] ?? 0) * (j < reactants.length ? 1 : -1)))));
  const cols = species.length;
  const pivots: number[] = [];
  let row = 0;
  for (let c = 0; c < cols && row < M.length; c++) {
    const p = M.findIndex((r, i) => i >= row && r[c][0] !== B0);
    if (p < 0) continue;
    [M[row], M[p]] = [M[p], M[row]];
    const lead = M[row][c];
    M[row] = M[row].map((x) => div(x, lead));
    for (let i = 0; i < M.length; i++) if (i !== row && M[i][c][0] !== B0) { const f = M[i][c]; M[i] = M[i].map((x, k) => sub(x, mul(f, M[row][k]))); }
    pivots.push(c);
    row++;
  }
  const free = [...Array(cols).keys()].filter((c) => !pivots.includes(c));
  if (!free.length) throw new Error("These substances can't be balanced into one reaction");
  let coef: number[];
  if (free.length === 1) {
    const f = free[0];
    const x: Q[] = Array(cols).fill(q(B0));
    x[f] = q(B1);
    pivots.forEach((c, r) => (x[c] = q(-M[r][f][0], M[r][f][1])));
    const lcm = x.reduce((l, v) => (l * v[1]) / gcd(l, v[1]), B1);
    let ints = x.map((v) => (v[0] * lcm) / v[1]);
    if (ints.every((v) => v <= B0)) ints = ints.map((v) => -v);
    if (ints.some((v) => v <= B0)) throw new Error("No balance with every substance taking part");
    const g = ints.reduce((a, b) => gcd(a, b));
    coef = ints.map((v) => Number(v / g));
  } else {
    // Several independent balances: take the simplest one, as chemists write it.
    const s = cols <= 7 ? simplestBalance(atoms, reactants.length, elements) : null;
    if (!s) throw new Error("More than one way to balance this (it's really two reactions mixed together)");
    coef = s;
  }
  const side = (list: string[], off: number) => list.map((formula, i) => ({ formula, coefficient: coef[off + i] }));
  const R = side(reactants, 0), P = side(products, reactants.length);
  const write = (s: { formula: string; coefficient: number }[]) => s.map((t) => `${t.coefficient === 1 ? "" : `${t.coefficient} `}${pretty(t.formula)}`).join(" + ");
  const count = (s: { formula: string; coefficient: number }[], el: string) => s.reduce((n, t) => n + t.coefficient * (parseFormula(t.formula)[el] ?? 0), 0);
  const massOf = (s: { formula: string; coefficient: number }[]) => Math.round(s.reduce((m, t) => m + t.coefficient * formulaMass(t.formula), 0) * 100) / 100;
  return {
    ...(free.length > 1 ? { simplest: true } : {}),
    reactants: R, products: P, text: `${write(R)} → ${write(P)}`,
    atoms: Object.fromEntries(elements.map((el) => [el, [count(R, el), count(P, el)]])),
    mass: [massOf(R), massOf(P)],
  };
}

// ---------- collision theory: NO + O₃ → NO₂ + O₂ ----------

const RATE_REACTION_EQUATION = "NO + O3 -> NO2 + O2";
export const RATE_REACTION = {
  equation: RATE_REACTION_EQUATION,
  species: ["NO", "O₃", "NO₂", "O₂"],
  colors: ["#60a5fa", "#a78bfa", "#f59e0b", "#ef4444"],
  /** Measured activation energy (kJ/mol): 1500 K × R. */
  eaKJ: (1500 * 8.314) / 1000,
  source: "JPL/NASA kinetics evaluation: k = 3.0×10⁻¹² e^(−1500/T) cm³/s",
};
export interface ReactionState {
  /** Any equation to balance; the particle box runs when it is NO + O₃. */
  equation: string;
  temperatureC: number;
  /** Molecules of each reactant in the box. */
  particles: number;
  activationKJ: number;
  catalyst: boolean;
}
export const DEFAULT_REACTION: ReactionState = { equation: RATE_REACTION_EQUATION, temperatureC: 25, particles: 80, activationKJ: 12.5, catalyst: false };
/** Characters an equation may use (formulas, +, arrows). */
export const EQUATION = /^[A-Za-z0-9()[\]·. +\-><=→⇌⟶]{3,80}$/;

/** True when the equation is the one the particle box can run. */
export function runsInBox(equation: string): boolean {
  try {
    const b = balance(equation);
    return b.text === "NO + O₃ → NO₂ + O₂";
  } catch {
    return false;
  }
}

/** Real kelvin per model temperature unit (room temperature ≈ 0.8, a lively gas). */
export const TAU = 372.5;
const R_GAS = 8.314;
export const modelTemp = (tempC: number) => (tempC + 273.15) / TAU;
export const modelEa = (eaKJ: number) => (eaKJ * 1000) / (R_GAS * TAU);
/** A catalyst gives a path with a lower barrier; here it halves Eₐ. */
export const CATALYST_FACTOR = 0.5;

/** Share of collisions with enough energy along the line of centres to react: e^(−Eₐ/RT). */
export function collisionFraction(eaKJ: number, tempC: number): number {
  return Math.exp(-(eaKJ * 1000) / (R_GAS * (tempC + 273.15)));
}

export interface ReactionBox {
  md: Md;
  /** Model time of every reaction so far. */
  events: number[];
  ea: number;
}

/** Contact distance for the repulsive (WCA) particles. */
const CONTACT = 2 ** (1 / 6);

export function createReactionBox(o: { perReactant: number; tempC: number; eaKJ: number; catalyst: boolean; seed?: number; size?: number }): ReactionBox {
  const n = o.perReactant * 2;
  const L = o.size ?? 10;
  const r = rng(o.seed ?? 5);
  // Shuffle A and B through the box.
  const types = Array.from({ length: n }, (_, i) => i % 2);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [types[i], types[j]] = [types[j], types[i]]; }
  const md = createMd({ n, box: [L, L, L], types, species: 4, temperature: modelTemp(o.tempC), start: "spread", pair: () => ({ eps: 0, sigma: 1 }), seed: o.seed ?? 5 });
  return { md, events: [], ea: modelEa(o.eaKJ) * (o.catalyst ? CATALYST_FACTOR : 1) };
}

/**
 * One step, then every A–B pair that has just come into contact reacts if its
 * relative kinetic energy along the line of centres, ½μv², exceeds Eₐ.
 */
function stepOnce(box: ReactionBox) {
  const { md } = box;
  const dt = md.opts.dt ?? 0.005;
  stepMd(md, 1);
  const { pos, vel, types, n } = md;
  for (let i = 0; i < n; i++) {
    if (types[i] !== 0) continue;
    for (let j = 0; j < n; j++) {
      if (types[j] !== 1) continue;
      const dx = pos[j * 3] - pos[i * 3], dy = pos[j * 3 + 1] - pos[i * 3 + 1], dz = pos[j * 3 + 2] - pos[i * 3 + 2];
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 > CONTACT * CONTACT) continue;
      const r = Math.sqrt(r2);
      const vn = ((vel[j * 3] - vel[i * 3]) * dx + (vel[j * 3 + 1] - vel[i * 3 + 1]) * dy + (vel[j * 3 + 2] - vel[i * 3 + 2]) * dz) / r;
      // Only the step on which the pair first touched (it was outside one step ago).
      if (vn >= 0 || r - vn * dt < CONTACT) continue;
      if (0.25 * vn * vn > box.ea) {
        types[i] = 2;
        types[j] = 3;
        box.events.push(md.time);
        break;
      }
    }
  }
}

/** Up to `steps` steps within `budgetMs` (slow devices run in slow motion). */
export function stepReaction(box: ReactionBox, steps: number, budgetMs = 3): void {
  const t0 = performance.now();
  for (let s = 0; s < steps; s++) {
    stepOnce(box);
    if (performance.now() - t0 > budgetMs) break;
  }
}

export function setReactionConditions(box: ReactionBox, tempC: number, eaKJ: number, catalyst: boolean) {
  box.md.temperature = modelTemp(tempC);
  box.ea = modelEa(eaKJ) * (catalyst ? CATALYST_FACTOR : 1);
}

/** Reactions per model time unit over the last `window` time units. */
export function measuredRate(box: ReactionBox, window = 6): number {
  const since = box.md.time - window;
  return box.events.filter((t) => t > since).length / Math.min(window, Math.max(box.md.time, 1e-9));
}

/** Share of the starting reactant pairs that have reacted. */
export function progress(box: ReactionBox): number {
  return box.events.length / (box.md.n / 2);
}

export { kineticTemperature };
