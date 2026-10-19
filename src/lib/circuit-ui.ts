// Shared state for building circuits: the 3D board and the panel both read it.

import { create } from "zustand";
import { PART_INFO, formatPartValue, type Board, type PartKind, type Pt } from "./engine/circuit";
import { circuitBoard, circuitResult, siFormat } from "./modules";
import { noteFocus, useSim } from "./store";

export type CircuitTool = PartKind | "select" | "erase";

interface CircuitUi {
  /** Build mode shows the grid dots and the parts palette. */
  building: boolean;
  tool: CircuitTool;
  /** First dot tapped while placing a part. */
  pending: Pt | null;
  selected: string | null;
  /** Earlier boards, newest last, for undo. */
  history: Board[];
}

export const useCircuitUi = create<CircuitUi>(() => ({ building: false, tool: "select", pending: null, selected: null, history: [] }));

/** Change the board on the workshop mat (remembered for undo). */
export function editBoard(change: (b: Board) => Board) {
  const s = useSim.getState();
  const board = circuitBoard(s.modules.circuit);
  if (!board) return;
  const next = change(board);
  if (next === board) return;
  useCircuitUi.setState((u) => ({ history: [...u.history, board].slice(-40) }));
  s.set({ modules: { ...s.modules, circuit: next } });
}

export function undoBoard() {
  const prev = useCircuitUi.getState().history.at(-1);
  if (!prev) return;
  useCircuitUi.setState((u) => ({ history: u.history.slice(0, -1), selected: null, pending: null }));
  const s = useSim.getState();
  s.set({ modules: { ...s.modules, circuit: prev } });
}

/** Select a part and tell the guide what it is and what it is doing right now. */
export function selectPart(id: string | null) {
  useCircuitUi.setState({ selected: id });
  const board = circuitBoard(useSim.getState().modules.circuit);
  const part = id ? board?.parts.find((p) => p.id === id) : undefined;
  if (!board || !part) return;
  const r = circuitResult(board).parts[part.id];
  const state = part.broken ? "broken" : part.kind === "switch" ? (part.closed ? "closed" : "open") : `${siFormat(Math.abs(r?.v ?? 0), "V")}, ${siFormat(Math.abs(r?.i ?? 0), "A")}`;
  const value = formatPartValue(part.kind, part.value) ? ` (${formatPartValue(part.kind, part.value)})` : "";
  noteFocus({ kind: "circuit_part", id: part.id, label: `${PART_INFO[part.kind].name}${value} "${part.id}" on the circuit board (${state})`, detail: PART_INFO[part.kind].note });
}
