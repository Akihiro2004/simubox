import { describe, expect, it } from "vitest";
import { chooseTeaching, teachingPlanIssue } from "@/lib/ai/teaching";
import { normalizePlan, validatePlan } from "@/lib/ssp/validate";
import { createStepStreamer } from "@/lib/ssp/stream";
import { freshScene, snapshot, useSim } from "@/lib/store";

const request = (prompt: string) => ({ prompt, scene: snapshot({ ...useSim.getState(), ...freshScene("bedroom") }), history: [] });
describe("teaching decisions", () => {
  it.each([
    ["What happens if there is no gravity?", "bedroom"], ["Make gravity 10x stronger", "bedroom"], ["Bagaimana kalau gravitasi hilang?", "bedroom"],
    ["Explain Newton's second law and acceleration", "mechanics"], ["Show conservation of momentum", "mechanics"], ["Mengapa gaya mengubah percepatan?", "mechanics"],
    ["How are ocean waves created and how does wind affect them?", "workshop"], ["Bagaimana angin membuat ombak laut?", "workshop"],
    ["Show diffraction through a narrow gap", "workshop"], ["Explain fractions 1/2 plus 1/3", "math_studio"], ["Solve 2x + 3 = 7", "math_studio"],
    ["What is 2 + 2?", "math_studio"], ["Show the sine of a 30 degree angle", "math_studio"],
    ["Why does a lens bend light at an angle?", "optics"], ["Throw a ball at 40 degrees", "court"], ["Why is Wi-Fi weaker through a wall?", "stage"],
    ["Show series and parallel circuits", "workshop"], ["Why does ice float?", "ocean"],
    ["What does gravity mean?", "bedroom"], ["Measure the net force on a cart", "mechanics"],
    ["Draw all eight planets", "space"], ["Draw Mercury", "space"], ["Show Venus", "space"], ["Draw Earth", "space"],
    ["Draw Mars", "space"], ["Show Jupiter", "space"], ["Draw Saturn", "space"], ["Show Uranus", "space"], ["Draw Neptune", "space"],
    ["How do water waves reflect off a wall?", "workshop"], ["Explain the current gravity setting", "bedroom"],
  ])("%s → %s", (prompt, world) => { expect(chooseTeaching(request(prompt)).world).toBe(world); });
  it("honours explicit illustration requests and preserves parameter follow-ups", () => {
    expect(chooseTeaching(request("Explain momentum on the blank stage")).enforce).toBe(false);
    const req = request("Now make gravity 10x stronger");
    req.scene = snapshot({ ...useSim.getState(), ...freshScene("mechanics") });
    const choice = chooseTeaching({ ...req, history: [{ role: "user", text: "Show a ramp" }] });
    expect(choice.world).toBe("mechanics"); expect(choice.active).toBe(true);
    req.scene = snapshot({ ...useSim.getState(), ...freshScene("court") });
    expect(chooseTeaching({ ...req, prompt: "Change the angle to 60 degrees.", history: [{ role: "user", text: "Throw a ball" }] }).world).toBe("court");
  });
  it("recommends specific instruments and requires a wind driver when wind is the subject", () => {
    expect(chooseTeaching(request("Show conservation of momentum")).instrument).toBe("collision");
    expect(chooseTeaching(request("Solve a quadratic equation")).instrument).toBe("quadratic");
    expect(chooseTeaching(request("How does wind make waves?")).wind).toBe(true);
    const raw = normalizePlan({ title: "Wind", reply: "Waves", capability: "waves", steps: [{ title: "Tank", commands: [{ op: "show_ripple_tank" }] }] }, "en");
    const r = validatePlan(raw, request("Wind waves").scene);
    expect(r.ok && teachingPlanIssue(r.plan, chooseTeaching(request("Wind waves")))).toContain("windSpeedMps");
  });
  it("holds a wrong-stage streamed answer for repair before any lesson steps play", () => {
    const req = request("How does wind make ocean waves?");
    const choice = chooseTeaching(req);
    const bad = normalizePlan({ title: "Waves", reply: "Wind transfers energy", capability: "waves", steps: [{ title: "Diagram", commands: [{ op: "load_world", world: "stage" }, { op: "speak", speaker: "simu", text: "Waves move." }] }] }, "en");
    const r = validatePlan(bad, req.scene);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(teachingPlanIssue(r.plan, choice)).toContain("show_ripple_tank");
      const stream = createStepStreamer(req.scene, "en", plan => teachingPlanIssue(plan, choice) === null);
      expect(stream.feed(JSON.stringify(r.plan))).toEqual([]); expect(stream.count).toBe(0);
    }
    const good = validatePlan(normalizePlan({ title: "Waves", reply: "Wind transfers energy", capability: "waves", steps: [{ title: "Wave tank", commands: [{ op: "show_ripple_tank", windSpeedMps: 8 }] }] }, "en"), req.scene);
    expect(good.ok && teachingPlanIssue(good.plan, choice)).toBeNull();
  });
});
