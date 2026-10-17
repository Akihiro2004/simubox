import { describe, expect, it } from "vitest";
import { fillProse, normalizePlan, validatePlan } from "@/lib/ssp/validate";
import { freshScene, useSim } from "@/lib/store";
import { settleLessonText } from "@/lib/player";
import { MODULE_DEFAULTS } from "@/lib/modules";

const values: Record<string, string> = { gravity: "9.81 m/s²", "distance_km:london~new_york": "5,570 km" };
const resolve = (name: string, arg?: string) => values[arg ? `${name}:${arg}` : name];

describe("placeholders in Simu's answer text", () => {
  it("fills known values and shows a quiet gap for ones the lesson hasn't computed yet", () => {
    expect(fillProse("Gravity is {{gravity}}.", resolve)).toBe("Gravity is 9.81 m/s².");
    expect(fillProse("They are {{distance_km:a~b}} apart.", resolve)).toBe("They are … apart.");
    expect(fillProse("No numbers here.", resolve)).toBe("No numbers here.");
  });

  it("leaves out a sentence whose number never became known once the lesson is over", () => {
    const text = "They are neighbours. Their capitals are {{distance_km:jakarta_pt~kl_pt}} apart. London to New York is {{distance_km:london~new_york}}.";
    expect(fillProse(text, resolve, true)).toBe("They are neighbours. London to New York is 5,570 km.");
    expect(fillProse("Line one {{nope}}.\nLine two is fine.", resolve, true)).toBe("Line two is fine.");
    expect(fillProse("Decimals like 1.5 m stay whole. {{gravity}} here.", resolve, true)).toBe("Decimals like 1.5 m stay whole. 9.81 m/s² here.");
  });

  const plan = (reply: string, commands: unknown[]) =>
    normalizePlan(
      { schemaVersion: 1, scope: "in_scope", language: "en", title: "Distance between Indonesia and Malaysia", subject: "other", supportLevel: "visual", capability: "globe", reply, steps: [{ title: "Mark them", commands }], assumptions: [], limitations: [], followUps: [] },
      "en",
    );
  const scene = { world: "globe" as const, objects: [], characters: [] };
  const reply = "They are neighbours. Their capitals are {{distance_km:jakarta_pt~kl_pt}} apart.";

  it("keeps a reply sentence that refers to places the plan marks", () => {
    const r = validatePlan(plan(reply, [
      { op: "mark_place", id: "jakarta_pt", place: "jakarta" },
      { op: "mark_place", id: "kl_pt", lat: 3.14, lon: 101.69, label: "Kuala Lumpur" },
    ]), scene);
    expect(r.ok && r.plan.reply).toBe(reply);
  });

  it("drops a reply sentence whose places never exist, and unknown placeholder names", () => {
    const r = validatePlan(plan(`${reply} Gravity is {{gravityy}}.`, [{ op: "show_globe", view: "globe" }]), scene);
    expect(r.ok && r.plan.reply).toBe("They are neighbours.");
  });

  it("a streamed prefix keeps sentences whose ids later steps may still create", () => {
    const r = validatePlan(plan(`${reply} Gravity is {{gravityy}}.`, [{ op: "show_globe", view: "globe" }]), scene, { partial: true });
    expect(r.ok && r.plan.reply).toBe(reply);
  });

  it("writes the computed number into the answer card and transcript when the lesson ends", () => {
    useSim.setState({
      ...freshScene("globe"),
      modules: { ...freshScene("globe").modules, globe: { ...MODULE_DEFAULTS.globe, marks: [{ id: "jakarta_pt", lat: -6.2, lon: 106.85, label: "Jakarta", color: "#e5484d" }, { id: "kl_pt", lat: 3.14, lon: 101.69, label: "Kuala Lumpur", color: "#e5484d" }] } },
      explanation: { title: "Neighbours", reply, assumptions: [], limitations: [], supportLevel: "visual", scope: "in_scope", source: "gemini" },
      messages: [{ id: "m1", role: "assistant", text: reply, at: 0 }, { id: "m2", role: "user", text: "what is {{this}}?", at: 0 }],
    });
    settleLessonText();
    const s = useSim.getState();
    expect(s.explanation?.reply).toMatch(/^They are neighbours\. Their capitals are [\d,]+ km apart\.$/);
    expect(s.messages[0].text).toBe(s.explanation?.reply);
    // The student's own words are never rewritten.
    expect(s.messages[1].text).toBe("what is {{this}}?");
  });
});
