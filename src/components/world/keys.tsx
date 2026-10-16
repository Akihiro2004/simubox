"use client";

// Keyboard camera: W/A/S/D or arrow keys glide across the world relative to
// the current view, Q/E turn, Shift goes faster. Ignored while typing.

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Vector3 } from "three";
import { controlsRef } from "./camera";

const MOVE: Record<string, [number, number]> = {
  w: [0, 1],
  arrowup: [0, 1],
  s: [0, -1],
  arrowdown: [0, -1],
  a: [-1, 0],
  arrowleft: [-1, 0],
  d: [1, 0],
  arrowright: [1, 0],
};
const TURN: Record<string, number> = { q: 1, e: -1 };

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && Boolean(t.closest("input, textarea, select, [contenteditable='true']"));

export function KeyboardNavigator() {
  const held = useRef(new Set<string>());
  const shift = useRef(false);
  const gl = useThree((s) => s.gl);
  const tmp = useRef({ fwd: new Vector3(), right: new Vector3(), target: new Vector3() });

  useEffect(() => {
    const keys = held.current;
    const down = (e: KeyboardEvent) => {
      shift.current = e.shiftKey;
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (k in MOVE || k in TURN) {
        keys.add(k);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      shift.current = e.shiftKey;
      keys.delete(e.key.toLowerCase());
    };
    const clear = () => keys.clear();
    // Clicking the world takes focus away from the text box so keys steer the camera.
    const focusWorld = () => {
      const a = document.activeElement;
      if (isTyping(a)) (a as HTMLElement).blur();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    gl.domElement.addEventListener("pointerdown", focusWorld);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      gl.domElement.removeEventListener("pointerdown", focusWorld);
    };
  }, [gl]);

  useFrame(({ camera }, dt) => {
    const c = controlsRef.current;
    const keys = held.current;
    if (!c || !c.enabled || !keys.size) return;
    const step = Math.min(dt, 0.05);
    let mx = 0, mz = 0, turn = 0;
    for (const k of keys) {
      if (MOVE[k]) {
        mx += MOVE[k][0];
        mz += MOVE[k][1];
      }
      turn += TURN[k] ?? 0;
    }
    const { fwd, right, target } = tmp.current;
    if (mx || mz) {
      camera.getWorldDirection(fwd).setY(0).normalize();
      right.crossVectors(fwd, camera.up).normalize();
      // Speed scales with zoom so it feels the same close up and far away.
      const speed = Math.max(1.5, c.distance * 0.55) * (shift.current ? 2.2 : 1);
      const len = Math.hypot(mx, mz);
      c.getTarget(target);
      target.addScaledVector(fwd, (mz / len) * speed * step).addScaledVector(right, (mx / len) * speed * step);
      void c.moveTo(target.x, target.y, target.z, false);
    }
    if (turn) void c.rotate(turn * 1.6 * step, 0, false);
  });

  return null;
}
