"use client";

import { useEffect, useState } from "react";
import { FlipHorizontal2, RotateCcw, Trash2, Undo2, Wrench, X } from "lucide-react";
import { useSim } from "@/lib/store";
import { circuitResult, siFormat } from "@/lib/modules";
import { CIRCUIT_PRESETS, CIRCUIT_PRESET_IDS, LED_COLORS, PART_INFO, PART_KINDS, formatPartValue, presetBoard, type Board, type CircuitPreset, type Part } from "@/lib/engine/circuit";
import { editBoard, selectPart, undoBoard, useCircuitUi, type CircuitTool } from "@/lib/circuit-ui";
import { BOARD_POS } from "@/components/world/modules/circuit";
import { Picker, Segmented } from "./kit";
import { CircuitSymbol } from "./circuit-symbols";
import { Caption, Note, Row, Slider, Toggle } from "./controls";

const PRESET_GROUPS = [
  { name: "Basics", options: (["series_bulbs", "parallel_bulbs", "series_parallel", "and_switches", "or_switches"] as CircuitPreset[]).map((id) => ({ value: id, label: CIRCUIT_PRESETS[id].title })) },
  { name: "Components", options: (["led_resistor", "diode", "motor", "rc_charging", "short_circuit"] as CircuitPreset[]).map((id) => ({ value: id, label: CIRCUIT_PRESETS[id].title })) },
  { name: "Measuring and sensing", options: (["meters", "potential_divider", "light_sensor", "thermistor"] as CircuitPreset[]).map((id) => ({ value: id, label: CIRCUIT_PRESETS[id].title })) },
  { name: "Start fresh", options: [{ value: "empty" as CircuitPreset, label: CIRCUIT_PRESETS.empty.title }] },
];
// Make sure every example is listed somewhere.
if (process.env.NODE_ENV !== "production") for (const id of CIRCUIT_PRESET_IDS) if (!PRESET_GROUPS.some((g) => g.options.some((o) => o.value === id))) console.warn(`circuit example ${id} is missing from the panel`);

const TOOLS: CircuitTool[] = ["select", ...PART_KINDS, "erase"];
const toolName = (t: CircuitTool) => (t === "select" ? "Select" : t === "erase" ? "Eraser" : PART_INFO[t].name.replace(" (LDR)", ""));
const LOG_KINDS = new Set<Part["kind"]>(["resistor", "capacitor", "ldr"]);
const roundSig = (v: number) => { const p = 10 ** (Math.floor(Math.log10(Math.abs(v) || 1)) - 1); return Math.round(v / p) * p; };

/** Change one part without filling the undo history (sliders move many times a second). */
function setPart(id: string, patch: Partial<Part>) {
  const s = useSim.getState();
  const board = s.modules.circuit as Board;
  s.set({ modules: { ...s.modules, circuit: { ...board, parts: board.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) } } });
}

