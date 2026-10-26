// Human physiology models for the Anatomy Lab. Pure functions, no rendering.
//
// Heart: left ventricle as a time-varying elastance, P = E(t)(V − V0)
//   (Suga & Sagawa 1974), with the normalised double-Hill elastance curve of
//   Stergiopulos et al. 1996. It fills from a constant left-atrial pressure
//   through the mitral valve and ejects into a 3-element Windkessel
//   (Westerhof): characteristic resistance Rc, arterial compliance C,
//   systemic resistance Rs. Valves are ideal diodes. Parameters are fitted to
//   a resting adult: 72 bpm gives ~119/80 mmHg, EDV ~116 mL, ESV ~46 mL,
//   stroke volume ~70 mL, ejection fraction ~60 %, cardiac output ~5 L/min.
// Lungs: single-compartment respiratory mechanics (equation of motion of the
//   respiratory system): Pmus = R·V' + V/C, quiet breathing driven by a
//   half-sine inspiratory muscle pressure, passive expiration (I:E = 1:2).
// Nerve: Hodgkin & Huxley 1952 squid giant axon membrane at 6.3 °C, the
//   classic model of the action potential (rest −65 mV convention).
// Reflex: knee-jerk latency from conduction velocities of the fibre types
//   (Purves, Neuroscience, table of peripheral axon classes).
// Digestion: typical transit times of a mixed meal in healthy adults.

import { rk4 } from "./ecology";

// ---------------------------------------------------------------- heart

export interface HeartParams {
  heartRateBpm: number;
  /** Multiplies end-systolic elastance (how hard the muscle squeezes). 1 = healthy resting heart. */
  contractility: number;
  /** Multiplies systemic vascular resistance. */
  resistance: number;
  /** Multiplies arterial stiffness (1 / compliance). */
  arterialStiffness: number;
  /** Left-atrial (filling) pressure, mmHg; venous return raises it. */
  fillingMmHg: number;
}

export const HEART_DEFAULTS: HeartParams = { heartRateBpm: 72, contractility: 1, resistance: 1, arterialStiffness: 1, fillingMmHg: 7.5 };

// Fitted constants (mmHg, mL, s).
const EMAX = 3.1, EMIN = 0.07, V0 = 10, R_MITRAL = 0.006, R_AORTIC = 0.002, RC = 0.04, RS = 1.1, COMPLIANCE = 1.6, P_VENOUS = 4;

/** Normalised elastance, peak 1 at tn ≈ 1 (Stergiopulos 1996). */
export function elastanceCurve(tn: number): number {
  return 1.553 * ((tn / 0.7) ** 1.9 / (1 + (tn / 0.7) ** 1.9)) * (1 / (1 + (tn / 1.17) ** 21.9));
}

export interface HeartBeat {
  /** One steady-state beat, sampled evenly from the start of systole. */
  t: Float32Array;
  lvPressure: Float32Array;
  lvVolume: Float32Array;
  aorticPressure: Float32Array;
  /** Flow out through the aortic valve, mL/s. */
  aorticFlow: Float32Array;
  periodS: number;
  systolic: number;
  diastolic: number;
  meanArterial: number;
  edv: number;
  esv: number;
  strokeVolume: number;
  ejectionFraction: number;
  /** L/min. */
  cardiacOutput: number;
  /** Seconds into the beat: mitral valve closes ("lub"), aortic valve closes ("dub"). */
  lubS: number;
  dubS: number;
}

