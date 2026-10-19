// Circuit simulator: modified nodal analysis on a grid board. Every part is a
// two-terminal element between neighbouring grid points; wires are short
// copper links. Batteries have internal resistance, bulbs are non-ohmic
// tungsten filaments, LEDs and diodes are piecewise-linear, capacitors charge
// over time (backward Euler), fuses blow and LEDs burn out. All readings come
// from the solve; nothing is scripted.

export const BOARD_COLS = 11; // grid points across (0..10)
export const BOARD_ROWS = 8; // grid points down (0..7)

export const PART_KINDS = ["wire", "battery", "resistor", "bulb", "switch", "led", "diode", "capacitor", "fuse", "motor", "buzzer", "ammeter", "voltmeter", "ldr", "thermistor"] as const;
export type PartKind = (typeof PART_KINDS)[number];
export const LED_COLORS = ["red", "yellow", "green", "blue", "white"] as const;
export type LedColor = (typeof LED_COLORS)[number];

export type Pt = [number, number];

export interface Part {
  id: string;
  kind: PartKind;
  /** Grid points (col, row). Battery: a is +. LED/diode: current flows a → b. Meters read a → b. */
  a: Pt;
  b: Pt;
  /** battery V · resistor Ω · bulb rated V · capacitor µF · fuse rating A · LDR light lux · thermistor °C */
  value?: number;
  closed?: boolean;
  color?: LedColor;
  /** Blown fuse or bulb, burnt-out LED. */
  broken?: boolean;
}

export interface Board {
  v: 2;
  parts: Part[];
  /** Which way the dots move: conventional current (+ → −) or electrons (− → +). */
  flow: "conventional" | "electron";
  readings: boolean;
}

/** What each kind is, its default value and real-world numbers behind it. */
export const PART_INFO: Record<PartKind, { name: string; unit?: string; value?: number; min?: number; max?: number; note: string }> = {
  wire: { name: "Wire", note: "Copper hook-up wire, about 0.01 Ω per segment." },
  battery: { name: "Battery", unit: "V", value: 6, min: 1.5, max: 24, note: "EMF with 0.1 Ω internal resistance, like a real battery: a short circuit draws a big but finite current." },
  resistor: { name: "Resistor", unit: "Ω", value: 100, min: 1, max: 1_000_000, note: "Ohmic: V = IR. Its colour bands show the value." },
  bulb: { name: "Bulb", unit: "V rated", value: 6, min: 1.5, max: 24, note: "Tungsten filament rated at 0.3 A. Its resistance rises as it heats (I ∝ V^0.6), so it is not ohmic. Burns out above 2.5× its rated power." },
  switch: { name: "Switch", note: "Closed: a conductor. Open: a gap, so no current flows through it." },
  led: { name: "LED", note: "Lights only when current flows from + (long leg) to −. Forward voltage depends on colour; burns out above about 50 mA, so it needs a resistor." },
  diode: { name: "Diode", note: "Silicon diode: conducts one way only, dropping about 0.65 V." },
  capacitor: { name: "Capacitor", unit: "µF", value: 100, min: 1, max: 10_000, note: "Stores charge: it charges and discharges over time with time constant τ = RC." },
  fuse: { name: "Fuse", unit: "A", value: 1, min: 0.1, max: 10, note: "Melts and breaks the circuit when the current exceeds its rating." },
  motor: { name: "Motor", note: "DC motor modelled as 4 Ω; it spins faster with more current. (Back-EMF is not modelled.)" },
  buzzer: { name: "Buzzer", note: "Magnetic buzzer, about 200 Ω; sounds above about 1.5 V." },
  ammeter: { name: "Ammeter", note: "Measures current through itself. Connect it in series; it has almost no resistance (0.05 Ω)." },
  voltmeter: { name: "Voltmeter", note: "Measures the voltage between its terminals. Connect it in parallel; it has a very high resistance (10 MΩ)." },
  ldr: { name: "Light sensor (LDR)", unit: "lux", value: 100, min: 1, max: 10_000, note: "Light-dependent resistor: about 10 kΩ at 10 lux, falling as light increases (R ∝ lux^−0.7)." },
  thermistor: { name: "Thermistor", unit: "°C", value: 25, min: -20, max: 120, note: "NTC thermistor, 10 kΩ at 25 °C, β = 3950 K: resistance falls as it warms." },
};

