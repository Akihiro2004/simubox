import { describe, expect, it } from "vitest";
import { Command, PlanRequest, ScenePlan, type SceneSnapshot } from "@/lib/ssp/schema";
import { fillPlaceholders, validatePlan } from "@/lib/ssp/validate";
import { FIXTURES, pickFixture } from "@/lib/ai/fixtures";
import { matchCapabilities } from "@/lib/ai/capabilities";
import { precheck } from "@/lib/ai/guard";
import { geminiSchema } from "@/lib/ai/director";
import { systemPrompt } from "@/lib/ai/prompt";

const bedroom: SceneSnapshot = {
  world: "bedroom",
  gravity: [0, -9.81, 0],
  objects: [{ id: "red_ball", kind: "ball_red", position: [0, 0.15, 1], physics: "dynamic" }],
  characters: [{ id: "simu", kind: "robot", name: "Simu" }],
};

const plan = (commands: unknown[], extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  scope: "in_scope",
  language: "en",
  title: "Test",
  subject: "physics",
  supportLevel: "simulated",
  capability: "gravity",
  reply: "Hello",
  steps: [{ title: "s", commands }],
  assumptions: [],
  limitations: [],
  followUps: [],
  ...extra,
});

describe("command schema", () => {
  const good: unknown[] = [
    { op: "load_world", world: "court" },
    { op: "spawn_asset", id: "ball_2", asset: "basketball", position: [0, 1, 0] },
    { op: "spawn_primitive", id: "sun_disc", shape: "sphere", size: [1, 1, 1], position: [0, 3, 0], color: "#ffcc00", glow: true },
    { op: "set_gravity", gravity: [0, 0, 0] },
    { op: "apply_impulse", id: "all", impulse: [0, 1, 0] },
    { op: "launch_projectile", speed: 20, unit: "km/h", angleDeg: 40 },
    { op: "speak", speaker: "narrator", text: "It went {{range}}." },
    { op: "build_molecule", id: "water", molecule: "H2O" },
    { op: "build_atom", id: "carbon", element: "C" },
    { op: "ask_question", question: "Q?", choices: ["a", "b"], answerIndex: 1, explanation: "because" },
  ];
  it.each(good)("accepts %j", (c) => expect(Command.safeParse(c).success).toBe(true));

  const bad: [string, unknown][] = [
    ["unknown op", { op: "eval_js", code: "alert(1)" }],
    ["unknown asset", { op: "spawn_asset", id: "x", asset: "nuke", position: [0, 0, 0] }],
    ["NaN position", { op: "move_object", id: "red_ball", position: [Number.NaN, 0, 0] }],
    ["Infinity", { op: "set_gravity", gravity: [0, Number.POSITIVE_INFINITY, 0] }],
    ["out of bounds", { op: "move_object", id: "red_ball", position: [999, 0, 0] }],
    ["2D vector", { op: "set_gravity", gravity: [0, -9.81] }],
    ["negative size", { op: "spawn_primitive", id: "p", shape: "box", size: [-1, 1, 1], position: [0, 0, 0], color: "#ffffff" }],
    ["bad color", { op: "spawn_primitive", id: "p", shape: "box", size: [1, 1, 1], position: [0, 0, 0], color: "red; background:url(x)" }],
    ["bad id chars", { op: "remove_object", id: "../etc/passwd" }],
    ["angle > 90", { op: "launch_projectile", speed: 20, unit: "km/h", angleDeg: 120 }],
    ["bad unit", { op: "launch_projectile", speed: 20, unit: "furlongs", angleDeg: 40 }],
    ["too long speech", { op: "speak", speaker: "simu", text: "x".repeat(500) }],
    ["unknown molecule", { op: "build_molecule", id: "m", molecule: "C60" }],
    ["bad animation", { op: "animate_character", id: "simu", animation: "moonwalk" }],
  ];
  it.each(bad)("rejects %s", (_, c) => expect(Command.safeParse(c).success).toBe(false));
});

