import { describe, expect, it } from "vitest";
import { actionPotential, BREATH_DEFAULTS, breathCycle, digestionAt, DIGESTION_TOTAL_HOURS, elastanceCurve, HEART_DEFAULTS, heartBeat, pulseWaveVelocity, reflexLatencyMs } from "@/lib/engine/physiology";

describe("heart", () => {
  const rest = heartBeat(HEART_DEFAULTS);
  it("matches a healthy resting adult", () => {
    expect(rest.systolic).toBeGreaterThan(110); expect(rest.systolic).toBeLessThan(130);
    expect(rest.diastolic).toBeGreaterThan(70); expect(rest.diastolic).toBeLessThan(90);
    expect(rest.strokeVolume).toBeGreaterThan(60); expect(rest.strokeVolume).toBeLessThan(80);
    expect(rest.ejectionFraction).toBeGreaterThan(0.55); expect(rest.ejectionFraction).toBeLessThan(0.7);
    expect(rest.cardiacOutput).toBeGreaterThan(4.5); expect(rest.cardiacOutput).toBeLessThan(5.5);
    expect(rest.edv).toBeGreaterThan(100); expect(rest.edv).toBeLessThan(140);
  });
  it("conserves blood: stroke volume equals what flowed through the aortic valve", () => {
    let ejected = 0;
    for (let k = 1; k < rest.t.length; k++) ejected += rest.aorticFlow[k] * (rest.t[k] - rest.t[k - 1]);
    expect(Math.abs(ejected - rest.strokeVolume) / rest.strokeVolume).toBeLessThan(0.05);
  });
  it("hears lub before dub, inside one beat", () => {
    expect(rest.lubS).toBeGreaterThan(0);
    expect(rest.dubS).toBeGreaterThan(rest.lubS);
    expect(rest.dubS).toBeLessThan(rest.periodS);
    expect(elastanceCurve(1)).toBeCloseTo(1, 1);
  });
  it("shows the textbook cause-and-effect", () => {
    expect(heartBeat({ ...HEART_DEFAULTS, resistance: 1.6 }).meanArterial).toBeGreaterThan(rest.meanArterial + 15);
    const weak = heartBeat({ ...HEART_DEFAULTS, contractility: 0.5 });
    expect(weak.ejectionFraction).toBeLessThan(0.45);
    const stiff = heartBeat({ ...HEART_DEFAULTS, arterialStiffness: 2 });
    expect(stiff.systolic - stiff.diastolic).toBeGreaterThan(rest.systolic - rest.diastolic + 10);
    // Very fast rates leave too little filling time.
    expect(heartBeat({ ...HEART_DEFAULTS, heartRateBpm: 180 }).strokeVolume).toBeLessThan(rest.strokeVolume / 2);
  });
  it("roughly triples cardiac output in hard exercise", () => {
    const exercise = heartBeat({ heartRateBpm: 150, contractility: 1.8, resistance: 0.45, arterialStiffness: 1, fillingMmHg: 14 });
    expect(exercise.cardiacOutput).toBeGreaterThan(12);
    expect(exercise.cardiacOutput).toBeLessThan(22);
  });
  it("speeds the pulse wave up in stiff arteries", () => {
    expect(pulseWaveVelocity(1)).toBeCloseTo(5.5);
    expect(pulseWaveVelocity(4)).toBeCloseTo(11);
  });
});

describe("lungs", () => {
  const quiet = breathCycle(BREATH_DEFAULTS);
  it("moves about half a litre per quiet breath", () => {
    expect(quiet.tidalVolume).toBeGreaterThan(0.45); expect(quiet.tidalVolume).toBeLessThan(0.6);
    expect(quiet.minuteVentilation).toBeCloseTo(quiet.tidalVolume * 12, 5);
    expect(quiet.alveolarVentilation).toBeCloseTo((quiet.tidalVolume - 0.15) * 12, 5);
    expect(quiet.timeConstant).toBeCloseTo(0.25);
    expect(quiet.trapped).toBeLessThan(0.005);
  });
  it("traps air when the airways narrow (asthma)", () => {
    const asthma = breathCycle({ ...BREATH_DEFAULTS, airwayResistance: 20, breathsPerMin: 20 });
    expect(asthma.trapped).toBeGreaterThan(0.05);
    expect(asthma.peakFlow).toBeLessThan(quiet.peakFlow);
  });
  it("needs more effort for the same breath with stiff lungs (fibrosis)", () => {
    expect(breathCycle({ ...BREATH_DEFAULTS, compliance: 0.04 }).tidalVolume).toBeLessThan(quiet.tidalVolume / 2);
  });
});

