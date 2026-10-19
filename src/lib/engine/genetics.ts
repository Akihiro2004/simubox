// Mendelian genetics with Mendel's own pea traits (Mendel, 1866):
//   R round seed (dominant) / r wrinkled,  Y yellow seed (dominant) / y green.
// Exact ratios come from the Punnett square: every gamete combination is
// equally likely. Offspring are then sampled with a seeded random generator,
// so real-looking counts scatter around the exact ratio, as Mendel's did
// (5,474 round : 1,850 wrinkled = 2.96 : 1).

import { rng } from "./md";

export const GENES = {
  R: { name: "seed shape", dominant: "round", recessive: "wrinkled" },
  Y: { name: "seed colour", dominant: "yellow", recessive: "green" },
} as const;
export type Gene = keyof typeof GENES;

export interface GeneticsState {
  /** Genotypes like "Rr" or "RrYy" (both parents follow the same genes). */
  parent1: string;
  parent2: string;
  /** How many offspring to grow. */
  offspring: number;
  seed: number;
}
export const DEFAULT_GENETICS: GeneticsState = { parent1: "Rr", parent2: "Rr", offspring: 100, seed: 1 };

/** Genotypes for one or both genes: "Rr", "Yy", "RrYy". */
export const GENOTYPE = /^(?:[Rr]{2}|[Yy]{2}|[Rr]{2}[Yy]{2})$/;

/** Split "RrYy" into allele pairs per gene, upper case first ("rR" → "Rr"). */
export function genePairs(g: string): string[] {
  if (!g || !GENOTYPE.test(g)) throw new SyntaxError(`"${g}" isn't a genotype like Rr or RrYy`);
  return (g.match(/../g) ?? []).map((p) => (p[0] > p[1] ? p[1] + p[0] : p));
}

/** Every gamete a parent can make (equal probability): "RrYy" → RY, Ry, rY, ry. */
export function gametes(g: string): string[] {
  return genePairs(g).reduce<string[]>((acc, pair) => acc.flatMap((a) => [a + pair[0], a + pair[1]]), [""]);
}

const tidy = (alleles: string) => (alleles.match(/../g) ?? []).map((p) => (p[0] > p[1] ? p[1] + p[0] : p)).join("");

/** Offspring genotype from two gametes, gene by gene ("RY" + "ry" → "RrYy"). */
const combine = (a: string, b: string) => tidy([...a].map((x, i) => x + b[i]).join(""));

/** Visible traits of a genotype, e.g. "round yellow". */
export function phenotype(g: string): string {
  return genePairs(g).map((p) => (p[0] === p[0].toUpperCase() ? GENES[p[0].toUpperCase() as Gene].dominant : GENES[p[0].toUpperCase() as Gene].recessive)).join(" ");
}

export interface Punnett {
  rows: string[];
  cols: string[];
  /** cells[r][c] = offspring genotype */
  cells: string[][];
  /** Exact fractions (count out of total). */
  genotypes: { genotype: string; count: number }[];
  phenotypes: { phenotype: string; count: number }[];
  total: number;
}

export function punnett(p1: string, p2: string): Punnett {
  if (genePairs(p1).map((p) => p[0].toUpperCase()).join() !== genePairs(p2).map((p) => p[0].toUpperCase()).join()) throw new SyntaxError("Both parents need the same genes");
  const rows = gametes(p1), cols = gametes(p2);
  const cells = rows.map((a) => cols.map((b) => combine(a, b)));
  const tally = (key: (g: string) => string) => {
    const m = new Map<string, number>();
    for (const g of cells.flat()) m.set(key(g), (m.get(key(g)) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  return {
    rows, cols, cells, total: rows.length * cols.length,
    genotypes: tally((g) => g).map(([genotype, count]) => ({ genotype, count })),
    phenotypes: tally(phenotype).map(([phenotype, count]) => ({ phenotype, count })),
  };
}

/** Smallest whole-number ratio, e.g. [12, 4] → "3 : 1". */
export function ratio(counts: number[]): string {
  const g = counts.reduce((a, b) => { while (b) [a, b] = [b, a % b]; return a; });
  return counts.map((c) => c / g).join(" : ");
}

/** Grow `n` offspring: each parent passes one random allele per gene (seeded). */
export function sampleOffspring(p1: string, p2: string, n: number, seed: number): string[] {
  const r = rng(seed);
  const a = genePairs(p1), b = genePairs(p2);
  return Array.from({ length: n }, () => a.map((pa, k) => tidy(pa[r() < 0.5 ? 0 : 1] + b[k][r() < 0.5 ? 0 : 1])).join(""));
}

/** Pearson χ² of observed phenotype counts against the Punnett expectation. */
export function chiSquare(p: Punnett, offspring: string[]): number {
  const n = offspring.length;
  return p.phenotypes.reduce((x, { phenotype: ph, count }) => {
    const expected = (count / p.total) * n;
    const observed = offspring.filter((g) => phenotype(g) === ph).length;
    return x + (observed - expected) ** 2 / expected;
  }, 0);
}
