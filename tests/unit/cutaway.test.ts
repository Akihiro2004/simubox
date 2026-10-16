import { describe, expect, it } from "vitest";
import { wallBlocksView } from "@/lib/world/cutaway";

const N = { "-x": [-1, 0], "+x": [1, 0], "-z": [0, -1], "+z": [0, 1] } as const;
const hiddenFor = (x: number, z: number) => Object.entries(N).filter(([, n]) => wallBlocksView(n, x, z, false)).map(([k]) => k).sort();

describe("dollhouse cutaway", () => {
  it("lowers exactly the walls facing the camera, from every corner", () => {
    expect(hiddenFor(10, 10)).toEqual(["+x", "+z"]);
    expect(hiddenFor(-10, 10)).toEqual(["+z", "-x"]);
    expect(hiddenFor(-10, -10)).toEqual(["-x", "-z"]);
    expect(hiddenFor(10, -10)).toEqual(["+x", "-z"]);
  });

  it("lowers only the near wall when looking straight at one side", () => {
    expect(hiddenFor(0, 12)).toEqual(["+z"]);
    expect(hiddenFor(-12, 0)).toEqual(["-x"]);
  });

  it("never hides the far walls", () => {
    for (let a = 0; a < Math.PI * 2; a += 0.1) {
      const x = Math.cos(a) * 12, z = Math.sin(a) * 12;
      for (const n of Object.values(N)) if (n[0] * x + n[1] * z < 0) expect(wallBlocksView(n, x, z, false)).toBe(false);
    }
  });

  it("has hysteresis so an edge-on wall doesn't flicker", () => {
    // facing ≈ 0.06: a shown wall stays shown, a hidden wall stays hidden.
    const x = 12, z = 0.72;
    expect(wallBlocksView(N["+z"], x, z, false)).toBe(false);
    expect(wallBlocksView(N["+z"], x, z, true)).toBe(true);
  });

  it("keeps its state when the camera is straight overhead", () => {
    expect(wallBlocksView(N["+x"], 0, 0, true)).toBe(true);
    expect(wallBlocksView(N["+x"], 0, 0, false)).toBe(false);
  });
});
