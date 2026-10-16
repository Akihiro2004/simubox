import { describe, expect, it } from "vitest";
import { positionAt, solveProjectile, toMetersPerSecond, validateProjectile } from "@/lib/engine/projectile";
import { ELEMENTS, MOLECULES, MOLECULE_IDS, bondLength, measureAngle, shells } from "@/lib/engine/chemistry";

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("unit conversion", () => {
  it("converts km/h, mph, m/s", () => {
    close(toMetersPerSecond(36, "km/h"), 10);
    close(toMetersPerSecond(20, "km/h"), 5.555555556);
    close(toMetersPerSecond(10, "mph"), 4.4704);
    close(toMetersPerSecond(7, "m/s"), 7);
  });
});

describe("projectile", () => {
  // Textbook formulas for same-height launch, checked across a grid.
  for (const v of [1, 5.5556, 10, 25, 60]) {
    for (const deg of [5, 15, 30, 40, 45, 60, 75, 89]) {
      for (const g of [1.62, 9.81, 24.79]) {
        it(`v=${v} θ=${deg} g=${g}`, () => {
          const th = (deg * Math.PI) / 180;
          const r = solveProjectile({ speed: v, angleDeg: deg, gravity: g });
          close(r.flightTime, (2 * v * Math.sin(th)) / g, 1e-9);
          close(r.range, (v * v * Math.sin(2 * th)) / g, 1e-9);
          close(r.maxHeight, (v * v * Math.sin(th) ** 2) / (2 * g), 1e-9);
          close(r.impactSpeed, v, 1e-9);
          const [x, y] = positionAt({ speed: v, angleDeg: deg, gravity: g }, r, r.flightTime);
          close(x, r.range, 1e-9);
          close(y, 0, 1e-9);
        });
      }
    }
  }

  it("matches the acceptance prompt: 20 km/h at 40°", () => {
    const r = solveProjectile({ speed: toMetersPerSecond(20, "km/h"), angleDeg: 40, gravity: 9.81 });
    close(r.range, 3.0984, 1e-3);
    close(r.flightTime, 0.7280, 1e-3);
    close(r.maxHeight, 0.6500, 1e-3);
  });

  it("45° maximises range", () => {
    const at = (d: number) => solveProjectile({ speed: 20, angleDeg: d, gravity: 9.81 }).range;
    expect(at(45)).toBeGreaterThan(at(40));
    expect(at(45)).toBeGreaterThan(at(50));
    close(at(30), at(60), 1e-9);
  });

  it("handles launch height", () => {
    const r = solveProjectile({ speed: 0, angleDeg: 0, gravity: 9.81, height: 4.905 });
    close(r.flightTime, 1, 1e-9);
    close(r.range, 0);
    const r2 = solveProjectile({ speed: 10, angleDeg: 30, gravity: 9.81, height: 2 });
    expect(r2.range).toBeGreaterThan(solveProjectile({ speed: 10, angleDeg: 30, gravity: 9.81 }).range);
  });

  it("edge cases", () => {
    expect(solveProjectile({ speed: 10, angleDeg: 90, gravity: 9.81 }).range).toBe(0);
    expect(solveProjectile({ speed: 10, angleDeg: 0, gravity: 9.81 }).range).toBe(0);
    const zeroG = solveProjectile({ speed: 10, angleDeg: 30, gravity: 0 });
    expect(zeroG.lands).toBe(false);
    expect(zeroG.range).toBe(Infinity);
    expect(validateProjectile({ speed: -1, angleDeg: 30, gravity: 9.81 })).toMatch(/speed/);
    expect(validateProjectile({ speed: Number.NaN, angleDeg: 30, gravity: 9.81 })).toMatch(/finite/);
    expect(validateProjectile({ speed: 10, angleDeg: 120, gravity: 9.81 })).toMatch(/angle/);
    expect(() => solveProjectile({ speed: 10, angleDeg: 30, gravity: -9.81 })).toThrow(RangeError);
  });
});

describe("molecules", () => {
  it("every molecule has valid connectivity", () => {
    for (const id of MOLECULE_IDS) {
      const m = MOLECULES[id];
      expect(m.id).toBe(id);
      for (const b of m.bonds) {
        expect(m.atoms[b.a]).toBeDefined();
        expect(m.atoms[b.b]).toBeDefined();
        const len = bondLength(m, b);
        expect(len).toBeGreaterThan(0.7);
        expect(len).toBeLessThan(1.3);
      }
    }
  });

  it("geometry matches curated angles and lengths", () => {
    for (const id of MOLECULE_IDS) {
      const m = MOLECULES[id];
      for (const a of m.angles) close(measureAngle(m, a.atoms), a.deg, 0.1);
    }
    close(bondLength(MOLECULES.H2O, MOLECULES.H2O.bonds[0]), 0.958, 1e-6);
    close(bondLength(MOLECULES.CO2, MOLECULES.CO2.bonds[0]), 1.162, 1e-6);
    close(bondLength(MOLECULES.CH4, MOLECULES.CH4.bonds[3]), 1.087, 1e-6);
    close(bondLength(MOLECULES.NH3, MOLECULES.NH3.bonds[2]), 1.012, 1e-6);
    // All six H-C-H angles in methane are tetrahedral.
    const m = MOLECULES.CH4;
    for (const [a, b] of [[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]]) close(measureAngle(m, [a, 0, b]), 109.47, 0.05);
    // Three H-N-H angles in ammonia are equal.
    for (const [a, b] of [[1, 2], [1, 3], [2, 3]]) close(measureAngle(MOLECULES.NH3, [a, 0, b]), 106.7, 0.05);
  });

  it("electron shells", () => {
    expect(shells(1)).toEqual([1]);
    expect(shells(8)).toEqual([2, 6]);
    expect(shells(11)).toEqual([2, 8, 1]);
    expect(shells(20)).toEqual([2, 8, 8, 2]);
    expect(() => shells(21)).toThrow();
    expect(ELEMENTS).toHaveLength(20);
    for (const e of ELEMENTS) expect(shells(e.z).reduce((a, b) => a + b, 0)).toBe(e.z);
  });
});