export function CircuitControls({ board }: { board: Board }) {
  const { building, tool, selected, history } = useCircuitUi();
  // Capacitors change over time: refresh the live numbers a few times a second.
  const timed = board.parts.some((p) => p.kind === "capacitor");
  const [, tick] = useState(0);
  useEffect(() => {
    if (!timed) return;
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [timed]);
  const result = circuitResult(board);
  const part = board.parts.find((p) => p.id === selected);
  const setBuilding = (on: boolean) => {
    useCircuitUi.setState({ building: on, pending: null, tool: on ? "wire" : "select" });
    // Building wants a clear view straight down onto the board.
    if (on) useSim.getState().focus({ target: [BOARD_POS[0], BOARD_POS[1], BOARD_POS[2]], distance: 6.5 });
  };
  const batteries = board.parts.filter((p) => p.kind === "battery" && !p.broken);
  return (
    <>
      <Caption>Start from an example</Caption>
      <Picker<CircuitPreset>
        label="Circuit example"
        placeholder="Choose an example…"
        value={null}
        groups={PRESET_GROUPS}
        onChange={(id) => {
          editBoard(() => ({ ...presetBoard(id, board.flow), readings: board.readings }));
          useCircuitUi.setState({ selected: null, pending: null });
        }}
      />
      <div className="mt-2">
        <Segmented label="Mode" value={building ? "build" : "run"} options={[["run", "Use it"], ["build", "Build"]] as const} onChange={(m) => setBuilding(m === "build")} />
      </div>

      {building && (
        <>
          <div className="mt-2 grid grid-cols-4 gap-1.5" role="toolbar" aria-label="Circuit parts">
            {TOOLS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tool === t}
                title={t === "select" || t === "erase" ? toolName(t) : PART_INFO[t].note}
                className={`btn flex min-h-[58px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-bold leading-tight ${tool === t ? "bg-[var(--ink)] text-white" : "bg-white/75 text-ink-2 hover:bg-white"}`}
                onClick={() => useCircuitUi.setState({ tool: t, pending: null })}
              >
                <CircuitSymbol kind={t} size={30} />
                <span className="w-full truncate text-center">{toolName(t)}</span>
              </button>
            ))}
          </div>
          <Note>
            {tool === "wire"
              ? "Tap a dot, then another dot in the same row or column. Keep tapping to carry on the wire."
              : tool === "erase"
                ? "Tap a part or a wire to remove it."
                : tool === "select"
                  ? "Tap a part to see its readings and change it."
                  : `Tap a dot, then a neighbouring dot to place the ${PART_INFO[tool].name.toLowerCase()}.${tool === "battery" ? " The first dot is the + end." : tool === "led" || tool === "diode" ? " Current flows from the first dot to the second." : ""}`}
          </Note>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" className="btn btn-soft flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm" disabled={!history.length} onClick={undoBoard}><Undo2 size={16} /> Undo</button>
            <button type="button" className="btn btn-soft flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm" disabled={!board.parts.length} onClick={() => { editBoard((b) => ({ ...b, parts: [] })); useCircuitUi.setState({ selected: null, pending: null }); }}><Trash2 size={16} /> Clear</button>
          </div>
        </>
      )}

      {part && <Inspector board={board} part={part} />}

      <Caption>Whole circuit</Caption>
      <div className="group-rows" role="status" aria-live="polite">
        <Row label="Battery current" value={batteries.length ? siFormat(result.current, "A") : "no battery"} />
        <Row label="Power used" value={siFormat(result.power, "W")} />
      </div>
      {result.short && <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[13px] font-semibold leading-snug text-red-700">{result.warnings[0]}</p>}
      {board.parts.some((p) => p.broken) && (
        <button type="button" className="btn btn-soft mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm" onClick={() => editBoard((b) => ({ ...b, parts: b.parts.map((p) => ({ ...p, broken: false })) }))}>
          <Wrench size={16} /> Replace blown and burnt parts
        </button>
      )}
      <Toggle label="Show readings on parts" checked={board.readings} onChange={(readings) => editBoard((b) => ({ ...b, readings }))} />
      <Caption>Moving dots show</Caption>
      <Segmented label="Current shown as" value={board.flow} options={[["conventional", "Conventional (+ → −)"], ["electron", "Electrons (− → +)"]] as const} onChange={(flow) => editBoard((b) => ({ ...b, flow }))} />
      <Note>Dots speed up with more current. Real electrons drift only about 0.1 mm/s, but they all start moving at once because the push travels through the wire at nearly the speed of light.</Note>
    </>
  );
}

