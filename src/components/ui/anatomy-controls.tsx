"use client";

import { useSim, noteFocus } from "@/lib/store";
import { execNow } from "@/lib/player";
import { AnatomyFields, DEFAULT_ANATOMY, type AnatomyState } from "@/lib/experiments";
import { anatomyBreath, anatomyGas, anatomyHeart } from "@/lib/anatomy-values";
import { actionPotential, kidneyBalance, digestionAt, DIGESTION_TOTAL_HOURS, FIBERS, reflexLatencyMs, type FiberId } from "@/lib/engine/physiology";
import { ANATOMY_SYSTEMS, anatomyLooks, DEPTH_LABELS, STRUCTURES, SYSTEM_LABELS, type AnatomySystem, type StructureId } from "@/lib/world/anatomy";
import { Picker, Segmented, type PickerGroup } from "./kit";
import { Caption, Note, Row, Slider, Toggle } from "./controls";

const INSTRUMENTS: [AnatomyState["instrument"], string][] = [["none", "Off"], ["heart", "Heart"], ["breathing", "Lungs"], ["nerve", "Nerve"], ["digestion", "Gut"], ["kidney", "Kidney"]];

const PRESETS: Record<"heart" | "breathing" | "nerve", { name: string; set: Partial<AnatomyState> }[]> = {
  heart: [
    { name: "Resting", set: { heartRateBpm: 72, contractility: 1, resistance: 1, arterialStiffness: 1, fillingMmHg: 7.5 } },
    { name: "Hard exercise", set: { heartRateBpm: 150, contractility: 1.8, resistance: .45, arterialStiffness: 1, fillingMmHg: 14 } },
    { name: "High blood pressure", set: { heartRateBpm: 72, contractility: 1, resistance: 1.6, arterialStiffness: 1.3, fillingMmHg: 8 } },
    { name: "Weak heart muscle", set: { heartRateBpm: 85, contractility: .5, resistance: 1, arterialStiffness: 1, fillingMmHg: 12 } },
    { name: "Older, stiffer arteries", set: { heartRateBpm: 70, contractility: 1, resistance: 1.1, arterialStiffness: 2.2, fillingMmHg: 8 } },
  ],
  breathing: [
    { name: "Quiet breathing", set: { breathsPerMin: 12, effortCmH2O: 5.5, airwayResistance: 2.5, compliance: .1, metabolicRate: 1 } },
    { name: "Running", set: { breathsPerMin: 30, effortCmH2O: 16, airwayResistance: 2.5, compliance: .1, metabolicRate: 6 } },
    { name: "Asthma attack", set: { breathsPerMin: 22, effortCmH2O: 8, airwayResistance: 25, compliance: .1, metabolicRate: 1 } },
    { name: "Stiff lungs (fibrosis)", set: { breathsPerMin: 20, effortCmH2O: 8, airwayResistance: 3, compliance: .04, metabolicRate: 1 } },
  ],
  nerve: [
    { name: "Strong tap", set: { stimulusUA: 15, fiber: "A_alpha" } },
    { name: "Too gentle to fire", set: { stimulusUA: 3, fiber: "A_alpha" } },
    { name: "Slow pain fibre (C)", set: { stimulusUA: 15, fiber: "C" } },
  ],
};

const f0 = (x: number) => String(Math.round(x)), f1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1), f2 = (x: number) => (Math.round(x * 100) / 100).toFixed(2);

