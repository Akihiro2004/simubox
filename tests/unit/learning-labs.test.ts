import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MECHANICS as D, DEFAULT_MATH as M, MathFields, MechanicsFields, MATH_MODES, mathSetupError } from "@/lib/experiments";
import { mechanicsAt, slide } from "@/lib/engine/mechanics";
import { fraction, schoolMath } from "@/lib/engine/school-math";
import { execNow, resolvePlaceholder } from "@/lib/player";
import { freshScene, pickScene, snapshot, useSim } from "@/lib/store";
import { normalizePlan, validatePlan } from "@/lib/ssp/validate";
import { windDrivenRipple, MODULE_DEFAULTS } from "@/lib/modules";

describe("mechanics reference models", () => {
  it("Newton II and the zero-net-force first law use signed SI units", () => {
    const r = mechanicsAt({ ...D, massKg: 2, forceN: 4, durationS: 3 });
    expect(r.acceleration).toBe(2); expect(r.velocity).toBe(6); expect(r.x).toBe(9);
    expect(r.momentum).toBe(12); expect(r.kinetic).toBe(36); expect(r.work).toBe(36);
    const free = mechanicsAt({ ...D, forceN: 4, opposingN: 4, velocity: -2, durationS: 3 });
    expect(free.x).toBe(-6); expect(free.velocity).toBe(-2); expect(free.acceleration).toBe(0);
  });
  it("friction stops exactly and cannot accelerate a stopped cart by itself", () => {
    const r = slide(1, 0, 2, 3, 5);
    expect(r.x).toBeCloseTo(2.25); expect(r.velocity).toBe(0); expect(r.acceleration).toBe(0);
    expect(slide(1, 1, 2, 0, 3).x).toBe(0);
    const reverse = slide(1, -4, 2, 2, 3);
    expect(reverse.velocity).toBeCloseTo(-16 / 3);
    expect(reverse.acceleration).toBe(-2);
  });
  it("collision sweeps conserve momentum, have opposite impulses and do not gain kinetic energy", () => {
    for (const m of [.1, 1, 7, 50]) for (const m2 of [.1, 3, 50]) for (const e of [0, .3, 1]) {
      const s = { ...D, mode: "collision" as const, massKg: m, mass2Kg: m2, velocity: 4, velocity2: -2, restitution: e, durationS: 3 };
      const initial = mechanicsAt(s, 0), end = mechanicsAt(s);
      expect(end.collided).toBe(true);
      expect(end.momentum + end.momentum2).toBeCloseTo(m * 4 - m2 * 2, 9);
      expect(end.impulse + end.impulse2).toBeCloseTo(0, 9);
      expect(end.velocity2 - end.velocity).toBeCloseTo(e * 6, 9);
      expect(end.kinetic).toBeLessThanOrEqual(initial.kinetic + 1e-8);
      if (e === 1) expect(end.kinetic).toBeCloseTo(initial.kinetic, 9);
      if (e === 0) expect(end.velocity).toBeCloseTo(end.velocity2, 9);
    }
    const apart = mechanicsAt({ ...D, mode: "collision", velocity: -1, velocity2: 1 });
    expect(apart.collisionTime).toBeNull(); expect(apart.collided).toBe(false);
  });
  it("the same impulse produces the same final momentum over different contact times", () => {
    for (const contactS of [.05, .2, 1, 2]) {
      const r = mechanicsAt({ ...D, mode: "impulse", impulseNs: -6, contactS, velocity: 2, durationS: 3 });
      expect(r.impulse).toBe(-6); expect(r.momentum).toBe(-2); expect(r.acceleration).toBe(0);
    }
    const partial = mechanicsAt({ ...D, mode: "impulse", impulseNs: 8, contactS: 2 }, .5);
    expect(partial.impulse).toBe(2); expect(partial.netForce).toBe(4);
  });
  it("ramps use gravity along the slope and the normal force for friction", () => {
    const s = { ...D, mode: "ramp" as const, angleDeg: 30, forceN: 0, friction: .1 };
    const r = mechanicsAt(s);
    expect(r.normal).toBeCloseTo(s.massKg * s.gravity * Math.cos(Math.PI / 6));
    expect(r.acceleration).toBeCloseTo(s.gravity * (.5 - .1 * Math.cos(Math.PI / 6)));
    expect(mechanicsAt({ ...s, angleDeg: 5, friction: .5 }).velocity).toBe(0);
  });
  it("spring and small-angle pendulum energy stays constant and periods match reference formulas", () => {
    for (const mode of ["spring", "pendulum"] as const) {
      const s = { ...D, mode, velocity: 0 };
      const initial = mechanicsAt(s, 0);
      for (let t = 0; t <= 4; t += .1) {
        const r = mechanicsAt(s, t);
        expect(r.kinetic + r.potential).toBeCloseTo(initial.kinetic + initial.potential, 9);
      }
      expect(initial.period).toBeCloseTo(2 * Math.PI * Math.sqrt(mode === "spring" ? s.massKg / s.springK : s.lengthM / s.gravity));
    }
    expect(mechanicsAt({ ...D, mode: "pendulum", gravity: 0 }).period).toBeNull();
    expect(MechanicsFields.safeParse({ ...D, pendulumDeg: 90 }).success).toBe(false);
  });
});

