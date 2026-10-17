"use client";

import { Camera, Focus, Hand, House, MessageCircle, PartyPopper, Pause, Play, RotateCcw, Rocket, SlidersHorizontal, Trash, X } from "lucide-react";
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { useShallow } from "zustand/react/shallow";
import { useSim, projectileResult } from "@/lib/store";
import { execNow } from "@/lib/player";
import { GRAVITY_PRESETS, fmt } from "@/lib/engine/projectile";
import { ELEMENTS, MOLECULES, MOLECULE_IDS, type MoleculeId } from "@/lib/engine/chemistry";
import { ASSETS, GUIDE_ID } from "@/lib/world/catalog";
import { MODULE_DEFAULTS, type Modules } from "@/lib/modules";
import { isValidExpression } from "@/lib/engine/expr";
import { measureShape } from "@/lib/engine/geometry";
import { PLACES, distanceKm } from "@/lib/engine/geo";
import { Segmented, SwapIcon } from "./kit";
import { CELL_KINDS, CELL_PARTS, ORGANELLES } from "@/lib/engine/biology";
import { MATERIALS, SUBSTANCES, SUBSTANCE_IDS, phaseAt, type MaterialId, type SubstanceId } from "@/lib/engine/physics2";
import { objectName } from "@/lib/world/scene";
import { getBody, livePosition, liveSpeed } from "@/lib/world/runtime";
import { EMPTY_TABLE, PERIODIC_ELEMENTS } from "@/lib/periodic-table";

// ---------- small building blocks ----------