export function heartBeat(p: HeartParams, samples = 240): HeartBeat {
  const T = 60 / p.heartRateBpm, Tmax = 0.2 + 0.15 * T, dt = 0.0004;
  const emax = EMAX * p.contractility, rs = RS * p.resistance, c = COMPLIANCE / p.arterialStiffness;
  let V = 120, Pc = 85;
  const steps = Math.ceil(T / dt), every = steps / samples;
  const out = { t: new Float32Array(samples), lvPressure: new Float32Array(samples), lvVolume: new Float32Array(samples), aorticPressure: new Float32Array(samples), aorticFlow: new Float32Array(samples) };
  let lub = 0, dub = 0;
  // Settle to a steady beat, then record the last one.
  for (let beat = 0, last = 14; beat <= last; beat++) {
    let mitralWasOpen = true, aorticWasOpen = false;
    for (let i = 0; i < steps; i++) {
      const t = i * dt;
      const Plv = ((emax - EMIN) * elastanceCurve(t / Tmax) + EMIN) * (V - V0);
      const Qm = p.fillingMmHg > Plv ? (p.fillingMmHg - Plv) / R_MITRAL : 0;
      const Qa = Plv > Pc ? (Plv - Pc) / (R_AORTIC + RC) : 0;
      if (beat === last) {
        if (mitralWasOpen && Qm === 0 && t < Tmax && !lub) lub = t;
        if (aorticWasOpen && Qa === 0 && !dub) dub = t;
        const k = Math.floor(i / every);
        if (k < samples && i === Math.ceil(k * every)) {
          out.t[k] = t;
          out.lvPressure[k] = Plv;
          out.lvVolume[k] = V;
          out.aorticPressure[k] = Pc + RC * Qa;
          out.aorticFlow[k] = Qa;
        }
      }
      mitralWasOpen = Qm > 0;
      aorticWasOpen = Qa > 0;
      V += dt * (Qm - Qa);
      Pc += (dt * (Qa - (Pc - P_VENOUS) / rs)) / c;
    }
  }
  let edv = 0, esv = Infinity, sys = -Infinity, dia = Infinity, mean = 0;
  for (let k = 0; k < samples; k++) {
    edv = Math.max(edv, out.lvVolume[k]);
    esv = Math.min(esv, out.lvVolume[k]);
    sys = Math.max(sys, out.aorticPressure[k]);
    dia = Math.min(dia, out.aorticPressure[k]);
    mean += out.aorticPressure[k] / samples;
  }
  const sv = edv - esv;
  return { ...out, periodS: T, systolic: sys, diastolic: dia, meanArterial: mean, edv, esv, strokeVolume: sv, ejectionFraction: sv / edv, cardiacOutput: (sv * p.heartRateBpm) / 1000, lubS: lub, dubS: dub };
}

/**
 * Pulse wave velocity in the aorta, m/s. A healthy young aorta carries the
 * pressure pulse at about 5-6 m/s; stiffer arteries carry it faster
 * (Moens-Korteweg: PWV ∝ √stiffness).
 */
export const pulseWaveVelocity = (stiffness: number) => 5.5 * Math.sqrt(stiffness);

// ---------------------------------------------------------------- lungs

export interface BreathParams {
  breathsPerMin: number;
  /** Peak inspiratory muscle pressure, cmH2O. */
  effortCmH2O: number;
  /** Airway resistance, cmH2O·s/L (healthy adult 2-3; asthma attack 10-30). */
  airwayResistance: number;
  /** Respiratory-system compliance, L/cmH2O (healthy ~0.1; fibrosis lower, emphysema higher). */
  compliance: number;
}

export const BREATH_DEFAULTS: BreathParams = { breathsPerMin: 12, effortCmH2O: 5.5, airwayResistance: 2.5, compliance: 0.1 };

/** Typical adult lung volumes, litres (functional residual capacity is where quiet breathing rests). */
export const LUNG_VOLUMES = { residual: 1.2, frc: 2.4, total: 6.0, vital: 4.8, deadSpace: 0.15 } as const;

export interface BreathCycle {
  t: Float32Array;
  /** Volume above the resting level (FRC), litres. */
  volume: Float32Array;
  /** Airflow, L/s (positive in). */
  flow: Float32Array;
  periodS: number;
  tidalVolume: number;
  /** L/min. */
  minuteVentilation: number;
  alveolarVentilation: number;
  peakFlow: number;
  /** R·C, seconds: how quickly the lungs empty. */
  timeConstant: number;
  /** Air still left in at the end of a breath (dynamic hyperinflation), litres. */
  trapped: number;
}

export function breathCycle(p: BreathParams, samples = 240): BreathCycle {
  const T = 60 / p.breathsPerMin, Ti = T / 3, R = p.airwayResistance, C = p.compliance, dt = Math.min(0.002, (R * C) / 20);
  const pmus = (t: number) => (t < Ti ? p.effortCmH2O * Math.sin((Math.PI * t) / Ti) : 0);
  const steps = Math.ceil(T / dt), every = steps / samples;
  const t = new Float32Array(samples), volume = new Float32Array(samples), flow = new Float32Array(samples);
  let V = 0, start = 0;
  for (let breath = 0, last = 12; breath <= last; breath++) {
    if (breath === last) start = V;
    for (let i = 0; i < steps; i++) {
      const ti = i * dt;
      const q = (pmus(ti) - V / C) / R;
      if (breath === last) {
        const k = Math.floor(i / every);
        if (k < samples && i === Math.ceil(k * every)) {
          t[k] = ti;
          volume[k] = V;
          flow[k] = q;
        }
      }
      [V] = rk4(([v]) => [(pmus(ti) - v / C) / R], [V], dt);
    }
  }
  let max = -Infinity, min = Infinity, peak = 0;
  for (let k = 0; k < samples; k++) {
    max = Math.max(max, volume[k]);
    min = Math.min(min, volume[k]);
    peak = Math.max(peak, flow[k]);
  }
  const tv = max - min;
  return { t, volume, flow, periodS: T, tidalVolume: tv, minuteVentilation: tv * p.breathsPerMin, alveolarVentilation: Math.max(0, tv - LUNG_VOLUMES.deadSpace) * p.breathsPerMin, peakFlow: peak, timeConstant: R * C, trapped: start };
}

