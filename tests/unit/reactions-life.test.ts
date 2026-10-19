import { describe, expect, it } from "vitest";
import { balance, collisionFraction, createReactionBox, formulaMass, measuredRate, parseFormula, progress, stepReaction, RATE_REACTION } from "@/lib/engine/reactions";
import { cyclePeriod, lvInvariant, logisticExact, lvPeriod, seriesAt, solvePopulation, DEFAULT_POPULATION } from "@/lib/engine/ecology";
import { chiSquare, gametes, phenotype, punnett, ratio, sampleOffspring } from "@/lib/engine/genetics";
import { countLeft, createOsmosis, isotonicPosition, SOLUTE, WATER, OSMOSIS_BOX } from "@/lib/engine/osmosis";
import { stepMd } from "@/lib/engine/md";

describe("equation balancing (exact)", () => {
  it("balances textbook equations to the smallest whole numbers", () => {
    expect(balance("C3H8 + O2 -> CO2 + H2O").text).toBe("C₃H₈ + 5 O₂ → 3 CO₂ + 4 H₂O");
    expect(balance("CO2 + H2O -> C6H12O6 + O2").text).toBe("6 CO₂ + 6 H₂O → C₆H₁₂O₆ + 6 O₂");
    expect(balance("Fe + O2 -> Fe2O3").text).toBe("4 Fe + 3 O₂ → 2 Fe₂O₃");
    expect(balance("Al + HCl -> AlCl3 + H2").text).toBe("2 Al + 6 HCl → 2 AlCl₃ + 3 H₂");
    expect(balance("Ca(OH)2 + H3PO4 -> Ca3(PO4)2 + H2O").text).toBe("3 Ca(OH)₂ + 2 H₃PO₄ → Ca₃(PO₄)₂ + 6 H₂O");
    expect(balance("2 H2 + O2 = H2O").text).toBe("2 H₂ + O₂ → 2 H₂O");
    // Atoms alone allow 3 NO + O₃ → 3 NO₂ too; the simplest balance is the real 1 : 1 : 1 : 1.
    expect(balance("NO + O3 -> NO2 + O2").text).toBe("NO + O₃ → NO₂ + O₂");
    expect(balance("NO + O3 -> NO2 + O2").simplest).toBe(true);
  });

  it("conserves every atom and the total mass", () => {
    const b = balance("C3H8 + O2 -> CO2 + H2O");
    for (const [l, r] of Object.values(b.atoms)) expect(l).toBe(r);
    expect(b.mass[0]).toBeCloseTo(b.mass[1], 1);
    expect(formulaMass("H2O")).toBeCloseTo(18.015, 2);
    expect(parseFormula("CuSO4·5H2O")).toEqual({ Cu: 1, S: 1, O: 9, H: 10 });
  });

  it("refuses equations that cannot balance", () => {
    expect(() => balance("H2O -> CO2")).toThrow();
    expect(() => balance("Xx + O2 -> XxO")).toThrow();
  });
});

describe("collision theory reaction box (NO + O₃)", () => {
  it("uses the measured activation energy: 1500 K × R = 12.5 kJ/mol", () => {
    expect(RATE_REACTION.eaKJ).toBeCloseTo(12.47, 2);
    // Share of collisions with enough energy at 25 °C equals e^(−1500/298) from the measured rate law.
    expect(collisionFraction(RATE_REACTION.eaKJ, 25)).toBeCloseTo(Math.exp(-1500 / 298.15), 6);
  });

  // Collision theory: rate ∝ √T · e^(−Eₐ/RT). Compare the very start of two runs (few reactants used up).
  const startRate = (tempC: number, eaKJ: number, catalyst = false) => {
    let total = 0;
    for (const seed of [1, 2, 3, 4]) {
      const box = createReactionBox({ perReactant: 80, tempC, eaKJ, catalyst, seed });
      stepReaction(box, 1500, 1e9);
      total += box.events.length;
    }
    return total;
  };

  it("hotter reacts faster by the Arrhenius factor; a catalyst speeds it up", () => {
    const ea = 6; // a lower barrier so a short test sees plenty of reactions
    const cold = startRate(25, ea), hot = startRate(150, ea);
    const theory = Math.sqrt(423.15 / 298.15) * Math.exp((-ea * 1000 / 8.314) * (1 / 423.15 - 1 / 298.15));
    expect(hot / cold).toBeGreaterThan(theory * 0.7);
    expect(hot / cold).toBeLessThan(theory * 1.4);
    expect(startRate(25, ea, true)).toBeGreaterThan(cold * 1.5);
  }, 120_000);

  it("reactions use up reactants and the measured rate falls as they run out", () => {
    const box = createReactionBox({ perReactant: 60, tempC: 100, eaKJ: 4, catalyst: false });
    stepReaction(box, 3000, 1e9);
    const early = measuredRate(box);
    stepReaction(box, 12000, 1e9);
    expect(progress(box)).toBeGreaterThan(0.3);
    expect(measuredRate(box)).toBeLessThan(early);
  }, 120_000);
});