function Inspector({ board, part }: { board: Board; part: Part }) {
  const info = PART_INFO[part.kind];
  const r = circuitResult(board).parts[part.id];
  const log = LOG_KINDS.has(part.kind);
  const value = part.value ?? info.value ?? 0;
  return (
    <section aria-label={`${info.name} settings`} className="mt-3">
      <div className="flex items-center gap-2 px-1 pb-1.5">
        <span className="text-ink-2"><CircuitSymbol kind={part.kind} size={28} /></span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold">{info.name}{formatPartValue(part.kind, part.value) ? ` · ${formatPartValue(part.kind, part.value)}` : ""}</span>
        <button type="button" aria-label="Close part settings" className="btn btn-quiet grid h-8 w-8 place-items-center rounded-full" onClick={() => selectPart(null)}><X size={16} /></button>
      </div>
      <div className="group-rows">
        {part.broken ? (
          <Row label="State" value={<span className="text-red-700">{part.kind === "fuse" ? "Blown" : "Burnt out"}</span>} />
        ) : (
          <>
            <Row label="Voltage across" value={siFormat(Math.abs(r?.v ?? 0), "V")} />
            <Row label="Current through" value={siFormat(Math.abs(r?.i ?? 0), "A")} />
            {part.kind !== "wire" && <Row label={part.kind === "battery" ? "Power supplied" : "Power"} value={siFormat(Math.abs(r?.p ?? 0), "W")} />}
            {r?.r !== undefined && part.kind !== "battery" && part.kind !== "wire" && <Row label="Resistance now" value={Number.isFinite(r.r) ? siFormat(r.r, "Ω") : "∞ (open)"} />}
          </>
        )}
        {info.unit && (
          <Slider
            label={part.kind === "battery" ? "Battery voltage" : part.kind === "bulb" ? "Bulb rating" : part.kind === "ldr" ? "Light level" : part.kind === "thermistor" ? "Temperature" : part.kind === "fuse" ? "Fuse rating" : info.name}
            min={log ? Math.log10(info.min!) : info.min!}
            max={log ? Math.log10(info.max!) : info.max!}
            step={log ? 0.01 : part.kind === "fuse" ? 0.1 : part.kind === "thermistor" ? 1 : 0.5}
            value={log ? Math.log10(value) : value}
            display={formatPartValue(part.kind, value)}
            onChange={(v) => setPart(part.id, { value: log ? roundSig(10 ** v) : v })}
          />
        )}
      </div>
      {part.kind === "led" && <div className="mt-2"><Segmented label="LED colour" value={part.color ?? "red"} options={LED_COLORS.map((c) => [c, c[0].toUpperCase() + c.slice(1)] as const)} onChange={(color) => editBoard((b) => ({ ...b, parts: b.parts.map((p) => (p.id === part.id ? { ...p, color } : p)) }))} /></div>}
      {part.kind === "switch" && <Toggle label="Switch closed" checked={!!part.closed} onChange={(closed) => editBoard((b) => ({ ...b, parts: b.parts.map((p) => (p.id === part.id ? { ...p, closed } : p)) }))} />}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button type="button" className="btn btn-soft flex items-center justify-center gap-1 rounded-xl px-2 py-2 text-[13px]" onClick={() => editBoard((b) => ({ ...b, parts: b.parts.map((p) => (p.id === part.id ? { ...p, a: p.b, b: p.a } : p)) }))}><FlipHorizontal2 size={15} /> Flip</button>
        <button type="button" className="btn btn-soft flex items-center justify-center gap-1 rounded-xl px-2 py-2 text-[13px]" disabled={!part.broken} onClick={() => editBoard((b) => ({ ...b, parts: b.parts.map((p) => (p.id === part.id ? { ...p, broken: false } : p)) }))}><RotateCcw size={15} /> Repair</button>
        <button type="button" className="btn btn-soft flex items-center justify-center gap-1 rounded-xl px-2 py-2 text-[13px] text-red-700" onClick={() => { editBoard((b) => ({ ...b, parts: b.parts.filter((p) => p.id !== part.id) })); selectPart(null); }}><Trash2 size={15} /> Delete</button>
      </div>
      <Note>{info.note}</Note>
    </section>
  );
}
