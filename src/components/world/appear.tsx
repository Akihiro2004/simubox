"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";

/**
 * Grows its children in from nothing on a real damped spring (when `on`), so
 * things land with a soft overshoot and settle instead of easing on a curve.
 * `ms` is roughly how long it takes to settle.
 */
export function Appear({ on, ms = 500, children }: { on: boolean; ms?: number; children: React.ReactNode }) {
  const g = useRef<Group>(null);
  const s = useRef({ x: on ? 0 : 1, v: 0, done: !on });
  useFrame((_, delta) => {
    const st = s.current;
    if (st.done || !g.current) return;
    // Stiffness from the settle time; damping ratio 0.62 gives a ~8% overshoot.
    const w = 7.5 / (ms / 1000);
    const k = w * w;
    const c = 2 * 0.62 * w;
    // Fixed small steps keep the spring stable on slow frames.
    let left = Math.min(delta, 0.1);
    while (left > 0) {
      const dt = Math.min(left, 1 / 120);
      st.v += (-k * (st.x - 1) - c * st.v) * dt;
      st.x += st.v * dt;
      left -= dt;
    }
    if (Math.abs(st.x - 1) < 0.0005 && Math.abs(st.v) < 0.005) {
      st.x = 1;
      st.done = true;
    }
    g.current.scale.setScalar(Math.max(0.001, st.x));
  });
  return (
    <group ref={g} scale={on ? 0.001 : 1}>
      {children}
    </group>
  );
}