const LED_VF: Record<LedColor, number> = { red: 1.8, yellow: 2.0, green: 2.1, blue: 3.0, white: 3.0 };
const R_WIRE = 0.01, R_SWITCH = 0.01, R_FUSE = 0.05, R_AMMETER = 0.05, R_VOLTMETER = 1e7, R_INTERNAL = 0.1, R_MOTOR = 4, R_BUZZER = 200;
const G_OPEN = 1e-12, G_MIN = 1e-9;
const BULB_I_RATED = 0.3;
const LED_RD = 15, LED_MAX = 0.05, DIODE_VF = 0.65, DIODE_RD = 0.5;

export const ledForwardVoltage = (c: LedColor = "red") => LED_VF[c];
/** Light-dependent resistor (GL55-style): R = 10 kΩ · (lux / 10)^−0.7. */
export const ldrResistance = (lux: number) => 10_000 * Math.pow(Math.max(lux, 0.1) / 10, -0.7);
/** NTC thermistor, β model: R = R25 · e^{β(1/T − 1/298.15)}. */
export const thermistorResistance = (tempC: number) => 10_000 * Math.exp(3950 * (1 / (tempC + 273.15) - 1 / 298.15));
const bulbHotR = (ratedV: number) => ratedV / BULB_I_RATED;

export interface PartResult {
  /** Voltage across the part, V(a) − V(b). */
  v: number;
  /** Current through the part from a to b (for a battery: current leaving its + terminal). */
  i: number;
  /** Power dissipated (for a battery: power delivered). */
  p: number;
  /** Bulb/LED/motor/buzzer output 0..1+ (relative to rated). */
  level: number;
  /** The part just exceeded its limit (fuse, LED, bulb): the app marks it broken. */
  burns?: boolean;
  /** Resistance used in this solve (Ω), for display. */
  r?: number;
}

export interface CircuitResult {
  parts: Record<string, PartResult>;
  /** Node voltages keyed "col,row" (ground = the first battery's − terminal). */
  nodes: Record<string, number>;
  /** Total current leaving all batteries' + terminals. */
  current: number;
  /** Power delivered by the batteries. */
  power: number;
  /** A battery is shorted (almost no resistance outside it). */
  short: boolean;
  warnings: string[];
}

/** Runtime state carried between transient steps (capacitor voltages). */
export interface CircuitState {
  cap: Record<string, number>;
}

const key = (p: Pt) => `${p[0]},${p[1]}`;

/** Solve the linear system A x = b in place (Gaussian elimination, partial pivoting). */
function solveLinear(A: Float64Array, b: Float64Array, n: number): Float64Array {
  for (let c = 0; c < n; c++) {
    let piv = c, best = Math.abs(A[c * n + c]);
    for (let r = c + 1; r < n; r++) {
      const v = Math.abs(A[r * n + c]);
      if (v > best) { best = v; piv = r; }
    }
    if (best < 1e-300) continue;
    if (piv !== c) {
      for (let k = 0; k < n; k++) { const t = A[c * n + k]; A[c * n + k] = A[piv * n + k]; A[piv * n + k] = t; }
      const t = b[c]; b[c] = b[piv]; b[piv] = t;
    }
    const d = A[c * n + c];
    for (let r = c + 1; r < n; r++) {
      const f = A[r * n + c] / d;
      if (!f) continue;
      for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k];
      b[r] -= f * b[c];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r * n + k] * x[k];
    const d = A[r * n + r];
    x[r] = Math.abs(d) < 1e-300 ? 0 : s / d;
  }
  return x;
}

/**
 * Solve the board. With `dt` (seconds) capacitors step forward in time from
 * `state`; without it they are treated as their stored voltage (steady view).
 */