describe("nerve", () => {
  it("fires an all-or-nothing action potential", () => {
    const big = actionPotential(15);
    expect(big.fired).toBe(true);
    expect(big.peakMv).toBeGreaterThan(30); expect(big.peakMv).toBeLessThan(55);
    expect(big.v[0]).toBeCloseTo(-65, 0);
    expect(actionPotential(2).fired).toBe(false);
    // Bigger stimulus, same spike height.
    expect(Math.abs(actionPotential(30).peakMv - big.peakMv)).toBeLessThan(6);
  });
  it("times the knee-jerk reflex like a real one", () => {
    const fast = reflexLatencyMs("A_alpha").latencyMs;
    expect(fast).toBeGreaterThan(15); expect(fast).toBeLessThan(30);
    expect(reflexLatencyMs("C").latencyMs).toBeGreaterThan(1000);
  });
});

describe("digestion", () => {
  it("walks a meal through the gut in order", () => {
    expect(digestionAt(0).stage.id).toBe("mouth");
    expect(digestionAt(1).stage.id).toBe("stomach");
    expect(digestionAt(5).stage.id).toBe("small_intestine");
    expect(digestionAt(20).stage.id).toBe("large_intestine");
    expect(digestionAt(DIGESTION_TOTAL_HOURS + 5).overall).toBe(1);
    expect(DIGESTION_TOTAL_HOURS).toBeGreaterThan(24); expect(DIGESTION_TOTAL_HOURS).toBeLessThan(72);
  });
});

describe("gas exchange", () => {
  it("gives normal blood gases at rest", async () => {
    const { gasExchange } = await import("@/lib/engine/physiology");
    const g = gasExchange(breathCycle(BREATH_DEFAULTS).alveolarVentilation);
    expect(g.paco2).toBeGreaterThan(35); expect(g.paco2).toBeLessThan(45);
    expect(g.pao2).toBeGreaterThan(80); expect(g.pao2).toBeLessThan(105);
    expect(g.spo2).toBeGreaterThan(0.95); expect(g.spo2).toBeLessThan(0.99);
  });
  it("raises CO2 and drops oxygen when breathing cannot keep up", async () => {
    const { gasExchange } = await import("@/lib/engine/physiology");
    const asthma = gasExchange(breathCycle({ ...BREATH_DEFAULTS, airwayResistance: 25, breathsPerMin: 22, effortCmH2O: 8 }).alveolarVentilation);
    expect(asthma.paco2).toBeGreaterThan(50);
    expect(asthma.spo2).toBeLessThan(0.93);
    // Exercise: much more CO2 made, much more air moved, gases stay near normal.
    const run = gasExchange(breathCycle({ ...BREATH_DEFAULTS, breathsPerMin: 30, effortCmH2O: 16 }).alveolarVentilation, 6);
    expect(run.paco2).toBeGreaterThan(28); expect(run.paco2).toBeLessThan(46);
  });
});

describe("kidneys", () => {
  it("filters 180 L a day and keeps almost all of it", async () => {
    const { kidneyBalance } = await import("@/lib/engine/physiology");
    const k = kidneyBalance(2);
    expect(k.filteredL).toBeCloseTo(180, 0);
    expect(k.urineL).toBeCloseTo(1.4, 1);
    expect(k.reabsorbed).toBeGreaterThan(0.99);
    expect(k.osm).toBeGreaterThan(300); expect(k.osm).toBeLessThan(600);
  });
  it("cannot make less than half a litre: little water means dark, concentrated urine", async () => {
    const { kidneyBalance } = await import("@/lib/engine/physiology");
    const dry = kidneyBalance(0.6), wet = kidneyBalance(4);
    expect(dry.urineL).toBeCloseTo(0.5, 2);
    expect(dry.osm).toBeCloseTo(1200, 0);
    expect(dry.dehydrated).toBe(true);
    expect(wet.osm).toBeLessThan(200);
    expect(wet.bladderHours).toBeLessThan(dry.bladderHours);
  });
});
