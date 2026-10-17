import { describe, expect, it } from "vitest";
import {
  G, SIGNAL_KIND_IDS, SIGNAL_LAYOUTS, WALL_LOSS, doppler, formatFrequency, formatLength, formatSpeed, freeSpaceLoss, gapSpread, pathDifference, reception, segmentsCross, shallowWaterSpeed, shownWavelength,
  signalLayout, signalWavelength, waterWave,
} from "@/lib/engine/waves";
import { WaveField, discCells, paintSegment } from "@/lib/engine/wave2d";

const near = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("water waves", () => {
  it("deep water: λ = g/(2πf²); shallow water: v = √(g·d)", () => {
    const deep = waterWave(1, 50);
    near(deep.wavelength, G / (2 * Math.PI), 1e-6);
    expect(deep.regime).toBe("deep");
    const shallow = waterWave(0.2, 0.05);
    near(shallow.speed, shallowWaterSpeed(0.05), 0.01);
    expect(shallow.regime).toBe("shallow");
  });

  it("satisfies the dispersion relation and v = f·λ everywhere", () => {
    for (const [f, d] of [[0.5, 0.1], [1.5, 0.05], [3, 0.02], [2, 0.5]]) {
      const w = waterWave(f, d);
      const k = (2 * Math.PI) / w.wavelength;
      near(G * k * Math.tanh(k * d), (2 * Math.PI * f) ** 2, 1e-6);
      near(w.speed, f * w.wavelength, 1e-12);
      near(w.period, 1 / f, 1e-12);
    }
    // Waves slow down (and squash together) where the water gets shallower.
    expect(waterWave(1.5, 0.02).speed).toBeLessThan(waterWave(1.5, 0.1).speed);
  });

  it("interference, gaps and the Doppler effect", () => {
    expect(pathDifference([0, 5], [-1, 0], [1, 0], 0.5).kind).toBe("constructive");
    const d = pathDifference([2, 3], [-0.5, 0], [0.5, 0], 1);
    expect(["constructive", "destructive", "in between"]).toContain(d.kind);
    near(gapSpread(0.2, 0.4).firstMinimumDeg!, 30, 1e-9);
    expect(gapSpread(0.5, 0.3).firstMinimumDeg).toBeNull();
    const dop = doppler(2, 0.6, 0.2);
    near(dop.ahead, 3, 1e-9);
    near(dop.behind, 1.5, 1e-9);
    near(dop.aheadWavelength, 0.2, 1e-9);
  });
});

describe("signals", () => {
  it("wavelengths: Wi-Fi 12.5 cm, FM radio 3 m, sound at 343 Hz is 1 m", () => {
    near(signalWavelength("wifi_2_4"), 0.1249, 1e-3);
    near(signalWavelength("fm_radio"), 2.998, 1e-3);
    near(signalWavelength("sound", 343), 1, 1e-9);
  });

  it("free-space path loss: 2.4 GHz over 10 m is about 60 dB, and doubling distance adds 6 dB", () => {
    near(freeSpaceLoss(10, 2.4e9), 60.05, 0.05);
    near(freeSpaceLoss(20, 2.4e9) - freeSpaceLoss(10, 2.4e9), 6.02, 0.01);
  });

  it("walls cost signal, metal most; light stops at walls but not at glass", () => {
    const from: [number, number] = [-2, 0], to: [number, number] = [2, 0];
    const wall = (material: "drywall" | "concrete" | "metal" | "glass" | "brick") => [{ id: "w", from: [0, -1] as [number, number], to: [0, 1] as [number, number], material }];
    const open = reception("wifi_2_4", from, to, []);
    const dry = reception("wifi_2_4", from, to, wall("drywall"));
    const metal = reception("wifi_2_4", from, to, wall("metal"));
    near(open.strength - dry.strength, WALL_LOSS.radio_2ghz.drywall, 1e-9);
    expect(metal.strength).toBeLessThan(dry.strength);
    expect(reception("wifi_5", from, to, wall("concrete")).strength).toBeLessThan(reception("wifi_2_4", from, to, wall("concrete")).strength);
    expect(reception("light", from, to, wall("brick")).strength).toBe(0);
    expect(reception("light", from, to, wall("glass")).strength).toBeGreaterThan(5);
    near(reception("light", [0, 0], [2, 0], []).strength, 25, 1e-9);
    expect(open.bars).toBeGreaterThanOrEqual(3);
  });

  it("segment crossing and the ready-made floor plans", () => {
    expect(segmentsCross([0, 0], [2, 0], [1, -1], [1, 1])).toBe(true);
    expect(segmentsCross([0, 0], [2, 0], [3, -1], [3, 1])).toBe(false);
    for (const l of SIGNAL_LAYOUTS) {
      const plan = signalLayout(l);
      expect(new Set(plan.walls.map((x) => x.id)).size).toBe(plan.walls.length);
    }
    // Inside the metal lift there is almost no Wi-Fi.
    const lift = signalLayout("elevator");
    expect(reception("wifi_2_4", lift.source, lift.device, lift.walls).bars).toBe(0);
    const flat = signalLayout("apartment");
    expect(reception("wifi_2_4", flat.source, flat.device, flat.walls).walls.length).toBeGreaterThan(0);
  });

  it("the wave animation shows tiny wavelengths larger, and says so", () => {
    expect(shownWavelength("sound", 500).toScale).toBe(true);
    const wifi = shownWavelength("wifi_5");
    expect(wifi.toScale).toBe(false);
    expect(wifi.shown).toBeGreaterThan(wifi.real);
    for (const k of SIGNAL_KIND_IDS) expect(shownWavelength(k).shown).toBeGreaterThanOrEqual(0.32);
  });

  it("formats numbers students can read", () => {
    expect(formatFrequency(2.4e9)).toBe("2.4 GHz");
    expect(formatFrequency(500)).toBe("500 Hz");
    expect(formatFrequency(100e6)).toBe("100 MHz");
    expect(formatLength(0.125)).toBe("12.5 cm");
    expect(formatLength(3)).toBe("3.00 m");
    expect(formatSpeed(299_792_458)).toBe("299,792 km/s");
    expect(formatSpeed(343)).toBe("343 m/s");
  });
});

