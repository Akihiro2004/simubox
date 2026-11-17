import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import { freshScene, useSim } from "@/lib/store";
import { cancelPlayback, execNow, resetDirector, runPlan } from "@/lib/player";
import { pickFixture } from "@/lib/ai/fixtures";
import { view } from "@/lib/world/runtime";
import { beatPoints, measureFraming, needsShot, SHOT, shotRadius } from "@/lib/world/camera-framing";
import { glideTime, shotDirection } from "@/components/world/camera";

const box = (id: string, x: number) => ({ op: "spawn_shape" as const, id, shape: "box" as const, size: [0.6, 0.6, 0.6] as [number, number, number], position: [x, 1.2, 0] as [number, number, number], color: "#ffcc00" });

describe("shot maths", () => {
  it("leaves a well framed subject alone (the dead zone)", () => {
    expect(needsShot(measureFraming([[-0.3, -0.3, 0.5], [0.3, 0.4, 0.5]]))).toBe(false);
  });

  it("moves for subjects that are off screen, under the UI, tiny or overflowing", () => {
    expect(needsShot(measureFraming([[0.9, 0, 0.5]]))).toBe(true); // under the right rail
    expect(needsShot(measureFraming([[0, -0.9, 0.5]]))).toBe(true); // behind the composer
    expect(needsShot(measureFraming([[0, 0, 1.2]]))).toBe(true); // behind the camera
    expect(needsShot(measureFraming([[0, 0, 0.5], [0.05, 0.05, 0.5]]))).toBe(true); // a speck
    expect(needsShot(measureFraming([[-0.44, -0.59, 0.5], [0.61, 0.79, 0.5]]))).toBe(true); // edge to edge
  });

  it("frames at the target fill, never nose-close", () => {
    expect(shotRadius([[0, 0, 0], [2, 0, 0]])).toBeCloseTo(1 / SHOT.targetFill);
    expect(shotRadius([[0, 0, 0]])).toBe(SHOT.minRadius);
  });

  it("keeps the previous beat in shot only when it is close by", () => {
    const now: [number, number, number][] = [[1, 1, 0]];
    expect(beatPoints([[0, 1, 0]], now)).toHaveLength(2);
    expect(beatPoints([[30, 1, 0]], now)).toEqual(now);
    expect(beatPoints([], now)).toEqual(now);
  });

  it("keeps the student's orbit direction and only tilts into the pleasant band", () => {
    const flat = shotDirection(new Vector3(1, 0.02, 1)); // nearly edge-on
    expect(flat.x).toBeCloseTo(flat.z); // same azimuth
    expect(Math.acos(flat.y)).toBeCloseTo(1.1);
    const top = shotDirection(new Vector3(0.001, 1, 0.001)); // straight down
    expect(Math.acos(top.y)).toBeCloseTo(0.52);
    const fine = new Vector3(1, 1.2, 1).normalize();
    expect(shotDirection(fine).distanceTo(fine)).toBeLessThan(1e-9);
  });

  it("glides longer for longer trips, within limits", () => {
    expect(glideTime(0)).toBe(0.45);
    expect(glideTime(6)).toBeGreaterThan(glideTime(2));
    expect(glideTime(500)).toBe(0.9);
  });
});