export function solveCircuit(board: Pick<Board, "parts">, state: CircuitState = { cap: {} }, dt?: number): CircuitResult {
  const parts = board.parts;
  const index = new Map<string, number>();
  for (const p of parts) for (const q of [p.a, p.b]) if (!index.has(key(q))) index.set(key(q), index.size);
  const firstBattery = parts.find((p) => p.kind === "battery" && !p.broken);
  const groundKey = firstBattery ? key(firstBattery.b) : index.keys().next().value;
  // Unknowns: every node except ground.
  const unknown = new Map<string, number>();
  for (const k of index.keys()) if (k !== groundKey) unknown.set(k, unknown.size);
  const n = unknown.size;

  // Nonlinear elements keep their operating point between iterations.
  const bulbR = new Map<string, number>(parts.filter((p) => p.kind === "bulb").map((p) => [p.id, bulbHotR(p.value ?? 6) / 4]));
  const diodeOn = new Map<string, boolean>(parts.filter((p) => p.kind === "led" || p.kind === "diode").map((p) => [p.id, true]));

  const stampFor = (p: Part): { g: number; j: number } => {
    // Each part is a conductance g in parallel with a current source j pushing current from b to a inside the part.
    if (p.broken && p.kind !== "wire") return { g: G_OPEN, j: 0 };
    switch (p.kind) {
      case "wire": return { g: 1 / R_WIRE, j: 0 };
      case "battery": return { g: 1 / R_INTERNAL, j: (p.value ?? 6) / R_INTERNAL };
      case "resistor": return { g: 1 / Math.max(p.value ?? 100, 1e-3), j: 0 };
      case "bulb": return { g: 1 / bulbR.get(p.id)!, j: 0 };
      case "switch": return { g: p.closed ? 1 / R_SWITCH : G_OPEN, j: 0 };
      case "fuse": return { g: 1 / R_FUSE, j: 0 };
      case "motor": return { g: 1 / R_MOTOR, j: 0 };
      case "buzzer": return { g: 1 / R_BUZZER, j: 0 };
      case "ammeter": return { g: 1 / R_AMMETER, j: 0 };
      case "voltmeter": return { g: 1 / R_VOLTMETER, j: 0 };
      case "ldr": return { g: 1 / ldrResistance(p.value ?? 100), j: 0 };
      case "thermistor": return { g: 1 / thermistorResistance(p.value ?? 25), j: 0 };
      case "led":
      case "diode": {
        if (!diodeOn.get(p.id)) return { g: G_OPEN, j: 0 };
        const vf = p.kind === "led" ? LED_VF[p.color ?? "red"] : DIODE_VF, rd = p.kind === "led" ? LED_RD : DIODE_RD;
        // On: Vf in series with Rd, conducting a → b: i = (v − Vf)/Rd, i.e. g = 1/Rd and j = Vf/Rd.
        return { g: 1 / rd, j: vf / rd };
      }
      case "capacitor": {
        const c = (p.value ?? 100) * 1e-6, v0 = state.cap[p.id] ?? 0;
        if (!dt) return { g: 1e6, j: 1e6 * v0 }; // steady view: hold its stored voltage
        const g = c / dt;
        return { g, j: g * v0 };
      }
    }
  };

  let x: Float64Array = new Float64Array(n);
  const volt = (q: Pt) => { const u = unknown.get(key(q)); return u === undefined ? 0 : x[u]; };
  const solveOnce = () => {
    const A = new Float64Array(n * n), rhs = new Float64Array(n);
    for (let k = 0; k < n; k++) A[k * n + k] += G_MIN;
    for (const p of parts) {
      const { g, j } = stampFor(p);
      const ia = unknown.get(key(p.a)), ib = unknown.get(key(p.b));
      if (ia !== undefined) { A[ia * n + ia] += g; rhs[ia] += j; }
      if (ib !== undefined) { A[ib * n + ib] += g; rhs[ib] -= j; }
      if (ia !== undefined && ib !== undefined) { A[ia * n + ib] -= g; A[ib * n + ia] -= g; }
    }
    x = solveLinear(A, rhs, n);
  };
  for (let iter = 0; iter < 40; iter++) {
    solveOnce();
    // Update the nonlinear operating points; stop when nothing changes.
    let changed = false;
    for (const p of parts) {
      if (p.broken) continue;
      const v = volt(p.a) - volt(p.b);
      if (p.kind === "bulb") {
        const rated = p.value ?? 6, hot = bulbHotR(rated);
        // Tungsten: I = I_rated (V/V_rated)^0.6 ⇒ R = R_hot (V/V_rated)^0.4, never below the cold resistance (~R_hot/12).
        const target = Math.max(hot / 12, hot * Math.pow(Math.abs(v) / rated, 0.4));
        const cur = bulbR.get(p.id)!, next = 0.5 * cur + 0.5 * target;
        if (Math.abs(next - cur) / cur > 1e-5) changed = true;
        bulbR.set(p.id, next);
      } else if (p.kind === "led" || p.kind === "diode") {
        const vf = p.kind === "led" ? LED_VF[p.color ?? "red"] : DIODE_VF;
        const on = diodeOn.get(p.id)!;
        const want = on ? v >= vf - 1e-9 : v > vf;
        if (want !== on) { diodeOn.set(p.id, want); changed = true; }
      }
    }
    if (!changed) break;
  }
  // One last solve with the final operating points, so every reading comes from the same solution.
  solveOnce();

  const results: Record<string, PartResult> = {};
  let current = 0, power = 0, short = false;
  const warnings: string[] = [];
  for (const p of parts) {
    const v = volt(p.a) - volt(p.b);
    const { g, j } = stampFor(p);
    // Current a → b through the part: g·v − j (j pushes from b to a).
    let i = g * v - j;
    // Below 0.1 µA is the solver's tiny stabilising leakage, not a real current (a voltmeter draws 0.6 µA at 6 V).
    if (Math.abs(i) < 1e-7) i = 0;
    const r: PartResult = { v, i, p: v * i, level: 0, r: g > G_OPEN * 10 ? 1 / g : Infinity };
    if (p.kind === "battery" && !p.broken) {
      r.i = -i; // current leaving the + terminal into the circuit
      r.p = (p.value ?? 6) * r.i - r.i * r.i * R_INTERNAL;
      current += r.i;
      power += r.p;
      // A short: under 0.5 Ω outside the battery (terminal voltage / current).
      const terminal = (p.value ?? 6) - r.i * R_INTERNAL;
      if (r.i > 0.5 && terminal / r.i < 0.5) short = true;
    } else if (p.kind === "bulb" && !p.broken) {
      const pr = (p.value ?? 6) * BULB_I_RATED;
      r.level = Math.abs(r.p) / pr;
      if (r.level > 2.5) r.burns = true;
    } else if (p.kind === "led" && !p.broken) {
      r.level = Math.max(0, i) / 0.02; // 20 mA = full brightness
      if (i > LED_MAX) r.burns = true;
    } else if (p.kind === "motor" || p.kind === "buzzer") {
      r.level = p.kind === "motor" ? Math.abs(i) / 1.5 : Math.abs(v) > 1.5 ? 1 : 0;
    } else if (p.kind === "fuse" && !p.broken && Math.abs(i) > (p.value ?? 1)) {
      r.burns = true;
    }
    results[p.id] = r;
  }
  if (dt) for (const p of parts) if (p.kind === "capacitor") state.cap[p.id] = results[p.id].v;
  const nodes: Record<string, number> = {};
  for (const k of index.keys()) { const u = unknown.get(k); nodes[k] = u === undefined ? 0 : x[u]; }
  if (short) warnings.push("Short circuit: almost nothing resists the current, so the battery pushes a huge current and heats up.");
  return { parts: results, nodes, current, power, short, warnings };
}

