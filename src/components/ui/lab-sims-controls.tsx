"use client";

// Lab panel controls for the reaction bench, population graph, genetics cross and osmosis tank.

import { useState } from "react";
import { noteFocus, useSim } from "@/lib/store";
import { execNow } from "@/lib/player";
import { MODULE_DEFAULTS, type Modules } from "@/lib/modules";
import { balance, runsInBox, RATE_REACTION } from "@/lib/engine/reactions";
import { cyclePeriod } from "@/lib/engine/ecology";
import { punnett, ratio } from "@/lib/engine/genetics";
import { isotonicPosition } from "@/lib/engine/osmosis";
import { Picker, Segmented } from "./kit";

type LabKey = "reaction" | "population" | "genetics" | "osmosis";

/** Merge fields into one lab module and tell the guide what the student changed. */
function patch<K extends LabKey>(key: K, fields: Partial<NonNullable<Modules[K]>>, said?: string) {
  const s = useSim.getState();
  const cur = (s.modules[key] ?? MODULE_DEFAULTS[key]) as NonNullable<Modules[K]>;
  s.set({ modules: { ...s.modules, [key]: { ...cur, ...fields } } });
  noteFocus({ kind: "control", label: said ?? `Changed ${key}: ${Object.entries(fields).map(([f, v]) => `${f} → ${JSON.stringify(v)}`).join(", ")}`.slice(0, 120) });
}

function Slider({ label, value, min, max, step, display, onChange }: { label: string; value: number; min: number; max: number; step: number; display: string; onChange: (v: number) => void }) {
  return (
    <label className="block px-3.5 pb-1.5 pt-2.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-bold">{label}</span>
        <span className="text-[15px] font-bold tabular-nums">{display}</span>
      </span>
      <input type="range" className="slider" min={min} max={max} step={step} value={value} aria-label={label} style={{ ["--fill" as string]: `${((value - min) / (max - min)) * 100}%` }} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
const Caption = ({ children }: { children: React.ReactNode }) => <p className="mb-1 mt-3 px-1 text-[13px] font-semibold text-ink-3">{children}</p>;
const Note = ({ children }: { children: React.ReactNode }) => <p className="mt-2 px-1 text-[13px] font-semibold leading-snug text-ink-3">{children}</p>;

const EQUATIONS: { value: string; label: string; hint: string }[] = [
  { value: RATE_REACTION.equation, label: "Nitric oxide + ozone", hint: "rates" },
  { value: "C3H8 + O2 -> CO2 + H2O", label: "Burning propane", hint: "combustion" },
  { value: "CH4 + O2 -> CO2 + H2O", label: "Burning methane", hint: "combustion" },
  { value: "CO2 + H2O -> C6H12O6 + O2", label: "Photosynthesis", hint: "plants" },
  { value: "C6H12O6 + O2 -> CO2 + H2O", label: "Respiration", hint: "cells" },
  { value: "Fe + O2 -> Fe2O3", label: "Rusting iron", hint: "oxidation" },
  { value: "Mg + O2 -> MgO", label: "Burning magnesium", hint: "metals" },
  { value: "HCl + NaOH -> NaCl + H2O", label: "Neutralisation", hint: "acids" },
  { value: "H2 + O2 -> H2O", label: "Hydrogen fuel", hint: "water" },
  { value: "Zn + HCl -> ZnCl2 + H2", label: "Zinc in acid", hint: "metals" },
];

export function ReactionControls() {
  const r = useSim((s) => s.modules.reaction) ?? MODULE_DEFAULTS.reaction;
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const box = runsInBox(r.equation);
  const tryEquation = (equation: string) => {
    try {
      balance(equation);
      setError(null);
      execNow({ op: "show_reaction", equation });
      noteFocus({ kind: "reaction", label: `Balancing ${equation}` });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Can't balance that");
    }
  };
  return (
    <>
      <Caption>Reaction</Caption>
      <Picker label="Reaction" placeholder="Choose a reaction" value={EQUATIONS.some((e) => e.value === r.equation) ? r.equation : null} onChange={tryEquation} groups={[{ options: EQUATIONS }]} />
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) tryEquation(draft.trim()); }}>
        <input aria-label="Any equation" className="min-w-0 flex-1 rounded-xl bg-white/80 px-3 py-2.5 text-sm" placeholder="Any equation, e.g. Al + O2 -> Al2O3" maxLength={80} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn btn-soft px-3" type="submit">Balance</button>
      </form>
      {error ? <p role="alert" className="mt-1.5 px-1 text-[13px] font-semibold text-red-700">{error}</p> : <Note>Balancing only changes the numbers in front: atoms are rearranged, never made or destroyed.</Note>}
      {box && (
        <>
          <Caption>Reaction box</Caption>
          <div className="group-rows">
            <Slider label="Temperature" min={0} max={200} step={5} value={r.temperatureC} display={`${r.temperatureC} °C`} onChange={(temperatureC) => patch("reaction", { temperatureC })} />
            <Slider label="Molecules of each" min={20} max={90} step={10} value={r.particles} display={`${r.particles}`} onChange={(particles) => patch("reaction", { particles })} />
            <Slider label="Activation energy" min={2} max={30} step={0.5} value={r.activationKJ} display={`${r.activationKJ} kJ/mol`} onChange={(activationKJ) => patch("reaction", { activationKJ })} />
          </div>
          <label className="group-rows mt-2 flex items-center justify-between px-3.5 py-2.5 text-[15px] font-bold">
            Catalyst
            <input type="checkbox" role="switch" className="h-5 w-5 accent-[var(--ink)]" checked={r.catalyst} onChange={(e) => patch("reaction", { catalyst: e.target.checked })} />
          </label>
          <Note>Hotter molecules hit harder, more molecules hit more often, and a catalyst lowers the energy needed. The real Eₐ of this reaction is {RATE_REACTION.eaKJ.toFixed(1)} kJ/mol.</Note>
        </>
      )}
    </>
  );
}