/**
 * How far the dome of the diaphragm moves for a breath, cm: about 1.5 cm in
 * quiet breathing and up to ~10 cm in a maximal breath (scales with volume).
 */
export const diaphragmTravelCm = (litres: number) => Math.min(10, (litres / 0.5) * 1.5);

// ---------------------------------------------------------------- nerve

const safe = (x: number, f: (x: number) => number, limit: number) => (Math.abs(x) < 1e-7 ? limit : f(x));
const an = (V: number) => safe(V + 55, (x) => (0.01 * x) / (1 - Math.exp(-x / 10)), 0.1);
const bn = (V: number) => 0.125 * Math.exp(-(V + 65) / 80);
const am = (V: number) => safe(V + 40, (x) => (0.1 * x) / (1 - Math.exp(-x / 10)), 1);
const bm = (V: number) => 4 * Math.exp(-(V + 65) / 18);
const ah = (V: number) => 0.07 * Math.exp(-(V + 65) / 20);
const bh = (V: number) => 1 / (1 + Math.exp(-(V + 35) / 10));

export interface ActionPotential {
  /** ms */
  t: Float32Array;
  /** Membrane potential, mV. */
  v: Float32Array;
  peakMv: number;
  fired: boolean;
  restMv: number;
}

/** HH membrane given a square current pulse (µA/cm²) at t = 1 ms. 20 ms traced. */
export function actionPotential(stimulusUA: number, pulseMs = 1, totalMs = 20, samples = 400): ActionPotential {
  const g = { na: 120, k: 36, l: 0.3 }, E = { na: 50, k: -77, l: -54.387 };
  const inf = (a: number, b: number) => a / (a + b);
  let y = [-65, inf(an(-65), bn(-65)), inf(am(-65), bm(-65)), inf(ah(-65), bh(-65))];
  const dt = 0.01, steps = Math.round(totalMs / dt), every = steps / samples;
  const t = new Float32Array(samples), v = new Float32Array(samples);
  let peak = -Infinity;
  for (let i = 0; i < steps; i++) {
    const time = i * dt, I = time >= 1 && time < 1 + pulseMs ? stimulusUA : 0;
    y = rk4(([V, n, m, h]) => [
      I - g.na * m ** 3 * h * (V - E.na) - g.k * n ** 4 * (V - E.k) - g.l * (V - E.l),
      an(V) * (1 - n) - bn(V) * n,
      am(V) * (1 - m) - bm(V) * m,
      ah(V) * (1 - h) - bh(V) * h,
    ], y, dt);
    peak = Math.max(peak, y[0]);
    const k = Math.floor(i / every);
    if (k < samples && i === Math.ceil(k * every)) {
      t[k] = time;
      v[k] = y[0];
    }
  }
  return { t, v, peakMv: peak, fired: peak > 0, restMv: -65 };
}

export const FIBERS = {
  // Conduction velocity ranges, m/s (Purves, Neuroscience): typical value used.
  A_alpha: { label: "Aα (thick, myelinated)", velocity: 80, range: [80, 120], example: "muscle stretch sensors and motor nerves" },
  A_delta: { label: "Aδ (thin, myelinated)", velocity: 15, range: [5, 30], example: "sharp pain and cold" },
  C: { label: "C (unmyelinated)", velocity: 1, range: [0.5, 2], example: "slow burning pain and warmth" },
} as const;
export type FiberId = keyof typeof FIBERS;

/**
 * Knee-jerk (patellar) reflex: stretch sensor in the thigh → spinal cord
 * (L2-L4 segments) → back to the quadriceps. ponytail: one-way path taken as
 * 0.75 m for an adult; measured latencies are ~18-25 ms with Aα fibres.
 */
export function reflexLatencyMs(fiber: FiberId, pathM = 0.75): { latencyMs: number; afferentMs: number; synapseMs: number; efferentMs: number; muscleMs: number } {
  const v = FIBERS[fiber].velocity;
  const afferentMs = (pathM / v) * 1000, efferentMs = (pathM / (fiber === "A_alpha" ? 70 : v)) * 1000, synapseMs = 0.7, muscleMs = 1;
  return { latencyMs: afferentMs + synapseMs + efferentMs + muscleMs, afferentMs, synapseMs, efferentMs, muscleMs };
}

// ---------------------------------------------------------------- digestion