describe("2D wave solver", () => {
  const field = (n = 120, dx = 0.05, c = 1) => {
    const f = new WaveField(n, n, dx, c);
    f.addBeach(12);
    return f;
  };

  it("waves travel at the speed they are given", () => {
    const f = field();
    const src = discCells(f, 60, 60, 1.5);
    const probe = f.index(60 + 40, 60); // 2 m away
    let arrived = -1;
    const dt = f.stableDt();
    for (let s = 0; s < 4000 && arrived < 0; s++) {
      f.step(dt, s * dt < 0.25 ? [{ cells: src, amplitude: 1, frequency: 1, phase: Math.PI / 2 }] : []);
      if (Math.abs(f.u[probe]) > 0.01) arrived = f.time;
    }
    // 2 m at 1 m/s (the front of a smoothed pulse arrives a little early).
    expect(arrived).toBeGreaterThan(1.6);
    expect(arrived).toBeLessThan(2.2);
  });

  it("stays stable and the beach absorbs the waves once the source stops", () => {
    const f = field(80);
    const src = discCells(f, 40, 40, 1.5);
    let peak = 0;
    for (let s = 0; s < 400; s++) {
      f.advance(1 / 60, s < 60 ? [{ cells: src, amplitude: 1, frequency: 2 }] : []);
      if (s < 60) peak = Math.max(peak, f.energyIn(1, 1, 78, 78));
    }
    const all = f.energyIn(1, 1, 78, 78);
    expect(Number.isFinite(all)).toBe(true);
    expect(all).toBeLessThan(peak * 0.01);
  });

  it("a rigid wall blocks the wave; a lossy wall lets some through, less when it absorbs more", () => {
    const behind = (setup: (f: WaveField) => void) => {
      const f = field();
      setup(f);
      const src = discCells(f, 30, 60, 2);
      for (let s = 0; s < 220; s++) f.advance(1 / 60, [{ cells: src, amplitude: 1, frequency: 1.5 }]);
      let e = 0;
      for (let s = 0; s < 60; s++) {
        f.advance(1 / 60, [{ cells: src, amplitude: 1, frequency: 1.5 }]);
        e += f.energyIn(75, 40, 95, 80);
      }
      return e;
    };
    const open = behind(() => {});
    const rigid = behind((f) => paintSegment(f, [60, 13], [60, 107], 1, (k) => (f.rigid[k] = 1)));
    const soft = behind((f) => paintSegment(f, [60, 13], [60, 107], 1.5, (k) => ((f.speed[k] = 0.6), (f.damping[k] = 4))));
    const thick = behind((f) => paintSegment(f, [60, 13], [60, 107], 1.5, (k) => ((f.speed[k] = 0.6), (f.damping[k] = 40))));
    expect(rigid).toBeLessThan(open * 0.02);
    expect(soft).toBeLessThan(open);
    expect(thick).toBeLessThan(soft);
    expect(soft).toBeGreaterThan(rigid);
  });
});
