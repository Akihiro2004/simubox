// Small molecular dynamics engine (reduced Lennard-Jones units: σ = ε = m = 1).
// Velocity Verlet with a Berendsen thermostat in a closed box. Phases, diffusion,
// gas pressure and reactions emerge from the particle interactions; nothing is
// scripted. Used by the particle box, the reaction box and the osmosis tank.

export interface PairRule {
  /** Well depth (0 = purely repulsive). */
  eps: number;
  /** Contact size. */
  sigma: number;
}

export interface MdOptions {
  n: number;
  /** Box size [x, y, z] in σ (y is up). */
  box: [number, number, number];
  /** Particle species, one per particle (default all 0). */
  types?: number[];
  /** pair(i, j) rule for species i and j. Default: attractive Lennard-Jones. */
  pair?: (a: number, b: number) => PairRule;
  /** Downward acceleration in reduced units (small: lets liquids pool). */
  gravity?: number;
  /** Target temperature (reduced). */
  temperature: number;
  /** Berendsen coupling time; smaller heats and cools faster. */
  tau?: number;
  dt?: number;
  seed?: number;
  /** Start packed in a lattice at the bottom (solids) or spread through the box (gases). */
  start?: "lattice" | "spread";
  /** A wall across the middle (x) that only species listed here may cross (osmosis). */
  membrane?: number[];
  /** Give the membrane this mass and it moves like a piston, pushed by the particles it blocks. */
  membraneMass?: number;
  /** How many species the pair rules cover (when types change during a run, e.g. reactions). */
  species?: number;
}

export interface Md {
  n: number;
  box: [number, number, number];
  pos: Float64Array;
  vel: Float64Array;
  types: Uint8Array;
  temperature: number;
  time: number;
  /** Momentum given to the walls since the last pressure reading. */
  wallImpulse: number;
  impulseTime: number;
  opts: MdOptions;
  acc: Float64Array;
  rules: PairRule[][];
  /** Membrane position along x and its speed (it only moves when membraneMass is set). */
  membraneX: number;
  membraneV: number;
}

/** mulberry32: a small seeded PRNG so a setup always starts the same way. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CUT = 2.5;
const LJ: PairRule = { eps: 1, sigma: 1 };

export function createMd(o: MdOptions): Md {
  const { n, box } = o;
  const rand = rng(o.seed ?? 1);
  const types = Uint8Array.from(o.types ?? new Array(n).fill(0));
  const species = Math.max(o.species ?? 0, Math.max(...types) + 1);
  const rules = Array.from({ length: species }, (_, a) => Array.from({ length: species }, (_, b) => (o.pair ? o.pair(a, b) : LJ)));
  const pos = new Float64Array(n * 3);
  const vel = new Float64Array(n * 3);
  if ((o.start ?? "lattice") === "lattice") {
    // Face-centred cubic close packing (nearest neighbours at 2^(1/6)), centred on the floor.
    const a0 = 2 ** (1 / 6) * Math.SQRT2;
    const cells = Math.ceil(Math.cbrt(n / 4));
    const basis = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];
    let i = 0;
    for (let iy = 0; iy < cells * 2 && i < n; iy++) for (let ix = 0; ix < cells && i < n; ix++) for (let iz = 0; iz < cells && i < n; iz++) for (const b of basis) {
      if (i >= n) break;
      pos[i * 3] = box[0] / 2 + (ix + b[0] - (cells - 1) / 2 - 0.25) * a0;
      pos[i * 3 + 1] = 0.6 + (iy + b[1]) * a0;
      pos[i * 3 + 2] = box[2] / 2 + (iz + b[2] - (cells - 1) / 2 - 0.25) * a0;
      i++;
    }
  } else {
    // Spread on a coarse grid with jitter so no two particles start overlapping.
    const side = Math.ceil(Math.cbrt(n));
    for (let i = 0; i < n; i++) {
      const c = [i % side, Math.floor(i / side) % side, Math.floor(i / (side * side))];
      for (let k = 0; k < 3; k++) pos[i * 3 + k] = ((c[k] + 0.5 + (rand() - 0.5) * 0.4) / side) * box[k];
    }
  }
  // Maxwell-Boltzmann velocities (Box-Muller), net momentum removed.
  const T = Math.max(o.temperature, 1e-3);
  for (let i = 0; i < n * 3; i++) vel[i] = Math.sqrt(T) * Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());
  for (let k = 0; k < 3; k++) {
    let m = 0;
    for (let i = 0; i < n; i++) m += vel[i * 3 + k];
    for (let i = 0; i < n; i++) vel[i * 3 + k] -= m / n;
  }
  const md: Md = { n, box, pos, vel, types, temperature: o.temperature, time: 0, wallImpulse: 0, impulseTime: 0, opts: o, acc: new Float64Array(n * 3), rules, membraneX: box[0] / 2, membraneV: 0 };
  forces(md);
  return md;
}

// ponytail: O(n²) pair loop, fine up to a few hundred particles; add a cell list if n grows.
export function forces(md: Md) {
  const { n, pos, acc, types, rules } = md;
  acc.fill(0);
  const g = md.opts.gravity ?? 0;
  for (let i = 0; i < n; i++) acc[i * 3 + 1] = -g;
  for (let i = 0; i < n; i++) {
    const xi = pos[i * 3], yi = pos[i * 3 + 1], zi = pos[i * 3 + 2];
    const ri = rules[types[i]];
    for (let j = i + 1; j < n; j++) {
      const dx = xi - pos[j * 3], dy = yi - pos[j * 3 + 1], dz = zi - pos[j * 3 + 2];
      const r2 = dx * dx + dy * dy + dz * dz;
      const rule = ri[types[j]];
      const s2 = rule.sigma * rule.sigma;
      // Attractive pairs cut at 2.5σ; repulsive-only pairs at the potential minimum (WCA).
      const cut = rule.eps > 0 ? CUT : 2 ** (1 / 6);
      if (r2 >= cut * cut * s2) continue;
      const eps = rule.eps > 0 ? rule.eps : 1;
      const ir2 = s2 / Math.max(r2, 0.36 * s2);
      const ir6 = ir2 * ir2 * ir2;
      const f = (24 * eps * ir6 * (2 * ir6 - 1)) / Math.max(r2, 0.36 * s2);
      acc[i * 3] += f * dx; acc[i * 3 + 1] += f * dy; acc[i * 3 + 2] += f * dz;
      acc[j * 3] -= f * dx; acc[j * 3 + 1] -= f * dy; acc[j * 3 + 2] -= f * dz;
    }
  }
}

/** Instantaneous kinetic temperature: 2·KE / (3N) with k_B = 1. */
export function kineticTemperature(md: Md): number {
  let ke = 0;
  for (let i = 0; i < md.n * 3; i++) ke += md.vel[i] * md.vel[i];
  return ke / (3 * md.n);
}