export function PopulationControls() {
  const p = useSim((s) => s.modules.population) ?? MODULE_DEFAULTS.population;
  const logistic = p.model === "logistic";
  return (
    <>
      <Caption>Model</Caption>
      <Segmented label="Population model" value={p.model} options={[["predator_prey", "Predator & prey"], ["logistic", "One species"]] as const} onChange={(model) => execNow({ op: "show_population", model })} />
      <div className="group-rows mt-2">
        {logistic ? (
          <>
            <Slider label="Growth rate r" min={0.05} max={2} step={0.05} value={p.r} display={`${p.r.toFixed(2)} / year`} onChange={(r) => patch("population", { r })} />
            <Slider label="Carrying capacity K" min={50} max={2000} step={50} value={p.K} display={`${p.K}`} onChange={(K) => patch("population", { K })} />
            <Slider label="Starting size" min={1} max={200} step={1} value={p.N0} display={`${p.N0}`} onChange={(N0) => patch("population", { N0 })} />
          </>
        ) : (
          <>
            <Slider label="Prey birth rate" min={0.1} max={1.5} step={0.05} value={p.alpha} display={`${p.alpha.toFixed(2)} / year`} onChange={(alpha) => patch("population", { alpha })} />
            <Slider label="Predator death rate" min={0.1} max={1.5} step={0.05} value={p.gamma} display={`${p.gamma.toFixed(2)} / year`} onChange={(gamma) => patch("population", { gamma })} />
            <Slider label="Starting prey" min={5} max={80} step={1} value={p.prey0} display={`${p.prey0}k`} onChange={(prey0) => patch("population", { prey0 })} />
            <Slider label="Starting predators" min={1} max={30} step={1} value={p.predators0} display={`${p.predators0}k`} onChange={(predators0) => patch("population", { predators0 })} />
          </>
        )}
        <Slider label="Years" min={10} max={100} step={5} value={p.years} display={`${p.years}`} onChange={(years) => patch("population", { years })} />
      </div>
      <Note>{logistic ? "Growth slows as food and space run out, levelling off at the carrying capacity." : `More prey feed more predators, which then eat the prey down, so both rise and fall in turn (about every ${cyclePeriod(p).toFixed(1)} years).`}</Note>
    </>
  );
}

