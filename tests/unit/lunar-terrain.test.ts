import { describe, expect, it } from "vitest";
import { createLunarTerrain, createLunarCraterGeometry, lunarCraters, lunarHeight } from "@/lib/world/lunar-terrain";

describe("lunar landscape", () => {
  it("spreads deterministic craters across every quadrant and out to the lunar limb", () => {
    const craters = lunarCraters();
    expect(craters).toEqual(lunarCraters());
    expect(craters.length).toBeGreaterThan(150);
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      expect(craters.some((c) => c.x * x > 500 && c.z * z > 300)).toBe(true);
    }
    expect(craters.some((c) => Math.hypot(c.x, c.z) < 100)).toBe(true);
    expect(craters.every((c) => Math.abs(c.z) >= 12 + c.r || Math.abs(c.x) >= 55 + c.r)).toBe(true);
  });
  it("keeps the measured experiment level and curves down toward a rounded horizon", () => {
    for (const point of [[0, 0], [-90, 0], [60, 40], [0, 100]]) {
      expect(lunarHeight(point[0], point[1])).toBe(-0.01);
    }
    expect(lunarHeight(400, 0)).toBeLessThan(-20);
    expect(lunarHeight(1200, 0)).toBeLessThan(-300);
    expect(lunarHeight(600, 0, 650)).toBe(-0.01);
    expect(Math.abs(lunarHeight(100.01, 0) + 0.01)).toBeLessThan(0.001);
  });

  it("has smooth finite normals within a small fixed geometry budget", () => {
    const geometry = createLunarTerrain();
    try {
      expect(geometry.index!.count / 3).toBeLessThan(32_000);
      expect(Array.from(geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
      expect(Array.from(geometry.getAttribute("normal").array).every(Number.isFinite)).toBe(true);
    } finally { geometry.dispose(); }
  });
  it("merges detailed crater rims into one bounded mesh with finite normals", () => {
    const geometry = createLunarCraterGeometry();
    try {
      expect(geometry.index!.count / 3).toBeLessThan(160_000);
      expect(Array.from(geometry.getAttribute("normal").array).every(Number.isFinite)).toBe(true);
      expect(geometry.groups).toHaveLength(0);
    } finally { geometry.dispose(); }
  });
});