/** Advance by `steps` time steps. `onWall(i)` lets callers react (unused by default). */
export function stepMd(md: Md, steps = 1) {
  const { n, pos, vel, acc, box, types } = md;
  const dt = md.opts.dt ?? 0.005;
  const tau = md.opts.tau ?? 0.2;
  const membrane = md.opts.membrane;
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < n * 3; i++) {
      vel[i] += 0.5 * dt * acc[i];
    }
    // A free membrane moves first; crossings are then judged against where it was and where it is,
    // so it can never sweep past a particle it should block.
    const m0 = md.membraneX;
    if (membrane && md.opts.membraneMass) {
      md.membraneV *= 1 - 2 * dt;
      md.membraneV = Math.max(-3, Math.min(3, md.membraneV));
      md.membraneX += md.membraneV * dt;
      if (md.membraneX < 1.5 || md.membraneX > box[0] - 1.5) { md.membraneX = Math.min(Math.max(md.membraneX, 1.5), box[0] - 1.5); md.membraneV = 0; }
    }
    const m1 = md.membraneX;
    for (let i = 0; i < n; i++) {
      const before = pos[i * 3];
      for (let k = 0; k < 3; k++) {
        const q = i * 3 + k;
        pos[q] += dt * vel[q];
        // Reflective walls; each bounce hands 2mv to the wall (pressure).
        const r = 0.5;
        if (pos[q] < r) { pos[q] = 2 * r - pos[q]; md.wallImpulse += 2 * Math.abs(vel[q]); vel[q] = Math.abs(vel[q]); }
        else if (pos[q] > box[k] - r) { pos[q] = 2 * (box[k] - r) - pos[q]; md.wallImpulse += 2 * Math.abs(vel[q]); vel[q] = -Math.abs(vel[q]); }
      }
      if (membrane && !membrane.includes(types[i])) {
        const side = Math.sign(before - m0) || 1;
        if (side * (pos[i * 3] - m1) <= 0) {
          // Back onto its own side, just clear of the membrane.
          pos[i * 3] = m1 + side * Math.max(Math.abs(m1 - pos[i * 3]), 0.01);
          const M = md.opts.membraneMass;
          if (M) {
            // Elastic collision of a unit-mass particle with the membrane (mass M).
            const v = vel[i * 3], V = md.membraneV;
            vel[i * 3] = ((1 - M) * v + 2 * M * V) / (1 + M);
            md.membraneV = ((M - 1) * V + 2 * v) / (1 + M);
          } else vel[i * 3] = -vel[i * 3];
        }
      }
    }
    forces(md);
    for (let i = 0; i < n * 3; i++) vel[i] += 0.5 * dt * acc[i];
    // Berendsen thermostat: nudge the kinetic temperature toward the target.
    const T = kineticTemperature(md);
    if (T > 0) {
      const lam = Math.sqrt(Math.min(1.5, Math.max(0.5, 1 + (dt / tau) * (md.temperature / T - 1))));
      for (let i = 0; i < n * 3; i++) vel[i] *= lam;
    }
    md.time += dt;
    md.impulseTime += dt;
  }
}

