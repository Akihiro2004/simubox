import { describe, expect, it } from "vitest";
import { dragTarget, rayHeight, rayPlane, releaseVelocity, type DragSpace, type V3 } from "@/lib/world/dragmath";

const close = (a: V3 | null, b: V3, eps = 1e-6) => {
  expect(a).not.toBeNull();
  a!.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(eps));
};
const norm = (v: V3): V3 => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};

// Isometric-style camera at (10, 9, 10) looking at the origin.
const cam: V3 = [10, 9, 10];
const forward = norm([-10, -9, -10]);
const space = (over: Partial<DragSpace> = {}): DragSpace => ({
  planePoint: [0, 0.15, 0],
  planeNormal: [-forward[0], -forward[1], -forward[2]],
  offset: [0, 0, 0],
  minY: 0.15,
  maxY: 3.5,
  minX: -3.8,
  maxX: 3.8,
  minZ: -3.8,
  maxZ: 3.8,
  ...over,
});
const rayTo = (p: V3) => norm([p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]]);

describe("ray helpers", () => {
  it("intersects planes", () => {
    close(rayPlane([0, 5, 0], [0, -1, 0], [0, 1, 0], [0, 1, 0]), [0, 1, 0]);
    expect(rayPlane([0, 5, 0], [1, 0, 0], [0, 1, 0], [0, 1, 0])).toBeNull();
    expect(rayPlane([0, 5, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0])).toBeNull();
    close(rayHeight([0, 5, 0], norm([1, -1, 0]), 2), [3, 2, 0]);
  });
});

describe("dragTarget", () => {
  it("keeps the object exactly under the cursor on the camera-facing plane", () => {
    // Aim at a point that is on the drag plane and 1.5 m above the grab point.
    const s = space();
    const up = norm([-(forward[0] * forward[1]), 1 - forward[1] * forward[1], -(forward[2] * forward[1])]);
    const target: V3 = [up[0] * 1.5, 0.15 + up[1] * 1.5, up[2] * 1.5];
    close(dragTarget(cam, rayTo(target), s), target, 1e-6);
  });

  it("lets you lift objects high", () => {
    const s = space();
    // Point well above the room centre, on the plane through the origin.
    const p = rayPlane(cam, rayTo([0, 3, 0]), s.planeNormal, s.planePoint)!;
    const out = dragTarget(cam, rayTo([0, 3, 0]), s)!;
    expect(out[1]).toBeGreaterThan(2);
    close(out, p, 1e-6);
  });

  it("slides along the floor under the cursor when dragged below it", () => {
    const s = space();
    // Cursor aimed at a floor spot in front of the plane: plane point would be underground.
    const floorSpot: V3 = [2, 0.15, 2];
    close(dragTarget(cam, rayTo(floorSpot), s), floorSpot, 1e-6);
  });

  it("respects the grab offset during the floor hand-off", () => {
    // Grabbed 0.1 m above the centre: aiming the cursor at (2, 0.25, 2) puts the centre at (2, 0.15, 2).
    const s = space({ offset: [0, 0.1, 0] });
    close(dragTarget(cam, rayTo([2, 0.25, 2]), s), [2, 0.15, 2], 1e-6);
  });

  it("never leaves the room or goes through the ceiling", () => {
    const s = space();
    for (const aim of [[50, 0, 0], [0, 0, -50], [0, 40, 0], [-30, 20, -30]] as V3[]) {
      const out = dragTarget(cam, rayTo(aim), s);
      if (!out) continue;
      expect(out[0]).toBeGreaterThanOrEqual(s.minX);
      expect(out[0]).toBeLessThanOrEqual(s.maxX);
      expect(out[2]).toBeGreaterThanOrEqual(s.minZ);
      expect(out[2]).toBeLessThanOrEqual(s.maxZ);
      expect(out[1]).toBeGreaterThanOrEqual(s.minY);
      expect(out[1]).toBeLessThanOrEqual(s.maxY);
    }
  });
});

describe("releaseVelocity", () => {
  it("uses recent motion only", () => {
    const samples = [
      { t: 0, p: [0, 0, 0] as V3 },
      { t: 500, p: [0, 0, 0] as V3 }, // held still, then flicked
      { t: 550, p: [0.25, 0, 0] as V3 },
      { t: 600, p: [0.5, 0, 0] as V3 },
    ];
    close(releaseVelocity(samples), [5, 0, 0], 1e-6);
  });
  it("is zero when held still and capped when flung", () => {
    close(releaseVelocity([{ t: 0, p: [1, 1, 1] }, { t: 80, p: [1, 1, 1] }]), [0, 0, 0]);
    const fast = releaseVelocity([{ t: 0, p: [0, 0, 0] }, { t: 50, p: [10, 0, 0] }]);
    expect(Math.hypot(...fast)).toBeCloseTo(12, 6);
  });
});