// ---------- building boards ----------

let seq = 0;
const nid = (kind: PartKind) => `${kind}_${++seq}`;

export const inBoard = (p: Pt) => Number.isInteger(p[0]) && Number.isInteger(p[1]) && p[0] >= 0 && p[0] < BOARD_COLS && p[1] >= 0 && p[1] < BOARD_ROWS;
export const adjacent = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
const sameEdge = (p: Part, a: Pt, b: Pt) => (key(p.a) === key(a) && key(p.b) === key(b)) || (key(p.a) === key(b) && key(p.b) === key(a));

/** Unit wire segments along a straight or L-shaped run of grid points. */
export function wireRun(points: Pt[]): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  for (let i = 1; i < points.length; i++) {
    let [c, r] = points[i - 1];
    const [c2, r2] = points[i];
    // Horizontal first, then vertical.
    while (c !== c2) { const n: Pt = [c + Math.sign(c2 - c), r]; out.push([[c, r], n]); c = n[0]; }
    while (r !== r2) { const n: Pt = [c, r + Math.sign(r2 - r)]; out.push([[c, r], n]); r = n[1]; }
  }
  return out;
}

/** Place a part (or a run of wire), replacing whatever sat on the same edges. Returns the new parts list. */
export function placePart(parts: Part[], part: Omit<Part, "id"> & { id?: string }): Part[] {
  if (!inBoard(part.a) || !inBoard(part.b)) return parts;
  if (part.kind === "wire" && !adjacent(part.a, part.b)) {
    const segs = wireRun([part.a, part.b]);
    return segs.reduce((acc, [a, b], i) => placePart(acc, { ...part, a, b, id: part.id ? (i ? `${part.id}_${i}` : part.id) : undefined }), parts);
  }
  if (!adjacent(part.a, part.b)) return parts;
  const id = part.id ?? nid(part.kind);
  const base: Part = { ...part, id, value: part.value ?? PART_INFO[part.kind].value };
  if (part.kind === "switch" && part.closed === undefined) base.closed = true;
  if (part.kind === "led" && !part.color) base.color = "red";
  return [...parts.filter((p) => p.id !== id && !sameEdge(p, part.a, part.b)), base];
}

