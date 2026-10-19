// Population models, integrated with classic 4th-order Runge–Kutta.
//
// Logistic growth: dN/dt = rN(1 − N/K) (Verhulst). Exact solution
//   N(t) = K / (1 + ((K − N₀)/N₀) e^(−rt)), used to check the integrator.
// Predator–prey (Lotka–Volterra): dx/dt = αx − βxy, dy/dt = δxy − γy.
//   It keeps V = δx − γ ln x + βy − α ln y constant, so populations cycle
//   forever around (γ/δ, α/β) with the predator peak lagging the prey peak.

export type Vec = number[];

/** One RK4 step of dy/dt = f(y). */
export function rk4(f: (y: Vec) => Vec, y: Vec, h: number): Vec {
  const k1 = f(y);
  const k2 = f(y.map((v, i) => v + (h / 2) * k1[i]));
  const k3 = f(y.map((v, i) => v + (h / 2) * k2[i]));
  const k4 = f(y.map((v, i) => v + h * k3[i]));
  return y.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

export interface PopulationState {
  model: "logistic" | "predator_prey";
  /** Logistic: growth rate per year, carrying capacity, starting size. */
  r: number;
  K: number;
  N0: number;
  /** Lotka–Volterra rates per year (α prey births, β predation, γ predator deaths, δ predator gain). */
  alpha: number;
  beta: number;
  gamma: number;
  delta: number;
  prey0: number;
  predators0: number;
  /** Years shown on the graph. */
  years: number;
}

// Predator–prey defaults: a snowshoe-hare / lynx style cycle (populations in thousands),
// giving the roughly 10-year period seen in the Hudson's Bay Company fur records.
export const DEFAULT_POPULATION: PopulationState = { model: "predator_prey", r: 0.5, K: 1000, N0: 10, alpha: 0.55, beta: 0.028, gamma: 0.84, delta: 0.026, prey0: 30, predators0: 4, years: 40 };

export const logisticExact = (r: number, K: number, N0: number, t: number) => K / (1 + ((K - N0) / N0) * Math.exp(-r * t));

export interface Series {
  t: Float64Array;
  /** One array per population (logistic: [N]; predator–prey: [prey, predators]). */
  y: Float64Array[];
}

/** Solve the chosen model over its years with `steps` RK4 steps. */
export function solvePopulation(p: PopulationState, steps = 800): Series {
  const h = p.years / steps;
  const f = p.model === "logistic"
    ? ([N]: Vec) => [p.r * N * (1 - N / p.K)]
    : ([x, y]: Vec) => [p.alpha * x - p.beta * x * y, p.delta * x * y - p.gamma * y];
  let y: Vec = p.model === "logistic" ? [p.N0] : [p.prey0, p.predators0];
  const t = new Float64Array(steps + 1);
  const out = y.map(() => new Float64Array(steps + 1));
  out.forEach((a, i) => (a[0] = y[i]));
  for (let s = 1; s <= steps; s++) {
    y = rk4(f, y, h);
    t[s] = s * h;
    out.forEach((a, i) => (a[s] = Math.max(0, y[i])));
  }
  return { t, y: out };
}

/** The conserved quantity of Lotka–Volterra (constant along every exact orbit). */
export function lvInvariant(p: PopulationState, x: number, y: number): number {
  return p.delta * x - p.gamma * Math.log(x) + p.beta * y - p.alpha * Math.log(y);
}

/** Linear-theory period of small cycles, 2π/√(αγ) years (bigger swings take longer). */
export const lvPeriod = (p: PopulationState) => (2 * Math.PI) / Math.sqrt(p.alpha * p.gamma);

/** The real cycle length: average time between prey peaks in the solved curve (or null if under two cycles). */
export function measuredPeriod(s: Series): number | null {
  const y = s.y[0], peaks: number[] = [];
  for (let i = 1; i < y.length - 1; i++) if (y[i] > y[i - 1] && y[i] >= y[i + 1]) peaks.push(s.t[i]);
  return peaks.length >= 2 ? (peaks[peaks.length - 1] - peaks[0]) / (peaks.length - 1) : null;
}

/** Cycle length for the readouts: measured when the graph shows two peaks, else the linear estimate. */
export const cyclePeriod = (p: PopulationState) => measuredPeriod(solvePopulation({ ...p, years: Math.max(p.years, 4 * lvPeriod(p)) }, 4000)) ?? lvPeriod(p);

/** Value at time `t` by linear interpolation in a solved series. */
export function seriesAt(s: Series, k: number, t: number): number {
  const n = s.t.length - 1, T = s.t[n];
  const u = Math.min(Math.max(t / T, 0), 1) * n;
  const i = Math.min(Math.floor(u), n - 1), w = u - i;
  return s.y[k][i] * (1 - w) + s.y[k][i + 1] * w;
}
