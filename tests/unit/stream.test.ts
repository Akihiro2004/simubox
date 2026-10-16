import { describe, expect, it } from "vitest";
import type { SceneSnapshot } from "@/lib/ssp/schema";
import { normalizePlan, validatePlan } from "@/lib/ssp/validate";
import { createStepStreamer, scanPlan } from "@/lib/ssp/stream";
import { EXAMPLES } from "@/lib/ai/examples";
import { pcmToFloat } from "@/lib/tts";

const bedroom: SceneSnapshot = {
  world: "bedroom",
  gravity: [0, -9.81, 0],
  objects: [{ id: "red_ball", kind: "ball_red", position: [0, 0.15, 1], physics: "dynamic" }],
  characters: [{ id: "simu", kind: "robot", name: "Simu" }],
};

/** The model's key order: envelope, steps, then the rest. */
function modelText(plan: (typeof EXAMPLES)[number]["plan"]) {
  const { steps, details, assumptions, limitations, followUps, ...head } = plan;
  return JSON.stringify({ ...head, steps, details, assumptions, limitations, followUps }, null, 1);
}

describe("scanPlan", () => {
  it("finds the head only once steps start, and only complete steps", () => {
    expect(scanPlan('{"title":"Hi","reply":"Yo"').head).toBeUndefined();
    const partial = '{"title":"A {tricky} \\"title\\"","reply":"x, y","steps":[{"title":"one","commands":[{"op":"speak","speaker":"simu","text":"} ] not the end"}]},{"title":"two","comm';
    const r = scanPlan(partial);
    expect(r.head).toEqual({ title: 'A {tricky} "title"', reply: "x, y" });
    expect(r.steps).toHaveLength(1);
    expect(JSON.parse(r.steps[0]).commands[0].text).toBe("} ] not the end");
  });

  it("ignores text before the object and fields after the steps", () => {
    const r = scanPlan('```json\n{"title":"T","steps":[{"title":"a","commands":[]},{"title":"b","commands":[]}],"followUps":["x"]}');
    expect(r.head).toEqual({ title: "T" });
    expect(r.steps.map((s) => JSON.parse(s).title)).toEqual(["a", "b"]);
  });
});

describe("createStepStreamer", () => {
  it("hands out every step once, in order, matching whole-plan validation", () => {
    for (const ex of EXAMPLES) {
      const text = modelText(ex.plan);
      const s = createStepStreamer(bedroom, "en");
      const events = [];
      // Feed in uneven chunks like a real stream.
      for (let i = 23; i < text.length + 23; i += 23) events.push(...s.feed(text.slice(0, i)));
      expect(events[0].type).toBe("begin");
      const steps = events.flatMap((e) => (e.type === "plan_step" ? [e] : []));
      expect(steps.map((e) => e.index)).toEqual(steps.map((_, i) => i));
      const whole = validatePlan(normalizePlan(JSON.parse(text), "en"), bedroom);
      if (!whole.ok) throw new Error(whole.error);
      expect(steps.map((e) => e.step)).toEqual(whole.plan.steps);
      expect(s.played(whole.plan)).toEqual(whole.plan);
    }
  });

  it("starts playing before the plan is finished", () => {
    const text = modelText(EXAMPLES[0].plan);
    const s = createStepStreamer(bedroom, "en");
    const cut = text.indexOf('"title"', text.indexOf('"steps"') + 30); // inside step 2
    const events = s.feed(text.slice(0, cut));
    expect(events.map((e) => e.type)).toEqual(["begin", "plan_step"]);
    expect(s.count).toBe(1);
  });

  it("moves a late Moon restyle into the next step instead of the one already played", () => {
    const head = '{"schemaVersion":1,"scope":"in_scope","language":"en","title":"Moon","subject":"physics","supportLevel":"simulated","capability":"gravity","reply":"r","steps":[';
    const one = '{"title":"one","commands":[{"op":"speak","speaker":"simu","text":"Hi!"}]}';
    const two = '{"title":"two","commands":[{"op":"set_gravity","gravity":[0,-1.62,0]}]}';
    const s = createStepStreamer(bedroom, "en");
    s.feed(head + one + ",");
    const later = s.feed(head + one + "," + two + "]");
    const step = later.find((e) => e.type === "plan_step");
    expect(step?.type === "plan_step" && step.step.commands.map((c) => c.op)).toEqual(["set_environment", "set_gravity"]);
  });

  it("drops a bad command but keeps the step", () => {
    const text = '{"schemaVersion":1,"scope":"in_scope","language":"en","title":"T","subject":"physics","supportLevel":"simulated","capability":"gravity","reply":"r","steps":[{"title":"one","commands":[{"op":"explode"},{"op":"speak","speaker":"simu","text":"Hi!"}]}]';
    const s = createStepStreamer(bedroom, "en");
    const step = s.feed(text).find((e) => e.type === "plan_step");
    expect(step?.type === "plan_step" && step.step.commands.map((c) => c.op)).toEqual(["speak"]);
    expect(s.issues).toHaveLength(1);
  });
});

describe("pcmToFloat", () => {
  it("reads 16-bit little-endian samples", () => {
    expect([...pcmToFloat(new Uint8Array([0x00, 0x80, 0xff, 0x7f, 0x00, 0x00, 0x01]))]).toEqual([-1, 32767 / 32768, 0]);
  });
});

describe("finish", () => {
  it("hands out steps the stream missed", () => {
    const s = createStepStreamer(bedroom, "en");
    const text = modelText(EXAMPLES[0].plan);
    const cut = text.indexOf('"title"', text.indexOf('"steps"') + 30);
    s.feed(text.slice(0, cut));
    const whole = validatePlan(normalizePlan(JSON.parse(text), "en"), bedroom);
    if (!whole.ok) throw new Error(whole.error);
    const late = s.finish(whole.plan);
    expect(late.map((e) => (e.type === "plan_step" ? e.index : -1))).toEqual(whole.plan.steps.slice(1).map((_, i) => i + 1));
    expect(s.played(whole.plan)).toEqual(whole.plan);
  });
});
