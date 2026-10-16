import { describe, expect, it } from "vitest";
import { ASSETS, WORLDS } from "@/lib/world/catalog";
import { fishPose, NATURE_ASSETS } from "@/lib/world/nature";
import { initialObjects } from "@/lib/world/scene";
import { Command } from "@/lib/ssp/schema";

describe("editable marine life", () => {
  it("registers every nature model with the existing spawn command", () => {
    for (const id of Object.keys(NATURE_ASSETS)) {
      expect(ASSETS).toHaveProperty(id);
      expect(Command.safeParse({ op: "spawn_asset", id: "nature_prop", asset: id, position: [0, 1, 0] }).success).toBe(true);
    }
  });
  it("keeps swimming fish below the surface and clear of the tank walls", () => {
    for (const scale of [.5, 1, 2, 5]) for (const x of [-3.7, 0, 3.7]) for (let t = 0; t <= 50; t += .25) {
      const p = fishPose([x, t % 3 ? 0 : 5, x], t, .7, scale, WORLDS.ocean.bounds, true);
      expect(p.position[0] - .37 * scale).toBeGreaterThanOrEqual(-3.75);
      expect(p.position[0] + .37 * scale).toBeLessThanOrEqual(3.75);
      expect(p.position[2] - .11 * scale).toBeGreaterThanOrEqual(-3.75);
      expect(p.position[2] + .11 * scale).toBeLessThanOrEqual(3.75);
      expect(p.position[1] - .2 * scale).toBeGreaterThanOrEqual(0);
      expect(p.position[1] + .2 * scale).toBeLessThanOrEqual(2.6);
      expect(Number.isFinite(p.yaw)).toBe(true);
    }
  });
  it("keeps a paused cycle stable and follows an edited home position", () => {
    const first = fishPose([0, 1, 0], 3, 1, 1, WORLDS.ocean.bounds, true);
    expect(fishPose([0, 1, 0], 3, 1, 1, WORLDS.ocean.bounds, true)).toEqual(first);
    const moved = fishPose([1, 1, 0], 3, 1, 1, WORLDS.ocean.bounds, true);
    expect(moved.position[0] - first.position[0]).toBeCloseTo(1);
    const fish = initialObjects("ocean").filter(o => o.type === "asset" && o.asset.endsWith("fish"));
    expect(fish).toHaveLength(6);
    expect(fish.every(o => o.physics === "none")).toBe(true);
  });
});
