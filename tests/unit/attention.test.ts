import { beforeEach, describe, expect, it } from "vitest";
import { freshScene, noteFocus, snapshot, useSim } from "@/lib/store";
import { routedPrompt } from "@/lib/ai/teaching";
import { userPrompt } from "@/lib/ai/prompt";
import { PlanRequest } from "@/lib/ssp/schema";

const scene = () => snapshot({ ...useSim.getState(), ...freshScene("lab") });

beforeEach(() => useSim.getState().set({ attention: null, recentAttention: [] }));

describe("what the student is pointing at", () => {
  it("a click is sent with the next question, with how long ago it happened", () => {
    noteFocus({ kind: "cell_part", label: "Mitochondria (part of the Sperm cell)", detail: "Power stations that release energy from food." });
    const s = scene();
    expect(s.focus?.label).toBe("Mitochondria (part of the Sperm cell)");
    expect(s.focus?.detail).toContain("energy");
    expect(s.focus?.secondsAgo).toBeLessThan(2);
    expect(PlanRequest.safeParse({ prompt: "what is this for?", scene: s, history: [] }).success).toBe(true);
  });

  it("earlier picks are kept (newest first, no repeats) and stale ones are dropped", () => {
    noteFocus({ kind: "element", label: "Oxygen (O)" });
    noteFocus({ kind: "element", label: "Sodium (Na)" });
    noteFocus({ kind: "element", label: "Oxygen (O)" });
    expect(scene().recentFocus).toEqual(["Sodium (Na)"]);
    const st = useSim.getState();
    st.set({ attention: { ...st.attention!, at: Date.now() - 11 * 60_000 }, recentAttention: [] });
    expect(scene().focus).toBeUndefined();
  });

  it("selecting a molecule in the world describes it", () => {
    useSim.getState().set({ selectedId: null });
    useSim.getState().upsertObject({ id: "mol_1", type: "molecule", molecule: "caffeine", position: [0, 2, 0], rotation: [0, 0, 0], scale: 1, physics: "none", massKg: 1, bounciness: 0, drag: 0, visible: true, version: 0 });
    useSim.getState().set({ selectedId: "mol_1" });
    expect(scene().focus?.label).toBe("Caffeine molecule (C₈H₁₀N₄O₂)");
    useSim.getState().removeObject("mol_1");
  });

  it("a vague question is routed as if it named the picked thing; a specific one is left alone", () => {
    noteFocus({ kind: "cell_part", label: "Mitochondria (part of the Sperm cell)" });
    const s = scene();
    expect(routedPrompt({ prompt: "what is this for?", scene: s })).toBe("what is this for? (about: Mitochondria (part of the Sperm cell))");
    expect(routedPrompt({ prompt: "apa fungsi ini?", scene: s })).toContain("about: Mitochondria");
    expect(routedPrompt({ prompt: "Throw a ball at 40 degrees", scene: s })).toBe("Throw a ball at 40 degrees");
    expect(routedPrompt({ prompt: "what is this for?", scene: { ...s, focus: { ...s.focus!, secondsAgo: 900 } } })).toBe("what is this for?");
  });

  it("the director's prompt says what the student is pointing at, and keeps their words unchanged", () => {
    noteFocus({ kind: "atom", label: "Oxygen atom in the Water molecule (H₂O)", detail: "2 bonds: single to H, single to H" });
    const p = userPrompt({ prompt: "why is it bent?", scene: scene(), history: [], gradeBand: "middle", language: "auto" }, []);
    expect(p).toContain("The student is pointing at (clicked 0 s ago): Oxygen atom in the Water molecule (H₂O) — 2 bonds");
    expect(p).toContain('"""why is it bent?"""');
  });
});
