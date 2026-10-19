import { describe, expect, it } from "vitest";
import { EARTH_FIELD, MAGNET_MATERIALS, MAGNET_PRESET_IDS, MU0, SIZES, coreFactor, compassReading, fieldAt, forceOn, magnetPreset, rectFaceH, traceFieldLines, type MagnetItem } from "@/lib/engine/magnet";

const bar = (x: number, angleDeg = 0, id = `b${x}${angleDeg}`): MagnetItem => ({ id, kind: "bar", x, z: 0, angleDeg, material: "alnico" });

describe("magnetic fields (surface-charge model, SI units)", () => {
  it("the closed-form field of a charged rectangle matches brute-force integration", () => {
    const a = 0.01, b = 0.005, n = 400;
    for (const [pu, pv, pn] of [[0.003, 0.001, 0.004], [0.02, -0.006, 0.01], [-0.004, 0.012, -0.002]]) {
      const H = [0, 0, 0];
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const u = -a + ((i + 0.5) * 2 * a) / n, v = -b + ((j + 0.5) * 2 * b) / n;
        const d = [pu - u, pv - v, pn], r3 = Math.hypot(...d) ** 3, dA = (4 * a * b) / (n * n);
        for (let k = 0; k < 3; k++) H[k] += (d[k] / r3) * dA / (4 * Math.PI);
      }
      const exact = rectFaceH(1, a, b, pu, pv, pn);
      for (let k = 0; k < 3; k++) expect(exact[k]).toBeCloseTo(H[k], 0);
      expect(Math.hypot(...exact.map((e, k) => e - H[k])) / Math.hypot(...H)).toBeLessThan(0.01);
    }
  });

  it("far from a bar magnet the field is a dipole's: B = μ0·2m / 4πr³ on its axis", () => {
    const [L, W, H] = SIZES.bar, m = (MAGNET_MATERIALS.alnico.br / MU0) * L * W * H;
    // At 50 cm (over 6× its length) the two-pole correction, L²/2r², is ~1%.
    const r = 0.5, B = fieldAt({ items: [bar(0)], earth: false }, r, 0);
    expect(B[0] / ((MU0 * 2 * m) / (4 * Math.PI * r ** 3))).toBeCloseTo(1, 1);
    // …and it points away from the north pole along the axis.
    expect(B[0]).toBeGreaterThan(0);
  });

  it("a magnet's field falls to Earth's strength (20 µT) tens of centimetres away", () => {
    const at = (r: number) => Math.hypot(...fieldAt({ items: [bar(0)], earth: false }, r, 0));
    expect(at(0.3)).toBeGreaterThan(EARTH_FIELD);
    expect(at(0.6)).toBeLessThan(EARTH_FIELD);
  });

  it("a straight wire: B = μ0 I / 2πr, circling the wire", () => {
    const lab = { items: [{ id: "w", kind: "wire" as const, x: 0, z: 0, angleDeg: 0, current: 5 }], earth: false };
    const B = fieldAt(lab, 0.03, 0);
    expect(Math.hypot(...B)).toBeCloseTo((MU0 * 5) / (2 * Math.PI * 0.03), 8);
    expect(Math.abs(B[0])).toBeLessThan(1e-12); // perpendicular to the radius
  });

  it("a coil's centre field matches the finite solenoid B = μ0nI·L/√(L²+4R²), and an iron core multiplies it", () => {
    const coil: MagnetItem = { id: "c", kind: "coil", x: 0, z: 0, angleDeg: 0, current: 2, turns: 200, core: false };
    const { length: L, radius: R } = SIZES.coil;
    const expected = ((MU0 * 200) / L) * 2 * (L / Math.sqrt(L * L + 4 * R * R));
    expect(fieldAt({ items: [coil], earth: false }, 0, 0)[0] / expected).toBeCloseTo(1, 1);
    expect(coreFactor(L / (2 * R))).toBeGreaterThan(10);
    const cored = fieldAt({ items: [{ ...coil, core: true }], earth: false }, 0.06, 0)[0];
    expect(cored / fieldAt({ items: [coil], earth: false }, 0.06, 0)[0]).toBeCloseTo(coreFactor(L / (2 * R)), 0);
  });

  it("opposite poles attract and like poles repel", () => {
    const pull = forceOn({ items: [bar(-0.055), bar(0.055, 0, "right")] }, "right")[0]; // N of left faces S of right
    expect(pull).toBeLessThan(0);
    const push = forceOn({ items: [bar(-0.055), bar(0.055, 180, "right")] }, "right")[0]; // N faces N
    expect(push).toBeGreaterThan(0);
  });

  it("a compass with only Earth's field points north; field lines leave north poles and reach south poles", () => {
    expect(compassReading({ items: [], earth: true }, 0, 0).angleDeg).toBeCloseTo(90, 5);
    const lines = traceFieldLines({ items: [bar(0)], earth: false });
    expect(lines.length).toBeGreaterThan(4);
    const ends = lines.map((l) => l[l.length - 1]);
    // Each line either curls round to the south pole (x ≈ −L/2) or runs off the table; none stops midway.
    const atSouth = ([x, z]: [number, number]) => Math.hypot(x + SIZES.bar[0] / 2, z) < 0.02;
    const offTable = ([x, z]: [number, number]) => Math.abs(x) >= 0.249 || Math.abs(z) >= 0.169;
    expect(ends.filter(atSouth).length).toBeGreaterThanOrEqual(2);
    for (const e of ends) expect(atSouth(e) || offTable(e)).toBe(true);
  });

  it("every example builds", () => {
    for (const id of MAGNET_PRESET_IDS) expect(magnetPreset(id).items.length, id).toBeGreaterThan(0);
  });
});

describe("magnetic materials", () => {
  it("a steel clip 5.5 cm from the pole slides in and sticks; far away it stays put", async () => {
    const { pullStep, magnetPreset } = await import("@/lib/engine/magnet");
    const lab = magnetPreset("materials");
    const clip = lab.items.find((i) => i.test === "steel_clip")!;
    let p = { x: clip.x, z: clip.z, stuck: false, moving: true };
    let t = 0;
    while (!p.stuck && t < 30) { p = pullStep(lab, p.x, p.z, 0.02); t += 0.02; }
    expect(p.stuck).toBe(true);
    expect(t).toBeLessThan(15);
    expect(pullStep(lab, 0.2, 0.15, 0.02).moving).toBe(false);
  });
});