const ONE = ["RR", "Rr", "rr"], TWO = ["RRYY", "RrYy", "rryy", "RrYY", "Rryy", "RRYy", "rrYy"];
const genotypeLabel = (g: string) => `${g}`;

export function GeneticsControls() {
  const g = useSim((s) => s.modules.genetics) ?? MODULE_DEFAULTS.genetics;
  const two = g.parent1.length === 4;
  const list = (two ? TWO : ONE).map((v) => ({ value: v, label: genotypeLabel(v) }));
  let summary = "";
  try {
    const p = punnett(g.parent1, g.parent2);
    summary = `Expect ${ratio(p.phenotypes.map((x) => x.count))}: ${p.phenotypes.map((x) => x.phenotype).join(" : ")}.`;
  } catch { /* shown on the board */ }
  const cross = (parent1: string, parent2: string) => execNow({ op: "show_genetics", parent1, parent2 });
  return (
    <>
      <Caption>Cross</Caption>
      <Segmented label="Genes" value={two ? "two" : "one"} options={[["one", "Seed shape"], ["two", "Shape + colour"]] as const} onChange={(v) => (v === "two" ? cross("RrYy", "RrYy") : cross("Rr", "Rr"))} />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Picker label="Parent 1" value={g.parent1} onChange={(v) => cross(v, g.parent2)} groups={[{ options: list }]} />
        <Picker label="Parent 2" value={g.parent2} onChange={(v) => cross(g.parent1, v)} groups={[{ options: list }]} />
      </div>
      <div className="group-rows mt-2">
        <Slider label="Peas to grow" min={4} max={400} step={4} value={g.offspring} display={`${g.offspring}`} onChange={(offspring) => patch("genetics", { offspring })} />
      </div>
      <button className="btn btn-soft mt-2 w-full" onClick={() => patch("genetics", { seed: g.seed + 1 }, "Grew a new crop of peas")}>Grow a new crop</button>
      <Note>{summary} Capital letters are dominant: one R is enough for a round seed.</Note>
    </>
  );
}

export function OsmosisControls() {
  const o = useSim((s) => s.modules.osmosis) ?? MODULE_DEFAULTS.osmosis;
  const osmosis = o.mode === "osmosis";
  return (
    <>
      <Caption>Experiment</Caption>
      <Segmented label="Experiment" value={o.mode} options={[["osmosis", "Osmosis"], ["diffusion", "Diffusion"]] as const} onChange={(mode) => execNow({ op: "show_osmosis", mode })} />
      {osmosis && (
        <div className="group-rows mt-2">
          <Slider label="Solute on the left" min={0} max={60} step={2} value={o.soluteLeft} display={`${o.soluteLeft}`} onChange={(soluteLeft) => patch("osmosis", { soluteLeft })} />
          <Slider label="Solute on the right" min={0} max={60} step={2} value={o.soluteRight} display={`${o.soluteRight}`} onChange={(soluteRight) => patch("osmosis", { soluteRight })} />
        </div>
      )}
      <button className="btn btn-soft mt-2 w-full" onClick={() => patch("osmosis", { ...o }, "Restarted the osmosis tank")}>Run it again</button>
      <Note>{osmosis ? `Water flows toward the stronger solution until both sides match: the membrane should settle near ${Math.round(isotonicPosition(o) * 100)}%.` : "The orange solute spreads out by itself, from crowded to less crowded, until it is even."}</Note>
    </>
  );
}