describe("who moves the camera", () => {
  beforeEach(() => useSim.setState({ ...freshScene("bedroom"), aiStatus: "playing", cameraFollow: true, pendingShot: null }));
  afterEach(() => useSim.setState({ aiStatus: "idle" }));

  it("lets the lesson steer until the student takes the camera", () => {
    const n = useSim.getState().camera.nonce;
    useSim.getState().focus({ target: [1, 1, 1] });
    expect(useSim.getState().camera.nonce).toBe(n + 1);

    useSim.getState().takeCamera();
    useSim.getState().focus({ target: [2, 2, 2] });
    expect(useSim.getState().camera.nonce).toBe(n + 1); // held back
    expect(useSim.getState().pendingShot).toEqual({ target: [2, 2, 2] });

    useSim.getState().followLesson();
    const s = useSim.getState();
    expect(s.cameraFollow).toBe(true);
    expect(s.pendingShot).toBeNull();
    expect(s.camera).toMatchObject({ target: [2, 2, 2], nonce: n + 2 });
  });

  it("always honours the student's own view buttons, and they take the camera", () => {
    const n = useSim.getState().camera.nonce;
    useSim.getState().focus({ preset: "top", by: "user" });
    expect(useSim.getState().camera.nonce).toBe(n + 1);
    expect(useSim.getState().cameraFollow).toBe(false);
    useSim.getState().focus({ preset: "home", by: "user" });
    expect(useSim.getState().camera.nonce).toBe(n + 2);
  });

  it("hands the camera back to every new lesson", () => {
    useSim.getState().takeCamera();
    useSim.getState().focus({ target: [2, 2, 2] });
    expect(useSim.getState().cameraFollow).toBe(false);
    const plan = pickFixture("Show me a water molecule");
    expect(plan).not.toBeNull();
    void runPlan(plan!, "offline-demo");
    expect(useSim.getState()).toMatchObject({ cameraFollow: true, pendingShot: null });
    cancelPlayback();
  });

  it("ignores camera grabs outside a lesson", () => {
    useSim.setState({ aiStatus: "idle" });
    useSim.getState().takeCamera();
    expect(useSim.getState().cameraFollow).toBe(true);
  });
});

describe("the lesson director", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetDirector();
    useSim.setState({ ...freshScene("park"), aiStatus: "playing", cameraFollow: true, pendingShot: null });
  });
  afterEach(() => {
    view.framing = null;
    useSim.setState({ aiStatus: "idle" });
    vi.useRealTimers();
  });

  it("frames things spawned together in one shot", () => {
    const n = useSim.getState().camera.nonce;
    execNow(box("a", 0));
    execNow(box("b", 1));
    vi.advanceTimersByTime(200);
    const cam = useSim.getState().camera;
    expect(cam.nonce).toBe(n + 1);
    expect(cam.points?.some((p) => p[0] < 0)).toBe(true); // a's corners
    expect(cam.points?.some((p) => p[0] > 1)).toBe(true); // b's corners
    expect(cam.radius).toBeGreaterThanOrEqual(SHOT.minRadius);
  });

  it("stays put when the subject is already well framed", () => {
    view.framing = () => ({ inside: true, fill: 0.5 });
    const n = useSim.getState().camera.nonce;
    execNow(box("a", 0));
    vi.advanceTimersByTime(200);
    expect(useSim.getState().camera.nonce).toBe(n);
  });

  it("holds each shot before the next one", () => {
    execNow(box("a", 0));
    vi.advanceTimersByTime(200);
    const n = useSim.getState().camera.nonce;
    execNow(box("b", 6));
    vi.advanceTimersByTime(300);
    expect(useSim.getState().camera.nonce).toBe(n); // still holding
    vi.advanceTimersByTime(SHOT.holdMs);
    expect(useSim.getState().camera.nonce).toBe(n + 1);
  });

  it("leaves a beat alone when it was already framed on purpose", () => {
    execNow(box("a", 0));
    execNow({ op: "focus_camera", target: "a", zoom: "close" });
    const n = useSim.getState().camera.nonce;
    vi.advanceTimersByTime(200);
    expect(useSim.getState().camera.nonce).toBe(n);
  });

  it("holds its shot back while the student has the camera", () => {
    useSim.getState().takeCamera();
    const n = useSim.getState().camera.nonce;
    execNow(box("a", 0));
    vi.advanceTimersByTime(200);
    expect(useSim.getState().camera.nonce).toBe(n);
    expect(useSim.getState().pendingShot?.points?.length).toBeGreaterThan(0);
  });

  it("does nothing when no lesson is playing", () => {
    useSim.setState({ aiStatus: "idle" });
    const n = useSim.getState().camera.nonce;
    execNow(box("a", 0));
    vi.advanceTimersByTime(200);
    expect(useSim.getState().camera.nonce).toBe(n);
  });
});