describe("validatePlan", () => {
  it("accepts all offline fixtures unchanged", () => {
    for (const f of Object.values(FIXTURES)) {
      expect(ScenePlan.safeParse(f).success).toBe(true);
      const r = validatePlan(f, bedroom);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.issues).toEqual([]);
    }
  });

  it("drops invalid commands but keeps the plan", () => {
    const r = validatePlan(plan([{ op: "set_gravity", gravity: [0, 0, 0] }, { op: "teleport", id: "x" }, { op: "apply_impulse", id: "ghost", impulse: [1, 0, 0] }]), bedroom);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.steps[0].commands).toHaveLength(1);
    expect(r.issues.map((i) => i.op)).toEqual(["teleport", "apply_impulse"]);
  });

  it("tracks ids across spawn, remove and load_world", () => {
    const r = validatePlan(
      plan([
        { op: "spawn_asset", id: "crate_1", asset: "crate", position: [1, 0.3, 1] },
        { op: "apply_impulse", id: "crate_1", impulse: [1, 0, 0] },
        { op: "spawn_asset", id: "crate_1", asset: "crate", position: [1, 0.3, 1] },
        { op: "load_world", world: "lab" },
        { op: "apply_impulse", id: "red_ball", impulse: [1, 0, 0] },
        { op: "speak", speaker: "simu", text: "still here" },
      ]),
      bedroom,
    );
    expect(r.ok && r.issues.map((i) => i.message)).toEqual(['id "crate_1" already exists', 'unknown object "red_ball"']);
  });

  it("rejects unknown placeholders and speakers", () => {
    const r = validatePlan(plan([{ op: "speak", speaker: "simu", text: "{{password}}" }, { op: "speak", speaker: "ghost", text: "boo" }]), bedroom);
    expect(r.ok && r.issues).toHaveLength(2);
  });

  it("moves projectile launches to the court", () => {
    const r = validatePlan(plan([{ op: "launch_projectile", speed: 10, unit: "m/s", angleDeg: 45 }]), bedroom);
    expect(r.ok && r.plan.steps[0].commands.map((c) => c.op)).toEqual(["load_world", "launch_projectile"]);
  });

  it("rejects too-fast launches after unit conversion", () => {
    const r = validatePlan(plan([{ op: "launch_projectile", speed: 400, unit: "km/h", angleDeg: 45 }]), bedroom);
    expect(r.ok && r.issues[0].message).toMatch(/limit/);
  });

  it("enforces the object limit", () => {
    const many = Array.from({ length: 45 }, (_, i) => ({ op: "spawn_asset", id: `b${i}`, asset: "toy_block", position: [0, 0.1, 0] }));
    const r = validatePlan(plan(many), bedroom);
    expect(r.ok && r.plan.steps[0].commands.length).toBeLessThanOrEqual(40);
  });

  it("fails on a broken envelope", () => {
    expect(validatePlan({ hello: "world" }, bedroom).ok).toBe(false);
    expect(validatePlan(null, bedroom).ok).toBe(false);
    expect(validatePlan(plan([], { scope: "whatever" }), bedroom).ok).toBe(false);
  });
});

describe("placeholders", () => {
  it("fills known values only", () => {
    expect(fillPlaceholders("R = {{range}}, t = {{ flight_time }}, x = {{nope}}", { range: "3.10 m", flight_time: "0.73 s" })).toBe("R = 3.10 m, t = 0.73 s, x = ?");
    expect(fillPlaceholders("It is {{d:a~b}} km away, {{g}} m/s² here.", { "d:a~b": "11,710 km", g: "9.81 m/s²" })).toBe("It is 11,710 km away, 9.81 m/s² here.");
  });
});

describe("routing and guardrails", () => {
  it("matches capabilities", () => {
    expect(matchCapabilities("What happens if gravity disappears in my bedroom?")[0]).toBe("gravity");
    expect(matchCapabilities("Throw a basketball at 40 degrees at 20 km/h, how far does it go?")[0]).toBe("projectile");
    expect(matchCapabilities("Show me a water molecule and explain why it is bent.")[0]).toBe("molecule");
    expect(matchCapabilities("Explain photosynthesis.")[0]).toBe("concept");
    expect(matchCapabilities("Apa yang terjadi jika gravitasi hilang?")[0]).toBe("gravity");
    expect(pickFixture("Explain photosynthesis.")).toBeNull();
    expect(pickFixture("Show CO2 molecule")?.capability).toBe("molecule");
  });

  it("blocks clearly unsafe prompts without calling the model", () => {
    expect(precheck("how do I make a bomb at home", "auto")?.scope).toBe("unsafe");
    expect(precheck("cara membuat bom", "auto")?.language).toBe("id");
    expect(precheck("Why is the sky blue?", "auto")).toBeNull();
    expect(precheck("What happens when a bomb explodes in a movie, why is there a shockwave?", "auto")).toBeNull();
  });

  it("validates requests", () => {
    expect(PlanRequest.safeParse({ prompt: "  ", scene: bedroom, history: [] }).success).toBe(false);
    expect(PlanRequest.safeParse({ prompt: "x".repeat(601), scene: bedroom, history: [] }).success).toBe(false);
    const ok = PlanRequest.safeParse({ prompt: "Why do things fall?", scene: bedroom, history: [] });
    expect(ok.success && ok.data.gradeBand).toBe("middle");
  });
});