type Spec = [PartKind, Pt, Pt, Partial<Part>?];

/** Place a list of parts, then fill the given runs of grid points with wire wherever no part sits. */
function make(specs: Spec[], ...runs: Pt[][]): Part[] {
  let parts = specs.reduce<Part[]>((acc, [kind, a, b, extra]) => placePart(acc, { kind, a, b, ...extra }), []);
  for (const run of runs) for (const [a, b] of wireRun(run)) if (!parts.some((p) => sameEdge(p, a, b))) parts = placePart(parts, { kind: "wire", a, b });
  return parts;
}

const BOX: Pt[] = [[1, 1], [9, 1], [9, 6], [1, 6], [1, 1]];
const BATTERY: Spec = ["battery", [1, 3], [1, 4]];
/** A voltmeter-ready divider on the right edge: top part (9,2)-(9,3), bottom part (9,4)-(9,5), voltmeter across the bottom one. */
const divider = (top: Spec, bottom: Spec) =>
  make([BATTERY, top, bottom, ["voltmeter", [7, 4], [7, 5]]], [[1, 3], [1, 1], [9, 1], [9, 2]], [[9, 3], [9, 4]], [[9, 5], [9, 6], [1, 6], [1, 4]], [[9, 4], [7, 4]], [[9, 5], [7, 5]]);

/** Bulbs one after another on a single loop (1–4 bulbs). */
export function seriesBulbs(n = 2): Part[] {
  const slots: [Pt, Pt][] = [[[3, 1], [4, 1]], [[6, 1], [7, 1]], [[9, 2], [9, 3]], [[9, 4], [9, 5]]];
  return make([BATTERY, ["switch", [4, 6], [5, 6]], ...slots.slice(0, Math.max(1, Math.min(4, n))).map(([a, b]): Spec => ["bulb", a, b])], BOX);
}

