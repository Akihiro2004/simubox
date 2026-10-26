import { existsSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import body from "@/lib/world/anatomy.generated.json";
import { anatomyLooks, STRUCTURE_IDS, STRUCTURES } from "@/lib/world/anatomy";
import { anatomySetup, DEFAULT_ANATOMY } from "@/lib/experiments";
import { moduleValue } from "@/lib/modules";
import { matchCapabilities } from "@/lib/ai/capabilities";
import { FIXTURES, pickFixture } from "@/lib/ai/fixtures";
import { validatePlan } from "@/lib/ssp/validate";
import { freshScene, snapshot, useSim } from "@/lib/store";

const solid = (looks: Map<string, string>) => [...looks].filter(([, l]) => l === "solid").map(([id]) => id);

describe("anatomy layers", () => {
  it("peels the whole body skin → muscles → skeleton and organs → organs", () => {
    expect(solid(anatomyLooks("all", 0))).toEqual(["skin"]);
    const muscles = anatomyLooks("all", 1);
    expect(solid(muscles)).toContain("biceps");
    expect(solid(muscles)).not.toContain("heart");
    expect(muscles.get("skin")).toBe("ghost");
    const inner = solid(anatomyLooks("all", 2));
    expect(inner).toEqual(expect.arrayContaining(["heart", "ribcage", "liver", "brain"]));
    expect(inner).not.toContain("biceps");
    expect(solid(anatomyLooks("all", 3))).not.toContain("ribcage");
    expect(solid(anatomyLooks("all", 3))).toContain("stomach");
  });
  it("shows one system with a ghosted body for context", () => {
    const heart = anatomyLooks("cardiovascular", 0);
    expect(solid(heart)).toEqual(expect.arrayContaining(["heart", "aorta", "arteries", "veins"]));
    expect(heart.get("skin")).toBe("ghost");
    expect(heart.get("ribcage")).toBe("ghost");
    expect(heart.has("biceps")).toBe(false);
  });
  it("opens the right system for a live model or a hidden structure", () => {
    expect(anatomySetup(DEFAULT_ANATOMY, { instrument: "breathing" }, true).system).toBe("respiratory");
    expect(anatomySetup(DEFAULT_ANATOMY, { highlight: "biceps" }, false).system).toBe("muscular");
    expect(anatomySetup(DEFAULT_ANATOMY, { instrument: "heart", system: "all", depth: 2 }, true).system).toBe("all");
    expect(anatomySetup({ ...DEFAULT_ANATOMY, highlight: "liver" }, { instrument: "none" }, true).highlight).toBeNull();
  });
});

describe("anatomy numbers come from the models", () => {
  const m = { ...useSim.getState().modules, anatomy: { ...DEFAULT_ANATOMY } };
  it("fills physiology placeholders", () => {
    expect(moduleValue("blood_pressure", undefined, m, {})).toMatch(/^1[12]\d\/[78]\d mmHg$/);
    expect(moduleValue("tidal_volume", undefined, m, {})).toMatch(/^5\d\d mL$/);
    expect(moduleValue("reflex_time", undefined, m, {})).toMatch(/^2\d ms$/);
    expect(moduleValue("organ_mass", "liver", m, {})).toBe("about 1.8 kg");
    expect(moduleValue("organ_mass", "heart", { ...m, anatomy: null }, {})).toBe("about 330 g");
    expect(moduleValue("organ_mass", "aorta", m, {})).toBeUndefined();
  });
});

describe("anatomy lessons", () => {
  it("routes body questions to the Anatomy Lab and leaves cells alone", () => {
    expect(matchCapabilities("How does my heart pump blood?")[0]).toBe("anatomy");
    expect(matchCapabilities("Show me the bones in the human skeleton")[0]).toBe("anatomy");
    expect(matchCapabilities("Bagaimana paru-paru bekerja?")[0]).toBe("anatomy");
    expect(matchCapabilities("What is inside a plant cell?")[0]).toBe("cell");
  });
  it("plays the offline heart demo through the validator", () => {
    expect(pickFixture("how does the heart work")).toBe(FIXTURES.anatomy);
    useSim.setState(freshScene("bedroom"));
    const r = validatePlan(FIXTURES.anatomy, snapshot(useSim.getState()));
    expect(r.ok && r.issues).toEqual([]);
  });
  it("drops an unknown body part", () => {
    const plan = { ...FIXTURES.anatomy, steps: [{ title: "x", commands: [{ op: "show_anatomy", highlight: "spleen" }, { op: "speak", speaker: "simu", text: "Hi" }] }] };
    const r = validatePlan(plan, snapshot(useSim.getState()));
    expect(r.ok && r.issues.length).toBe(1);
  });
});

describe("anatomy mesh file", () => {
  it("has every named structure, life size, within budget", () => {
    for (const id of STRUCTURE_IDS) expect(body.structures, id).toHaveProperty(id);
    expect(body.heightM).toBeGreaterThan(1.6); expect(body.heightM).toBeLessThan(1.85);
    expect(body.indexCount / 3).toBeLessThan(400_000);
    expect(existsSync("public/anatomy/body.bin")).toBe(true);
    expect(statSync("public/anatomy/body.bin").size).toBe(body.positionCount * 2 + body.indexCount * 2);
    for (const [id, s] of Object.entries(body.structures)) {
      expect(s.vertexCount, id).toBeLessThan(65536);
      if (id in STRUCTURES) expect(s.system, id).toBe(STRUCTURES[id as keyof typeof STRUCTURES].system);
    }
  });
  it("puts organs where they are in a real body", () => {
    const c = (id: string) => (body.structures as Record<string, { center: number[] }>)[id].center;
    expect(c("brain")[1]).toBeGreaterThan(c("heart")[1]);
    expect(c("heart")[1]).toBeGreaterThan(c("stomach")[1]);
    expect(c("stomach")[1]).toBeGreaterThan(c("bladder")[1]);
    // The heart sits left of the midline: the person's left is +x when they face +z.
    expect(c("heart")[0]).toBeGreaterThan(0);
    expect(c("liver")[0]).toBeLessThan(0);
    // Face forward: the eyes are in front of the spine.
    expect(c("eyes")[2]).toBeGreaterThan(c("spine")[2]);
  });
});

describe("organ questions reach the right model", () => {
  it.each([
    ["What happens after we eat?", "digestion"],
    ["How does our body use air to breathe?", "breathing"],
    ["Why does my heart beat faster when I run?", "heart"],
    ["Why does my knee kick when the doctor taps it?", "nerve"],
    ["Why do we pee more when we drink a lot of water?", "kidney"],
    ["Apa yang terjadi setelah kita makan?", "digestion"],
  ])("%s → %s", async (prompt, instrument) => {
    const { chooseTeaching } = await import("@/lib/ai/teaching");
    const choice = chooseTeaching({ prompt, history: [], scene: snapshot(useSim.getState()) });
    expect(choice.capability).toBe("anatomy");
    expect(choice.instrument).toBe(instrument);
  });
  it("leaves food chains and oxygen molecules to their own labs", () => {
    expect(matchCapabilities("Explain a food chain in the ocean")[0]).not.toBe("anatomy");
    expect(matchCapabilities("Show me an oxygen molecule")[0]).toBe("molecule");
  });
});

describe("offline organ demos", () => {
  it.each(["What happens after we eat?", "How does our body use air to breathe?"])("%s plays a valid built-in lesson", (prompt) => {
    const plan = pickFixture(prompt)!;
    expect(plan.capability).toBe("anatomy");
    useSim.setState(freshScene("bedroom"));
    const r = validatePlan(plan, snapshot(useSim.getState()));
    expect(r.ok && r.issues).toEqual([]);
  });
});
