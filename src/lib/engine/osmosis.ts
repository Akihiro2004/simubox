// Diffusion and osmosis on the molecular dynamics engine (md.ts).
//
// Water particles cross the partially permeable membrane; solute particles
// can't. Solute keeps hitting the membrane, so it is pushed toward the side
// with less solute until the solute concentration is the same on both sides
// (isotonic). The water that moved across is the osmosis. For dilute solutions
// the membrane therefore settles where nL / VL = nR / VR, and the pressure that
// would hold it back is van 't Hoff's Π = cRT.

import { createMd, forces, rng, type Md } from "./md";

export interface OsmosisState {
  mode: "osmosis" | "diffusion";
  /** Solute particles on each side at the start. */
  soluteLeft: number;
  soluteRight: number;
}
export const DEFAULT_OSMOSIS: OsmosisState = { mode: "osmosis", soluteLeft: 24, soluteRight: 6 };

export const OSMOSIS_BOX: [number, number, number] = [16, 8, 8];
export const WATER = 0, SOLUTE = 1;
const WATER_COUNT = 120;
/** Usable length on each side: walls and the membrane keep particle centres 0.5 away. */
const free = (x: number) => Math.max(x - 0.5, 0.01);

export function createOsmosis(s: OsmosisState, seed = 3): Md {
  const L = OSMOSIS_BOX[0];
  const r = rng(seed);
  const n = WATER_COUNT + s.soluteLeft + s.soluteRight;
  const types = [...Array(WATER_COUNT).fill(WATER), ...Array(s.soluteLeft + s.soluteRight).fill(SOLUTE)];
  const md = createMd({
    n, box: OSMOSIS_BOX, types, temperature: 1, start: "spread", seed, pair: () => ({ eps: 0, sigma: 1 }),
    // Diffusion: no membrane, the dye just spreads. Osmosis: a free membrane across the middle.
    ...(s.mode === "osmosis" ? { membrane: [WATER], membraneMass: 8 } : {}),
  });
  // Water everywhere; solute starts on its side of the membrane (diffusion: all on the left),
  // each in a clear spot: overlapping particles would repel violently and heat the box.
  const [, H, D] = OSMOSIS_BOX;
  const clear = (i: number, p: number[]) => {
    for (let j = 0; j < n; j++) if (j !== i && (j < WATER_COUNT || j < i) && Math.hypot(p[0] - md.pos[j * 3], p[1] - md.pos[j * 3 + 1], p[2] - md.pos[j * 3 + 2]) < 1.1) return false;
    return true;
  };
  for (let i = WATER_COUNT, k = 0; i < n; i++, k++) {
    const left = s.mode === "diffusion" || k < s.soluteLeft;
    let p: number[];
    let tries = 0;
    do p = [(left ? 0.8 : L / 2 + 0.8) + r() * (L / 2 - 1.6), 0.8 + r() * (H - 1.6), 0.8 + r() * (D - 1.6)]; while (!clear(i, p) && ++tries < 500);
    md.pos.set(p, i * 3);
  }
  forces(md);
  return md;
}

/** Where the membrane settles (share of the box on the left): equal solute concentration. */
export function isotonicPosition(s: OsmosisState): number {
  const L = OSMOSIS_BOX[0];
  if (!s.soluteLeft && !s.soluteRight) return 0.5;
  // nL / free(x) = nR / free(L − x), solved for x.
  let lo = 1.5, hi = L - 1.5;
  for (let i = 0; i < 60; i++) {
    const x = (lo + hi) / 2;
    if (s.soluteLeft / free(x) > s.soluteRight / free(L - x)) lo = x;
    else hi = x;
  }
  return (lo + hi) / 2 / L;
}

/** Particles of a type left of the membrane (or of the middle for diffusion). */
export function countLeft(md: Md, type: number): number {
  const mid = md.opts.membrane ? md.membraneX : md.box[0] / 2;
  let c = 0;
  for (let i = 0; i < md.n; i++) if (md.types[i] === type && md.pos[i * 3] < mid) c++;
  return c;
}