/** Each bulb on its own rung between two rails (1–4 bulbs). */
export function parallelBulbs(n = 3): Part[] {
  const cols = [3, 5, 7, 9].slice(0, Math.max(1, Math.min(4, n)));
  const last = cols[cols.length - 1];
  return make(
    [BATTERY, ["switch", [1, 5], [1, 6]], ...cols.map((c): Spec => ["bulb", [c, 3], [c, 4]])],
    [[1, 3], [1, 1], [last, 1]], [[1, 4], [1, 5]], [[1, 6], [last, 6]], ...cols.flatMap((c) => [[[c, 1], [c, 3]], [[c, 4], [c, 6]]] as Pt[][]),
  );
}

export const CIRCUIT_PRESETS = {
  series_bulbs: { title: "Series bulbs", build: () => seriesBulbs(2) },
  parallel_bulbs: { title: "Parallel bulbs", build: () => parallelBulbs(3) },
  series_parallel: {
    title: "Series + parallel",
    build: () => make([BATTERY, ["bulb", [3, 1], [4, 1]], ["bulb", [7, 3], [7, 4]], ["bulb", [9, 3], [9, 4]]], [[1, 3], [1, 1], [3, 1]], [[4, 1], [9, 1], [9, 3]], [[7, 1], [7, 3]], [[1, 4], [1, 6], [9, 6], [9, 4]], [[7, 4], [7, 6]]),
  },
  led_resistor: { title: "LED with resistor", build: () => make([BATTERY, ["resistor", [4, 1], [5, 1], { value: 220 }], ["led", [9, 2], [9, 3], { color: "red" }], ["switch", [5, 6], [4, 6]]], BOX) },
  meters: {
    title: "Ammeter and voltmeter",
    build: () => make([BATTERY, ["ammeter", [3, 1], [4, 1]], ["resistor", [6, 1], [7, 1], { value: 20 }], ["voltmeter", [6, 3], [7, 3]]], [[1, 3], [1, 1], [3, 1]], [[4, 1], [6, 1]], [[7, 1], [9, 1], [9, 6], [1, 6], [1, 4]], [[6, 1], [6, 3]], [[7, 1], [7, 3]]),
  },
  potential_divider: { title: "Potential divider", build: () => divider(["resistor", [9, 2], [9, 3], { value: 1000 }], ["resistor", [9, 4], [9, 5], { value: 2000 }]) },
  rc_charging: {
    title: "Capacitor charging (RC)",
    build: () => make([BATTERY, ["switch", [3, 1], [4, 1], { closed: false }], ["resistor", [6, 1], [7, 1], { value: 10_000 }], ["capacitor", [9, 3], [9, 4], { value: 100 }], ["voltmeter", [7, 3], [7, 4]]], [[1, 3], [1, 1], [3, 1]], [[4, 1], [6, 1]], [[7, 1], [9, 1], [9, 3]], [[9, 4], [9, 6], [1, 6], [1, 4]], [[9, 3], [7, 3]], [[9, 4], [7, 4]]),
  },
  short_circuit: {
    title: "Short circuit and fuse",
    build: () => make([BATTERY, ["fuse", [3, 1], [4, 1], { value: 1 }], ["bulb", [9, 3], [9, 4]], ["switch", [7, 3], [7, 4], { closed: false }]], [[1, 3], [1, 1], [3, 1]], [[4, 1], [9, 1], [9, 3]], [[9, 4], [9, 6], [1, 6], [1, 4]], [[7, 1], [7, 3]], [[7, 4], [7, 6]]),
  },
  motor: { title: "Motor and switch", build: () => make([BATTERY, ["motor", [5, 1], [6, 1]], ["switch", [5, 6], [4, 6]]], BOX) },
  diode: { title: "Diode: one way only", build: () => make([BATTERY, ["diode", [3, 1], [4, 1]], ["bulb", [9, 3], [9, 4]]], BOX) },
  light_sensor: { title: "Light sensor (LDR)", build: () => divider(["resistor", [9, 2], [9, 3], { value: 10_000 }], ["ldr", [9, 4], [9, 5], { value: 100 }]) },
  thermistor: { title: "Temperature sensor (thermistor)", build: () => divider(["resistor", [9, 2], [9, 3], { value: 10_000 }], ["thermistor", [9, 4], [9, 5], { value: 25 }]) },
  and_switches: { title: "Two switches in series (AND)", build: () => make([BATTERY, ["switch", [3, 1], [4, 1]], ["switch", [6, 1], [7, 1], { closed: false }], ["bulb", [9, 3], [9, 4]]], BOX) },
  or_switches: {
    title: "Two switches in parallel (OR)",
    build: () => make([BATTERY, ["switch", [4, 1], [5, 1], { closed: false }], ["switch", [4, 3], [5, 3], { closed: false }], ["bulb", [9, 3], [9, 4]]], [[1, 3], [1, 1], [4, 1]], [[5, 1], [9, 1], [9, 3]], [[3, 1], [3, 3], [4, 3]], [[5, 3], [6, 3], [6, 1]], [[9, 4], [9, 6], [1, 6], [1, 4]]),
  },
  empty: { title: "Empty board", build: () => [] as Part[] },
} as const satisfies Record<string, { title: string; build: () => Part[] }>;
export type CircuitPreset = keyof typeof CIRCUIT_PRESETS;
export const CIRCUIT_PRESET_IDS = Object.keys(CIRCUIT_PRESETS) as [CircuitPreset, ...CircuitPreset[]];

