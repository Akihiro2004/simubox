import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "@/lib/ssp/schema";
import { normalizePlan, validatePlan } from "@/lib/ssp/validate";
import { createStepStreamer } from "@/lib/ssp/stream";
import { freshScene, projectileResult, snapshot, useSim } from "@/lib/store";
import { execNow, resolvePlaceholder } from "@/lib/player";
import { positionAt, solveProjectile } from "@/lib/engine/projectile";

beforeEach(() => { vi.useFakeTimers(); useSim.setState(freshScene("court")); });
afterEach(() => vi.useRealTimers());

const plan = (commands: unknown[]) => normalizePlan({ schemaVersion: 1, scope: "in_scope", language: "en", title: "Ten times Earth", subject: "physics", supportLevel: "simulated", capability: "projectile", reply: "Gravity is {{gravity}}.", steps: [{ title: "Compare", commands }], assumptions: [], limitations: [], followUps: [] }, "en");

describe("gravity command consistency", () => {
  it("accepts 10x Earth through every AI gravity command and the streamed validator", () => {
    for (const command of [{ op: "set_gravity", gravity: [0, -98.1, 0] }, { op: "launch_projectile", speed: 10, unit: "m/s", angleDeg: 45, gravity: 98.1 }, { op: "set_parameter", name: "gravity", value: 98.1 }]) {
      expect(Command.safeParse(command).success).toBe(true);
      const raw = plan([command]);
      const result = validatePlan(raw, snapshot(useSim.getState()));
      expect(result.ok && result.issues).toEqual([]);
      const events = createStepStreamer(snapshot(useSim.getState()), "en").feed(JSON.stringify(raw));
      expect(events.find((event) => event.type === "plan_step")?.step.commands).toContainEqual(command);
    }
  });

  it("set_gravity updates the court trajectory, room physics and displayed measurement together", () => {
    execNow({ op: "set_gravity", gravity: [0, -98.1, 0] });
    expect(useSim.getState().gravity).toEqual([0, -98.1, 0]);
    expect(useSim.getState().projectile!.gravity).toBe(98.1);
    expect(resolvePlaceholder("gravity")).toBe("98.10 m/s²");
    expect(projectileResult(useSim.getState().projectile)).not.toBeNull();
  });

  it("scalar gravity is never silently reduced and unrelated court parameters do not change it", () => {
    execNow({ op: "set_parameter", name: "gravity", value: 98.1 });
    expect(useSim.getState().projectile!.gravity).toBe(98.1);
    expect(useSim.getState().gravity[1]).toBe(-98.1);
    execNow({ op: "set_parameter", name: "time_speed", value: 2 });
    expect(useSim.getState().projectile!.gravity).toBe(98.1);
  });

  it("subsequent launches and UI edits keep the active gravity rather than resetting to Earth", () => {
    useSim.getState().setProjectile({ gravity: 98.1 });
    expect(useSim.getState().gravity[1]).toBe(-98.1);
    execNow({ op: "launch_projectile", speed: 10, unit: "m/s", angleDeg: 45 });
    expect(useSim.getState().projectile!.gravity).toBe(98.1);
  });

  it("tenfold gravity gives one tenth the range, flight time and rise for a ground launch", () => {
    const input = { speed: 10, angleDeg: 45, gravity: 9.81 };
    const earth = solveProjectile(input);
    const heavy = solveProjectile({ ...input, gravity: 98.1 });
    expect(heavy.range).toBeCloseTo(earth.range / 10, 10);
    expect(heavy.flightTime).toBeCloseTo(earth.flightTime / 10, 10);
    expect(heavy.maxHeight).toBeCloseTo(earth.maxHeight / 10, 10);
    expect(positionAt({ ...input, gravity: 98.1 }, heavy, heavy.flightTime)[1]).toBeCloseTo(0, 10);
  });

  it("rejects out-of-range scalar gravity instead of accepting a misleading clamped lesson", () => {
    const result = validatePlan(plan([{ op: "set_parameter", name: "gravity", value: 2000 }]), snapshot(useSim.getState()));
    expect(result.ok && result.issues.some((issue) => issue.message.includes("gravity"))).toBe(true);
  });

  it("applies tenfold gravity in the rigid-body room and reports arbitrary vector strength correctly", () => {
    useSim.setState(freshScene("bedroom"));
    execNow({ op: "set_parameter", name: "gravity", value: 98.1 });
    expect(useSim.getState().gravity).toEqual([0, -98.1, 0]);
    expect(resolvePlaceholder("gravity")).toBe("98.10 m/s²");
    execNow({ op: "set_gravity", gravity: [58.86, -78.48, 0] });
    expect(resolvePlaceholder("gravity")).toBe("98.10 m/s²");
  });

  it("reports unsupported projectile gravity directions rather than pretending the path changed", () => {
    const result = validatePlan(plan([{ op: "set_gravity", gravity: [98.1, 0, 0] }]), snapshot(useSim.getState()));
    expect(result.ok && result.issues.some((issue) => issue.message.includes("downward gravity"))).toBe(true);
  });

  it("preserves the experiment's gravity when a launch moves from the room to the court", async () => {
    useSim.setState(freshScene("bedroom"));
    execNow({ op: "set_gravity", gravity: [0, -98.1, 0] });
    const validated = validatePlan(plan([{ op: "launch_projectile", speed: 10, unit: "m/s", angleDeg: 45 }]), snapshot(useSim.getState()));
    expect(validated.ok && validated.issues).toEqual([]);
    if (!validated.ok) return;
    expect(validated.plan.steps[0].commands).toContainEqual({ op: "launch_projectile", speed: 10, unit: "m/s", angleDeg: 45, gravity: 98.1 });
    for (const command of validated.plan.steps[0].commands) execNow(command);
    await vi.advanceTimersByTimeAsync(500);
    expect(useSim.getState().world).toBe("court");
    expect(useSim.getState().projectile!.gravity).toBe(98.1);
  });

  it("a requested launch resumes a paused court instead of leaving the changed experiment frozen", () => {
    useSim.setState({ paused: true });
    execNow({ op: "launch_projectile", speed: 10, unit: "m/s", angleDeg: 45, gravity: 98.1 });
    expect(useSim.getState().paused).toBe(false);
    expect(useSim.getState().projectile!.status).toBe("flying");
  });
});
