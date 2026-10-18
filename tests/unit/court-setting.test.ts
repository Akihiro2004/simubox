import { describe, expect, it } from "vitest";
import { ENV_PRESETS, PRESETS, applyEnvironment, environmentForGravity, isGiantPlanet, isPlanetary } from "@/lib/environment";
import { COURT_CRATERS, ROCKY_COURT, craterOuterRadius } from "@/lib/world/court-terrain";
import { PLANET_IDS } from "@/lib/engine/astro";
import { Command } from "@/lib/ssp/schema";

describe("planetary court settings", () => {
  it("keeps complete crater rims inside terrain, off the track and apart", () => {
    for (const c of COURT_CRATERS) {
      const r = craterOuterRadius(c.r) + ROCKY_COURT.edgeClearance;
      expect(Math.abs(c.x - ROCKY_COURT.centerX) + r).toBeLessThan(ROCKY_COURT.width / 2);
      expect(Math.abs(c.z) + r).toBeLessThan(ROCKY_COURT.depth / 2);
      expect(Math.abs(c.z) - craterOuterRadius(c.r)).toBeGreaterThan(8.5);
      for (const other of COURT_CRATERS) if (c !== other) expect(Math.hypot(c.x - other.x, c.z - other.z)).toBeGreaterThan(craterOuterRadius(c.r + other.r) + 1);
    }
  });
  it("accepts every planet in AI astronomy commands and outdoor settings", () => {
    expect(Command.parse({ op: "show_orbits", mode: "solar_system", planets: [...PLANET_IDS] }).op).toBe("show_orbits");
    for (const id of PLANET_IDS) {
      expect(Command.parse({ op: "show_orbits", mode: "solar_system", planets: [id], focus: id }).op).toBe("show_orbits");
      expect(Command.parse({ op: "set_environment", preset: id }).op).toBe("set_environment");
    }
  });
  it("never restores Earth vegetation on planets through a colour override", () => {
    for (const preset of ENV_PRESETS.filter(isPlanetary)) {
      expect(PRESETS[preset].scenery).toBe(false);
      expect(applyEnvironment(null, { preset, scenery: true }).scenery).toBe(false);
      expect(applyEnvironment(PRESETS[preset], { ground: "#ffffff", scenery: true }).scenery).toBe(false);
    }
    expect(applyEnvironment(PRESETS.jupiter, { preset: "earth" }).scenery).toBe(true);
  });
  it("distinguishes simulation decks from rocky test stations and preserves Moon features", () => {
    for (const p of ["jupiter", "saturn", "uranus", "neptune"] as const) {
      expect(isGiantPlanet(p)).toBe(true);
      expect(applyEnvironment(null, { preset: p, craters: true }).craters).toBe(false);
    }
    for (const p of ["earth", "mars", "moon", "mercury", "venus"]) expect(isGiantPlanet(p)).toBe(false);
    expect(PRESETS.moon).toMatchObject({ earth: true, craters: true, stars: true, sky: "#04060c" });
    expect(environmentForGravity(24.79)).toBe("jupiter");
    expect(environmentForGravity(9.81)).toBe("earth");
    expect(environmentForGravity(0)).toBeUndefined();
    expect(environmentForGravity(98.1)).toBeUndefined();
  });
});