export function presetBoard(id: CircuitPreset, flow: Board["flow"] = "conventional"): Board {
  return { v: 2, parts: CIRCUIT_PRESETS[id].build(), flow, readings: true };
}

/** Older saves (and build_circuit) describe a series/parallel loop of bulbs: turn them into a board. */
export function legacyBoard(c: { layout: "series" | "parallel"; voltage: number; bulbs: number; closed: boolean; broken: number[] }): Board {
  const parts = c.layout === "series" ? seriesBulbs(c.bulbs) : parallelBulbs(c.bulbs);
  const bulbs = parts.filter((p) => p.kind === "bulb");
  return {
    v: 2, flow: "conventional", readings: true,
    parts: parts.map((p) => {
      if (p.kind === "battery") return { ...p, value: c.voltage };
      if (p.kind === "switch") return { ...p, closed: c.closed };
      return c.broken.includes(bulbs.indexOf(p)) ? { ...p, broken: true } : p;
    }),
  };
}

/** Resistor colour bands (4-band code) for a value in ohms. */
export function resistorBands(ohms: number): string[] {
  const colors = ["#000000", "#8b4513", "#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#8e24aa", "#9e9e9e", "#ffffff"];
  const exp = Math.max(0, Math.floor(Math.log10(Math.max(ohms, 10))) - 1);
  const digits = Math.round(ohms / 10 ** exp);
  const d1 = Math.floor(digits / 10) % 10, d2 = digits % 10;
  return [colors[d1], colors[d2], colors[Math.min(exp, 9)], "#c9a227"];
}

/** A part's setting in words, e.g. "220 Ω", "100 µF", "6 V bulb". */
export function formatPartValue(kind: PartKind, value = PART_INFO[kind].value ?? 0): string {
  const n = (v: number, d = 1) => (Number.isInteger(v) ? String(v) : v.toFixed(d));
  switch (kind) {
    case "resistor": return value >= 1e6 ? `${n(value / 1e6)} MΩ` : value >= 1e3 ? `${n(value / 1e3)} kΩ` : `${n(value)} Ω`;
    case "capacitor": return value >= 1000 ? `${n(value / 1000)} mF` : `${n(value)} µF`;
    case "battery": return `${n(value)} V`;
    case "bulb": return `${n(value)} V bulb`;
    case "fuse": return `${n(value)} A fuse`;
    case "ldr": return `${Math.round(value)} lux`;
    case "thermistor": return `${n(value)} °C`;
    default: return "";
  }
}
