import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizePlan, validatePlan } from "@/lib/ssp/validate";
import { freshScene, snapshot, useSim } from "@/lib/store";
import { execNow, resolvePlaceholder } from "@/lib/player";
import { MODULE_DEFAULTS, defaultModules, modulesSummary, moduleValue, type Modules } from "@/lib/modules";
import { WORLD_IDS } from "@/lib/world/catalog";
import { waterWave, formatLength } from "@/lib/engine/waves";
import type { Command } from "@/lib/ssp/schema";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const plan = (commands: unknown[], reply = "Let's see.") =>
  normalizePlan({ schemaVersion: 1, scope: "in_scope", language: "en", title: "Test", subject: "physics", supportLevel: "simulated", capability: "light", reply, steps: [{ title: "Go", commands }], assumptions: [], limitations: [], followUps: [] }, "en");
const bedroom = { world: "bedroom" as const, objects: [], characters: [] };
const ops = (r: ReturnType<typeof validatePlan>) => (r.ok ? r.plan.steps.flatMap((s) => s.commands.map((c) => c.op)) : []);
const issues = (r: ReturnType<typeof validatePlan>) => (r.ok ? r.issues.map((i) => i.message) : [r.error]);

describe("new simulations in the scene protocol", () => {
  it("each new command opens its own world first", () => {
    expect(ops(validatePlan(plan([{ op: "show_ripple_tank", source: "two_point" }]), bedroom))).toEqual(["load_world", "show_ripple_tank"]);
    const sig = validatePlan(plan([{ op: "show_signal", kind: "wifi_5", layout: "room" }]), bedroom);
    expect(sig.ok && sig.plan.steps[0].commands[0]).toEqual({ op: "load_world", world: "stage" });
    const opt = validatePlan(plan([{ op: "show_optics", preset: "prism" }]), bedroom);
    expect(opt.ok && opt.plan.steps[0].commands[0]).toEqual({ op: "load_world", world: "optics" });
    expect(ops(validatePlan(plan([{ op: "set_module", module: "ripple", set: { depthM: 0.03 } }]), bedroom))[0]).toBe("load_world");
  });

  it("knows the optics table's elements: presets, placed ones and removed ones", () => {
    const r = validatePlan(plan([
      { op: "show_optics", preset: "refraction" },
      { op: "speak", speaker: "simu", text: "It bends to {{refraction_angle:block}}." },
      { op: "speak", speaker: "simu", text: "Unknown {{refraction_angle:nothing}}." },
      { op: "place_optic", id: "mirror_2", element: "plane_mirror", position: [1.5, 0.5] },
      { op: "set_module", module: "optics", set: { aimAt: "mirror_2" } },
      { op: "set_module", module: "optics", set: { aimAt: "ghost" } },
      { op: "show_measurement", metric: "incidence_angle", target: "mirror_2" },
      { op: "remove_optic", id: "mirror_2" },
      { op: "remove_optic", id: "mirror_2" },
    ]), bedroom);
    expect(issues(r)).toEqual(['unknown optics element in {{refraction_angle:nothing}}', 'aimAt: unknown optics element "ghost"', 'unknown optics element "mirror_2"']);
  });

  it("the Light Lab opens with its mirror, and the table holds at most eight elements", () => {
    const optics = { world: "optics" as const, objects: [], characters: [] };
    expect(issues(validatePlan(plan([{ op: "speak", speaker: "simu", text: "Angle {{incidence_angle:mirror}}." }]), optics))).toEqual([]);
    const many = Array.from({ length: 9 }, (_, i) => ({ op: "place_optic", id: `m_${i}`, element: "plane_mirror", position: [0, 0] }));
    expect(issues(validatePlan(plan([{ op: "show_optics", preset: "free" }, ...many]), optics))).toEqual(["the optics table holds at most 8 elements"]);
  });

  it("module fields are strict, so mistakes are reported for repair", () => {
    expect(issues(validatePlan(plan([{ op: "set_module", module: "signal", set: { walls: "metal" } }]), bedroom))[0]).toMatch(/set signal/);
    expect(issues(validatePlan(plan([{ op: "set_module", module: "ripple", set: { frequency: 2 } }]), bedroom))[0]).toMatch(/set ripple/);
    expect(issues(validatePlan(plan([{ op: "show_signal", kind: "wifi_7" }]), bedroom))[0]).toMatch(/kind/);
  });

  it("new placeholders are known names", () => {
    const r = validatePlan(plan([
      { op: "show_ripple_tank" },
      { op: "speak", speaker: "simu", text: "They travel at {{water_wave_speed}} with wavelength {{water_wavelength}}." },
      { op: "show_signal", kind: "sound" },
      { op: "speak", speaker: "simu", text: "Here it is {{signal_strength}}, {{signal_bars}}." },
    ]), bedroom);
    expect(issues(r)).toEqual([]);
  });
});

