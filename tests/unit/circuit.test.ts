import { describe, expect, it } from "vitest";
import { CIRCUIT_PRESET_IDS, adjacent, inBoard, legacyBoard, placePart, presetBoard, resistorBands, solveCircuit, thermistorResistance, ldrResistance, type Part } from "@/lib/engine/circuit";

const loopWith = (specs: Omit<Part, "id">[]) => specs.reduce<Part[]>((acc, p) => placePart(acc, p), []);
/** Battery on (0,0)-(0,1) with + at (0,0); a loop around a 1×1 box with the given part on top (0,0)-(1,0)… */
function simple(part: Omit<Part, "id" | "a" | "b">, volts = 6): Part[] {
  return loopWith([
    { kind: "battery", a: [0, 1], b: [0, 2], value: volts },
    { kind: "wire", a: [0, 1], b: [0, 0] },
    { ...part, a: [0, 0], b: [1, 0] } as Omit<Part, "id">,
    { kind: "wire", a: [1, 0], b: [1, 2] },
    { kind: "wire", a: [1, 2], b: [0, 2] },
  ]);
}
const get = (parts: Part[], kind: string) => parts.find((p) => p.kind === kind)!;

describe("circuit solver (modified nodal analysis)", () => {
  it("Ohm's law with the battery's internal resistance: I = E / (R + r)", () => {
    const parts = simple({ kind: "resistor", value: 10 });
    const r = solveCircuit({ parts });
    expect(r.parts[get(parts, "resistor").id].i).toBeCloseTo(6 / (10 + 0.1 + 0.04), 3); // 4 wire segments ≈ 0.04 Ω
    expect(r.current).toBeCloseTo(r.parts[get(parts, "resistor").id].i, 6);
  });

  it("current is conserved at every node (Kirchhoff's current law)", () => {
    const board = presetBoard("series_parallel");
    const r = solveCircuit(board);
    const flow = new Map<string, number>();
    for (const p of board.parts) {
      const i = p.kind === "battery" ? -r.parts[p.id].i : r.parts[p.id].i; // a → b through the part
      const ka = `${p.a}`, kb = `${p.b}`;
      flow.set(ka, (flow.get(ka) ?? 0) - i);
      flow.set(kb, (flow.get(kb) ?? 0) + i);
    }
    for (const net of flow.values()) expect(Math.abs(net)).toBeLessThan(1e-6);
  });

  it("series bulbs share the voltage; parallel bulbs each get the full voltage and the currents add", () => {
    const s = presetBoard("series_bulbs");
    const rs = solveCircuit(s);
    const sb = s.parts.filter((p) => p.kind === "bulb").map((p) => rs.parts[p.id]);
    expect(sb[0].v).toBeCloseTo(sb[1].v, 3);
    expect(sb[0].v + sb[1].v).toBeLessThan(6);
    const p = presetBoard("parallel_bulbs");
    const rp = solveCircuit(p);
    const pb = p.parts.filter((x) => x.kind === "bulb").map((x) => rp.parts[x.id]);
    for (const b of pb) expect(b.v).toBeGreaterThan(5.7);
    expect(rp.current).toBeCloseTo(pb.reduce((t, b) => t + b.i, 0), 4);
    // Each parallel bulb is brighter than a series bulb.
    expect(pb[0].level).toBeGreaterThan(sb[0].level);
  });

  it("a tungsten bulb is not ohmic: half the voltage gives more than half the current (I ∝ V^0.6)", () => {
    const at = (v: number) => { const parts = simple({ kind: "bulb", value: 6 }, v); return solveCircuit({ parts }).parts[get(parts, "bulb").id]; };
    const full = at(6), half = at(3);
    expect(full.i).toBeCloseTo(0.3, 1);
    expect(half.i / full.i).toBeCloseTo(Math.pow(half.v / full.v, 0.6), 1);
  });

  it("an LED needs the right way round and a resistor", () => {
    const fwd = loopWith([
      { kind: "battery", a: [0, 1], b: [0, 2], value: 6 }, { kind: "wire", a: [0, 1], b: [0, 0] },
      { kind: "resistor", a: [0, 0], b: [1, 0], value: 220 }, { kind: "led", a: [1, 0], b: [1, 1], color: "red" },
      { kind: "wire", a: [1, 1], b: [1, 2] }, { kind: "wire", a: [1, 2], b: [0, 2] },
    ]);
    const led = solveCircuit({ parts: fwd }).parts[get(fwd, "led").id];
    expect(led.i).toBeCloseTo((6 - 1.8) / (220 + 15), 3); // ≈ 17.9 mA
    expect(led.v).toBeGreaterThan(1.8);
    const rev = fwd.map((p) => (p.kind === "led" ? { ...p, a: p.b, b: p.a } : p));
    expect(Math.abs(solveCircuit({ parts: rev }).parts[get(rev, "led").id].i)).toBeLessThan(1e-6);
    const noResistor = simple({ kind: "led", color: "red" });
    expect(solveCircuit({ parts: noResistor }).parts[get(noResistor, "led").id].burns).toBe(true);
  });

  it("a capacitor charges as V = E(1 − e^(−t/RC))", () => {
    const parts = loopWith([
      { kind: "battery", a: [0, 1], b: [0, 2], value: 6 }, { kind: "wire", a: [0, 1], b: [0, 0] },
      { kind: "resistor", a: [0, 0], b: [1, 0], value: 10_000 }, { kind: "capacitor", a: [1, 0], b: [1, 1], value: 100 },
      { kind: "wire", a: [1, 1], b: [1, 2] }, { kind: "wire", a: [1, 2], b: [0, 2] },
    ]);
    const state = { cap: {} };
    const dt = 0.001, tau = 10_000 * 100e-6; // 1 s
    let r = solveCircuit({ parts }, state, dt);
    for (let t = dt; t < tau - 1e-9; t += dt) r = solveCircuit({ parts }, state, dt);
    expect(r.parts[get(parts, "capacitor").id].v / 6).toBeCloseTo(1 - Math.exp(-1), 2);
  });

  it("a short circuit is flagged and blows the fuse", () => {
    const board = presetBoard("short_circuit");
    expect(solveCircuit(board).short).toBe(false);
    const closed = board.parts.map((p) => (p.kind === "switch" ? { ...p, closed: true } : p));
    const r = solveCircuit({ parts: closed });
    expect(r.short).toBe(true);
    expect(r.parts[get(closed, "fuse").id].burns).toBe(true);
  });

  it("meters: the ammeter reads the loop current, the voltmeter the voltage across the resistor", () => {
    const board = presetBoard("meters");
    const r = solveCircuit(board);
    const amm = r.parts[get(board.parts, "ammeter").id], vm = r.parts[get(board.parts, "voltmeter").id], res = r.parts[get(board.parts, "resistor").id];
    expect(amm.i).toBeCloseTo(res.i, 4);
    expect(vm.v).toBeCloseTo(res.v, 3);
    expect(Math.abs(vm.i)).toBeLessThan(1e-5); // draws almost nothing
  });

  it("a potential divider splits the voltage in the ratio of the resistors", () => {
    const board = presetBoard("potential_divider");
    const r = solveCircuit(board);
    expect(r.parts[get(board.parts, "voltmeter").id].v).toBeCloseTo((6 * 2000) / 3000, 1);
  });

  it("sensors follow their real curves", () => {
    expect(thermistorResistance(25)).toBeCloseTo(10_000, 0);
    expect(thermistorResistance(50)).toBeLessThan(5000);
    expect(ldrResistance(10)).toBeCloseTo(10_000, 0);
    expect(ldrResistance(1000)).toBeLessThan(ldrResistance(10));
  });

  it("an open switch stops the current; AND needs both switches, OR either one", () => {
    const and = presetBoard("and_switches");
    expect(solveCircuit(and).current).toBeLessThan(1e-6);
    const both = and.parts.map((p) => (p.kind === "switch" ? { ...p, closed: true } : p));
    expect(solveCircuit({ parts: both }).current).toBeGreaterThan(0.1);
    const or = presetBoard("or_switches");
    const oneClosed = or.parts.map((p, i) => (p.kind === "switch" && i === or.parts.findIndex((q) => q.kind === "switch") ? { ...p, closed: true } : p));
    expect(solveCircuit({ parts: oneClosed }).current).toBeGreaterThan(0.1);
  });

  it("every example builds a valid board and solves without errors", () => {
    for (const id of CIRCUIT_PRESET_IDS) {
      const b = presetBoard(id);
      for (const p of b.parts) { expect(inBoard(p.a) && inBoard(p.b), `${id} ${p.id}`).toBe(true); expect(adjacent(p.a, p.b), `${id} ${p.id}`).toBe(true); }
      const r = solveCircuit(b);
      for (const v of Object.values(r.parts)) expect(Number.isFinite(v.i) && Number.isFinite(v.v), id).toBe(true);
    }
  });

  it("older series/parallel saves become boards with the same bulbs, voltage and switch", () => {
    const b = legacyBoard({ layout: "parallel", voltage: 9, bulbs: 2, closed: false, broken: [1] });
    expect(b.parts.filter((p) => p.kind === "bulb")).toHaveLength(2);
    expect(b.parts.find((p) => p.kind === "battery")!.value).toBe(9);
    expect(b.parts.filter((p) => p.kind === "bulb" && p.broken)).toHaveLength(1);
    expect(solveCircuit(b).current).toBeLessThan(1e-6);
  });

  it("resistor colour bands follow the standard code", () => {
    expect(resistorBands(220).slice(0, 3)).toEqual(["#e53935", "#e53935", "#8b4513"]); // red red brown
    expect(resistorBands(10_000).slice(0, 3)).toEqual(["#8b4513", "#000000", "#fb8c00"]); // brown black orange
  });
});
