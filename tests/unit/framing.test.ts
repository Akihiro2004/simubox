import { afterEach, describe, expect, it, vi } from "vitest";
import { MathUtils } from "three";
import { freshScene, useSim } from "@/lib/store";
import { execNow, keepInView } from "@/lib/player";
import { view } from "@/lib/world/runtime";
import { fitDistance } from "@/components/world/camera";

afterEach(() => {
  view.inView = null;
  vi.useRealTimers();
});

describe("keeping the guide and the subject on screen", () => {
  it("fits a sphere inside the part of the screen the UI leaves free", () => {
    const d = fitDistance(2, 32, 16 / 9);
    // The sphere's angular radius must be below the free part of the vertical half-FOV.
    const half = MathUtils.degToRad(16) ;
    expect(Math.asin(2 / d)).toBeLessThan(Math.atan(Math.tan(half) * 0.7) + 1e-9);
    expect(fitDistance(2, 32, 0.5)).toBeGreaterThan(d); // portrait phones need more room
  });

  it("moves the camera to the guide and the new thing only when one is off screen", () => {
    vi.useFakeTimers();
    useSim.setState(freshScene("park"));
    const asked: number[][][] = [];
    view.inView = (pts) => {
      asked.push(pts);
      return false;
    };
    execNow({ op: "spawn_shape", id: "glucose", shape: "box", size: [0.6, 0.6, 0.6], position: [0, 1.5, 0.5], color: "#ffcc00" });
    const before = useSim.getState().camera.nonce;
    execNow({ op: "speak", speaker: "simu", text: "Here is the sugar the plant makes." });
    const cam = useSim.getState().camera;
    expect(cam.nonce).toBe(before + 1);
    const guide = useSim.getState().characters.simu.position;
    // Framed points cover the guide (with its bubble) and the glucose block.
    expect(cam.points?.some((p) => p[0] === guide[0] && p[2] === guide[2])).toBe(true);
    expect(cam.points?.some((p) => Math.abs(p[0] - 0.3) < 1e-9 || Math.abs(p[0] + 0.3) < 1e-9)).toBe(true);

    // Already visible: no camera move.
    view.inView = () => true;
    const n = useSim.getState().camera.nonce;
    expect(keepInView("simu")).toBe(false);
    expect(useSim.getState().camera.nonce).toBe(n);
  });

  it("frames the guide together with an explicit camera focus", () => {
    useSim.setState(freshScene("bedroom"));
    execNow({ op: "focus_camera", target: "red_ball", zoom: "close" });
    const cam = useSim.getState().camera;
    expect(cam.points?.length).toBeGreaterThan(2);
    expect(cam.radius).toBe(1.2);
  });
});
