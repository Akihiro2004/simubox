import { describe, expect, it } from "vitest";
import { EXAMPLES } from "@/lib/ai/examples";
import { systemPrompt } from "@/lib/ai/prompt";
import { commandReference } from "@/lib/ai/docs";
import { Command } from "@/lib/ssp/schema";
import { normalizePlan, validatePlan } from "@/lib/ssp/validate";
import { initialObjects } from "@/lib/world/scene";
import type { WorldId } from "@/lib/world/catalog";

const sceneFor = (world: WorldId) => ({
  world,
  objects: initialObjects(world).map((o) => ({ id: o.id, kind: "x", position: o.position, physics: o.physics })),
  characters: [{ id: "simu", kind: "robot", name: "Simu" }],
});

describe("worked examples", () => {
  it.each(EXAMPLES.map((e) => [e.prompt, e] as const))("%s is a valid plan with nothing dropped", (_, e) => {
    const r = validatePlan(e.plan, sceneFor(e.world as WorldId));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.issues).toEqual([]);
    const ops = e.plan.steps.flatMap((s) => s.commands.map((c) => c.op));
    // The lesson arc: narration, a prediction, and an info card.
    expect(ops.filter((o) => o === "speak").length).toBeGreaterThanOrEqual(4);
    expect(ops).toContain("ask_question");
    expect(ops.some((o) => o === "show_card" || o === "show_formula")).toBe(true);
  });
});

describe("prompt", () => {
  it("documents every command", () => {
    const ref = commandReference();
    const ops = (Command.options as { shape: { op: { value: string } } }[]).map((o) => o.shape.op.value);
    for (const op of ops) expect(ref).toContain(`- ${op} {`);
    const p = systemPrompt();
    expect(p).toContain(ref);
    for (const e of EXAMPLES) expect(p).toContain(e.prompt);
    expect(p.length).toBeLessThan(60_000);
  });
});

describe("normalizePlan", () => {
  it("fills a sloppy envelope and splits long narration", () => {
    const long = "This is the first sentence about gravity. ".repeat(10).trim();
    const raw = {
      title: "x".repeat(90),
      steps: [{ commands: [{ op: "speak", speaker: "simu", text: long }, { op: "show_card", id: "c1", title: "Hi", bullets: ["y".repeat(300)] }] }],
      followUps: ["a", 3, "b"],
    };
    const n = normalizePlan(raw, "id") as { title: string; language: string; scope: string; steps: { title: string; commands: { op: string; text?: string; bullets?: string[] }[] }[]; followUps: string[] };
    expect(n.language).toBe("id");
    expect(n.scope).toBe("in_scope");
    expect(n.title.length).toBeLessThanOrEqual(60);
    expect(n.steps[0].title).toBe("Step 1");
    const speaks = n.steps[0].commands.filter((c) => c.op === "speak");
    expect(speaks.length).toBeGreaterThan(1);
    for (const s of speaks) expect(s.text!.length).toBeLessThanOrEqual(240);
    expect(n.steps[0].commands.find((c) => c.op === "show_card")!.bullets![0].length).toBeLessThanOrEqual(160);
    expect(n.followUps).toEqual(["a", "b"]);
    const r = validatePlan(n, sceneFor("bedroom"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.issues).toEqual([]);
  });
  it("leaves garbage for the validator to reject", () => {
    expect(validatePlan(normalizePlan(null, "en"), sceneFor("bedroom")).ok).toBe(false);
    expect(validatePlan(normalizePlan("nope", "en"), sceneFor("bedroom")).ok).toBe(false);
  });
});

describe("new module commands", () => {
  it("validates cards, shapes, plots and places", () => {
    const plan = {
      schemaVersion: 1, scope: "in_scope", language: "en", title: "t", subject: "math", supportLevel: "visual", capability: "concept", reply: "r",
      steps: [{ title: "s", commands: [
        { op: "plot_function", id: "f1", expression: "x^2 - 3" },
        { op: "plot_function", id: "f2", expression: "alert(1)" },
        { op: "spawn_shape", id: "tri", shape: "extrusion", size: [1, 1, 0.2], position: [0, 0.5, 2], color: "#ff0000" },
        { op: "spawn_shape", id: "tri2", shape: "extrusion", size: [1, 1, 0.2], position: [0, 0.5, 2], color: "#ff0000", points: [[0, 0], [1, 0], [0, 1]] },
        { op: "show_card", id: "c", placement: "object", target: "tri2", title: "Volume", rows: [{ label: "V", value: "{{volume:tri2}}" }] },
        { op: "show_card", id: "c2", placement: "object", target: "ghost", title: "x" },
        { op: "mark_place", id: "home", place: "jakarta" },
        { op: "connect_places", id: "r", from: "home", to: "tokyo" },
        { op: "speak", speaker: "simu", text: "It is {{distance_km:home~tokyo}} away." },
      ] }],
      assumptions: [], limitations: [], followUps: [],
    };
    const r = validatePlan(plan, sceneFor("math"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.issues.map((i) => i.op)).toEqual(["plot_function", "spawn_shape", "show_card"]);
    // Globe commands pull in a load_world for the globe.
    expect(r.plan.steps[0].commands.map((c) => c.op)).toContain("load_world");
  });
});