export function AnatomyControls() {
  const a = useSim((s) => s.modules.anatomy) ?? DEFAULT_ANATOMY;
  const change = (patch: Partial<AnatomyState>) => {
    const parsed = AnatomyFields.partial().safeParse(patch);
    if (parsed.success) execNow({ op: "set_module", module: "anatomy", set: parsed.data });
  };
  const visible = [...anatomyLooks(a.system, a.depth)].filter(([id, look]) => look === "solid" && id in STRUCTURES).map(([id]) => id as StructureId);
  const partGroups: PickerGroup<StructureId>[] = ANATOMY_SYSTEMS.filter((s) => s !== "all").map((sys) => ({
    name: SYSTEM_LABELS[sys],
    options: (Object.keys(STRUCTURES) as StructureId[]).filter((id) => STRUCTURES[id].system === sys).map((id) => ({ value: id, label: structureName(id), hint: visible.includes(id) ? undefined : "hidden" })),
  }));
  const pick = (id: StructureId) => {
    change({ highlight: a.highlight === id ? null : id });
    noteFocus({ kind: "body_part", label: `${structureName(id)} (Anatomy Lab)`, detail: STRUCTURES[id].what, id });
  };
  const hl = a.highlight ? STRUCTURES[a.highlight] : null;

  return <>
    <Caption>Body system</Caption>
    <Picker<AnatomySystem> label="Body system" value={a.system} onChange={(system) => change({ system })} groups={[{ options: ANATOMY_SYSTEMS.map((s) => ({ value: s, label: SYSTEM_LABELS[s] })) }]} />
    {a.system === "all" && <>
      <Caption>Peel the layers</Caption>
      <Segmented label="Layer depth" value={a.depth} cols={2} options={DEPTH_LABELS.map((l, i) => [i, l] as const)} onChange={(depth) => change({ depth })} />
    </>}
    <Caption>Find a part</Caption>
    <Picker<StructureId> label="Highlight a body part" value={a.highlight} placeholder="Pick a structure…" onChange={pick} groups={partGroups} />
    {hl && a.highlight && <Note><b className="text-ink">{structureName(a.highlight)}.</b> {hl.what}{hl.massG ? ` Typical adult mass: ${hl.massG >= 1000 ? `${f1(hl.massG / 1000)} kg` : `${hl.massG} g`}.` : ""}</Note>}
    <Toggle label="Show labels" checked={a.labels} onChange={(labels) => change({ labels })} />

    <Caption>Live model</Caption>
    <Segmented label="Live model" value={a.instrument} cols={3} options={INSTRUMENTS} onChange={(instrument) => execNow({ op: "show_anatomy", instrument, ...(instrument === "nerve" ? { speed: 1 } : {}) })} />
    {a.instrument === "heart" && <HeartPanel a={a} change={change} />}
    {a.instrument === "breathing" && <BreathPanel a={a} change={change} />}
    {a.instrument === "nerve" && <NervePanel a={a} change={change} />}
    {a.instrument === "digestion" && <DigestionPanel a={a} change={change} />}
    {a.instrument === "kidney" && <KidneyPanel a={a} change={change} />}
    {a.instrument !== "none" && <Toggle label="Playing" checked={a.playing} onChange={(playing) => change({ playing })} />}
    {(a.instrument === "heart" || a.instrument === "breathing") && <Slider label="Playback speed" value={a.speed} min={.05} max={1} step={.05} display={a.speed === 1 ? "Real time" : `${f2(a.speed)}×`} onChange={(speed) => change({ speed })} />}
    <Note>Real adult anatomy (BodyParts3D, DBCLS), life size. Click any part of the body to name it.</Note>
  </>;
}

const structureName = (id: StructureId) => STRUCTURES[id].name;

type Panel = { a: AnatomyState; change: (p: Partial<AnatomyState>) => void };

function Presets({ kind, change }: { kind: keyof typeof PRESETS; change: Panel["change"] }) {
  return <div className="mt-2 flex flex-wrap gap-1.5">{PRESETS[kind].map((p) => <button key={p.name} className="btn rounded-full bg-[var(--fill)] px-3 py-1.5 text-[13px] font-bold" onClick={() => change(p.set)}>{p.name}</button>)}</div>;
}

function HeartPanel({ a, change }: Panel) {
  const h = anatomyHeart(a);
  return <>
    <Presets kind="heart" change={change} />
    <div className="group-rows mt-2">
      <Slider label="Heart rate" value={a.heartRateBpm} min={30} max={200} step={1} display={f0(a.heartRateBpm)} sub="bpm" onChange={(heartRateBpm) => change({ heartRateBpm })} />
      <Slider label="Heart muscle strength" value={a.contractility} min={.3} max={2} step={.05} display={`${f2(a.contractility)}×`} onChange={(contractility) => change({ contractility })} />
      <Slider label="Blood vessel resistance" value={a.resistance} min={.4} max={2.5} step={.05} display={`${f2(a.resistance)}×`} onChange={(resistance) => change({ resistance })} />
      <Slider label="Artery stiffness" value={a.arterialStiffness} min={.5} max={3} step={.05} display={`${f2(a.arterialStiffness)}×`} onChange={(arterialStiffness) => change({ arterialStiffness })} />
      <Slider label="Blood returning (filling pressure)" value={a.fillingMmHg} min={3} max={20} step={.5} display={f1(a.fillingMmHg)} sub="mmHg" onChange={(fillingMmHg) => change({ fillingMmHg })} />
    </div>
    <div className="group-rows mt-2">
      <Row label="Blood pressure" value={`${f0(h.systolic)}/${f0(h.diastolic)} mmHg`} />
      <Row label="Pumped per beat" value={`${f0(h.strokeVolume)} mL`} />
      <Row label="Pumped per minute" value={`${f1(h.cardiacOutput)} L`} />
      <Row label="Ejection fraction" value={`${f0(h.ejectionFraction * 100)}%`} />
    </div>
    <Note>Left ventricle as a time-varying elastance pumping into a 3-element Windkessel. The real system also changes heart rate, strength and vessel width together; here you change one thing at a time. The beat on the body is exaggerated 2.5× so you can see it; the red glow is the pressure pulse travelling down the arteries.</Note>
  </>;
}

