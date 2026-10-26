"use client";
import { MechanicsControls, SchoolMathControls } from "./learning-controls";
import { AnatomyControls } from "./anatomy-controls";

import { Camera, Focus, Hand, House, LoaderCircle, MessageCircle, PartyPopper, Pause, Play, RotateCcw, Rocket, SlidersHorizontal, Trash, X } from "lucide-react";
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { useShallow } from "zustand/react/shallow";
import { noteElement, noteFocus, pickCellPart, useSim, projectileResult } from "@/lib/store";
import { cancelPlayback, execNow, runPlan, skipSpeech, useCompoundJob } from "@/lib/player";
import { GRAVITY_PRESETS, fmt } from "@/lib/engine/projectile";
import { applyEnvironment, environmentForGravity, isGiantPlanet } from "@/lib/environment";
import { ELEMENTS, MOLECULES, MOLECULE_IDS, getMolecule, molarMass, type MoleculeId } from "@/lib/engine/chemistry";
import { ASSETS, GUIDE_ID, LIMITS } from "@/lib/world/catalog";
import { MODULE_DEFAULTS, OPTICS_TABLE, circuitBoard, opticsTrace, patchOptics, patchSignal, signalReception, type Modules, type OpticsPatch, type RippleState, type SignalPatch, type SignalState } from "@/lib/modules";
import { SIGNAL_KINDS, SIGNAL_KIND_IDS, WALL_MATERIALS, formatFrequency, formatLength, formatSpeed, formatStrength, signalWavelength, waterWave, type SignalKind, type WallMaterial } from "@/lib/engine/waves";
import { OPTIC_PRESETS, TABLE, criticalAngle, fresnelReflectance, objectRays, refractiveIndex, signedFocal, sourceWavelength, turningHits, type OpticElement, type OpticPreset } from "@/lib/engine/optics";
import { isValidExpression } from "@/lib/engine/expr";
import { measureShape } from "@/lib/engine/geometry";
import { PLACES, distanceKm } from "@/lib/engine/geo";
import { Picker, Segmented, SwapIcon } from "./kit";
import { CircuitControls } from "./circuit-controls";
import { MagnetControls } from "./magnet-controls";
import { GeneticsControls, OsmosisControls, PopulationControls, ReactionControls } from "./lab-sims-controls";
import { CELL_GROUPS, CELL_NAMES, CELL_PARTS, CELL_SUMMARY, ORGANELLES, type CellKind } from "@/lib/engine/biology";
import { MATERIALS, SUBSTANCES, SUBSTANCE_IDS, phaseAt, type MaterialId, type SubstanceId } from "@/lib/engine/physics2";
import { objectName } from "@/lib/world/scene";
import { getBody, livePosition, liveSpeed } from "@/lib/world/runtime";
import { EMPTY_TABLE, PERIODIC_ELEMENTS } from "@/lib/periodic-table";
import { periodicLesson } from "@/lib/periodic-lesson";
import "./table-controls.css";

// ---------- small building blocks ----------