describe("school math reference cases and singularities", () => {
  it.each(MATH_MODES)("%s returns a finite, explained default example", mode => {
    const r = schoolMath({ ...M, mode });
    expect(r.answer).not.toMatch(/NaN|Infinity/); expect(r.formula.length).toBeGreaterThan(0); expect(r.steps.length).toBeGreaterThan(0);
  });
  it("reduces fractions and handles division by a zero fraction", () => {
    expect(fraction(-4, -6)).toBe("2/3"); expect(fraction(0, 4)).toBe("0");
    expect(schoolMath({ ...M, mode: "fractions" }).answer).toBe("5/6");
    expect(schoolMath({ ...M, mode: "fractions", operation: "divide", numerator2: 0 }).answer).toBe("undefined");
  });
  it("handles arithmetic domains and sign reversal in inequalities", () => {
    expect(schoolMath({ ...M, mode: "arithmetic", operation: "divide", b: 0 }).answer).toBe("Undefined");
    expect(schoolMath({ ...M, mode: "inequality", a: -2, b: 3, c: 7 }).answer).toBe("x ≥ -2");
    expect(schoolMath({ ...M, mode: "equation", a: 0, b: 3, c: 3 }).answer).toBe("All real numbers");
    expect(schoolMath({ ...M, mode: "equation", a: 0, b: 3, c: 4 }).answer).toBe("No solution");
    expect(schoolMath({ ...M, mode: "percent", a: 80, b: 25 }).answer).toBe("20");
    expect(schoolMath({ ...M, mode: "ratio", a: 2, b: 3, c: 10 }).answer).toBe("15");
  });
  it("quadratic roots satisfy the original polynomial, including a repeated root and a linear degeneration", () => {
    for (const [a, b, c] of [[1, -5, 6], [1, 2, 1], [1, -1e3, 1]]) {
      const r = schoolMath({ ...M, mode: "quadratic", a, b, c });
      for (const [x] of r.points) expect(a * x * x + b * x + c).toBeCloseTo(0, 7);
    }
    expect(schoolMath({ ...M, mode: "quadratic", a: 1, b: 0, c: 1 }).answer).toContain("1i");
    expect(schoolMath({ ...M, mode: "quadratic", a: 0, b: 2, c: -6 }).answer).toBe("x = 3");
  });
  it("distinguishes intersecting, parallel, dependent and inconsistent zero equations", () => {
    expect(schoolMath({ ...M, mode: "linear_system" }).points).toEqual([[3, 2]]);
    expect(schoolMath({ ...M, mode: "linear_system", coefficients: [1, 2, 3, 2, 4, 6] }).answer).toContain("Infinitely");
    expect(schoolMath({ ...M, mode: "linear_system", coefficients: [1, 2, 3, 2, 4, 7] }).answer).toBe("No solution");
    expect(schoolMath({ ...M, mode: "linear_system", coefficients: [0, 0, 1, 0, 0, 1] }).answer).toBe("No solution");
  });
  it("uses perpendicular height, diameter and squared/cubed units consistently", () => {
    expect(schoolMath({ ...M, mode: "geometry", shape: "triangle", width: 4, height: 3 }).answer).toBe("6 units²");
    expect(schoolMath({ ...M, mode: "geometry", shape: "cuboid", width: 4, height: 3, depth: 2 }).answer).toBe("24 units³");
    expect(schoolMath({ ...M, mode: "geometry", shape: "circle", width: 2 }).values[0].value).toBeCloseTo(Math.PI);
    expect(schoolMath({ ...M, mode: "trigonometry", angleDeg: 90 }).answer).toContain("tan θ = undefined");
  });
  it("uses population statistics and conditional probabilities without replacement", () => {
    expect(schoolMath({ ...M, mode: "statistics", data: [1, 2, 3, 4] }).answer).toContain("Mean 2.5; median 2.5");
    expect(schoolMath({ ...M, mode: "statistics", data: [7] }).answer).toContain("population σ 0");
    expect(schoolMath({ ...M, mode: "probability", favourable: 2, total: 4, draws: 2, replacement: true }).answer).toBe("25%");
    expect(schoolMath({ ...M, mode: "probability", favourable: 2, total: 4, draws: 2, replacement: false }).answer).toBe("16.666667%");
    expect(schoolMath({ ...M, mode: "probability", favourable: 0, total: 4, draws: 2, replacement: false }).answer).toBe("0%");
    expect(mathSetupError({ ...M, mode: "probability", favourable: 7, total: 6 })).toBeTruthy();
  });
  it("sequences start at n=1, rotations are counterclockwise and expressions are safely parsed", () => {
    expect(schoolMath({ ...M, mode: "sequence", sequence: "geometric", a: 3, b: 2, index: 5 }).answer).toBe("Term 5: 48");
    expect(schoolMath({ ...M, mode: "transform", a: 1, b: 0, transform: "rotate", angleDeg: 90 }).points[1][1]).toBeCloseTo(1);
    expect(MathFields.safeParse({ ...M, expression: "alert(1)" }).success).toBe(false);
  });
  it("place value, angles and compatible measurement units preserve their meanings", () => {
    expect(schoolMath({ ...M, mode: "place_value", a: 123.45 }).answer).toBe("100 + 20 + 3 + 0.4 + 0.05");
    expect(schoolMath({ ...M, mode: "measurement", a: 2, unitFrom: "m", unitTo: "cm" }).answer).toBe("2 m = 200 cm");
    expect(mathSetupError({ ...M, mode: "measurement", unitFrom: "m", unitTo: "kg" })).toBeTruthy();
    expect(schoolMath({ ...M, mode: "angles", angleDeg: 120 }).answer).toContain("obtuse");
    expect(schoolMath({ ...M, mode: "probability", favourable: 1, total: 100, draws: 10, replacement: true }).answer).not.toBe("0%");
  });
});

