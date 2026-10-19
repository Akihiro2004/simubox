"use client";

import { RotateCcw, RotateCw, Repeat, Trash2, X } from "lucide-react";
import { useSim } from "@/lib/store";
import { siFormat } from "@/lib/modules";
import { MAGNET_MATERIALS, MAGNET_MATERIAL_IDS, MAGNET_PRESETS, TABLE_HALF, TEST_MATERIALS, TEST_MATERIAL_IDS, coilMagnetisation, compassReading, fieldAt, forceOn, formatTesla, magnetPreset, type MagnetItem, type MagnetItemKind, type MagnetLab, type MagnetPreset } from "@/lib/engine/magnet";
import { itemName, patchItem, selectItem, useMagnetUi } from "@/components/world/modules/magnet";
import { Picker, Segmented } from "./kit";
import { Caption, Note, Row, Slider, Toggle } from "./controls";

const PRESET_GROUPS = [
  { name: "Permanent magnets", options: (["bar_magnet", "attract", "repel", "horseshoe", "materials"] as MagnetPreset[]).map((id) => ({ value: id, label: MAGNET_PRESETS[id].title })) },
  { name: "Compasses", options: (["compasses", "earth"] as MagnetPreset[]).map((id) => ({ value: id, label: MAGNET_PRESETS[id].title })) },
  { name: "Electromagnetism", options: (["electromagnet", "iron_core", "wire"] as MagnetPreset[]).map((id) => ({ value: id, label: MAGNET_PRESETS[id].title })) },
];
const ADD: { kind: MagnetItemKind; label: string }[] = [
  { kind: "bar", label: "Bar magnet" }, { kind: "horseshoe", label: "Horseshoe" }, { kind: "coil", label: "Coil" },
  { kind: "wire", label: "Wire" }, { kind: "compass", label: "Compass" }, { kind: "object", label: "Test object" },
];

function setLab(patch: Partial<MagnetLab>) {
  const s = useSim.getState();
  const lab = s.modules.magnet;
  if (lab) s.set({ modules: { ...s.modules, magnet: { ...lab, ...patch } } });
}

let seq = 0;
function addItem(lab: MagnetLab, kind: MagnetItemKind) {
  // Drop it somewhere free near the front of the table.
  const spots: [number, number][] = [[0, 0.11], [-0.15, 0.11], [0.15, 0.11], [-0.15, -0.11], [0.15, -0.11], [0, -0.11], [0, 0]];
  const free = spots.find(([x, z]) => lab.items.every((i) => Math.hypot(i.x - x, i.z - z) > 0.05)) ?? [0, 0];
  const id = `${kind}_${Date.now().toString(36)}${++seq}`;
  const it: MagnetItem = { id, kind, x: free[0], z: free[1], angleDeg: 0, ...(kind === "bar" || kind === "horseshoe" ? { material: "alnico" as const } : {}), ...(kind === "coil" ? { current: 2, turns: 200, core: false } : {}), ...(kind === "wire" ? { current: 5 } : {}), ...(kind === "object" ? { test: "steel_clip" as const } : {}) };
  setLab({ items: [...lab.items, it].slice(-30) });
  selectItem(id);
}

export function MagnetControls({ lab }: { lab: MagnetLab }) {
  const selected = useMagnetUi((u) => u.selected);
  const it = lab.items.find((i) => i.id === selected);
  return (
    <>
      <Caption>Start from an example</Caption>
      <Picker<MagnetPreset> label="Magnet example" placeholder="Choose an example…" value={null} groups={PRESET_GROUPS} onChange={(p) => { const s = useSim.getState(); s.set({ modules: { ...s.modules, magnet: { ...magnetPreset(p), earth: lab.earth } } }); selectItem(null); }} />
      <Caption>Show</Caption>
      <div className="grid grid-cols-2 gap-x-2">
        <Toggle label="Field lines" checked={lab.lines} onChange={(lines) => setLab({ lines })} />
        <Toggle label="Iron filings" checked={lab.filings} onChange={(filings) => setLab({ filings })} />
        <Toggle label="Compass grid" checked={lab.compasses} onChange={(compasses) => setLab({ compasses })} />
        <Toggle label="Earth's field" checked={lab.earth} onChange={(earth) => setLab({ earth })} />
      </div>
      <Caption>Add to the table</Caption>
      <div className="grid grid-cols-3 gap-1.5">
        {ADD.map((a) => (
          <button key={a.kind} type="button" className="btn min-h-11 rounded-xl bg-white/75 px-2 py-2 text-[12px] font-bold text-ink-2 hover:bg-white" onClick={() => addItem(lab, a.kind)}>{a.label}</button>
        ))}
      </div>
      {it ? <Inspector lab={lab} it={it} /> : <Note>Drag anything on the table to move it. Tap an item to change it and read the field there.</Note>}
    </>
  );
}

