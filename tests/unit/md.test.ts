import { describe, expect, it } from "vitest";
import { createMd, kineticTemperature, measurePhase, modelTemperature, readPressure, stepMd, MATTER_BOX } from "@/lib/engine/md";
import { SUBSTANCES, phaseAt, type SubstanceId } from "@/lib/engine/physics2";

describe("molecular dynamics", () => {
  it("the phase the particles settle into matches the real substance", () => {
    const cases: [SubstanceId, number][] = [["water", -30], ["water", 50], ["water", 102], ["iron", 2000], ["nitrogen", -215], ["chocolate", 60]];
    for (const [id, c] of cases) {
      const s = SUBSTANCES[id];
      const md = createMd({ ...MATTER_BOX, temperature: modelTemperature(c, s.melt, s.boil), seed: 7 });
      stepMd(md, 8000);
      expect(measurePhase(md), `${id} at ${c} °C`).toBe(phaseAt(id, c));
    }
  }, 60_000);

  it("the thermostat holds the target temperature", () => {
    const md = createMd({ n: 64, box: [10, 10, 10], temperature: 1.2, start: "spread" });
    stepMd(md, 3000);
    expect(Math.abs(kineticTemperature(md) - 1.2)).toBeLessThan(0.2);
  });

  it("a dilute repulsive gas obeys the ideal gas law P = NkT / V", () => {
    const n = 64, L = 20, T = 1.5;
    const md = createMd({ n, box: [L, L, L], temperature: T, start: "spread", pair: () => ({ eps: 0, sigma: 1 }), seed: 2 });
    stepMd(md, 1000);
    readPressure(md);
    stepMd(md, 8000);
    // Walls sit 0.5σ in from the box edge, so the free volume is (L - 1)³.
    const ideal = (n * T) / (L - 1) ** 3;
    expect(Math.abs(readPressure(md) / ideal - 1)).toBeLessThan(0.15);
  }, 30_000);

  it("a membrane only lets listed species through", () => {
    const types = Array.from({ length: 60 }, (_, i) => (i % 2));
    const md = createMd({ n: 60, box: [16, 8, 8], temperature: 1, types, start: "spread", pair: () => ({ eps: 0, sigma: 1 }), membrane: [0] });
    const side0 = Array.from({ length: 60 }, (_, i) => md.pos[i * 3] < 8);
    stepMd(md, 4000);
    for (let i = 1; i < 60; i += 2) expect(md.pos[i * 3] < 8).toBe(side0[i]);
  }, 30_000);
});