/** Pressure on the walls since the last call: impulse / (time × wall area). */
export function readPressure(md: Md): number {
  const [x, y, z] = md.box;
  const area = 2 * (x * y + y * z + x * z);
  const p = md.impulseTime > 0 ? md.wallImpulse / (md.impulseTime * area) : 0;
  md.wallImpulse = 0;
  md.impulseTime = 0;
  return p;
}

/** Share of particles touching at least `min` neighbours (within 1.5σ): condensed matter. */
export function condensedFraction(md: Md, min = 4): number {
  const { n, pos } = md;
  let c = 0;
  for (let i = 0; i < n; i++) {
    let k = 0;
    for (let j = 0; j < n && k < min; j++) {
      if (i === j) continue;
      const dx = pos[i * 3] - pos[j * 3], dy = pos[i * 3 + 1] - pos[j * 3 + 1], dz = pos[i * 3 + 2] - pos[j * 3 + 2];
      if (dx * dx + dy * dy + dz * dz < 2.25) k++;
    }
    if (k >= min) c++;
  }
  return c / n;
}

/**
 * Phase measured from the motion: a gas when most particles are not touching
 * neighbours, a solid when they stay near their places for `window` time units,
 * otherwise a liquid. Runs its own copy so the caller's state is untouched.
 */
export function measurePhase(md: Md, window = 4): "solid" | "liquid" | "gas" {
  if (condensedFraction(md) < 0.5) return "gas";
  const start = Float64Array.from(md.pos);
  const copy: Md = { ...md, pos: Float64Array.from(md.pos), vel: Float64Array.from(md.vel), acc: Float64Array.from(md.acc) };
  stepMd(copy, Math.round(window / (md.opts.dt ?? 0.005)));
  // How far neighbour pairs drift apart: rotation- and sliding-proof (a crystal may roll).
  let drift = 0, pairs = 0;
  for (let i = 0; i < md.n; i++) for (let j = i + 1; j < md.n; j++) {
    const d0 = Math.hypot(start[i * 3] - start[j * 3], start[i * 3 + 1] - start[j * 3 + 1], start[i * 3 + 2] - start[j * 3 + 2]);
    if (d0 > 1.5) continue;
    const d1 = Math.hypot(copy.pos[i * 3] - copy.pos[j * 3], copy.pos[i * 3 + 1] - copy.pos[j * 3 + 1], copy.pos[i * 3 + 2] - copy.pos[j * 3 + 2]);
    drift += (d1 - d0) ** 2;
    pairs++;
  }
  return pairs && drift / pairs < 0.15 ? "solid" : "liquid";
}

/** The particle box used for states of matter (measured phase limits below hold for it). */
export const MATTER_BOX = { n: 108, box: [10, 10, 10] as [number, number, number], gravity: 0.03 };

/**
 * Model temperature for a real substance. Measured for MATTER_BOX: its
 * 108-particle cluster melts near T* = 0.34 and evaporates near 0.9 (small
 * clusters melt well below the bulk Lennard-Jones triple point of 0.69). The
 * substance's real melting and boiling points map just past those limits, so
 * the phase the particles settle into matches the real substance. Within each
 * phase the scale is linear in kelvin.
 */
export function modelTemperature(tempC: number, meltC: number, boilC: number): number {
  const T = tempC + 273.15, Tm = meltC + 273.15;
  if (T < Tm) return Math.max(0.02, (0.28 * T) / Tm);
  if (!Number.isFinite(boilC)) return Math.min(0.8, 0.4 + ((T - Tm) / 300) * 0.35);
  const Tb = boilC + 273.15;
  if (T < Tb) return 0.4 + ((T - Tm) / (Tb - Tm)) * 0.35;
  return Math.min(6, (1.0 * T) / Tb);
}

/**
 * Up to `steps` steps, stopping early once `budgetMs` has passed, so slow
 * devices run the simulation in slow motion instead of dropping frames.
 */
export function stepWithin(md: Md, steps: number, budgetMs = 2.5): number {
  const t0 = performance.now();
  let done = 0;
  while (done < steps) {
    stepMd(md, 2);
    done += 2;
    if (performance.now() - t0 > budgetMs) break;
  }
  return done;
}
