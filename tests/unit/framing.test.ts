import { afterEach, describe, expect, it, vi } from "vitest";
import { MathUtils } from "three";
import { freshScene, useSim } from "@/lib/store";
import { execNow, frameSpeaker } from "@/lib/player";
import { fitDistance } from "@/components/world/camera";

afterEach(() => {
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

  it("never moves the camera on its own when a character speaks", () => {
    vi.useFakeTimers();
    useSim.setState(freshScene("park"));
    execNow({ op: "spawn_shape", id: "glucose", shape: "box", size: [0.6, 0.6, 0.6], position: [0, 1.5, 0.5], color: "#ffcc00" });
    const before = useSim.getState().camera.nonce;
    execNow({ op: "speak", speaker: "simu", text: "Here is the sugar the plant makes." });
    expect(useSim.getState().camera.nonce).toBe(before);
  });

  it("frames the speaker and its bubble when the student asks", () => {
    useSim.setState(freshScene("park"));
    const before = useSim.getState().camera.nonce;
    frameSpeaker("simu");
    const cam = useSim.getState().camera;
    expect(cam.nonce).toBe(before + 1);
    const guide = useSim.getState().characters.simu.position;
    // Feet and the top of the bubble.
    expect(cam.points).toEqual([guide, [guide[0], guide[1] + 2.4, guide[2]]]);
    frameSpeaker("nobody");
    expect(useSim.getState().camera.nonce).toBe(before + 1);
  });

  it("frames just the target of an explicit camera focus, not the guide", () => {
    useSim.setState(freshScene("bedroom"));
    execNow({ op: "focus_camera", target: "red_ball", zoom: "close" });
    const cam = useSim.getState().camera;
    const guide = useSim.getState().characters.simu.position;
    expect(cam.points?.length).toBe(4);
    expect(cam.points?.some((p) => p[0] === guide[0] && p[2] === guide[2])).toBe(false);
    expect(cam.radius).toBe(1.2);
  });
});