describe("population models (RK4)", () => {
  it("logistic growth matches the exact solution and levels off at K", () => {
    const p = { ...DEFAULT_POPULATION, model: "logistic" as const, r: 0.8, K: 500, N0: 5, years: 20 };
    const s = solvePopulation(p);
    for (const t of [2, 5, 8, 15]) expect(seriesAt(s, 0, t)).toBeCloseTo(logisticExact(0.8, 500, 5, t), 1);
    expect(s.y[0][s.y[0].length - 1]).toBeCloseTo(500, 0);
  });

  it("predator–prey keeps its conserved quantity and cycles with predators lagging prey", () => {
    const p = DEFAULT_POPULATION;
    const s = solvePopulation(p, 4000);
    const v0 = lvInvariant(p, s.y[0][0], s.y[1][0]);
    for (let i = 0; i < s.t.length; i += 500) expect(lvInvariant(p, s.y[0][i], s.y[1][i])).toBeCloseTo(v0, 4);
    const peak = (k: number) => { let best = 0; for (let i = 1; i < s.t.length / 3; i++) if (s.y[k][i] > s.y[k][best]) best = i; return s.t[best]; };
    expect(peak(1)).toBeGreaterThan(peak(0));
    expect(lvPeriod(p)).toBeGreaterThan(8);
    expect(lvPeriod(p)).toBeLessThan(12);
    // Small swings around the balance point cycle at the linear period; big swings take longer.
    const eq = { ...p, prey0: (p.gamma / p.delta) * 1.02, predators0: p.alpha / p.beta };
    expect(cyclePeriod(eq)).toBeCloseTo(lvPeriod(eq), 0);
    expect(cyclePeriod(p)).toBeGreaterThan(lvPeriod(p) * 1.1);
  });
});

describe("Mendelian genetics", () => {
  it("monohybrid cross Rr × Rr: 1 RR : 2 Rr : 1 rr and 3 round : 1 wrinkled", () => {
    const p = punnett("Rr", "Rr");
    expect(p.genotypes.find((g) => g.genotype === "Rr")!.count).toBe(2);
    expect(ratio(p.phenotypes.map((x) => x.count))).toBe("3 : 1");
    expect(phenotype("rr")).toBe("wrinkled");
  });

  it("dihybrid cross RrYy × RrYy gives 9 : 3 : 3 : 1", () => {
    expect(gametes("RrYy")).toEqual(["RY", "Ry", "rY", "ry"]);
    expect(ratio(punnett("RrYy", "RrYy").phenotypes.map((x) => x.count))).toBe("9 : 3 : 3 : 1");
  });

  it("sampled offspring scatter around the exact ratio like Mendel's 5,474 : 1,850", () => {
    const p = punnett("Rr", "Rr");
    const kids = sampleOffspring("Rr", "Rr", 7324, 42);
    const round = kids.filter((g) => phenotype(g) === "round").length;
    expect(round / (kids.length - round)).toBeGreaterThan(2.7);
    expect(round / (kids.length - round)).toBeLessThan(3.3);
    expect(chiSquare(p, kids)).toBeLessThan(6.6); // not significant at p = 0.01
    expect(sampleOffspring("Rr", "Rr", 10, 7)).toEqual(sampleOffspring("Rr", "Rr", 10, 7));
  });
});

describe("diffusion and osmosis", () => {
  it("water crosses the membrane, solute never does", () => {
    const md = createOsmosis({ mode: "osmosis", soluteLeft: 20, soluteRight: 0 });
    const soluteLeft = countLeft(md, SOLUTE);
    stepMd(md, 4000);
    expect(countLeft(md, SOLUTE)).toBe(soluteLeft);
    expect(countLeft(md, WATER)).toBeGreaterThan(0);
  }, 60_000);

  it("the membrane moves toward the dilute side and settles where both sides are isotonic", () => {
    const s = { mode: "osmosis" as const, soluteLeft: 24, soluteRight: 8 };
    const predicted = isotonicPosition(s);
    expect(predicted).toBeGreaterThan(0.6);
    // A small box jiggles, so average over time and two runs (as the readout does).
    let sum = 0, k = 0;
    for (const seed of [3, 5]) {
      const md = createOsmosis(s, seed);
      for (let i = 0; i < 70; i++) { stepMd(md, 500); if (i >= 20) { sum += md.membraneX / OSMOSIS_BOX[0]; k++; } }
    }
    expect(Math.abs(sum / k - predicted)).toBeLessThan(0.05);
  }, 120_000);

  it("diffusion spreads the solute evenly", () => {
    const md = createOsmosis({ mode: "diffusion", soluteLeft: 30, soluteRight: 0 });
    expect(countLeft(md, SOLUTE)).toBe(30);
    stepMd(md, 20000);
    expect(countLeft(md, SOLUTE)).toBeGreaterThan(8);
    expect(countLeft(md, SOLUTE)).toBeLessThan(22);
  }, 120_000);
});
