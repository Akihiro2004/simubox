"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Shape, type Group } from "three";
import { useMotion } from "@/lib/useMotion";
import { useSim } from "@/lib/store";

export function AquariumLife() {
  const bubbles = useRef<Group>(null), time = useRef(0);
  const animate = useMotion();
  const star = useMemo(() => {
    const s = new Shape();
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5, r = i % 2 ? .065 : .16;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    s.closePath(); return s;
  }, []);
  useFrame((_, dt) => {
    if (animate && !useSim.getState().paused) time.current += Math.min(dt, .05);
    bubbles.current?.children.forEach((bubble, i) => {
      bubble.position.y = .15 + (time.current * .25 + i * .14) % 2.15;
      bubble.position.x = (i % 2 ? 2.55 : -2.65) + Math.sin(time.current * .9 + i) * .055;
    });
  });
  return <>
    <group ref={bubbles}>
      {Array.from({ length: 16 }, (_, i) => <mesh key={i} position={[i % 2 ? 2.55 : -2.65, .15 + i * .14 % 2.15, i % 2 ? -2.65 : -.6]} scale={.018 + i % 3 * .008}>
        <sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color="#d6edf0" transparent opacity={.3} roughness={.12} depthWrite={false} />
      </mesh>)}
    </group>
    {[[-1.4, .7], [.9, -1.2], [-2.2, 2.7], [2, -.8]].map(([x, z], i) => <mesh key={i} position={[x, .012, z]} rotation={[-Math.PI / 2, 0, i * .6]} receiveShadow>
      <shapeGeometry args={[star]} /><meshStandardMaterial color={i % 2 ? "#ce9c76" : "#c3a27f"} roughness={1} />
    </mesh>)}
    {Array.from({ length: 12 }, (_, i) => <mesh key={i} position={[-2.8 + (i % 4) * 1.6, .025, -2.9 + Math.floor(i / 4) * 2.3]} rotation={[0, i * .7, 0]} scale={[.12, .055, .1]} receiveShadow>
      <sphereGeometry args={[1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={i % 2 ? "#d5cbb1" : "#e4d6b9"} roughness={.9} />
    </mesh>)}
  </>;
}
