import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freshScene, pickScene, useSim } from "@/lib/store";
import { execNow, resolvePlaceholder } from "@/lib/player";
import { normalizePlan, validatePlan } from "@/lib/ssp/validate";
import { patchOptics } from "@/lib/modules";
import { opticsPreset } from "@/lib/engine/optics";

beforeEach(() => { vi.useFakeTimers(); useSim.setState(freshScene("optics")); });
afterEach(() => vi.useRealTimers());

describe("Light Lab AI and persistence", () => {
  it("executes wavelength, reflection visibility, lighting and numeric measurements through the real player", () => {
    execNow({ op: "show_optics", preset: "refraction" });
    execNow({ op: "set_module", module: "optics", set: { wavelengthNm: 532, reachM: 1.5, lighting: "dim", reflections: false } });
    expect(resolvePlaceholder("beam_wavelength")).toBe("532 nm");
    expect(resolvePlaceholder("reflectance", "block")).toMatch(/^\d+\.\d%$/);
    const saved = JSON.parse(JSON.stringify(pickScene(useSim.getState())));
    useSim.setState({ modules: freshScene("bedroom").modules });
    useSim.setState(saved);
    expect(useSim.getState().modules.optics!.source.wavelengthNm).toBe(532);
    expect(useSim.getState().modules.optics!.reflections).toBe(false);
    expect(useSim.getState().modules.optics!.lighting).toBe("dim");
    execNow({ op: "set_module", module: "optics", set: { color: "white" } });
    expect(useSim.getState().modules.optics!.source.wavelengthNm).toBeNull();
    expect(resolvePlaceholder("beam_wavelength")).toContain("9 wavelength samples");
  });

  it("old setups without the new optional fields still accept patches and trace", () => {
    const old = opticsPreset("refraction");
    const next = patchOptics(old, { normals: false });
    expect(next.source.wavelengthNm).toBeUndefined();
    expect(next.source.angleDeg).toBe(40);
    expect(next.normals).toBe(false);
  });

  it("screen capture is a bounded fraction of source power and construction rays do not count", () => {
    execNow({ op: "show_optics", preset: "free", color: "white" });
    execNow({ op: "place_optic", id: "screen", element: "screen", position: [2.4, 0], sizeM: 2.8 });
    expect(resolvePlaceholder("screen_power", "screen")).toBe("100.0%");
    expect(resolvePlaceholder("screen_power", "missing")).toBeUndefined();
    execNow({ op: "show_optics", preset: "plane_image" });
    expect(resolvePlaceholder("image_type")).toBe("virtual, upright and the same size");
    expect(resolvePlaceholder("screen_power")).toBeUndefined();
  });

  it("validates AI setup and focus commands while rejecting non-image-forming targets", () => {
    const raw = normalizePlan({ schemaVersion: 1, scope: "in_scope", language: "en", title: "Audit", subject: "physics", supportLevel: "simulated", capability: "light", reply: "Light", steps: [{title: "Explore",commands: [
      { op: "show_optics", preset: "refraction" },
      { op: "set_module", module: "optics", set: { wavelengthNm: 532, lighting: "bright" } },
      { op: "show_measurement", metric: "reflectance", target: "block" },
      { op: "focus_camera", target: "block", zoom: "close" },
      { op: "set_module", module: "optics", set: { object: { target: "block", distanceM: 1, heightM: 0.2 } } },
    ]}], assumptions: [], limitations: [], followUps: [] }, "en");
    const result = validatePlan(raw, {world: "bedroom", objects: [], characters: []});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issues.map((issue) => issue.message)).toEqual(["object.target must be a mirror or lens"]);
    expect(result.plan.steps[0].commands.some((command) => command.op === "focus_camera")).toBe(true);
  });
});