describe("new worlds through the real player, validator and save model", () => {
  beforeEach(() => { vi.useFakeTimers(); useSim.setState(freshScene("bedroom")); });
  afterEach(() => vi.useRealTimers());
  it("opens each instrument and resolves engine results without the AI inventing numbers", () => {
    execNow({ op: "show_mechanics", massKg: 2, forceN: 4, durationS: 3 });
    expect(useSim.getState().world).toBe("mechanics");
    expect(resolvePlaceholder("mechanics_acceleration")).toBe("2 m/s²");
    expect(resolvePlaceholder("mechanics_momentum")).toBe("12 kg·m/s");
    execNow({ op: "show_mechanics", mode: "pendulum" });
    expect(resolvePlaceholder("mechanics_acceleration")).toContain("tangential");
    expect(resolvePlaceholder("mechanics_impulse")).toBeUndefined();
    execNow({ op: "show_math", mode: "fractions" });
    expect(useSim.getState().world).toBe("math_studio");
    expect(resolvePlaceholder("math_answer")).toBe("5/6");
    const saved = JSON.parse(JSON.stringify(pickScene(useSim.getState())));
    useSim.setState(freshScene("bedroom")); useSim.setState(saved);
    expect(resolvePlaceholder("math_answer")).toBe("5/6");
  });
  it("auto-loads the correct map, preserves native graphing in Math Studio and rejects invalid coupled patches", () => {
    const raw = normalizePlan({ title: "Test", reply: "Test", capability: "maths", steps: [{ title: "Try", commands: [
      { op: "show_math", mode: "probability", total: 4, favourable: 2 },
      { op: "set_module", module: "maths", set: { favourable: 8 } },
      { op: "plot_function", id: "f", expression: "x^2" },
    ] }] }, "en");
    const r = validatePlan(raw, snapshot(useSim.getState()));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.issues).toHaveLength(1);
      expect(r.plan.steps[0].commands.filter(c => c.op === "load_world")).toEqual([{ op: "load_world", world: "math_studio" }]);
    }
  });
  it("graphing a worked quadratic does not replace its computed roots with a function evaluation", () => {
    execNow({ op: "show_math", mode: "quadratic", a: 1, b: -5, c: 6 });
    const roots = resolvePlaceholder("math_answer");
    execNow({ op: "plot_function", id: "quadratic", expression: "x^2 - 5x + 6" });
    expect(resolvePlaceholder("math_answer")).toBe(roots);
    expect(useSim.getState().modules.maths?.mode).toBe("quadratic");
    execNow({ op: "show_math", mode: "functions", expression: "x^2" });
    execNow({ op: "plot_function", id: "f", expression: "sin(x)" });
    expect(useSim.getState().modules.maths?.expression).toBe("sin(x)");
  });
  it("old worlds and absent optional modules keep working, and wind at zero is actually calm", () => {
    const old = freshScene("math"); delete old.modules.maths; delete old.modules.mechanics;
    useSim.setState(old); execNow({ op: "plot_function", id: "f", expression: "x^2" });
    expect(useSim.getState().world).toBe("math"); expect(useSim.getState().modules.plot!.functions).toHaveLength(1);
    expect(windDrivenRipple({ ...MODULE_DEFAULTS.ripple, windSpeed: 0 }).amplitude).toBe(0);
    expect(windDrivenRipple({ ...MODULE_DEFAULTS.ripple, windSpeed: 15 }).amplitude).toBeGreaterThan(windDrivenRipple({ ...MODULE_DEFAULTS.ripple, windSpeed: 5 }).amplitude);
  });
});
