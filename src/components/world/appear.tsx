"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";

const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

/** Grows its children in from nothing with a small overshoot (when `on`). */
export function Appear({ on, ms = 500, children }: { on: boolean; ms?: number; children: React.ReactNode }) {
  const g = useRef<Group>(null);
  const t = useRef(on ? 0 : 1);
  useFrame((_, dt) => {
    if (t.current >= 1 || !g.current) return;
    t.current = Math.min(1, t.current + Math.min(dt, 0.05) / (ms / 1000));
    g.current.scale.setScalar(Math.max(0.001, easeOutBack(t.current)));
  });
  return (
    <group ref={g} scale={on ? 0.001 : 1}>
      {children}
    </group>
  );
}
