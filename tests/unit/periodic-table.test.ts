import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_TABLE, PERIODIC_ELEMENTS, TABLE_SIZE, elementPoint, periodicTableCamera, tableSelection } from "@/lib/periodic-table";
import { Command, ScenePlan } from "@/lib/ssp/schema";
import { validatePlan } from "@/lib/ssp/validate";
import { freshScene, snapshot, useSim } from "@/lib/store";
import { execNow, runPlan } from "@/lib/player";

afterEach(() => vi.useRealTimers());

describe("periodic table", () => {
  it("contains 118 unique elements in atomic-number order and distinct visible cells", () => {
    expect(PERIODIC_ELEMENTS).toHaveLength(118);
    expect(new Set(PERIODIC_ELEMENTS.map((e) => e.symbol)).size).toBe(118);
    const cells = new Set<string>();
    for (const [i, e] of PERIODIC_ELEMENTS.entries()) {
      expect(e.number).toBe(i + 1);
      const [x, y] = elementPoint(e.number);
      expect(x).toBeGreaterThan(TABLE_SIZE.cell / TABLE_SIZE.width / 2);
      expect(x).toBeLessThan(1 - TABLE_SIZE.cell / TABLE_SIZE.width / 2);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(1 - TABLE_SIZE.cell / TABLE_SIZE.height / 2);
      cells.add(`${x},${y}`);
    }
    expect(cells.size).toBe(118);
    expect(PERIODIC_ELEMENTS[117]).toMatchObject({ symbol: "Og", name: "Oganesson", period: 7, group: 18 });
    expect(PERIODIC_ELEMENTS[1]).toMatchObject({ symbol: "He", group: 18, period: 1 });
    expect(PERIODIC_ELEMENTS[25]).toMatchObject({ symbol: "Fe", group: 8, period: 4 });
  });

  it("selects complete families and includes the detached series in their real periods", () => {
    expect([...tableSelection({ ...EMPTY_TABLE, groups: [18] })]).toEqual([2, 10, 18, 36, 54, 86, 118]);
    expect(tableSelection({ ...EMPTY_TABLE, periods: [6] }).size).toBe(32);
    expect(tableSelection({ ...EMPTY_TABLE, periods: [7] }).size).toBe(32);
    for (const n of [57, 71, 89, 103]) expect(PERIODIC_ELEMENTS[n - 1].group).toBeNull();
  });

  it("rejects invalid scientific selections and malformed or unbounded ink", () => {
    const bad = [
      { elements: [0] }, { elements: [119] }, { elements: [1.5] }, { groups: [19] }, { periods: [8] },
      { marks: [{ kind: "arrow", from: 11 }] },
      { marks: [{ kind: "circle", at: [1.5, .2] }] },
      { marks: [{ kind: "text", at: [.2, .2], text: "x".repeat(66) }] },
      { marks: [{ kind: "line", points: [[.1, .1]] }] },
    ];
    for (const patch of bad) expect(Command.safeParse({ op: "show_periodic_table", ...patch }).success).toBe(false);
  });

  it("validates and plays a lesson from another world, preserving and clearing ink", async () => {
    vi.useFakeTimers();
    useSim.setState({ ...freshScene("park"), settings: { ...useSim.getState().settings, voice: false } });
    const raw = ScenePlan.parse({
      schemaVersion: 1, scope: "in_scope", language: "en", title: "Compare halogens", subject: "chemistry",
      supportLevel: "visual", capability: "concept", reply: "Halogens are in group 17.",
      assumptions: [], limitations: [], followUps: [],
      steps: [{ title: "Find the family", commands: [{ op: "show_periodic_table", groups: [17], marks: [{ kind: "circle", at: 9 }, { kind: "arrow", from: 9, to: 17 }, { kind: "text", at: [.2, .2], text: "Group 17" }] }] }],
    });
    const validated = validatePlan(raw, snapshot(useSim.getState()));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.issues).toEqual([]);
    expect(validated.plan.steps[0].commands[0]).toEqual({ op: "load_world", world: "lab" });
    const playback = runPlan(validated.plan, "local");
    await vi.runAllTimersAsync();
    await playback;
    expect(useSim.getState().world).toBe("lab");
    expect(useSim.getState().camera.preset).toBe("periodic_table");
    expect(snapshot(useSim.getState()).modules?.periodicTable).toMatchObject({ groups: [17], marks: raw.steps[0].commands[0].op === "show_periodic_table" ? raw.steps[0].commands[0].marks : [] });
    const nonce = useSim.getState().camera.nonce;
    execNow({ op: "show_periodic_table", elements: [118], focus: false });
    expect(useSim.getState().modules.periodicTable?.marks).toHaveLength(3);
    expect(useSim.getState().camera.nonce).toBe(nonce);
    execNow({ op: "clear_annotations" });
    expect(useSim.getState().modules.periodicTable).toEqual(EMPTY_TABLE);
    execNow({ op: "show_periodic_table", elements: [11] });
    useSim.getState().resetSimulation();
    // Physics reset keeps lesson/module parameters, like the other modules.
    expect(useSim.getState().modules.periodicTable?.elements).toEqual([11]);
    useSim.getState().loadWorld("lab");
    expect(useSim.getState().modules.periodicTable).toEqual(EMPTY_TABLE);
    await vi.runAllTimersAsync();
  });

  it("faces the wall from inside its visible cutaway side and refits narrow screens", () => {
    const desktop = periodicTableCamera(16 / 9), mobile = periodicTableCamera(.5);
    expect(desktop.position[0]).toBeGreaterThan(0);
    expect(desktop.position[0]).toBeLessThan(4);
    expect(mobile.position[0]).toBeGreaterThan(desktop.position[0]);
    expect(desktop.position[2]).toBe(desktop.target[2]);
    expect(desktop.target[0]).toEqual(mobile.target[0]);
    expect(desktop.position[1]).toEqual(desktop.target[1]);
  });

  it("clears an obstructing pedestal and returns to the room when building an atom", async () => {
    vi.useFakeTimers();
    useSim.setState(freshScene("lab"));
    execNow({ op: "build_molecule", id: "water", molecule: "H2O" });
    const furniture = Object.values(useSim.getState().objects).filter((o) => o.type === "asset").map((o) => o.id);
    expect(Object.values(useSim.getState().objects).some((o) => o.type === "molecule")).toBe(true);
    execNow({ op: "show_periodic_table", elements: [9] });
    expect(Object.values(useSim.getState().objects).some((o) => o.type === "molecule")).toBe(false);
    for (const id of furniture) expect(useSim.getState().objects[id]).toBeDefined();
    execNow({ op: "build_atom", id: "fluorine", element: "F" });
    expect(useSim.getState().camera.preset).toBe("home");
    expect(useSim.getState().objects.fluorine).toMatchObject({ type: "atom", element: "F" });
    expect(useSim.getState().modules.periodicTable?.elements).toEqual([9]);
    await vi.runAllTimersAsync();
  });
});