function Slider({ label, value, min, max, step, display, sub, onChange, onCommit }: { label: string; value: number; min: number; max: number; step: number; display: string; sub?: string; onChange: (v: number) => void; onCommit?: () => void }) {
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

function Caption({ children }: { children: React.ReactNode }) {
  return <p className="px-1 pb-1.5 pt-3 text-[13px] font-semibold text-ink-3">{children}</p>;
}

function Note({ children }: { children: React.ReactNode }) {
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
        <Slider label="Gravity" min={0} max={25} step={0.01} value={g} display={fmt(g, "m/s²")} onChange={setG} />
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
      <Seg label="Gravity" value={nearestPreset(p.gravity)} options={gravityOptions} onChange={(gravity) => setProjectile({ gravity }, true)} cols={3} />
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

function ChemControls() {
  const objects = useSim((s) => s.objects);
  const [compare, setCompare] = useState(false);
  const chem = Object.values(objects).filter((o) => o.type === "molecule" || o.type === "atom");
  const current = chem.length === 1 ? chem[0] : null;
  const show = (cmd: { kind: "molecule"; id: MoleculeId } | { kind: "atom"; id: string }) => {
    if (!compare || chem.length >= 2) for (const o of chem) useSim.getState().removeObject(o.id);
    const id = `${cmd.kind}_${cmd.id.toLowerCase()}_${++chemSeq}`;
    if (cmd.kind === "molecule") execNow({ op: "build_molecule", id, molecule: cmd.id });
    else execNow({ op: "build_atom", id, element: cmd.id });
  };
  return (
    <>
      <button className="btn btn-soft mt-2 w-full" onClick={() => execNow({ op: "show_periodic_table" })}>Read periodic table</button>
      <Caption>Molecules</Caption>
      <Seg label="Molecules" value={current?.type === "molecule" ? current.molecule : null} options={MOLECULE_IDS.map((m) => [m, MOLECULES[m].formula] as const)} onChange={(m) => show({ kind: "molecule", id: m })} cols={4} />
      <Caption>Atoms, simplified model</Caption>
      <Seg label="Atoms" value={current?.type === "atom" ? current.element : null} options={ELEMENTS.map((e) => [e.symbol, e.symbol] as const)} onChange={(el) => show({ kind: "atom", id: el })} cols={5} />
      <Toggle label="Compare two side by side" checked={compare} onChange={setCompare} />
    </>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
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

const patchModules = (patch: Partial<Modules>) => {
  const s = useSim.getState();
  s.set({ modules: { ...s.modules, ...patch } });
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
  const { circuit, lever, wave } = useSim(useShallow((s) => ({ circuit: s.modules.circuit, lever: s.modules.lever, wave: s.modules.wave })));
  const active = circuit ? "circuit" : lever ? "lever" : wave ? "wave" : null;
  const pick = (k: "circuit" | "lever" | "wave") =>
    patchModules({ circuit: k === "circuit" ? (circuit ?? MODULE_DEFAULTS.circuit) : null, lever: k === "lever" ? (lever ?? MODULE_DEFAULTS.lever) : null, wave: k === "wave" ? (wave ?? MODULE_DEFAULTS.wave) : null });
  return (
    <>
      <Seg label="Experiment" value={active} options={[["circuit", "Circuit"], ["lever", "Lever"], ["wave", "Wave"]] as const} onChange={pick} />
      {circuit && (
        <>
          <Caption>Bulbs connected in</Caption>
          <Seg label="Layout" value={circuit.layout} options={[["series", "Series"], ["parallel", "Parallel"]] as const} onChange={(layout) => patchModules({ circuit: { ...circuit, layout } })} />
          <div className="group-rows mt-2">
            <Slider label="Battery" min={0} max={12} step={0.5} value={circuit.voltage} display={fmt(circuit.voltage, "V", 1)} onChange={(voltage) => patchModules({ circuit: { ...circuit, voltage } })} />
          </div>
          <Caption>Bulbs</Caption>
          <Seg label="Bulbs" value={circuit.bulbs} options={[[1, "1"], [2, "2"], [3, "3"], [4, "4"]] as const} onChange={(bulbs) => patchModules({ circuit: { ...circuit, bulbs, broken: circuit.broken.filter((i) => i < bulbs) } })} />
          <Toggle label="Switch closed" checked={circuit.closed} onChange={(closed) => patchModules({ circuit: { ...circuit, closed } })} />
        </>
      )}
      {!circuit && lever && (
        <div className="group-rows mt-2">
          <Slider label="Left weight" min={0.5} max={20} step={0.5} value={lever.leftMass} display={fmt(lever.leftMass, "kg", 1)} onChange={(leftMass) => patchModules({ lever: { ...lever, leftMass } })} />
          <Slider label="Left distance" min={0.2} max={2.4} step={0.1} value={lever.leftDistance} display={fmt(lever.leftDistance, "m", 1)} onChange={(leftDistance) => patchModules({ lever: { ...lever, leftDistance } })} />
          <Slider label="Right weight" min={0.5} max={20} step={0.5} value={lever.rightMass} display={fmt(lever.rightMass, "kg", 1)} onChange={(rightMass) => patchModules({ lever: { ...lever, rightMass } })} />
          <Slider label="Right distance" min={0.2} max={2.4} step={0.1} value={lever.rightDistance} display={fmt(lever.rightDistance, "m", 1)} onChange={(rightDistance) => patchModules({ lever: { ...lever, rightDistance } })} />
        </div>
      )}
      {!circuit && !lever && wave && (
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
        {circuit ? "Click the switch or any bulb on the board to open the switch or break and fix a bulb." : lever ? "Turning effect = weight × distance from the pivot. Equal on both sides means balanced." : "Wave speed = frequency × wavelength."}
      </Note>
    </>
  );
}

const TEMP_RANGE: Record<SubstanceId, [number, number]> = { water: [-40, 140], iron: [0, 3200], nitrogen: [-230, -150], chocolate: [0, 80] };

function LabControls() {
  const { particles, cell } = useSim(useShallow((s) => ({ particles: s.modules.particles, cell: s.modules.cell })));
  const readingTable = useSim((s) => s.camera.preset === "periodic_table");
  const table = useSim((s) => s.modules.periodicTable) ?? EMPTY_TABLE;
  const element = table.elements.length === 1 ? PERIODIC_ELEMENTS[table.elements[0] - 1] : null;
  const active = readingTable ? "table" : particles ? "matter" : cell ? "cell" : "chem";
  const pick = (k: typeof active) => {
    if (k === "table") { execNow({ op: "show_periodic_table" }); return; }
    if (readingTable) useSim.getState().focus({ preset: "home" });
    if (k === "chem") patchModules({ particles: null, cell: null });
    else if (k === "matter") execNow({ op: "show_particles", substance: "water", temperatureC: 20 });
    else execNow({ op: "show_cell", kind: "animal" });
  };
  return (
    <>
      <Seg label="Explore" value={active} options={[["chem", "Molecules"], ["table", "Table"], ["matter", "Matter"], ["cell", "Cells"]] as const} onChange={pick} />
      {readingTable && <>
        <Caption>118 elements</Caption>
        <select aria-label="Find an element" className="mt-1 w-full rounded-xl bg-white/80 px-3 py-2.5 text-sm" value={table.elements.length === 1 ? table.elements[0] : ""} onChange={(e) => {
          if (!e.target.value) return;
          const el = PERIODIC_ELEMENTS[Number(e.target.value) - 1];
          execNow({ op: "show_periodic_table", elements: [el.number], groups: [], periods: [], caption: `${el.number} · ${el.name} (${el.symbol}) · Period ${el.period}${el.group ? ` · Group ${el.group}` : ""}`, focus: false });
        }}>
          <option value="">Find an element…</option>
          {PERIODIC_ELEMENTS.map((e) => <option key={e.number} value={e.number}>{e.number} · {e.symbol} · {e.name}</option>)}
        </select>
        {element && <div className="group-rows mt-2 px-3 py-2 text-sm" role="status">
          <p className="font-bold">{element.name} · {element.symbol} · {element.number}</p>
          <p>Period {element.period} · {element.group ? `Group ${element.group}` : element.series}</p>
          <p>{element.weight.startsWith("[") ? "Isotope mass number" : "Abridged atomic weight"}: {element.weight}</p>
        </div>}
        <button className="btn btn-soft mt-2 w-full" onClick={() => execNow({ op: "show_periodic_table", ...EMPTY_TABLE, focus: false })}>Clear table markings</button>
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
      {cell && (
        <>
          <Caption>Cell</Caption>
          <Seg label="Cell" value={cell.kind} options={CELL_KINDS.map((k) => [k, k[0].toUpperCase() + k.slice(1)] as const)} onChange={(kind) => execNow({ op: "show_cell", kind })} />
          <Caption>Parts</Caption>
          <div className="group-rows">
            {CELL_PARTS[cell.kind].map((id) => {
              const on = cell.highlight === id;
              return (
                <button key={id} type="button" aria-pressed={on} className="btn-quiet block w-full px-3.5 py-2 text-left" onClick={() => patchModules({ cell: { ...cell, highlight: on ? null : id } })}>
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
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
    const m = MOLECULES[o.molecule];
    return {
      key: o.id,
      title: `${m.name}, ${m.formula}`,
      sub: `${m.shape[0].toUpperCase()}${m.shape.slice(1)} shape`,
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
        className={`btn pointer-events-auto mt-2.5 flex h-11 shrink-0 items-center gap-2 rounded-full pl-3.5 pr-4 text-[15px] font-bold ${controlsOpen && !showingSelection ? "btn-ink shadow-[0_8px_20px_-8px_rgba(28,30,34,0.6)]" : "glass"}`}
        aria-expanded={controlsOpen && !showingSelection}
        onClick={() => {
          // From an object card, the button morphs the card back to controls.
          if (showingSelection) {
            set({ selectedId: null });
            setOpen(true);
          } else setOpen(!controlsOpen);
        }}
      >
        <SlidersHorizontal size={18} /> Controls
      </button>
    </div>
  );
}
