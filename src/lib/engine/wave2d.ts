// A 2D wave field solved with finite differences: u_tt + σ·u_t = c²·∇²u.
// It animates ripples in the tank and signals spreading through a floor plan.
// A speed per cell gives refraction, rigid cells reflect, damping absorbs, and
// a soft "beach" around the border stops the edges from reflecting.

export interface Driver {
  /** Cell indices moved up and down together (a dipper, a bar, an antenna). */
  cells: number[];
  amplitude: number;
  frequency: number;
  phase?: number;
}

export class WaveField {
  readonly nx: number;
  readonly ny: number;
  readonly dx: number;
  readonly speed: Float32Array;
  readonly damping: Float32Array;
  readonly rigid: Uint8Array;
  /** Time-averaged u² (where the waves are strong, and where they cancel). */
  readonly intensity: Float32Array;
  u: Float32Array;
  prev: Float32Array;
  private next: Float32Array;
  time = 0;

  constructor(nx: number, ny: number, dx: number, speed = 1) {
    this.nx = nx;
    this.ny = ny;
    this.dx = dx;
    const n = nx * ny;
    this.speed = new Float32Array(n).fill(speed);
    this.damping = new Float32Array(n);
    this.rigid = new Uint8Array(n);
    this.intensity = new Float32Array(n);
    this.u = new Float32Array(n);
    this.prev = new Float32Array(n);
    this.next = new Float32Array(n);
  }

  index(i: number, j: number): number {
    return j * this.nx + i;
  }

  /** Damping that ramps up toward the border, so waves fade out there instead of bouncing back. */
  addBeach(cells: number) {
    const { nx, ny } = this;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const edge = Math.min(i, j, nx - 1 - i, ny - 1 - j);
        if (edge >= cells) continue;
        const k = this.index(i, j);
        const sigmaMax = (18 * this.speed[k]) / (cells * this.dx);
        this.damping[k] = Math.max(this.damping[k], sigmaMax * ((cells - edge) / cells) ** 2);
      }
    }
  }

  /** Largest time step that stays stable (Courant condition, with a margin). */
  stableDt(): number {
    let c = 1e-9;
    for (let k = 0; k < this.speed.length; k++) if (this.speed[k] > c) c = this.speed[k];
    return (0.6 * this.dx) / (c * Math.SQRT2);
  }

  reset() {
    this.u.fill(0);
    this.prev.fill(0);
    this.next.fill(0);
    this.intensity.fill(0);
    this.time = 0;
  }

  step(dt: number, drivers: Driver[] = []) {
    const { nx, ny, u, prev, next, speed, damping, rigid } = this;
    const k2 = (dt / this.dx) ** 2;
    for (let j = 1; j < ny - 1; j++) {
      let idx = j * nx + 1;
      for (let i = 1; i < nx - 1; i++, idx++) {
        if (rigid[idx]) {
          next[idx] = 0;
          continue;
        }
        const lap = u[idx - 1] + u[idx + 1] + u[idx - nx] + u[idx + nx] - 4 * u[idx];
        const c = speed[idx];
        const s = damping[idx] * dt * 0.5;
        next[idx] = (2 * u[idx] - (1 - s) * prev[idx] + c * c * k2 * lap) / (1 + s);
      }
    }
    this.time += dt;
    // Drivers ease in over the first half second so the start doesn't splash.
    const ease = Math.min(1, this.time / 0.6);
    for (const d of drivers) {
      const v = d.amplitude * ease * Math.sin(2 * Math.PI * d.frequency * this.time + (d.phase ?? 0));
      for (const c of d.cells) next[c] = v;
    }
    this.prev = u;
    this.u = next;
    this.next = prev;
  }

  /** Runs `seconds` of simulated time (at most `maxSteps` steps; slower than real time if it would need more). */
  advance(seconds: number, drivers: Driver[] = [], maxSteps = 8): number {
    if (!(seconds > 0)) return 0;
    const dtMax = this.stableDt();
    const steps = Math.min(maxSteps, Math.max(1, Math.ceil(seconds / dtMax)));
    const dt = Math.min(dtMax, seconds / steps);
    for (let s = 0; s < steps; s++) this.step(dt, drivers);
    const a = 1 - Math.exp(-(steps * dt) / 1.2);
    const { u, intensity } = this;
    for (let k = 0; k < u.length; k++) intensity[k] += (u[k] * u[k] - intensity[k]) * a;
    return steps;
  }

  /** Sum of u² over a rectangle of cells (for measuring how much wave got somewhere). */
  energyIn(i0: number, j0: number, i1: number, j1: number): number {
    let e = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) e += this.u[this.index(i, j)] ** 2;
    return e;
  }
}

/** Indices of the cells inside a disc (grid units). */
export function discCells(field: WaveField, ci: number, cj: number, r: number): number[] {
  const out: number[] = [];
  const R = Math.max(0.5, r);
  for (let j = Math.floor(cj - R); j <= Math.ceil(cj + R); j++) {
    for (let i = Math.floor(ci - R); i <= Math.ceil(ci + R); i++) {
      if (i < 1 || j < 1 || i >= field.nx - 1 || j >= field.ny - 1) continue;
      if ((i - ci) ** 2 + (j - cj) ** 2 <= R * R) out.push(field.index(i, j));
    }
  }
  return out;
}

/** Marks the cells along a thick segment (grid units) with `fn`. */
export function paintSegment(field: WaveField, a: [number, number], b: [number, number], halfWidth: number, fn: (k: number) => void) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-9;
  const i0 = Math.max(1, Math.floor(Math.min(a[0], b[0]) - halfWidth - 1));
  const i1 = Math.min(field.nx - 2, Math.ceil(Math.max(a[0], b[0]) + halfWidth + 1));
  const j0 = Math.max(1, Math.floor(Math.min(a[1], b[1]) - halfWidth - 1));
  const j1 = Math.min(field.ny - 2, Math.ceil(Math.max(a[1], b[1]) + halfWidth + 1));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const t = Math.max(0, Math.min(1, ((i - a[0]) * (b[0] - a[0]) + (j - a[1]) * (b[1] - a[1])) / (len * len)));
      const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
      if (Math.hypot(i - px, j - py) <= halfWidth) fn(field.index(i, j));
    }
  }
}
