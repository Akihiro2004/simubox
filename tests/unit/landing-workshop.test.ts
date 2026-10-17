import { describe, expect, it } from "vitest";
import { createWorkshopGeometry } from "@/components/LandingWorkshop";

describe("landing workshop geometry budget", () => {
  it("merges the set dressing into eight finite meshes that fit on the table", () => {
    const batches = createWorkshopGeometry();
    try {
      expect(batches).toHaveLength(8);
      let triangles = 0;
      for (const { geometry } of batches) {
        const vertices = geometry.getAttribute("position");
        triangles += vertices.count / 3;
        expect(Array.from(vertices.array).every(Number.isFinite)).toBe(true);
        geometry.computeBoundingBox();
        const bounds = geometry.boundingBox!;
        expect(bounds.min.x).toBeGreaterThan(-4.5);
        expect(bounds.max.x).toBeLessThan(4.5);
        expect(bounds.min.z).toBeGreaterThan(-2.5);
        expect(bounds.max.z).toBeLessThan(2.55);
        expect(bounds.max.y).toBeLessThan(2);
      }
      expect(triangles).toBeLessThan(20_000);
    } finally {
      batches.forEach(({ geometry }) => geometry.dispose());
    }
  });
});
