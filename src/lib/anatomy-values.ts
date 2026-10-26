// {{placeholders}} for the Anatomy Lab: every number Simu says comes from the
// physiology models or the reference fact sheet, never from the AI.

import type { AnatomyState } from "./experiments";
import { actionPotential, breathCycle, gasExchange, kidneyBalance, diaphragmTravelCm, digestionAt, DIGESTION_TOTAL_HOURS, FIBERS, heartBeat, pulseWaveVelocity, reflexLatencyMs, type BreathCycle, type HeartBeat } from "./engine/physiology";
import { STRUCTURES, type StructureId } from "./world/anatomy";

// The state object changes whenever a setting does, so results cache per state.
const hearts = new WeakMap<AnatomyState, HeartBeat>();
const breaths = new WeakMap<AnatomyState, BreathCycle>();
export function anatomyHeart(s: AnatomyState): HeartBeat {
  let r = hearts.get(s);
  if (!r) hearts.set(s, (r = heartBeat(s)));
  return r;
}
export const anatomyGas = (s: AnatomyState) => gasExchange(anatomyBreath(s).alveolarVentilation, s.metabolicRate);
export function anatomyBreath(s: AnatomyState): BreathCycle {
  let r = breaths.get(s);
  if (!r) breaths.set(s, (r = breathCycle(s)));
  return r;
}

const r0 = (x: number) => String(Math.round(x));
const r1 = (x: number) => String(Math.round(x * 10) / 10);
const r2 = (x: number) => String(Math.round(x * 100) / 100);

export function anatomyValue(name: string, arg: string | undefined, s: AnatomyState | null): string | undefined {
  if (name === "organ_mass") {
    const fact = arg && arg in STRUCTURES ? STRUCTURES[arg as StructureId] : null;
    return fact?.massG ? (fact.massG >= 1000 ? `about ${r1(fact.massG / 1000)} kg` : `about ${fact.massG} g`) : undefined;
  }
  if (!s) return undefined;
  const heart = () => anatomyHeart(s), lungs = () => anatomyBreath(s);
  switch (name) {
    case "heart_rate": return `${r0(s.heartRateBpm)} beats per minute`;
    case "blood_pressure": return `${r0(heart().systolic)}/${r0(heart().diastolic)} mmHg`;
    case "systolic_pressure": return `${r0(heart().systolic)} mmHg`;
    case "diastolic_pressure": return `${r0(heart().diastolic)} mmHg`;
    case "mean_pressure": return `${r0(heart().meanArterial)} mmHg`;
    case "stroke_volume": return `${r0(heart().strokeVolume)} mL`;
    case "cardiac_output": return `${r1(heart().cardiacOutput)} litres per minute`;
    case "ejection_fraction": return `${r0(heart().ejectionFraction * 100)}%`;
    case "end_diastolic_volume": return `${r0(heart().edv)} mL`;
    case "end_systolic_volume": return `${r0(heart().esv)} mL`;
    case "pulse_wave_speed": return `${r1(pulseWaveVelocity(s.arterialStiffness))} m/s`;
    case "beats_per_day": return `${Math.round((s.heartRateBpm * 60 * 24) / 1000) * 1000}`;
    case "tidal_volume": return `${r0(lungs().tidalVolume * 1000)} mL`;
    case "minute_ventilation": return `${r1(lungs().minuteVentilation)} litres per minute`;
    case "alveolar_ventilation": return `${r1(lungs().alveolarVentilation)} litres per minute`;
    case "breath_rate": return `${r0(s.breathsPerMin)} breaths per minute`;
    case "peak_airflow": return `${r2(lungs().peakFlow)} litres per second`;
    case "lung_time_constant": return `${r2(lungs().timeConstant)} s`;
    case "trapped_air": return `${r0(lungs().trapped * 1000)} mL`;
    case "diaphragm_travel": return `about ${r1(diaphragmTravelCm(lungs().tidalVolume))} cm`;
    case "membrane_peak": return `${r0(actionPotential(s.stimulusUA).peakMv)} mV`;
    case "nerve_fired": return actionPotential(s.stimulusUA).fired ? "yes, an action potential fired" : "no, the stimulus was below threshold";
    case "conduction_speed": return `${FIBERS[s.fiber].velocity} m/s`;
    case "reflex_time": return `${r0(reflexLatencyMs(s.fiber).latencyMs)} ms`;
    case "food_location": return digestionAt(s.hoursAfterMeal).stage.name.toLowerCase();
    case "hours_after_meal": return `${r1(s.hoursAfterMeal)} hours`;
    case "digestion_total": return `about ${r0(DIGESTION_TOTAL_HOURS)} hours`;
    case "blood_oxygen": return `${r0(anatomyGas(s).spo2 * 100)}% of haemoglobin carrying oxygen`;
    case "blood_co2": return `${r0(anatomyGas(s).paco2)} mmHg`;
    case "oxygen_pressure": return `${r0(anatomyGas(s).pao2)} mmHg`;
    case "oxygen_used": return `${r0(anatomyGas(s).vo2)} mL per minute`;
    case "co2_made": return `${r0(anatomyGas(s).vco2)} mL per minute`;
    case "urine_per_day": return `${r1(kidneyBalance(s.waterIntakeL).urineL)} litres a day`;
    case "filtered_per_day": return `${r0(kidneyBalance(s.waterIntakeL).filteredL)} litres a day`;
    case "water_reabsorbed": return `${r1(kidneyBalance(s.waterIntakeL).reabsorbed * 100)}%`;
    case "urine_concentration": return `${r0(kidneyBalance(s.waterIntakeL).osm)} mOsm/kg`;
    case "bladder_fill_time": return `about ${r1(kidneyBalance(s.waterIntakeL).bladderHours)} hours`;
  }
  return undefined;
}