function Inspector({ lab, it }: { lab: MagnetLab; it: MagnetItem }) {
  const reading = compassReading(lab, it.x, it.z);
  const force = it.kind === "bar" || it.kind === "horseshoe" || it.kind === "coil" ? forceOn(lab, it.id) : null;
  const dirName = ["east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east"][((Math.round(reading.angleDeg / 45) % 8) + 8) % 8];
  const rotate = (d: number) => patchItem(it.id, { angleDeg: (((it.angleDeg + d) % 360) + 360) % 360 });
  return (
    <section aria-label={`${itemName(it)} settings`} className="mt-3">
      <div className="flex items-center gap-2 px-1 pb-1.5">
        <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold">{itemName(it)}</span>
        <button type="button" aria-label="Close item settings" className="btn btn-quiet grid h-8 w-8 place-items-center rounded-full" onClick={() => selectItem(null)}><X size={16} /></button>
      </div>
      <div className="group-rows" role="status" aria-live="polite">
        <Row label="Field here" value={`${formatTesla(reading.tesla)}, ${dirName}`} />
        {force && Math.hypot(...force) > 1e-4 && <Row label="Force on it" value={siFormat(Math.hypot(...force), "N")} />}
        {it.kind === "coil" && <Row label="Field inside" value={formatTesla(Math.hypot(...fieldAt({ items: [it], earth: false }, it.x, it.z)))} />}
        {it.kind === "coil" && <Slider label="Current" min={-5} max={5} step={0.1} value={it.current ?? 2} display={`${(it.current ?? 2).toFixed(1)} A`} onChange={(current) => patchItem(it.id, { current })} />}
        {it.kind === "coil" && <Slider label="Turns" min={20} max={600} step={10} value={it.turns ?? 200} display={`${it.turns ?? 200}`} onChange={(turns) => patchItem(it.id, { turns })} />}
        {it.kind === "wire" && <Slider label="Current" min={-10} max={10} step={0.5} value={it.current ?? 5} display={`${(it.current ?? 5).toFixed(1)} A ${(it.current ?? 5) >= 0 ? "up" : "down"}`} onChange={(current) => patchItem(it.id, { current })} />}
      </div>
      {it.kind === "coil" && <Toggle label="Iron core inside" checked={!!it.core} onChange={(core) => patchItem(it.id, { core })} />}
      {(it.kind === "bar" || it.kind === "horseshoe") && (
        <>
          <Caption>Material (strength)</Caption>
          <Segmented label="Magnet material" value={it.material ?? "alnico"} options={MAGNET_MATERIAL_IDS.map((m) => [m, MAGNET_MATERIALS[m].name.split(" ")[0]] as const)} onChange={(material) => patchItem(it.id, { material })} />
        </>
      )}
      {it.kind === "object" && (
        <>
          <Caption>Made of</Caption>
          <Picker label="Test object material" value={it.test ?? "steel_clip"} groups={[{ options: TEST_MATERIAL_IDS.map((m) => ({ value: m, label: TEST_MATERIALS[m].name, hint: TEST_MATERIALS[m].magnetic ? "magnetic" : "not magnetic" })) }]} onChange={(test) => patchItem(it.id, { test })} />
        </>
      )}
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        <button type="button" aria-label="Rotate left" className="btn btn-soft grid place-items-center rounded-xl py-2" onClick={() => rotate(45)}><RotateCcw size={16} /></button>
        <button type="button" aria-label="Rotate right" className="btn btn-soft grid place-items-center rounded-xl py-2" onClick={() => rotate(-45)}><RotateCw size={16} /></button>
        <button type="button" aria-label="Flip poles" className="btn btn-soft grid place-items-center rounded-xl py-2" onClick={() => (it.kind === "coil" || it.kind === "wire" ? patchItem(it.id, { current: -(it.current ?? 2) }) : rotate(180))}><Repeat size={16} /></button>
        <button type="button" aria-label="Remove item" className="btn btn-soft grid place-items-center rounded-xl py-2 text-red-700" onClick={() => { setLab({ items: lab.items.filter((i) => i.id !== it.id) }); selectItem(null); }}><Trash2 size={16} /></button>
      </div>
      <Note>
        {it.kind === "coil"
          ? `A current in a coil makes a magnetic field like a bar magnet's. More current or more turns make it stronger; an iron core multiplies it (here ×${it.core ? Math.round(coilMagnetisation(it) / (((it.turns ?? 200) / 0.06) * Math.abs(it.current || 1e-9))) : 1}). Reverse the current to swap the poles.`
          : it.kind === "wire"
            ? "The field circles the wire. Point your right thumb along the current: your fingers curl the way the field goes. It gets weaker further away (B = μ0I/2πr)."
            : it.kind === "compass"
              ? "A compass needle is a tiny magnet: its north end points along the field, towards a magnet's south pole or, far from magnets, towards Earth's magnetic north."
              : it.kind === "object"
                ? "Only iron, steel, nickel and cobalt are pulled by a magnet. Copper, aluminium, plastic and wood are not, even though some are metals."
                : `Field lines leave the north pole and enter the south pole. ${MAGNET_MATERIALS[it.material ?? "alnico"].name} has a remanence of ${MAGNET_MATERIALS[it.material ?? "alnico"].br} T.`}
      </Note>
      <Note>Table is drawn 8× real size: this lab is {Math.round(TABLE_HALF[0] * 200)} × {Math.round(TABLE_HALF[1] * 200)} cm.</Note>
    </section>
  );
}
