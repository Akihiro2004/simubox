import { describe, expect, it } from "vitest";
import { createStarfield, STAR_COUNT } from "@/lib/world/starfield";

describe("efficient star field", () => {
  it("covers the sky evenly behind Earth with a small static GPU buffer", () => {
    const geometry = createStarfield();
    try {
      const positions = geometry.getAttribute("position");
      expect(positions.count).toBe(STAR_COUNT);
      const octants = new Array(8).fill(0);
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        expect(Math.hypot(x, y, z)).toBeCloseTo(2800, 2);
        octants[(x > 0 ? 1 : 0) + (y > 0 ? 2 : 0) + (z > 0 ? 4 : 0)]++;
      }
      expect(octants.every((count) => count > STAR_COUNT / 8 * 0.9)).toBe(true);
      expect(Object.values(geometry.attributes).reduce((bytes, attribute) => bytes + attribute.array.byteLength, 0)).toBeLessThan(200_000);
      expect(geometry.groups).toHaveLength(0);
      expect(Array.from(geometry.getAttribute("size").array).every((size) => size >= 0.9 && size <= 2.5)).toBe(true);
    } finally { geometry.dispose(); }
  });
});