export function Slider({ label, value, min, max, step, display, sub, onChange, onCommit }: { label: string; value: number; min: number; max: number; step: number; display: string; sub?: string; onChange: (v: number) => void; onCommit?: () => void }) {
  return (
    <label className="block px-3.5 pb-1.5 pt-2.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-bold">{label}</span>
        <span className="tabular-nums">
          <span className="text-[15px] font-bold">{display}</span>
          {sub && <span className="ml-1.5 text-[13px] font-semibold text-ink-3">{sub}</span>}
        </span>
      </span>
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        style={{ ["--fill" as string]: `${((value - min) / (max - min)) * 100}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={(e) => (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") && onCommit?.()}
      />
    </label>
  );
}

const Seg = Segmented;

export function Caption({ children }: { children: React.ReactNode }) {
  return <p className="px-1 pb-1.5 pt-3 text-[13px] font-semibold text-ink-3">{children}</p>;
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className="px-1 pt-2 text-[13px] leading-snug text-ink-3">{children}</p>;
}

const gravityOptions = GRAVITY_PRESETS.map((p) => [p.value, p.label] as const);
const nearestPreset = (g: number) => GRAVITY_PRESETS.find((p) => Math.abs(p.value - g) < 0.05)?.value ?? null;

// ---------- modules ----------

function GravityControls() {
  const g = useSim((s) => -s.gravity[1]);
  const setG = (v: number) => execNow({ op: "set_gravity", gravity: [0, -v, 0] });
  return (
    <>
      <Seg label="Gravity presets" value={nearestPreset(g)} options={gravityOptions} onChange={setG} cols={3} />
      <div className="group-rows mt-2">
        <Slider label="Gravity" min={0} max={LIMITS.maxGravity} step={0.01} value={g} display={fmt(g, "m/s²")} sub={`${(g / 9.81).toFixed(2)}× Earth`} onChange={setG} />
      </div>
      <Action onClick={() => execNow({ op: "apply_impulse", id: "all", impulse: [0, 1.4, 0] })}>
        <Hand size={18} /> Give everything a nudge
      </Action>
      <Note>Drag any object to pick it up and throw it.</Note>
    </>
  );
}

const BALLS = [
  ["basketball", "Basketball"],
  ["soccer_ball", "Soccer"],
  ["tennis_ball", "Tennis"],
  ["bowling_ball", "Bowling"],
] as const;

function ProjectileControls() {
  const p = useSim((s) => s.projectile);
  const environment = useSim(s => s.environment?.preset);
  const timeScale = useSim((s) => s.timeScale);
  const setProjectile = useSim((s) => s.setProjectile);
  const set = useSim((s) => s.set);
  if (!p) return null;
  const r = projectileResult(p);
  const launch = () => setProjectile({}, true);
  const edit = (patch: Parameters<typeof setProjectile>[0]) => setProjectile({ ...patch, status: "idle" });
  const landed = p.status === "landed";
  return (
    <>
      <div className="group-rows">
        <Slider label="Speed" min={0} max={40} step={0.1} value={p.speed} display={`${(p.speed * 3.6).toFixed(0)} km/h`} sub={`${p.speed.toFixed(1)} m/s`} onChange={(speed) => edit({ speed })} onCommit={launch} />
        <Slider label="Angle" min={0} max={90} step={1} value={p.angleDeg} display={`${p.angleDeg.toFixed(0)}°`} onChange={(angleDeg) => edit({ angleDeg })} onCommit={launch} />
        <Slider label="Launch height" min={0} max={10} step={0.5} value={p.height} display={fmt(p.height, "m", 1)} onChange={(height) => edit({ height })} onCommit={launch} />
      </div>
      <Caption>Gravity</Caption>
      <Seg label="Gravity" value={nearestPreset(p.gravity)} options={gravityOptions} onChange={(gravity) => {
        const preset = environmentForGravity(gravity);
        if (preset) useSim.getState().set({ environment: applyEnvironment(null, { preset }) });
        setProjectile({ gravity }, true);
      }} cols={3} />
      {isGiantPlanet(environment) && <Note>Gravity simulation deck. This planet has no solid surface to stand on. The launch uses idealized constant gravity without air resistance.</Note>}
      <div className="group-rows mt-2">
        <Slider label="Gravity acceleration" min={0} max={LIMITS.maxGravity} step={0.01} value={p.gravity} display={fmt(p.gravity, "m/s²")} sub={`${(p.gravity / 9.81).toFixed(2)}× Earth`} onChange={(gravity) => edit({ gravity })} onCommit={launch} />
      </div>
      <Caption>Ball</Caption>
      <Seg label="Ball" value={p.ball} options={BALLS} onChange={(ball) => setProjectile({ ball }, true)} />
      <div className="mt-3 flex gap-2">
        <button className="btn btn-accent flex h-11 flex-1 items-center justify-center gap-2 rounded-[14px] text-[15px] font-extrabold" onClick={launch}>
          <Rocket size={18} /> Launch
        </button>
        <div className="w-[118px] self-center">
          <Seg label="Playback speed" value={timeScale} options={[[1, "1×"], [0.5, "½×"], [0.25, "¼×"]] as const} onChange={(k) => set({ timeScale: k })} />
        </div>
      </div>
      <div className="group-rows mt-3">
        {[
          ["Lands at", r ? fmt(r.range, "m") : "–"],
          ["Time in the air", r ? fmt(r.flightTime, "s") : "–"],
          ["Highest point", r ? fmt(r.maxHeight, "m") : "–"],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between px-3.5 py-2.5 text-[15px]">
            <span className="font-semibold text-ink-2">{k}</span>
            <span className="font-bold tabular-nums">{landed ? v : "Launch to see"}</span>
          </div>
        ))}
      </div>
      <Note>The blue arrow is sideways speed, which never changes. The red arrow is up-and-down speed, which gravity keeps changing. No air drag.</Note>
    </>
  );
}

let chemSeq = 0;
const MOLECULE_PICKER = [{ options: MOLECULE_IDS.map((m) => ({ value: m, label: MOLECULES[m].name.replace(/ \(.*\)$/, ""), hint: MOLECULES[m].formula })) }];
const CELL_PICKER = CELL_GROUPS.map((g) => ({ name: g.name, options: g.kinds.map((k) => ({ value: k, label: CELL_NAMES[k] })) }));

function ChemControls() {
  const objects = useSim((s) => s.objects);
  const [compare, setCompare] = useState(false);
  const chem = Object.values(objects).filter((o) => o.type === "molecule" || o.type === "atom");
  const current = chem.length === 1 ? chem[0] : null;
  const [search, setSearch] = useState("");
  const job = useCompoundJob((s) => s.job);
  const loading = !!job && !job.error;
  const show = (cmd: { kind: "molecule"; id: MoleculeId } | { kind: "compound"; id: string } | { kind: "atom"; id: string }) => {
    const replaced = !compare || chem.length >= 2 ? chem : [];
    const clear = () => replaced.forEach((o) => useSim.getState().removeObject(o.id));
    const id = `${cmd.kind}_${++chemSeq}`;
    if (cmd.kind === "compound") {
      // Keep the current model until the new one has loaded, so a failed lookup never empties the bench.
      const done = () => { stopObj(); stopJob(); };
      const stopObj = useSim.subscribe((s) => { if (s.objects[id]) { done(); clear(); } });
      const stopJob = useCompoundJob.subscribe((s) => { if (!s.job || s.job.error) setTimeout(() => { if (!useSim.getState().objects[id]) done(); }); });
      execNow({ op: "build_molecule", id, compound: cmd.id, ...(replaced[0] ? { position: replaced[0].position } : {}) });
      return;
    }
    clear();
    if (cmd.kind === "molecule") execNow({ op: "build_molecule", id, molecule: cmd.id });
    else execNow({ op: "build_atom", id, element: cmd.id });
  };
  return (
    <>
      <button className="btn btn-soft mt-2 w-full" onClick={() => execNow({ op: "show_periodic_table" })}>Read periodic table</button>
      <Caption>Molecules</Caption>
      <Picker label="Molecule" placeholder="Choose a molecule" value={current?.type === "molecule" && MOLECULES[current.molecule] ? current.molecule : null} onChange={(id) => show({ kind: "molecule", id })} groups={MOLECULE_PICKER} />
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (search.trim() && !loading) show({ kind: "compound", id: search.trim() }); }}>
        <input aria-label="Any compound" className="min-w-0 flex-1 rounded-xl bg-white/80 px-3 py-2.5 text-sm" placeholder="Any compound, e.g. nicotine" maxLength={80} value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn btn-soft flex items-center gap-1.5 px-3" type="submit" disabled={loading} aria-busy={loading}>
          {loading ? <><LoaderCircle size={15} className="animate-spin" /> Loading</> : "Show"}
        </button>
      </form>
      {job?.error ? <p role="alert" className="mt-1.5 px-1 text-[13px] font-semibold text-red-700">{job.error}</p> : <Note>{loading ? `Fetching ${job!.name} from PubChem…` : "Other compounds load their real 3D shape from PubChem."}</Note>}
      <Caption>Atoms, simplified model</Caption>
      <Seg label="Atoms" value={current?.type === "atom" ? current.element : null} options={ELEMENTS.map((e) => [e.symbol, e.symbol] as const)} onChange={(el) => show({ kind: "atom", id: el })} cols={5} />
      <Toggle label="Compare two side by side" checked={compare} onChange={setCompare} />
    </>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="group-rows mt-2 flex items-center justify-between px-3.5 py-2.5 text-[15px] font-bold">
      {label}
      <input type="checkbox" role="switch" className="h-5 w-5 accent-[var(--ink)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function Action({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="btn btn-quiet mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--fill)] text-[15px] font-bold" onClick={onClick}>
      {children}
    </button>
  );
}

/** A panel change; the fields that changed are remembered so the guide knows what the student just did. */
const patchModules = (patch: Partial<Modules>) => {
  const s = useSim.getState();
  const before = s.modules as unknown as Record<string, unknown>;
  s.set({ modules: { ...s.modules, ...patch } });
  const changes = Object.entries(patch).map(([k, next]) => {
    const prev = before[k];
    if (next && prev && typeof next === "object" && typeof prev === "object") {
      const diff = Object.entries(next as Record<string, unknown>).filter(([f, v]) => JSON.stringify(v) !== JSON.stringify((prev as Record<string, unknown>)[f]));
      return `${k}: ${diff.map(([f, v]) => `${f} → ${JSON.stringify(v).slice(0, 40)}`).join(", ") || "updated"}`;
    }
    return `${k} → ${next === null ? "closed" : JSON.stringify(next).slice(0, 60)}`;
  });
  noteFocus({ kind: "control", label: `Changed ${changes.join("; ")}`.slice(0, 120) });
};
let seq = 0;
const nextId = (prefix: string) => `${prefix}_${++seq}`;

const ORBIT_MAX = { solar_system: 200, earth_moon: 10, seasons: 60 } as const;

function SpaceControls() {
  const o = useSim((s) => s.modules.orbits);
  if (!o) return null;
  return (
    <>
      <Seg label="View" value={o.mode} options={[["solar_system", "Planets"], ["earth_moon", "Moon"], ["seasons", "Seasons"]] as const} onChange={(mode) => execNow({ op: "show_orbits", mode })} />
      <div className="group-rows mt-2">
        <Slider label="Speed" min={0} max={ORBIT_MAX[o.mode]} step={o.mode === "earth_moon" ? 0.1 : 1} value={o.daysPerSecond} display={`${fmt(o.daysPerSecond, "", o.mode === "earth_moon" ? 1 : 0)} days/s`} onChange={(v) => patchModules({ orbits: { ...o, daysPerSecond: v } })} />
      </div>
      <Toggle label="Show names" checked={o.labels} onChange={(labels) => patchModules({ orbits: { ...o, labels } })} />
      <Note>Sizes and distances are squeezed to fit. How long each orbit takes is real.</Note>
    </>
  );
}

const FLUID_OPTS = [["fresh_water", "Fresh"], ["sea_water", "Sea"], ["very_salty_water", "Salty"], ["oil", "Oil"], ["honey", "Honey"]] as const;
const DROP_OPTS = [["cork", "Cork"], ["wood", "Wood"], ["ice", "Ice"], ["rubber", "Rubber"], ["stone", "Stone"], ["steel", "Steel"]] as const;

function OceanControls() {
  const fluid = useSim((s) => s.modules.fluid);
  const drop = (m: MaterialId) =>
    execNow({ op: "spawn_shape", id: nextId(`${m}_block`), shape: "box", size: [0.45, 0.45, 0.45], position: [Math.random() * 2.4 - 1.2, 4.4, Math.random() * 2.4 - 1.2], color: MATERIALS[m].color, physics: "dynamic", material: m, label: MATERIALS[m].name });
  return (
    <>
      <Caption>Liquid in the tank</Caption>
      <Seg label="Liquid" value={fluid} options={FLUID_OPTS} onChange={(f) => execNow({ op: "set_fluid", fluid: f })} />
      <Caption>Drop a block</Caption>
      <Seg label="Drop a block" value={null} options={DROP_OPTS} onChange={drop} cols={3} />
      <Note>A block floats when it is less dense than the liquid. Salty water and honey are denser, so they hold things up better.</Note>
    </>
  );
}

const SHAPE_OPTS = [["box", "Cube"], ["sphere", "Sphere"], ["cylinder", "Cylinder"], ["cone", "Cone"], ["pyramid", "Pyramid"], ["prism", "Prism"]] as const;

function MathControls() {
  const plot = useSim((s) => s.modules.plot);
  const [expr, setExpr] = useState("");
  const [bad, setBad] = useState(false);
  const draw = () => {
    const e = expr.trim();
    if (!e) return;
    if (!isValidExpression(e)) return setBad(true);
    execNow({ op: "plot_function", id: nextId("f"), expression: e, label: `y = ${e}`.slice(0, 30) });
    setExpr("");
  };
  const addShape = (shape: (typeof SHAPE_OPTS)[number][0]) => {
    const name = SHAPE_OPTS.find(([k]) => k === shape)![1];
    execNow({ op: "spawn_shape", id: nextId(shape), shape, size: [1, 1, 1], position: [Math.random() * 4 - 2, 0.5, 1.6 + Math.random() * 1.6], color: ["#6b8fe0", "#f0a800", "#30a46c", "#e5484d"][seq % 4], label: name });
  };
  const clear = () => {
    execNow({ op: "clear_plot" });
    for (const o of Object.values(useSim.getState().objects)) if (o.type === "shape") useSim.getState().removeObject(o.id);
  };
  return (
    <>
      <form
        className="group-rows flex items-center gap-2 py-1.5 pl-3.5 pr-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          draw();
        }}
      >
        <span className="text-[15px] font-bold">y =</span>
        <input
          value={expr}
          onChange={(e) => (setExpr(e.target.value), setBad(false))}
          placeholder="x^2 - 3"
          aria-label="Function of x"
          spellCheck={false}
          className="h-9 min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none placeholder:text-ink-3"
        />
        <button type="submit" className="btn btn-accent h-8 shrink-0 rounded-full px-3.5 text-[13px] font-extrabold">
          Plot
        </button>
      </form>
      <Note>{bad ? "I can only draw functions of x, like 2x + 1, sin(x) or sqrt(x)." : `${plot?.functions.length ?? 0} of 6 graphs drawn.`}</Note>
      <Caption>Add a shape</Caption>
      <Seg label="Add a shape" value={null} options={SHAPE_OPTS} onChange={addShape} cols={3} />
      <Action onClick={clear}>
        <Trash size={18} /> Clear graphs and shapes
      </Action>
      <Note>Click a shape to see its volume and surface area.</Note>
    </>
  );
}

function GlobeControls() {
  const g = useSim((s) => s.modules.globe);
  if (!g) return null;
  const [a, b] = g.marks.slice(-2);
  return (
    <>
      <Seg label="View" value={g.view} options={[["globe", "Globe"], ["map", "Flat map"]] as const} onChange={(view) => execNow({ op: "show_globe", view })} />
      <Toggle label="Spin the Earth" checked={g.spin} onChange={(spin) => patchModules({ globe: { ...g, spin } })} />
      <Caption>Find a place</Caption>
      <select
        className="group-rows h-11 w-full px-3 text-[15px] font-bold outline-none"
        aria-label="Find a place"
        value=""
        onChange={(e) => {
          const id = e.target.value;
          if (!id) return;
          const prev = useSim.getState().modules.globe?.marks.at(-1);
          execNow({ op: "mark_place", id, place: id });
          if (prev && prev.id !== id) execNow({ op: "connect_places", id: nextId("route"), from: prev.id, to: id });
        }}
      >
        <option value="">Choose a place…</option>
        {PLACES.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {b && (
        <div className="group-rows mt-2">
          <Row label={`${a.label} to ${b.label}`} value={`${Math.round(distanceKm(a, b)).toLocaleString("en-US")} km`} />
        </div>
      )}
      {g.marks.length > 0 && (
        <Action onClick={() => patchModules({ globe: { ...g, marks: [], routes: [], focus: null } })}>
          <Trash size={18} /> Clear places
        </Action>
      )}
      <Note>Pick two places to see how far apart they are along the Earth&apos;s surface.</Note>
    </>
  );
}

function WorkshopControls() {
  const { circuit, lever, wave, ripple, magnet } = useSim(useShallow((s) => ({ circuit: s.modules.circuit, lever: s.modules.lever, wave: s.modules.wave, ripple: s.modules.ripple ?? null, magnet: s.modules.magnet ?? null })));
  const active = magnet ? "magnet" : ripple ? "ripple" : circuit ? "circuit" : lever ? "lever" : wave ? "wave" : null;
  const pick = (k: "circuit" | "lever" | "wave" | "ripple" | "magnet") =>
    patchModules({
      magnet: k === "magnet" ? (magnet ?? MODULE_DEFAULTS.magnet) : null,
      circuit: k === "circuit" ? (circuit ?? MODULE_DEFAULTS.circuit) : null,
      lever: k === "lever" ? (lever ?? MODULE_DEFAULTS.lever) : null,
      wave: k === "wave" ? (wave ?? MODULE_DEFAULTS.wave) : null,
      ripple: k === "ripple" ? (ripple ?? MODULE_DEFAULTS.ripple) : null,
    });
  return (
    <>
      <Seg label="Experiment" value={active} options={[["circuit", "Circuit"], ["magnet", "Magnets"], ["lever", "Lever"], ["wave", "Rope"], ["ripple", "Ripples"]] as const} onChange={pick} cols={3} />
      {magnet && <MagnetControls lab={magnet} />}
      {!magnet && ripple && <RippleControls r={ripple} />}
      {!magnet && !ripple && circuitBoard(circuit) && <CircuitControls board={circuitBoard(circuit)!} />}
      {!magnet && !ripple && !circuit && lever && (
        <div className="group-rows mt-2">
          <Slider label="Left weight" min={0.5} max={20} step={0.5} value={lever.leftMass} display={fmt(lever.leftMass, "kg", 1)} onChange={(leftMass) => patchModules({ lever: { ...lever, leftMass } })} />
          <Slider label="Left distance" min={0.2} max={2.4} step={0.1} value={lever.leftDistance} display={fmt(lever.leftDistance, "m", 1)} onChange={(leftDistance) => patchModules({ lever: { ...lever, leftDistance } })} />
          <Slider label="Right weight" min={0.5} max={20} step={0.5} value={lever.rightMass} display={fmt(lever.rightMass, "kg", 1)} onChange={(rightMass) => patchModules({ lever: { ...lever, rightMass } })} />
          <Slider label="Right distance" min={0.2} max={2.4} step={0.1} value={lever.rightDistance} display={fmt(lever.rightDistance, "m", 1)} onChange={(rightDistance) => patchModules({ lever: { ...lever, rightDistance } })} />
        </div>
      )}
      {!magnet && !ripple && !circuit && !lever && wave && (
        <>
          <Seg label="Wave kind" value={wave.kind} options={[["transverse", "Side to side"], ["longitudinal", "Push and pull"]] as const} onChange={(kind) => patchModules({ wave: { ...wave, kind } })} />
          <div className="group-rows mt-2">
            <Slider label="Amplitude" min={0.05} max={1.2} step={0.05} value={wave.amplitude} display={fmt(wave.amplitude, "m")} onChange={(amplitude) => patchModules({ wave: { ...wave, amplitude } })} />
            <Slider label="Frequency" min={0.1} max={4} step={0.1} value={wave.frequency} display={fmt(wave.frequency, "Hz", 1)} onChange={(frequency) => patchModules({ wave: { ...wave, frequency } })} />
            <Slider label="Wavelength" min={0.5} max={6} step={0.1} value={wave.wavelength} display={fmt(wave.wavelength, "m", 1)} onChange={(wavelength) => patchModules({ wave: { ...wave, wavelength } })} />
          </div>
        </>
      )}
      <Note>
        {ripple ? "Water waves are real here: the wave speed comes from the depth. Watch them bend over the shallow plate and spread through gaps." : circuit ? "Click the switch or any bulb on the board to open the switch or break and fix a bulb." : lever ? "Turning effect = weight × distance from the pivot. Equal on both sides means balanced." : "Wave speed = frequency × wavelength."}
      </Note>
    </>
  );
}

const RIPPLE_BARRIER_LABELS = [["none", "None"], ["wall", "Wall"], ["gap", "Gap"], ["double_slit", "2 gaps"], ["reflector", "Angled"]] as const;

function RippleControls({ r }: { r: RippleState }) {
  const set = (p: Partial<RippleState>) => patchModules({ ripple: { ...r, ...p } });
  const w = waterWave(r.frequency, r.depth);
  const shallow = r.shallow ? waterWave(r.frequency, r.shallowDepth) : null;
  return (
    <>
      <Toggle label="Wind-driven waves (qualitative)" checked={r.windSpeed !== undefined} onChange={enabled => set({ windSpeed: enabled ? 8 : undefined, ...(enabled ? { source: "plane", sourceSpeed: 0 } : {}) })} />
      {r.windSpeed !== undefined && <><Slider label="Wind strength" min={0} max={20} step={1} value={r.windSpeed} display={`${r.windSpeed} m/s`} onChange={windSpeed => set({ windSpeed })} /><Note>Wind transfers energy to water. This driver illustrates stronger forcing; it does not predict ocean wave heights. Real growth also depends on wind duration and fetch.</Note></>}
      {r.windSpeed === undefined && <><Caption>Dipper</Caption>
      <Seg label="Wave source" value={r.source} options={[["point", "One"], ["two_point", "Two"], ["plane", "Straight"]] as const} onChange={(source) => set({ source })} /></>}
      <div className="group-rows mt-2">
        <Slider label="Frequency" min={0.3} max={3} step={0.1} value={r.frequency} display={formatFrequency(r.frequency)} onChange={(frequency) => set({ frequency })} />
        <Slider label="Water depth" min={0.02} max={0.5} step={0.01} value={r.depth} display={formatLength(r.depth)} onChange={(depth) => set({ depth })} />
        {r.source === "two_point" && <Slider label="Dippers apart" min={0.1} max={1.2} step={0.05} value={r.separation} display={formatLength(r.separation)} onChange={(separation) => set({ separation })} />}
        {r.source === "point" && <Slider label="Moving dipper" min={0} max={0.5} step={0.05} value={r.sourceSpeed} display={r.sourceSpeed ? formatSpeed(r.sourceSpeed) : "still"} sub={r.sourceSpeed ? "Doppler" : undefined} onChange={(sourceSpeed) => set({ sourceSpeed })} />}
      </div>
      <Caption>Barrier</Caption>
      <Seg label="Barrier" value={r.barrier} options={RIPPLE_BARRIER_LABELS} onChange={(barrier) => set({ barrier })} cols={5} />
      {(r.barrier === "gap" || r.barrier === "double_slit" || r.barrier === "reflector") && (
        <div className="group-rows mt-2">
          {r.barrier !== "reflector" && <Slider label="Gap" min={0.05} max={1} step={0.05} value={r.gapWidth} display={formatLength(r.gapWidth)} sub={`${(r.gapWidth / w.wavelength).toFixed(1)} λ`} onChange={(gapWidth) => set({ gapWidth })} />}
          {r.barrier === "double_slit" && <Slider label="Gaps apart" min={0.1} max={1.2} step={0.05} value={r.separation} display={formatLength(r.separation)} onChange={(separation) => set({ separation })} />}
          {r.barrier === "reflector" && <Slider label="Barrier angle" min={-60} max={60} step={5} value={r.reflectorAngle} display={`${r.reflectorAngle}°`} onChange={(reflectorAngle) => set({ reflectorAngle })} />}
        </div>
      )}
      <Toggle label="Shallow plate (refraction)" checked={r.shallow} onChange={(s) => set({ shallow: s })} />
      <Caption>Show</Caption>
      <Seg label="View" value={r.view} options={[["waves", "Waves"], ["intensity", "Where they add up"]] as const} onChange={(view) => set({ view })} />
      <div className="group-rows mt-2">
        <Row label="Wavelength" value={formatLength(w.wavelength)} />
        <Row label="Speed" value={formatSpeed(w.speed)} />
        <Row label="Period" value={`${w.period.toFixed(2)} s`} />
        {shallow && <Row label="Over the plate" value={`${formatLength(shallow.wavelength)} · ${formatSpeed(shallow.speed)}`} />}
      </div>
    </>
  );
}

const SIGNAL_LABELS: Record<SignalKind, string> = { wifi_2_4: "Wi-Fi 2.4 GHz", wifi_5: "Wi-Fi 5 GHz", bluetooth: "Bluetooth", mobile_4g: "4G phone", mobile_5g: "5G (mmWave)", fm_radio: "FM radio", am_radio: "AM radio", sound: "Sound", light: "Light" };

function SignalControls({ s }: { s: SignalState }) {
  const set = (p: SignalPatch) => patchModules({ signal: patchSignal(s, p) });
  const r = signalReception(s);
  const band = SIGNAL_KINDS[s.kind].band;
  return (
    <>
      <Caption>Wave</Caption>
      <select aria-label="Kind of signal" className="w-full rounded-xl bg-white/80 px-3 py-2.5 text-sm" value={s.kind} onChange={(e) => set({ kind: e.target.value as SignalKind })}>
        {SIGNAL_KIND_IDS.map((k) => <option key={k} value={k}>{SIGNAL_LABELS[k]}</option>)}
      </select>
      {s.kind === "sound" && (
        <div className="group-rows mt-2">
          <Slider label="Pitch" min={50} max={4000} step={10} value={s.soundHz} display={formatFrequency(s.soundHz)} sub={formatLength(343 / s.soundHz)} onChange={(soundHz) => set({ soundHz })} />
        </div>
      )}
      <Caption>Place</Caption>
      <Seg label="Floor plan" value={s.layout} options={[["room", "Room"], ["apartment", "Flat"], ["open_field", "Open"], ["elevator", "Lift"]] as const} onChange={(layout) => set({ layout })} />
      {s.walls.length > 0 && (
        <select aria-label="Make every wall" className="mt-2 w-full rounded-xl bg-white/80 px-3 py-2.5 text-sm" value="" onChange={(e) => e.target.value && set({ allWalls: e.target.value as WallMaterial })}>
          <option value="">Make every wall…</option>
          {WALL_MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      )}
      <Caption>Show</Caption>
      <Seg label="View" value={s.view} options={[["both", "Both"], ["waves", "Waves"], ["strength", "Strength"]] as const} onChange={(view) => set({ view })} />
      <div className="group-rows mt-2">
        <Row label={band === "sound" ? "Loudness" : band === "light" ? "Brightness" : "Signal"} value={formatStrength(s.kind, r)} />
        <Row label="Quality" value={band === "sound" || band === "light" ? r.quality : `${r.bars} of 4 bars`} />
        <Row label="Distance" value={formatLength(r.distance)} />
        <Row label="Walls in the way" value={r.walls.length ? `${r.walls.length} (−${Number.isFinite(r.wallLoss) ? Math.round(r.wallLoss) : "all"} dB)` : "none"} />
        <Row label="Wavelength" value={formatLength(signalWavelength(s.kind, s.soundHz))} />
      </div>
      <Note>Drag the {SIGNAL_KINDS[s.kind].source} or the {SIGNAL_KINDS[s.kind].device} around the plan. Thick or metal walls cost the most.</Note>
    </>
  );
}

function StageControls() {
  const s = useSim((st) => st.modules.signal ?? null);
  return (
    <>
      <Seg label="Explore" value={s ? "signal" : "free"} options={[["free", "Free build"], ["signal", "Signals"]] as const} onChange={(k) => (k === "signal" ? execNow({ op: "show_signal", kind: "wifi_2_4" }) : patchModules({ signal: null }))} />
      {s ? <SignalControls s={s} /> : <GravityControls />}
    </>
  );
}

const OPTIC_LABELS: Record<OpticPreset, string> = {
  plane_image: "Plane mirror image",
  reflection: "Mirror reflection", periscope: "Periscope", refraction: "Refraction in a block", total_internal_reflection: "Total internal reflection", optical_fibre: "Optical fibre", prism: "Prism and rainbow",
  convex_lens: "Convex lens", concave_lens: "Concave lens", lens_image: "Lens image (ray diagram)", magnifier: "Magnifying glass", concave_mirror: "Concave mirror", convex_mirror: "Convex mirror",
  mirror_image: "Mirror image (ray diagram)", shadows: "Shadows", colour_mixing: "Colour mixing", free: "Empty table",
};

function OpticsControls() {
  const o = useSim((s) => s.modules.optics ?? null);
  const [picked, setPicked] = useState<string | null>(null);
  if (!o) return <Action onClick={() => execNow({ op: "show_optics", preset: "reflection" })}>Set up the optics table</Action>;
  const set = (p: OpticsPatch) => patchModules({ optics: patchOptics(o, p) });
  const setElement = (id: string, p: Partial<OpticElement>) => patchModules({ optics: { ...o, elements: o.elements.map((e) => (e.id === id ? { ...e, ...p } : e)) } });
  const tr = opticsTrace(o);
  const el = o.elements.find((e) => e.id === picked) ?? o.elements.find((e) => e.kind !== "screen" && e.kind !== "blocker") ?? o.elements[0];
  const first = turningHits(tr.hits)[0];
  const image = objectRays(o);
  const refractor = el && ["glass_block", "prism", "semicircle"].includes(el.kind);
  const nm = sourceWavelength(o.source);
  const crit = el && refractor ? criticalAngle(refractiveIndex(el.material, nm), refractiveIndex(o.medium, nm)) : null;
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Action onClick={() => useSim.getState().focus({ target: [0, OPTICS_TABLE.center[1] + 0.1, 0], distance: 12 * Math.max(1, window.innerHeight / window.innerWidth) })}>Table close-up</Action>
        <Action onClick={() => useSim.getState().focus({ preset: "home" })}>Room view</Action>
      </div>
      <select aria-label="Optics experiment" className="w-full rounded-xl bg-white/80 px-3 py-2.5 text-sm" value="" onChange={(e) => e.target.value && execNow({ op: "show_optics", preset: e.target.value as OpticPreset })}>
        <option value="">Try an experiment…</option>
        {OPTIC_PRESETS.map((p) => <option key={p} value={p}>{OPTIC_LABELS[p]}</option>)}
      </select>
      {o.source.kind !== "off" && (
        <>
          <Caption>Light</Caption>
          <Seg label="Light colour" value={o.source.wavelengthNm != null ? null : o.source.color} options={[["red", "Red"], ["green", "Green"], ["blue", "Blue"], ["white", "White"]] as const} onChange={(color) => set({ color })} />
          <div className="group-rows mt-2">
            <Slider label="Beam angle" min={-180} max={180} step={1} value={Math.round(((o.source.angleDeg + 540) % 360) - 180)} display={`${Math.round(((o.source.angleDeg + 540) % 360) - 180)}°`} onChange={(angleDeg) => set({ angleDeg })} />
            {(o.source.color !== "white" || o.source.wavelengthNm != null) && <Slider label="Wavelength" min={380} max={780} step={5} value={nm} display={`${nm} nm`} onChange={(wavelengthNm) => set({ wavelengthNm })} />}
            {o.source.aimAt && <Slider label="Source distance" min={0.2} max={2.6} step={0.05} value={o.source.reach} display={`${o.source.reach.toFixed(2)} m`} onChange={(reachM) => set({ reachM })} />}
          </div>
          <Seg label="Source type" value={o.source.kind} options={[["laser", "Laser"], ["ray_box", "Ray box"], ["lamp", "Point source"]] as const} onChange={(sourceKind) => set({ sourceKind, spread: sourceKind === "lamp" ? 40 : 0.8, rays: sourceKind === "laser" ? 1 : 5 })} />
          {o.source.kind !== "laser" && <div className="group-rows mt-2">
            <Slider label="Number of rays" min={1} max={9} step={2} value={o.source.rays} display={`${o.source.rays}`} onChange={(rays) => set({ rays })} />
            <Slider label={o.source.kind === "ray_box" ? "Beam width" : "Fan angle"} min={0.1} max={o.source.kind === "ray_box" ? 2.4 : 120} step={o.source.kind === "ray_box" ? 0.1 : 1} value={o.source.spread} display={`${o.source.spread.toFixed(1)}${o.source.kind === "ray_box" ? " m" : "°"}`} onChange={(spread) => set({ spread })} />
          </div>}
        </>
      )}
      {el ? (
        <>
          <Caption>{o.elements.length > 1 ? "Element" : "The " + el.kind.replace(/_/g, " ")}</Caption>
          {o.elements.length > 1 && (
            <select aria-label="Pick an element" className="w-full rounded-xl bg-white/80 px-3 py-2.5 text-sm" value={el.id} onChange={(e) => { setPicked(e.target.value); const p = o.elements.find((x) => x.id === e.target.value); if (p) noteFocus({ kind: "optic", id: p.id, label: `The ${p.kind.replace(/_/g, " ")} "${p.id}" on the optics table` }); }}>
              {o.elements.map((e) => <option key={e.id} value={e.id}>{e.id.replace(/_/g, " ")} ({e.kind.replace(/_/g, " ")})</option>)}
            </select>
          )}
          <div className="group-rows mt-2">
            <Slider label="Turn" min={-180} max={180} step={1} value={Math.round(((el.rotationDeg + 540) % 360) - 180)} display={`${Math.round(((el.rotationDeg + 540) % 360) - 180)}°`} onChange={(rotationDeg) => setElement(el.id, { rotationDeg })} />
            <Slider label="Element X" min={-TABLE.x} max={TABLE.x} step={0.05} value={el.x} display={`${el.x.toFixed(2)} m`} onChange={(x) => setElement(el.id, { x })} />
            <Slider label="Element Z" min={-TABLE.z} max={TABLE.z} step={0.05} value={el.z} display={`${el.z.toFixed(2)} m`} onChange={(z) => setElement(el.id, { z })} />
            {signedFocal(el) !== null && <Slider label="Focal length" min={0.3} max={2} step={0.05} value={el.focalLength} display={`${el.focalLength.toFixed(2)} m`} onChange={(focalLength) => setElement(el.id, { focalLength })} />}
          </div>
          {refractor && <Seg label="Material" value={el.material === "air" ? null : el.material} options={[["water", "Water"], ["acrylic", "Acrylic"], ["glass", "Glass"], ["diamond", "Diamond"]] as const} onChange={(material) => setElement(el.id, { material })} />}
        </>
      ) : null}
      {o.object && (
        <div className="group-rows mt-2">
          <Slider label="Object distance" min={0.2} max={2.6} step={0.05} value={o.object.distance} display={`${o.object.distance.toFixed(2)} m`} onChange={(distanceM) => set({ object: { target: o.object!.target, distanceM, heightM: o.object!.height } })} />
        </div>
      )}
      {o.mixing && (
        <>
          <Toggle label="Red lamp" checked={o.mixing.red} onChange={(red) => set({ mixing: { ...o.mixing!, red } })} />
          <Toggle label="Green lamp" checked={o.mixing.green} onChange={(green) => set({ mixing: { ...o.mixing!, green } })} />
          <Toggle label="Blue lamp" checked={o.mixing.blue} onChange={(blue) => set({ mixing: { ...o.mixing!, blue } })} />
        </>
      )}
      {!o.mixing && (
        <>
          <Caption>Around the table</Caption>
          <Seg label="Medium" value={o.medium} options={[["air", "Air"], ["water", "Under water"]] as const} onChange={(medium) => set({ medium })} />
          <Toggle label="Show normals and angles" checked={o.normals} onChange={(normals) => set({ normals })} />
          <Toggle label="Show faint reflections" checked={o.reflections !== false} onChange={(reflections) => set({ reflections })} />
        </>
      )}
      <div className="group-rows mt-2">
        {first && <Row label="Angle of incidence" value={`${first.incidenceDeg.toFixed(1)}°`} />}
        {first && first.outDeg !== null && <Row label={first.kind === "refract" ? "Angle of refraction" : first.kind === "lens" ? "Exit angle to axis" : "Angle of reflection"} value={`${first.outDeg.toFixed(1)}°`} />}
        {first?.kind === "total_internal_reflection" && <Row label="Light" value="totally reflected" />}
        {crit !== null && <Row label={`Critical angle (${el.material} → ${o.medium})`} value={`${crit.toFixed(1)}°`} />}
        {refractor && <Row label={`Refractive index (${nm} nm)`} value={refractiveIndex(el.material, nm).toFixed(4)} />}
        {first && first.kind !== "absorb" && first.kind !== "lens" && <Row label="Surface reflectance" value={`${((first.kind === "refract" ? fresnelReflectance(first.n1, first.n2, Math.cos(first.incidenceDeg * Math.PI / 180)) : 1) * 100).toFixed(1)}%`} />}
        {tr.spread !== null && <Row label="Rainbow spread" value={`${tr.spread.toFixed(1)}°`} />}
        {image && <Row label="Image" value={image.result.imageDistance === null ? "none (object at F)" : `${Math.abs(image.result.imageDistance).toFixed(2)} m, ${image.result.description}`} />}
        {o.source.kind !== "off" && o.elements.filter((e) => e.kind === "screen").map((screen) => <Row key={screen.id} label={`${screen.id.replace(/_/g, " ")} capture`} value={`${(tr.spots.filter((spot) => !spot.diagram && spot.elementId === screen.id).reduce((sum, spot) => sum + spot.intensity, 0) * 100).toFixed(1)}%`} />)}
      </div>
      <Toggle label="Dim room for projection" checked={o.lighting === "dim"} onChange={(dim) => set({ lighting: dim ? "dim" : "bright" })} />
      {tr.truncated && <Note>Ray limit reached. This view omits some later bounces.</Note>}
      {image && <Note>{o.elements.some((e) => e.kind === "concave_mirror" || e.kind === "convex_mirror") ? "Image distances use the paraxial approximation. Spherical mirror rays can show aberration away from the axis." : "Ideal thin-lens or plane-mirror image for the selected element. A virtual image cannot be projected onto a screen."}</Note>}
      <Note>{o.mixing ? "Light colours add up: red + green = yellow, green + blue = cyan, red + blue = magenta, all three = white." : "Angles are measured from the normal, the dashed line at right angles to the surface."}</Note>
    </>
  );
}

const TEMP_RANGE: Record<SubstanceId, [number, number]> = { water: [-40, 140], iron: [0, 3200], nitrogen: [-230, -150], chocolate: [0, 80] };

function LabControls() {
  const { particles, cell, reaction, population, genetics, osmosis } = useSim(useShallow((s) => ({ particles: s.modules.particles, cell: s.modules.cell, reaction: s.modules.reaction, population: s.modules.population, genetics: s.modules.genetics, osmosis: s.modules.osmosis })));
  const readingTable = useSim((s) => s.camera.preset === "periodic_table");
  const table = useSim((s) => s.modules.periodicTable) ?? EMPTY_TABLE;
  const element = table.elements.length === 1 ? PERIODIC_ELEMENTS[table.elements[0] - 1] : null;
  const busy = useSim(s => s.aiStatus !== "idle");
  const tableAction = (command: Parameters<typeof execNow>[0]) => { cancelPlayback(); execNow(command); };
  const active = readingTable ? "table" : particles ? "matter" : cell ? "cell" : reaction ? "reaction" : population ? "population" : genetics ? "genetics" : osmosis ? "osmosis" : "chem";
  const pick = (k: typeof active) => {
    if (k === "table") { execNow({ op: "show_periodic_table" }); return; }
    if (readingTable) useSim.getState().focus({ preset: "home" });
    if (k === "chem") patchModules({ particles: null, cell: null, reaction: null, population: null, genetics: null, osmosis: null });
    else if (k === "matter") execNow({ op: "show_particles", substance: "water", temperatureC: 20 });
    else if (k === "reaction") execNow({ op: "show_reaction" });
    else if (k === "population") execNow({ op: "show_population", model: "predator_prey" });
    else if (k === "genetics") execNow({ op: "show_genetics", parent1: "Rr", parent2: "Rr" });
    else if (k === "osmosis") execNow({ op: "show_osmosis", mode: "osmosis" });
    else execNow({ op: "show_cell", kind: "animal" });
  };
  return (
    <>
      <Seg label="Explore" value={active} options={[["chem", "Molecules"], ["table", "Table"], ["matter", "Matter"], ["reaction", "Reactions"], ["cell", "Cells"], ["population", "Ecology"], ["genetics", "Genetics"], ["osmosis", "Osmosis"]] as const} onChange={pick} cols={3} />
      {readingTable && <>
        <Caption>118 elements</Caption>
        <select aria-label="Find an element" className="mt-1 w-full rounded-xl bg-white/80 px-3 py-2.5 text-sm" value={table.elements.length === 1 ? table.elements[0] : ""} onChange={(e) => {
          if (!e.target.value) return;
          const el = PERIODIC_ELEMENTS[Number(e.target.value) - 1];
          noteElement(el.number);
          tableAction({ op: "show_periodic_table", elements: [el.number], groups: [], periods: [], caption: `${el.number} · ${el.name} (${el.symbol}) · Period ${el.period}${el.group ? ` · Group ${el.group}` : ""}`, focus: false });
        }}>
          <option value="">Find an element…</option>
          {PERIODIC_ELEMENTS.map((e) => <option key={e.number} value={e.number}>{e.number} · {e.symbol} · {e.name}</option>)}
        </select>
        {element && <div className="group-rows mt-2 px-3 py-2 text-sm" role="status">
          <p className="font-bold">{element.name} · {element.symbol} · {element.number}</p>
          <p>Period {element.period} · {element.group ? `Group ${element.group}` : element.series}</p>
          <p>{element.weight.startsWith("[") ? "Isotope mass number" : "Abridged atomic weight"}: {element.weight}</p>
          <p className="mt-2 leading-relaxed text-ink-2">Atomic number {element.number} means {element.number} protons. A neutral {element.name.toLowerCase()} atom has {element.number} electrons.</p>
          <p className="mt-1 leading-relaxed text-ink-2">{element.weight.startsWith("[") ? "The bracketed value is an isotope’s mass number, not a standard atomic weight." : "Atomic weight describes the relative average mass for an element’s natural isotope mixture. It does not give an exact neutron count."}</p>
        </div>}
        {element && <div className="mt-2 grid grid-cols-2 gap-2">
          <button className="btn btn-soft rounded-xl px-3 py-2 text-sm" onClick={() => tableAction({ op: "show_periodic_table", elements: element.group ? [element.number] : PERIODIC_ELEMENTS.filter(e => e.series === element.series).map(e => e.number), groups: element.group ? [element.group] : [], periods: [], focus: false, caption: element.group ? `${element.name} belongs to Group ${element.group}` : `${element.name} belongs to the ${element.series} series` })}>Show its {element.group ? "group" : "series"}</button>
          <button className="btn btn-soft rounded-xl px-3 py-2 text-sm" onClick={() => tableAction({ op: "show_periodic_table", elements: [element.number], groups: [], periods: [element.period], focus: false, caption: `${element.name} is in Period ${element.period}` })}>Show its period</button>
          <button className="btn btn-ink col-span-2 rounded-xl px-3 py-2 text-sm" disabled={busy} onClick={() => void runPlan(periodicLesson(element.number), "local")}>Explain {element.name}</button>
        </div>}
        <button className="btn btn-soft mt-2 w-full rounded-xl px-3 py-2 text-sm" disabled={busy} onClick={() => void runPlan(periodicLesson(), "local")}>Explain how to read the table</button>
        <button className="btn btn-soft mt-2 w-full" onClick={() => tableAction({ op: "show_periodic_table", ...EMPTY_TABLE, focus: false })}>Clear table markings</button>
        <Note>Tap an element or ask about groups, periods, and trends. Simu can circle elements and draw on this table.</Note>
      </>}
      {active === "chem" && <ChemControls />}
      {particles && (
        <>
          <Caption>Substance</Caption>
          <Seg label="Substance" value={particles.substance} options={SUBSTANCE_IDS.map((id) => [id, SUBSTANCES[id].name] as const)} onChange={(substance) => patchModules({ particles: { substance, temperatureC: substance === particles.substance ? particles.temperatureC : 20 } })} cols={2} />
          <div className="group-rows mt-2">
            <Slider
              label="Temperature"
              min={TEMP_RANGE[particles.substance][0]}
              max={TEMP_RANGE[particles.substance][1]}
              step={1}
              value={Math.min(Math.max(particles.temperatureC, TEMP_RANGE[particles.substance][0]), TEMP_RANGE[particles.substance][1])}
              display={`${particles.temperatureC.toFixed(0)} °C`}
              sub={phaseAt(particles.substance, particles.temperatureC)}
              onChange={(temperatureC) => patchModules({ particles: { ...particles, temperatureC } })}
            />
          </div>
          <Note>Hotter particles move faster. Melting and boiling happen when they move fast enough to break free.</Note>
        </>
      )}
      {reaction && <ReactionControls />}
      {population && <PopulationControls />}
      {genetics && <GeneticsControls />}
      {osmosis && <OsmosisControls />}
      {cell && (
        <>
          <Caption>Cell</Caption>
          <Picker<CellKind> label="Cell" value={cell.kind} onChange={(kind) => { execNow({ op: "show_cell", kind }); noteFocus({ kind: "cell", label: CELL_NAMES[kind], detail: CELL_SUMMARY[kind] }); }} groups={CELL_PICKER} />
          <Caption>Parts</Caption>
          <div className="group-rows">
            {CELL_PARTS[cell.kind].map((id) => {
              const on = cell.highlight === id;
              return (
                <button key={id} type="button" aria-pressed={on} className="btn-quiet block w-full px-3.5 py-2 text-left" onClick={() => pickCellPart(on ? null : id)}>
                  <span className="flex items-center gap-2 text-[15px] font-bold">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ORGANELLES[id].color }} />
                    {ORGANELLES[id].name}
                  </span>
                  {on && <span className="mt-0.5 block text-[13px] font-semibold leading-snug text-ink-2">{ORGANELLES[id].job}</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

/** Always available even when Controls is collapsed in the close table view. */
export function TableViewActions() {
  const showing = useSim(s => s.world === "lab" && s.camera.preset === "periodic_table");
  const speech = useSim(s => s.speech);
  const tableReply = useSim(s => {
    const command = s.lastPlan?.steps[0]?.commands.find(c => c.op === "show_periodic_table");
    const selected = s.modules.periodicTable?.elements;
    return command?.op === "show_periodic_table" && selected?.length === 1 && command.elements?.includes(selected[0]) ? s.explanation?.reply : null;
  });
  if (!showing) return null;
  return <><nav aria-label="Periodic table view" className="table-view-actions pointer-events-auto fixed left-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-full glass p-1">
    <button className="btn rounded-full px-3 py-2 text-[12px] font-bold" onClick={() => { cancelPlayback(); useSim.getState().focus({ preset: "home" }); }}>Back to lab</button>
    <button className="btn rounded-full px-3 py-2 text-[12px] font-bold" onClick={() => useSim.getState().focus({ preset: "periodic_table" })}>Fit table</button>
  </nav>
    {(speech || tableReply) && <div className="table-lesson-caption glass" role="status" aria-live="polite">
      <p>{speech?.text ?? tableReply}</p>
      {speech && <button className="btn btn-quiet mt-2 rounded-full px-3 py-1 text-[12px] font-bold" onClick={skipSpeech}>Next</button>}
    </div>}
  </>;
}

// ---------- shared card shell ----------

/** Keeps children mounted briefly after `show` turns false so they can animate out. */
function usePresence(show: boolean, ms = 320) {
  const [mounted, setMounted] = useState(show);
  const [prevShow, setPrevShow] = useState(show);
  if (show !== prevShow) {
    setPrevShow(show);
    if (show) setMounted(true);
  }
  useEffect(() => {
    if (show) return;
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [show, ms]);
  return { mounted: mounted || show, closing: !show };
}

/** One card in the right rail: same header, body and footer for every card. */
/** Height of an element, kept current with a ResizeObserver. */
function useHeight<T extends HTMLElement>() {
  // Callback ref: start observing whenever the element (re)appears.
  const [el, setEl] = useState<T | null>(null);
  const [h, setH] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, h] as const;
}

interface CardContent {
  /** Changes whenever the card shows something else, which triggers the morph. */
  key: string;
  title: string;
  sub?: string;
  closeLabel: string;
  onClose: () => void;
  body: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * The one card in the rail. When its content changes (controls -> selected
 * object -> controls) the glass springs to the new height while the new
 * content fades and scales in, like a matched-geometry transition.
 */
function MorphCard({ content }: { content: CardContent | null }) {
  const { mounted, closing } = usePresence(Boolean(content));
  // Keep the last content during the closing animation.
  const [last, setLast] = useState(content);
  if (content && content !== last) setLast(content);
  const c = content ?? last;
  const [inner, h] = useHeight<HTMLDivElement>();
  if (!mounted || !c) return null;
  return (
    <div className="rail-item" data-closing={closing || undefined}>
      {/* The clip collapses the card when it closes; the padding (cancelled by
          equal negative margins) leaves room for the glass's soft drop shadow. */}
      <div className="-mx-8 -mb-12 -mt-3 min-h-0 overflow-hidden px-8 pb-12 pt-3">
        <section className="glass morph-card pointer-events-auto overflow-hidden rounded-[22px]" style={{ height: h }} aria-label={c.title}>
          <div ref={inner} className="scroll-thin max-h-[calc(100dvh-210px)] overflow-y-auto overflow-x-hidden p-3">
            <div key={c.key} className="morph-in">
              <div className="flex items-start gap-2 pb-2 pl-1">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[17px] font-extrabold first-letter:uppercase">{c.title}</h2>
                  {c.sub && <p className="truncate text-[13px] font-semibold text-ink-3">{c.sub}</p>}
                </div>
                <button className="btn btn-quiet grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-2" aria-label={c.closeLabel} onClick={c.onClose}>
                  <X size={17} />
                </button>
              </div>
              {c.body}
              {c.footer && <div className="mt-3 flex gap-1 border-t border-[var(--hairline)] pt-2">{c.footer}</div>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Footer tool: icon with a short label, shared by every rail card. */
function Tool({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="btn btn-quiet flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-ink-2" title={label} onClick={onClick}>
      {children}
      <span className="max-w-full truncate text-[11px] font-bold">{label}</span>
    </button>
  );
}

// ---------- controls card ----------

// Controls start open only where there is room beside the world.
const WIDE = "(min-width: 1440px)";
const subscribeWide = (cb: () => void) => {
  const m = window.matchMedia(WIDE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

function useControls() {
  const world = useSim((s) => s.world);
  switch (world) {
    case "mechanics": return { name: "Mechanics lab", body: <MechanicsControls /> };
    case "anatomy": return { name: "Anatomy lab", body: <AnatomyControls /> };
    case "math_studio": return { name: "Math studio", body: <SchoolMathControls /> };
    case "court":
      return { name: "Throwing", body: <ProjectileControls /> };
    case "lab":
      return { name: "Lab bench", body: <LabControls /> };
    case "space":
      return { name: "Orbits", body: <SpaceControls /> };
    case "ocean":
      return { name: "Floating and sinking", body: <OceanControls /> };
    case "math":
      return { name: "Graphs and shapes", body: <MathControls /> };
    case "globe":
      return { name: "Globe", body: <GlobeControls /> };
    case "workshop":
      return { name: "Workshop", body: <WorkshopControls /> };
    case "optics":
      return { name: "Light lab", body: <OpticsControls /> };
    case "stage":
      return { name: "Stage", body: <StageControls /> };
    default:
      return { name: "Gravity", body: <GravityControls /> };
  }
}

// ---------- selection card ----------

/** Mass (log scale) and bounciness; applied when the slider is released. */
function PhysicsTuning({ id, mass, bounciness }: { id: string; mass: number; bounciness: number }) {
  const [logM, setLogM] = useState(Math.log10(mass));
  const [b, setB] = useState(bounciness);
  const m = 10 ** logM;
  return (
    <>
      <Slider label="Mass" min={-1.3} max={1.7} step={0.01} value={logM} display={fmt(m, "kg", m < 1 ? 3 : 1)} onChange={setLogM} onCommit={() => execNow({ op: "set_object_property", id, property: "mass", value: Math.round(m * 1000) / 1000 })} />
      <Slider label="Bounciness" min={0} max={1} step={0.05} value={b} display={`${Math.round(b * 100)}%`} onChange={setB} onCommit={() => execNow({ op: "set_object_property", id, property: "bounciness", value: b })} />
    </>
  );
}

export function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[15px]">
      <span className="font-semibold text-ink-2">{label}</span>
      <span className="text-right font-bold tabular-nums">{value}</span>
    </div>
  );
}

/** Title, subtitle, body and footer tools for whatever is selected (or null). */
function useSelection() {
  const sel = useSim((s) => s.selectedId);
  const { obj, ch } = useSim(useShallow((s) => ({ obj: sel ? s.objects[sel] : undefined, ch: sel ? s.characters[sel] : undefined })));
  const [speed, setSpeed] = useState(0);
  useEffect(() => {
    if (!sel || !obj || obj.physics !== "dynamic") return;
    const t = setInterval(() => setSpeed(liveSpeed(sel)), 200);
    return () => clearInterval(t);
  }, [sel, obj]);
  if (!sel || (!obj && !ch)) return null;

  const askAbout = (text: string) => {
    useSim.getState().set({ draft: text });
    document.getElementById("prompt")?.focus();
  };
  const zoom = (
    <Tool
      label="Zoom in"
      onClick={() => {
        const p = livePosition(sel);
        if (p) useSim.getState().focus({ target: p, zoom: "close" });
      }}
    >
      <Focus size={18} />
    </Tool>
  );

  if (ch) {
    return {
      key: ch.id,
      title: ch.name,
      sub: ch.kind === "robot" ? "Your guide" : ch.kind[0].toUpperCase() + ch.kind.slice(1),
      body: null,
      footer: (
        <>
          <Tool label="Wave" onClick={() => execNow({ op: "animate_character", id: ch.id, animation: "wave" })}>
            <Hand size={18} />
          </Tool>
          <Tool label="Cheer" onClick={() => execNow({ op: "animate_character", id: ch.id, animation: "celebrate" })}>
            <PartyPopper size={18} />
          </Tool>
          {ch.id === GUIDE_ID && (
            <Tool label="Ask Simu" onClick={() => askAbout("Simu, what am I looking at?")}>
              <MessageCircle size={18} />
            </Tool>
          )}
          {zoom}
        </>
      ),
    };
  }
  const o = obj!;
  if (o.type === "molecule") {
    const m = getMolecule(o.molecule);
    if (!m) return null;
    return {
      key: o.id,
      title: `${m.name}, ${m.formula}`,
      sub: m.shape ? `${m.shape[0].toUpperCase()}${m.shape.slice(1)} shape · ${molarMass(m)} g/mol` : `${molarMass(m)} g/mol · ${m.atoms.length} atoms`,
      body: (
        <div className="group-rows">
          {m.facts.map((f) => (
            <p key={f} className="px-3.5 py-2.5 text-[14px] font-semibold leading-snug text-ink-2">
              {f}
            </p>
          ))}
        </div>
      ),
      footer: (
        <>
          <Tool label={`Why ${m.shape}?`} onClick={() => askAbout(`Why is ${m.name} ${m.shape}?`)}>
            <MessageCircle size={18} />
          </Tool>
          {zoom}
        </>
      ),
    };
  }
  if (o.type === "atom") {
    const e = ELEMENTS.find((x) => x.symbol === o.element);
    return {
      key: o.id,
      title: e ? `${e.name} atom` : objectName(o),
      sub: "Simplified model",
      body: e && (
        <div className="group-rows">
          <Row label="Protons" value={e.z} />
          <Row label="Neutrons" value={e.massNumber - e.z} />
          <Row label="Electrons" value={e.z} />
        </div>
      ),
      footer: (
        <>
          {e && (
            <Tool label="Ask" onClick={() => askAbout(`Tell me about ${e.name}`)}>
              <MessageCircle size={18} />
            </Tool>
          )}
          {zoom}
        </>
      ),
    };
  }
  const name = objectName(o);
  const dynamic = o.physics === "dynamic";
  const meas = o.type === "shape" ? measureShape(o.shape, o.size.map((v) => v * o.scale) as [number, number, number], o.sides) : null;
  return {
    key: o.id,
    title: name,
    sub: dynamic ? "Drag it to throw it" : o.type === "asset" ? ASSETS[o.asset].name : "Shape",
    body: dynamic ? (
      <div className="group-rows">
        <Row label="Speed now" value={fmt(speed, "m/s")} />
        {o.type === "shape" && o.material && <Row label="Density" value={`${MATERIALS[o.material].density.toLocaleString("en-US")} kg/m³`} />}
        <PhysicsTuning key={o.id} id={o.id} mass={o.massKg} bounciness={o.bounciness} />
      </div>
    ) : meas?.volume !== undefined ? (
      <div className="group-rows">
        <Row label="Volume" value={fmt(meas.volume, "m³", 3)} />
        {meas.surfaceArea !== undefined && <Row label="Surface area" value={fmt(meas.surfaceArea, "m²", 3)} />}
      </div>
    ) : null,
    footer: (
      <>
        {dynamic && (
          <Tool
            label="Push"
            onClick={() => {
              if (!getBody(o.id)) return;
              const a = Math.random() * Math.PI * 2;
              // A 3 m/s shove: impulse = mass × change in velocity.
              execNow({ op: "apply_impulse", id: o.id, impulse: [Math.cos(a) * 3 * o.massKg, 1.5 * o.massKg, Math.sin(a) * 3 * o.massKg] });
            }}
          >
            <Hand size={18} />
          </Tool>
        )}
        <Tool label="Ask" onClick={() => askAbout(`What happens to the ${name.toLowerCase()} if `)}>
          <MessageCircle size={18} />
        </Tool>
        <Tool label="Remove" onClick={() => execNow({ op: "remove_object", id: o.id })}>
          <Trash size={18} />
        </Tool>
        {zoom}
      </>
    ),
  };
}

// ---------- the rail ----------

/**
 * Bottom-right tool area: the Controls button with a single card growing out
 * of it. The card shows the selected object if there is one, otherwise the
 * controls (when open). Never both at once.
 */
export function RightRail() {
  const paused = useSim((s) => s.paused);
  const set = useSim((s) => s.set);
  // Server render starts closed; wide screens open it right after hydration.
  const desktop = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);
  const tableCamera = useSim((s) => s.camera.preset === "periodic_table" ? s.camera.nonce : -1);
  const [userOpen, setUserOpen] = useState<{ value: boolean; tableCamera: number } | null>(null);
  const setOpen = (value: boolean) => setUserOpen({ value, tableCamera });
  // A new table view needs the phone/tablet canvas; students can reopen tools.
  const controlsOpen = tableCamera !== -1 && !desktop && userOpen?.tableCamera !== tableCamera ? false : userOpen?.value ?? desktop;
  const mod = useControls();
  const selection = useSelection();
  // The menu lives on the left, so a selected object's card can show beside it.
  const showingSelection = Boolean(selection);

  const content: CardContent | null = showingSelection
    ? {
        key: `sel:${selection!.key}`,
        title: selection!.title,
        sub: selection!.sub,
        closeLabel: controlsOpen ? "Back to controls" : "Deselect",
        onClose: () => set({ selectedId: null }),
        body: selection!.body,
        footer: selection!.footer,
      }
    : controlsOpen
      ? {
          key: `ctl:${mod.name}`,
          title: mod.name,
          closeLabel: "Hide controls",
          onClose: () => setOpen(false),
          body: mod.body,
          footer: (
            <>
              <Tool label={paused ? "Play" : "Pause"} onClick={() => set({ paused: !paused })}>
                <SwapIcon id={paused ? "play" : "pause"}>{paused ? <Play size={18} /> : <Pause size={18} />}</SwapIcon>
              </Tool>
              <Tool label="Reset" onClick={() => execNow({ op: "reset_simulation" })}>
                <RotateCcw size={18} />
              </Tool>
              <Tool label="Start view" onClick={() => useSim.getState().focus({ preset: "home" })}>
                <House size={18} />
              </Tool>
              <Tool label="From above" onClick={() => useSim.getState().focus({ preset: "top" })}>
                <Camera size={18} />
              </Tool>
            </>
          ),
        }
      : null;

  return (
    <div className="pointer-events-none fixed bottom-[calc(84px+env(safe-area-inset-bottom))] right-3 top-[64px] z-30 flex w-[min(300px,calc(100vw-24px))] flex-col items-end justify-end sm:bottom-7 sm:right-6 sm:top-[80px] lg:z-10">
      <div className="flex min-h-0 w-full flex-col [justify-content:safe_flex-end]">
        <MorphCard content={content} />
      </div>
      <button
        className={`btn pointer-events-auto mt-2.5 flex h-11 shrink-0 items-center gap-2 rounded-full pl-3.5 pr-4 text-[15px] font-bold max-[359px]:px-3 ${controlsOpen && !showingSelection ? "btn-ink shadow-[0_8px_20px_-8px_rgba(28,30,34,0.6)]" : "glass"}`}
        aria-label="Controls"
        aria-expanded={controlsOpen && !showingSelection}
        onClick={() => {
          // From an object card, the button morphs the card back to controls.
          if (showingSelection) {
            set({ selectedId: null });
            setOpen(true);
          } else setOpen(!controlsOpen);
        }}
      >
        <SlidersHorizontal size={18} /><span className="hidden min-[360px]:inline">Controls</span>
      </button>
    </div>
  );
}