/**
 * Where a mixed meal is, hour by hour. Typical healthy-adult times; real
 * people vary a lot (fatty meals leave the stomach more slowly).
 * Sources: gastric emptying 2-4 h, small-intestine transit 2-6 h, colonic transit 10-59 h
 * (scintigraphy reference values; Camilleri, Gastroenterology).
 */
export const DIGESTION_STAGES = [
  { id: "mouth", name: "Mouth", hours: 0.01, what: "Chewing and saliva start breaking down starch." },
  { id: "esophagus", name: "Oesophagus", hours: 0.003, what: "Muscle waves (peristalsis) push the food down in about 8 seconds." },
  { id: "stomach", name: "Stomach", hours: 3, what: "Acid and enzymes churn food into a thick liquid (chyme)." },
  { id: "small_intestine", name: "Small intestine", hours: 4, what: "Most nutrients are absorbed into the blood through millions of villi." },
  { id: "large_intestine", name: "Large intestine", hours: 30, what: "Water is absorbed and gut bacteria break down fibre." },
  { id: "rectum", name: "Rectum", hours: 6, what: "Waste is stored until it leaves the body." },
] as const;
export type DigestionStageId = (typeof DIGESTION_STAGES)[number]["id"];
export const DIGESTION_TOTAL_HOURS = DIGESTION_STAGES.reduce((s, d) => s + d.hours, 0);

/** The stage at `hours` after eating and how far through it (0-1). */
export function digestionAt(hours: number): { stage: (typeof DIGESTION_STAGES)[number]; index: number; progress: number; overall: number } {
  let left = Math.max(0, hours);
  for (let i = 0; i < DIGESTION_STAGES.length; i++) {
    const s = DIGESTION_STAGES[i];
    if (left < s.hours || i === DIGESTION_STAGES.length - 1) return { stage: s, index: i, progress: Math.min(1, left / s.hours), overall: Math.min(1, hours / DIGESTION_TOTAL_HOURS) };
    left -= s.hours;
  }
  throw new Error("unreachable");
}

// ---------------------------------------------------------------- gas exchange

/**
 * Blood gases from breathing. Alveolar ventilation equation:
 * PaCO2 = 0.863 · VCO2 / V'A (mmHg; VCO2 mL/min, V'A L/min). Alveolar gas
 * equation: PAO2 = FiO2 (Patm − 47) − PaCO2 / 0.8. Arterial O2 sits a few mmHg
 * below alveolar (A-a gradient ~8 mmHg in a healthy adult). Saturation from
 * Severinghaus 1979. One MET uses ~250 mL O2 and makes ~200 mL CO2 per minute.
 */
export function gasExchange(alveolarVentilationLmin: number, mets = 1) {
  const vco2 = 200 * mets, vo2 = 250 * mets;
  const paco2 = Math.min(150, (0.863 * vco2) / Math.max(0.3, alveolarVentilationLmin));
  const pAo2 = Math.max(0, 0.21 * (760 - 47) - paco2 / 0.8);
  const pao2 = Math.max(0, pAo2 - 8);
  const spo2 = pao2 > 0 ? 1 / (23400 / (pao2 ** 3 + 150 * pao2) + 1) : 0;
  return { vo2, vco2, paco2, pAo2, pao2, spo2 };
}

// ---------------------------------------------------------------- kidneys

/**
 * Daily water balance through the kidneys. They filter ~125 mL of plasma a
 * minute (180 L a day) and reabsorb nearly all of it. Urine carries the day's
 * ~600 mOsm of waste solutes, and kidneys can concentrate urine only up to
 * ~1200 mOsm/kg, so at least 0.5 L must leave each day. Other water: ~0.3 L
 * made by metabolism, ~0.9 L lost through skin, breath and stool.
 */
export const KIDNEY = { gfrMlMin: 125, solutesMosm: 600, maxOsm: 1200, minOsm: 50, metabolicWaterL: 0.3, otherLossL: 0.9, bladderUrgeMl: 400 } as const;
export function kidneyBalance(waterIntakeL: number) {
  const filteredL = (KIDNEY.gfrMlMin * 60 * 24) / 1000;
  const wanted = waterIntakeL + KIDNEY.metabolicWaterL - KIDNEY.otherLossL;
  const urineL = Math.max(KIDNEY.solutesMosm / KIDNEY.maxOsm, Math.min(KIDNEY.solutesMosm / KIDNEY.minOsm, wanted));
  const osm = KIDNEY.solutesMosm / urineL;
  return { filteredL, urineL, reabsorbed: 1 - urineL / filteredL, osm, dehydrated: wanted < urineL, bladderHours: KIDNEY.bladderUrgeMl / ((urineL * 1000) / 24) };
}