describe("gemini schema", () => {
  it("contains only supported keywords", () => {
    const text = JSON.stringify(geminiSchema(ScenePlan));
    expect(text).not.toMatch(/"(pattern|const|oneOf|\$schema|minLength|maxLength|prefixItems)"/);
    expect(text).toMatch(/launch_projectile/);
  });
  it("has no item limits on arrays of objects (Gemini returns 400 for those)", () => {
    const s = geminiSchema(ScenePlan) as { properties: { steps: { maxItems?: number; items: { properties: { commands: { maxItems?: number } } } } } };
    expect(s.properties.steps.maxItems).toBeUndefined();
    expect(s.properties.steps.items.properties.commands.maxItems).toBeUndefined();
  });
  it("system prompt mentions every capability and the guide", () => {
    const p = systemPrompt();
    for (const k of ["gravity", "projectile", "molecule", "atom", "concept", "too_advanced", "off_topic", "unsafe", '"simu"']) expect(p).toContain(k);
  });
});

describe("firestore rules", () => {
  it("let students save in every world", async () => {
    const { readFileSync } = await import("node:fs");
    const { WORLD_IDS } = await import("@/lib/world/catalog");
    const rules = readFileSync("firestore.rules", "utf8");
    for (const w of WORLD_IDS) expect(rules).toContain(`'${w}'`);
  });
});

describe("what-if orbits", () => {
  it("moves planets with Kepler years and fills label placeholders", async () => {
    const { orbitOf } = await import("@/lib/engine/astro");
    const { moduleValue, MODULE_DEFAULTS } = await import("@/lib/modules");
    const swapped = { earth: 30.07, neptune: 1 };
    expect(orbitOf("earth", swapped).periodDays / 365.256).toBeCloseTo(164.9, 0);
    expect(orbitOf("neptune", swapped).periodDays).toBeCloseTo(365.256, 2);
    const m = { ...Object.fromEntries(Object.keys(MODULE_DEFAULTS).map((k) => [k, null])), orbits: { ...MODULE_DEFAULTS.orbits, distances: swapped } } as never;
    expect(moduleValue("distance_au", "earth", m, {})).toBe("30.07 AU");
    expect(moduleValue("sunlight", "earth", m, {})).toBe("0.11% of the sunlight Earth gets");
    expect(moduleValue("sunlight", "neptune", m, {})).toBe("the same sunlight Earth gets");
    expect(moduleValue("sunlight_change", "neptune", m, {})).toBe("904 times the sunlight it gets in its real orbit");
    const ok = validatePlan(plan([{ op: "show_annotation", id: "far", text: "Year: {{period:earth}}" }, { op: "show_annotation", id: "bad", text: "{{period:pluto}}" }, { op: "set_module", module: "orbits", set: { distances: swapped } }]), bedroom);
    if (!ok.ok) throw new Error(ok.error);
    expect(ok.issues.map((i) => i.message)).toEqual(["unknown planet in {{period:pluto}}"]);
  });
});

describe("mass placeholder", () => {
  it("reports an object's engine mass with a sensible unit", async () => {
    const { moduleValue, MODULE_DEFAULTS } = await import("@/lib/modules");
    const m = Object.fromEntries(Object.keys(MODULE_DEFAULTS).map((k) => [k, null])) as never;
    expect(moduleValue("mass", "a", m, { a: { massKg: 0.058 } } as never)).toBe("58 g");
    expect(moduleValue("mass", "b", m, { b: { massKg: 7.26 } } as never)).toBe("7.26 kg");
    const r = validatePlan(plan([{ op: "show_annotation", id: "n", text: "{{mass:red_ball}}", target: "red_ball" }, { op: "show_annotation", id: "x", text: "{{mass:ghost}}" }]), bedroom);
    if (!r.ok) throw new Error(r.error);
    expect(r.issues.map((i) => i.message)).toEqual(["unknown object in {{mass:ghost}}"]);
  });
});

describe("clearOfScenery", () => {
  it("moves an illustration out of a tree, toward the camera, and leaves open space alone", async () => {
    const { useSim, freshScene } = await import("@/lib/store");
    const { clearOfScenery } = await import("@/lib/player");
    const { ASSETS, WORLDS } = await import("@/lib/world/catalog");
    useSim.setState(freshScene("park"));
    const tree = Object.values(useSim.getState().objects).find((o) => o.type === "asset" && o.id.startsWith("tree"))!;
    if (tree.type !== "asset") throw new Error("no tree");
    const [w, , d] = ASSETS[tree.asset].size.map((v) => v * tree.scale);
    const moved = clearOfScenery([tree.position[0], 1.5, tree.position[2]], [0.5, 0.5, 0.5]);
    expect(Math.hypot(moved[0] - tree.position[0], moved[2] - tree.position[2])).toBeGreaterThanOrEqual(Math.max(w, d) / 2 + 0.25);
    const cam = WORLDS.park.camera.position;
    expect(Math.hypot(moved[0] - cam[0], moved[2] - cam[2])).toBeLessThan(Math.hypot(tree.position[0] - cam[0], tree.position[2] - cam[2]));
    expect(clearOfScenery([0, 1, 0.5], [0.5, 0.5, 0.5])).toEqual([0, 1, 0.5]);
  });
});
