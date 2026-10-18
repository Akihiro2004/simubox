"use client";

import { useState } from "react";
import { useSim } from "@/lib/store";
import { execNow } from "@/lib/player";
import { DEFAULT_MECHANICS, DEFAULT_MATH, MathFields, MechanicsFields, MATH_MODES, MECHANICS_MODES, SCHOOL_UNITS, UNIT_IDS, type MathState, type MechanicsState } from "@/lib/experiments";
import { mechanicsAt, mechanicsLimit, MECHANICS_LABELS } from "@/lib/engine/mechanics";
import { schoolMath, mathNumber as f } from "@/lib/engine/school-math";

function Field({ label, value, min, max, step = .1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  const [edit, setEdit] = useState({ value, draft: String(value) });
  if (edit.value !== value) setEdit({ value, draft: String(value) });
  return <label className="flex items-center justify-between gap-3 px-3 py-2 text-[13px] font-bold"><span>{label}</span><input className="w-[90px] rounded-lg border border-black/10 bg-white/60 px-2 py-1 text-right tabular-nums outline-offset-2" type="number" aria-label={label} min={min} max={max} step={step} value={edit.draft}
    onChange={e => setEdit({ value, draft: e.currentTarget.value })}
    onBlur={e => { const v = e.currentTarget.valueAsNumber; if (Number.isFinite(v) && v >= min && v <= max) onChange(v); setEdit({ value, draft: String(value) }); }}
    onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} /></label>;
}
function Readout({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3 px-3 py-1.5 text-[12px]"><span className="text-ink-3">{label}</span><span className="text-right font-bold tabular-nums">{value}</span></div>;
}

const mechanicsPresets: { name: string; set: Partial<MechanicsState> }[] = [
  { name: "Accelerate a cart", set: { mode: "force" } },
  { name: "Same push, heavier cart", set: { mode: "force", massKg: 8 } },
  { name: "Inertia: keep coasting", set: { mode: "force", forceN: 0, velocity: 2 } },
  { name: "Balanced opposing forces", set: { mode: "force", forceN: 4, opposingN: 4, velocity: 2 } },
  { name: "Friction stops a cart", set: { mode: "force", forceN: 0, friction: .2, velocity: 5 } },
  { name: "Elastic collision", set: { mode: "collision", velocity: 2, velocity2: -1 } },
  { name: "Carts stick together", set: { mode: "collision", velocity: 2, velocity2: -1, restitution: 0 } },
  { name: "Heavy cart meets light cart", set: { mode: "collision", velocity: 2, velocity2: 0, massKg: 8 } },
  { name: "Impulse: a short push", set: { mode: "impulse", contactS: .2 } },
  { name: "Impulse: same change, longer push", set: { mode: "impulse", contactS: 1 } },
  { name: "Gravity on a ramp", set: { mode: "ramp", forceN: 0, friction: .1 } },
  { name: "Hooke spring and energy", set: { mode: "spring" } },
  { name: "Small-angle pendulum", set: { mode: "pendulum", durationS: 8 } },
];

export function MechanicsControls() {
  const s = useSim(state => state.modules.mechanics) ?? DEFAULT_MECHANICS;
  const r = mechanicsAt(s);
  const change = (patch: Partial<MechanicsState>) => {
    const parsed = MechanicsFields.partial().safeParse(patch);
    if (parsed.success) execNow({ op: "set_module", module: "mechanics", set: parsed.data });
  };
  const field = (key: keyof MechanicsState, label: string, min: number, max: number, step = .1) => <Field key={key} label={label} min={min} max={max} step={step} value={s[key] as number} onChange={v => change({ [key]: v })} />;
  const collide = s.mode === "collision", pendulum = s.mode === "pendulum";
  return <>
    <label className="mb-3 block text-[12px] font-bold text-ink-3">Try an experiment<select aria-label="Mechanics experiment" defaultValue="" className="mt-1 w-full rounded-xl bg-white/60 p-2 text-ink" onChange={e => { const preset = mechanicsPresets[Number(e.target.value)]; if (preset) execNow({ op: "show_mechanics", ...DEFAULT_MECHANICS, ...preset.set }); }}><option value="" disabled>Choose a ready-made setup</option>{mechanicsPresets.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}</select></label>
    <label className="block text-[12px] font-bold text-ink-3">Instrument<select aria-label="Mechanics mode" className="mt-1 w-full rounded-xl bg-white/60 p-2 text-ink" value={s.mode} onChange={e => { const mode = e.target.value as MechanicsState["mode"]; execNow({ op: "show_mechanics", mode, ...(mode === "collision" ? { velocity: 2, velocity2: -1 } : mode === "ramp" ? { forceN: 0 } : {}) }); }}>{MECHANICS_MODES.map(mode => <option key={mode} value={mode}>{MECHANICS_LABELS[mode]}</option>)}</select></label>
    <div className="group-rows mt-3">
      {field("massKg", "Cart / bob mass (kg)", .1, 50)}
      {collide && field("mass2Kg", "Blue cart mass (kg)", .1, 50)}
      {!pendulum && field("velocity", "Initial velocity (m/s)", -20, 20)}
      {collide && field("velocity2", "Blue velocity (m/s)", -20, 20)}
      {collide && field("restitution", "Restitution (0 sticks, 1 elastic)", 0, 1, .05)}
      {(s.mode === "force" || s.mode === "ramp") && <>{field("forceN", "Applied force +right/down (N)", -100, 100)}{field("opposingN", "Opposing force (N)", -100, 100)}{field("friction", "Friction coefficient", 0, 1, .01)}</>}
      {s.mode === "ramp" && field("angleDeg", "Ramp angle (°)", 0, 60, 1)}
      {s.mode === "impulse" && <>{field("impulseNs", "Signed impulse (N·s)", -50, 50)}{field("contactS", "Contact time (s)", .05, 2, .05)}</>}
      {s.mode === "spring" && <>{field("springK", "Spring stiffness (N/m)", .1, 100)}{field("displacementM", "Initial extension (m)", -2, 2)}</>}
      {pendulum && <>{field("lengthM", "Pendulum length (m)", .5, 3)}{field("pendulumDeg", "Initial angle (°)", -15, 15, 1)}</>}
      {field("gravity", "Gravity (m/s²)", 0, 100, .01)}
      {field("durationS", "Observe until time (s)", .1, 10)}
    </div>
    <div className="mt-3 flex gap-2"><button className="btn btn-quiet flex-1 rounded-full px-3 py-2 text-[12px] font-bold" onClick={() => change({ playing: !s.playing })}>{s.playing ? "Hold at final time" : "Play from start"}</button><button className="btn btn-accent rounded-full px-3 py-2 text-[12px] font-bold" onClick={() => change({ playing: true })}>Replay</button></div>
    <p className="mt-3 text-[12px] font-extrabold">At t = {s.durationS} s</p>
    <div className="group-rows mt-1">
      <Readout label={pendulum ? "Tangential speed (signed)" : "Velocity"} value={`${f(r.velocity)} m/s`} />
      <Readout label={pendulum ? "Tangential acceleration" : "Acceleration"} value={`${f(r.acceleration)} m/s²`} />
      {!pendulum && <><Readout label="Net force" value={`${f(r.netForce)} N`} /><Readout label="Momentum" value={`${f(r.momentum)} kg·m/s`} /><Readout label="Impulse on orange cart" value={`${f(r.impulse)} N·s`} /></>}
      {collide && <><Readout label="Blue velocity" value={`${f(r.velocity2)} m/s`} /><Readout label="Total momentum" value={`${f(r.momentum + r.momentum2)} kg·m/s`} /><Readout label="Impulse on blue cart" value={`${f(r.impulse2)} N·s`} /><Readout label="Contact" value={r.collisionTime === null ? "Carts are not approaching" : r.collided ? `At ${f(r.collisionTime)} s` : `Will occur at ${f(r.collisionTime)} s`} /></>}
      <Readout label="Kinetic energy" value={`${f(r.kinetic)} J`} />
      {!pendulum && !collide && <Readout label="Net work (Δ kinetic energy)" value={`${f(r.work)} J`} />}
      {(s.mode === "spring" || pendulum || s.mode === "ramp") && <Readout label="Potential energy (relative)" value={`${f(r.potential)} J`} />}
      {r.period !== null && <Readout label="Period" value={`${f(r.period)} s`} />}
    </div>
    <p className="mt-3 text-[11px] leading-relaxed text-ink-3">{mechanicsLimit(s.mode)} Track arrows and cart positions are scaled for readability. Readouts above use the chosen final time; on-track readouts follow playback.</p>
  </>;
}

export const MATH_LABELS: Record<MathState["mode"], string> = {
  place_value: "Place value & decimals", measurement: "Measurement & units", angles: "Angles & turns",
  number_line: "Number line & signed numbers", arithmetic: "Arithmetic & powers", fractions: "Fractions", ratio: "Ratios & proportion", percent: "Percentages",
  equation: "Linear equations", inequality: "Linear inequalities", quadratic: "Quadratic equations", linear_system: "Simultaneous equations", functions: "Functions & graphs",
  geometry: "2D & 3D geometry", trigonometry: "Trigonometry & unit circle", statistics: "Statistics", probability: "Probability", sequence: "Sequences", transform: "Coordinate transformations",
};

function DataInput({ value, label, onChange }: { value: number[]; label: string; onChange: (value: number[]) => void }) {
  const [draft, setDraft] = useState(value.join(", "));
  return <form onSubmit={e => { e.preventDefault(); const nums = draft.split(/[,;\s]+/).filter(Boolean).map(Number); if (nums.length && nums.every(Number.isFinite)) onChange(nums); }} className="mt-3"><label className="text-[12px] font-bold">{label}<input aria-label={label} value={draft} onChange={e => setDraft(e.target.value)} className="mt-1 w-full rounded-xl bg-white/70 p-2 text-[13px]" /></label><button className="btn btn-quiet mt-1 rounded-full px-3 py-1 text-[12px] font-bold">Apply values</button></form>;
}

export function SchoolMathControls() {
  const s = useSim(state => state.modules.maths) ?? DEFAULT_MATH;
  const change = (patch: Partial<MathState>) => {
    const parsed = MathFields.partial().safeParse(patch);
    if (parsed.success) execNow({ op: "set_module", module: "maths", set: parsed.data });
    else useSim.getState().set({ aiError: parsed.error.issues[0]?.message || "Check the values." });
  };
  const field = (key: keyof MathState, label: string, min = -1000, max = 1000, step = .1) => <Field key={key} label={label} value={s[key] as number} min={min} max={max} step={step} onChange={v => change({ [key]: v })} />;
  const r = schoolMath(s), mode = s.mode;
  return <>
    <label className="text-[12px] font-bold text-ink-3">Investigation<select aria-label="Math investigation" className="mt-1 w-full rounded-xl bg-white/60 p-2 text-ink" value={mode} onChange={e => execNow({ op: "show_math", mode: e.target.value as MathState["mode"] })}>{MATH_MODES.map(mode => <option key={mode} value={mode}>{MATH_LABELS[mode]}</option>)}</select></label>
    {(["number_line", "arithmetic", "fractions"].includes(mode)) && <label className="mt-3 block text-[12px] font-bold">Operation<select aria-label="Math operation" className="ml-2 rounded-lg bg-white/60 p-1" value={s.operation} onChange={e => change({ operation: e.target.value as MathState["operation"] })}>{["add", "subtract", "multiply", "divide", ...(mode === "arithmetic" ? ["power"] : [])].map(op => <option key={op}>{op}</option>)}</select></label>}
    <div className="group-rows mt-3">
      {(["place_value", "measurement", "number_line", "arithmetic", "ratio", "percent", "equation", "inequality", "quadratic", "functions", "sequence", "transform"].includes(mode)) && field("a", mode === "functions" ? "Evaluate at x" : mode === "percent" ? "Whole" : mode === "sequence" ? "First term" : "a / x")}
      {(["number_line", "arithmetic", "ratio", "percent", "equation", "inequality", "quadratic", "sequence", "transform"].includes(mode)) && field("b", mode === "percent" ? "Percent (%)" : mode === "sequence" ? "Difference / ratio" : "b / y", mode === "arithmetic" && s.operation === "power" ? -8 : -1000, mode === "arithmetic" && s.operation === "power" ? 8 : 1000, mode === "arithmetic" && s.operation === "power" ? 1 : .1)}
      {(["ratio", "equation", "inequality", "quadratic", "transform"].includes(mode)) && field("c", mode === "transform" ? "Translate x by" : "c")}
      {mode === "transform" && field("d", "Translate y by")}
      {mode === "fractions" && <>{field("numerator", "First numerator", -96, 96, 1)}{field("denominator", "First denominator", 1, 24, 1)}{field("numerator2", "Second numerator", -96, 96, 1)}{field("denominator2", "Second denominator", 1, 24, 1)}</>}
      {mode === "geometry" && <>{field("width", "Width / diameter", .1, 10)}{field("height", "Perpendicular height", .1, 10)}{field("depth", "Depth", .1, 10)}</>}
      {(mode === "angles" || mode === "trigonometry" || mode === "transform") && field("angleDeg", "Angle in degrees", -360, 360, 1)}
      {mode === "probability" && <>{field("total", "Total objects", 1, 100, 1)}{field("favourable", "Favourable objects", 0, s.total, 1)}{field("draws", "Draws (ALL must succeed)", 1, s.replacement ? 10 : Math.min(10, s.total), 1)}</>}
      {mode === "sequence" && field("index", "Term number", 1, 30, 1)}
    </div>
    {mode === "measurement" && <div className="mt-2 flex gap-2"><select aria-label="Source unit" value={s.unitFrom} className="w-1/2 rounded-xl bg-white/70 p-2" onChange={e => { const unitFrom = e.target.value as MathState["unitFrom"]; change({ unitFrom, unitTo: unitFrom }); }}>{UNIT_IDS.map(unit => <option key={unit}>{unit}</option>)}</select><select aria-label="Target unit" value={s.unitTo} className="w-1/2 rounded-xl bg-white/70 p-2" onChange={e => change({ unitTo: e.target.value as MathState["unitTo"] })}>{UNIT_IDS.filter(unit => SCHOOL_UNITS[unit][0] === SCHOOL_UNITS[s.unitFrom][0]).map(unit => <option key={unit}>{unit}</option>)}</select></div>}
    {mode === "geometry" && <select aria-label="Geometry shape" className="mt-2 w-full rounded-xl bg-white/70 p-2" value={s.shape} onChange={e => change({ shape: e.target.value as MathState["shape"] })}>{["rectangle", "triangle", "circle", "cuboid", "cylinder", "sphere"].map(shape => <option key={shape}>{shape}</option>)}</select>}
    {mode === "transform" && <select aria-label="Transformation" className="mt-2 w-full rounded-xl bg-white/70 p-2" value={s.transform} onChange={e => change({ transform: e.target.value as MathState["transform"] })}>{["translate", "reflect_x", "reflect_y", "rotate"].map(x => <option key={x}>{x}</option>)}</select>}
    {mode === "statistics" && <DataInput key={mode} label="Data (1–32 values, −100 to 100)" value={s.data} onChange={data => change({ data })} />}
    {mode === "linear_system" && <DataInput key={mode} label="Coefficients a,b,c,d,e,f (ax+by=c; dx+ey=f)" value={s.coefficients} onChange={coefficients => change({ coefficients })} />}
    {mode === "functions" && <form className="mt-3" onSubmit={e => { e.preventDefault(); const expression = String(new FormData(e.currentTarget).get("expression") || ""); change({ expression }); }}><label className="text-[12px] font-bold">y = f(x)<input aria-label="Function expression" name="expression" defaultValue={s.expression} className="mt-1 w-full rounded-xl bg-white/70 p-2" /></label><button className="btn btn-accent mt-2 rounded-full px-3 py-1 text-[12px]">Plot function</button></form>}
    {mode === "probability" && <label className="mt-3 flex items-center gap-2 text-[12px] font-bold"><input type="checkbox" checked={s.replacement} onChange={e => change({ replacement: e.target.checked })} />Replace after each draw</label>}
    {mode === "sequence" && <select aria-label="Sequence type" className="mt-2 w-full rounded-xl bg-white/70 p-2" value={s.sequence} onChange={e => change({ sequence: e.target.value as MathState["sequence"] })}><option>arithmetic</option><option>geometric</option></select>}
    <div className="mt-4 rounded-xl bg-white/50 p-3"><p className="text-[13px] font-extrabold">{r.formula}</p><p className="mt-2 text-[16px] font-extrabold text-[#247a80]">{r.answer}</p><ol className="mt-2 space-y-1 text-[12px] leading-relaxed text-ink-2">{r.steps.map((step, i) => <li key={i}>{i + 1}. {step}</li>)}</ol></div>
    <p className="mt-3 text-[11px] leading-relaxed text-ink-3">Investigate by changing one value. This is a collection of bounded teaching models, not a general symbolic algebra solver. Function angles use radians; the unit-circle control uses degrees. Bar charts use one shared scale.</p>
  </>;
}