function BreathPanel({ a, change }: Panel) {
  const b = anatomyBreath(a), g = anatomyGas(a);
  return <>
    <Presets kind="breathing" change={change} />
    <div className="group-rows mt-2">
      <Slider label="Breaths per minute" value={a.breathsPerMin} min={4} max={40} step={1} display={f0(a.breathsPerMin)} onChange={(breathsPerMin) => change({ breathsPerMin })} />
      <Slider label="Breathing effort" value={a.effortCmH2O} min={1} max={30} step={.5} display={f1(a.effortCmH2O)} sub="cmH₂O" onChange={(effortCmH2O) => change({ effortCmH2O })} />
      <Slider label="Airway resistance" value={a.airwayResistance} min={.5} max={30} step={.5} display={f1(a.airwayResistance)} sub="cmH₂O·s/L" onChange={(airwayResistance) => change({ airwayResistance })} />
      <Slider label="Body activity" value={a.metabolicRate} min={1} max={12} step={.5} display={a.metabolicRate === 1 ? "Resting" : `${f1(a.metabolicRate)} METs`} onChange={(metabolicRate) => change({ metabolicRate })} />
      <Slider label="Lung stretchiness (compliance)" value={a.compliance} min={.02} max={.3} step={.01} display={f2(a.compliance)} sub="L/cmH₂O" onChange={(compliance) => change({ compliance })} />
    </div>
    <div className="group-rows mt-2">
      <Row label="Air per breath" value={`${f0(b.tidalVolume * 1000)} mL`} />
      <Row label="Air per minute" value={`${f1(b.minuteVentilation)} L`} />
      <Row label="Reaching the air sacs" value={`${f1(b.alveolarVentilation)} L/min`} />
      <Row label="Air trapped" value={`${f0(b.trapped * 1000)} mL`} />
      <Row label="Blood oxygen (SpO₂)" value={`${f0(g.spo2 * 100)}%`} />
      <Row label="Blood CO₂" value={`${f0(g.paco2)} mmHg`} />
      <Row label="Oxygen used" value={`${f0(g.vo2)} mL/min`} />
    </div>
    <Note>One-compartment lung mechanics: muscle pressure = resistance × airflow + volume ÷ compliance. Blood gases: alveolar ventilation and alveolar gas equations, Severinghaus saturation curve. Lungs and diaphragm move by the computed volume, life size; the lung outline is rebuilt around the real airway tree.</Note>
  </>;
}

function NervePanel({ a, change }: Panel) {
  const ap = actionPotential(a.stimulusUA), r = reflexLatencyMs(a.fiber);
  return <>
    <Presets kind="nerve" change={change} />
    <div className="group-rows mt-2">
      <Slider label="Stimulus" value={a.stimulusUA} min={0} max={40} step={.5} display={f1(a.stimulusUA)} sub="µA/cm²" onChange={(stimulusUA) => change({ stimulusUA })} />
    </div>
    <Segmented label="Nerve fibre" value={a.fiber} cols={3} options={(Object.keys(FIBERS) as FiberId[]).map((id) => [id, FIBERS[id].label.split(" ")[0]] as const)} onChange={(fiber) => change({ fiber })} />
    <div className="group-rows mt-2">
      <Row label="Action potential" value={ap.fired ? `Fired, peak ${f0(ap.peakMv)} mV` : "Below threshold"} />
      <Row label="Conduction speed" value={`${FIBERS[a.fiber].velocity} m/s`} />
      <Row label="Knee-jerk reflex time" value={`${f0(r.latencyMs)} ms`} />
    </div>
    <Note>Membrane: Hodgkin–Huxley 1952 squid axon model. Reflex: 0.75 m each way at the fibre&apos;s speed, plus one synapse. Leg nerves are not in the 3D data, so the path is drawn, slowed 200×.</Note>
  </>;
}

function KidneyPanel({ a, change }: Panel) {
  const k = kidneyBalance(a.waterIntakeL);
  return <>
    <div className="group-rows mt-2">
      <Slider label="Water drunk per day" value={a.waterIntakeL} min={.5} max={5} step={.1} display={f1(a.waterIntakeL)} sub="L" onChange={(waterIntakeL) => change({ waterIntakeL })} />
      <Row label="Blood filtered" value={`${f0(k.filteredL)} L/day`} />
      <Row label="Taken back into the blood" value={`${f1(k.reabsorbed * 100)}%`} />
      <Row label="Urine made" value={`${f1(k.urineL)} L/day`} />
      <Row label="Urine concentration" value={`${f0(k.osm)} mOsm/kg${k.dehydrated ? " (max)" : ""}`} />
      <Row label="Bladder fills in" value={`about ${f1(k.bladderHours)} h`} />
    </div>
    <Note>Kidneys filter ~125 mL of blood plasma a minute and reabsorb almost all of it. Urine must carry the day&apos;s ~600 mOsm of waste, and can be at most ~1200 mOsm/kg, so even when thirsty you make at least half a litre.</Note>
  </>;
}

function DigestionPanel({ a, change }: Panel) {
  const d = digestionAt(a.hoursAfterMeal);
  return <>
    <div className="group-rows mt-2">
      <Slider label="Hours after eating" value={a.hoursAfterMeal} min={0} max={72} step={.5} display={f1(a.hoursAfterMeal)} sub="h" onChange={(hoursAfterMeal) => change({ hoursAfterMeal, playing: false })} />
      <Row label="The meal is in the" value={d.stage.name.toLowerCase()} />
    </div>
    <Note>{d.stage.what} Typical adult times (about {f0(DIGESTION_TOTAL_HOURS)} h in all); real meals vary a lot. Playing runs 1 hour per second.</Note>
  </>;
}