describe("the player runs the new simulations", () => {
  const run = (c: Command) => execNow(c);

  it("ripple tank: replaces the other workshop experiments and reports engine numbers", () => {
    useSim.setState(freshScene("workshop"));
    run({ op: "show_ripple_tank", frequencyHz: 2, depthM: 0.1 });
    const m = useSim.getState().modules;
    expect(m.ripple?.frequency).toBe(2);
    expect(m.circuit).toBeNull();
    expect(resolvePlaceholder("water_wavelength")).toBe(formatLength(waterWave(2, 0.1).wavelength));
    run({ op: "set_module", module: "ripple", set: { shallow: true, barrier: "gap", gapWidthM: 0.2 } });
    expect(resolvePlaceholder("shallow_wave_speed")).toBeDefined();
    expect(resolvePlaceholder("gap_wavelengths")).toMatch(/wavelengths$/);
    run({ op: "set_parameter", name: "frequency", value: 1 });
    expect(useSim.getState().modules.ripple?.frequency).toBe(1);
    run({ op: "show_wave", kind: "transverse", amplitude: 0.5, frequency: 1, wavelength: 2 });
    expect(useSim.getState().modules.ripple).toBeNull();
  });

  it("signals: strength, walls and layouts", () => {
    useSim.setState(freshScene("stage"));
    run({ op: "show_signal", kind: "wifi_2_4", layout: "apartment" });
    const before = resolvePlaceholder("signal_strength")!;
    expect(before).toMatch(/dBm$/);
    expect(resolvePlaceholder("signal_bars")).toMatch(/of 4 bars/);
    run({ op: "set_module", module: "signal", set: { allWalls: "metal" } });
    expect(Number.parseInt(resolvePlaceholder("signal_strength")!)).toBeLessThan(Number.parseInt(before));
    run({ op: "set_module", module: "signal", set: { layout: "open_field" } });
    expect(useSim.getState().modules.signal?.walls).toEqual([]);
    expect(resolvePlaceholder("signal_walls")).toBe("no walls");
    run({ op: "set_module", module: "signal", set: { device: [3.6, 3.5] } });
    expect(useSim.getState().modules.signal?.device).toEqual([3.6, 2.6]);
  });

  it("optics: presets, aimed beams, placing and removing elements", () => {
    useSim.setState(freshScene("optics"));
    expect(useSim.getState().modules.optics).not.toBeNull();
    expect(resolvePlaceholder("incidence_angle")).toBe("30.0°");
    expect(resolvePlaceholder("reflection_angle")).toBe("30.0°");
    run({ op: "set_module", module: "optics", set: { angleDeg: 50 } });
    expect(resolvePlaceholder("reflection_angle")).toBe("50.0°");
    run({ op: "show_optics", preset: "refraction", material: "water" });
    expect(resolvePlaceholder("refractive_index")).toBe("1.33");
    // Water at the red laser's 650 nm (n ≈ 1.331) against air.
    expect(resolvePlaceholder("critical_angle")).toBe("48.7°");
    run({ op: "place_optic", id: "screen_2", element: "screen", position: [2.5, 3] });
    const placed = useSim.getState().modules.optics!.elements.find((e) => e.id === "screen_2")!;
    expect(placed.z).toBe(1.6);
    run({ op: "remove_optic", id: "block" });
    const o = useSim.getState().modules.optics!;
    expect(o.elements.map((e) => e.id)).toEqual(["screen_2"]);
    expect(o.source.aimAt).toBeNull();
    run({ op: "show_optics", preset: "lens_image" });
    expect(resolvePlaceholder("image_type")).toBe("real, upside down and smaller");
    expect(resolvePlaceholder("image_distance")).toMatch(/m behind the lens$/);
    // The beam enters a semicircle head-on (unbent); the angle that matters is at the flat face.
    run({ op: "show_optics", preset: "total_internal_reflection", angleDeg: 50 });
    expect(resolvePlaceholder("incidence_angle")).toBe("50.0°");
    expect(resolvePlaceholder("reflection_angle")).toBe("50.0°");
    expect(resolvePlaceholder("refraction_angle")).toBeUndefined();
  });
});

describe("compatibility", () => {
  it("only the Light Lab starts with a new module switched on", () => {
    for (const w of WORLD_IDS) {
      const m = defaultModules(w);
      expect(Boolean(m.optics)).toBe(w === "optics");
      expect(m.ripple).toBeNull();
      expect(m.signal).toBeNull();
    }
  });

  it("older saved scenes without the new modules still summarise and resolve", () => {
    // A save from before the new modules existed: those keys are simply missing.
    const saved: Modules = { ...defaultModules("workshop") };
    delete saved.ripple;
    delete saved.signal;
    delete saved.optics;
    expect(Object.keys(modulesSummary(saved))).not.toContain("ripple");
    expect(moduleValue("water_wavelength", undefined, saved, {})).toBeUndefined();
    expect(moduleValue("incidence_angle", undefined, saved, {})).toBeUndefined();
    expect(moduleValue("signal_bars", undefined, saved, {})).toBeUndefined();
  });

  it("the scene sent to the AI stays small with every new module on", () => {
    useSim.setState(freshScene("optics"));
    execNow({ op: "show_optics", preset: "periscope" });
    useSim.setState({ modules: { ...useSim.getState().modules, signal: MODULE_DEFAULTS.signal, ripple: MODULE_DEFAULTS.ripple } });
    expect(JSON.stringify(snapshot(useSim.getState())).length).toBeLessThan(6000);
  });
});
