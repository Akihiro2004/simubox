"use client";

import { Stars } from "@react-three/drei";
import { useMemo } from "react";
import { useSim } from "@/lib/store";
import type { LightMood } from "@/lib/environment";
import { getEarthTexture } from "./modules/earth";

/** Light colours and strengths for each mood (day = the template's own). */
export const MOOD: Record<Exclude<LightMood, "day">, { sky: string; ground: string; hemi: number; ambient: number; sun: string; sunI: number; fill: number }> = {
  harsh: { sky: "#d9dde6", ground: "#3a3a3a", hemi: 0.22, ambient: 0.05, sun: "#ffffff", sunI: 3.8, fill: 0.12 },
  dusk: { sky: "#f3c49b", ground: "#8a6a55", hemi: 0.55, ambient: 0.12, sun: "#ffb27a", sunI: 2.2, fill: 0.35 },
  night: { sky: "#6d7fb8", ground: "#1f2533", hemi: 0.3, ambient: 0.08, sun: "#a9bcff", sunI: 0.9, fill: 0.2 },
  dim: { sky: "#7fc6d9", ground: "#3b5f66", hemi: 0.45, ambient: 0.1, sun: "#bfe6f0", sunI: 1.2, fill: 0.3 },
};

// Deterministic crater field around the court (kept off the measured lanes).
const CRATERS = Array.from({ length: 34 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12345.6789;
  const fx = a - Math.floor(a), fz = b - Math.floor(b);
  const side = i % 2 ? 1 : -1;
  return { x: -12 + fx * 80, z: side * (8.5 + fz * 22), r: 0.6 + ((fx * 7) % 1) * 2.4 };
});

function Earth() {
  const map = useMemo(() => getEarthTexture(), []);
  return (
    <mesh position={[-60, 55, -140]} rotation={[0.4, -1.2, 0]}>
      <sphereGeometry args={[9, 48, 32]} />
      <meshBasicMaterial map={map} />
    </mesh>
  );
}

/** Sky, haze, stars, Earth and craters for a restyled world. */
export function EnvironmentLayer() {
  const env = useSim((s) => s.environment);
  const world = useSim((s) => s.world);
  if (!env) return null;
  return (
    <>
      {env.sky && <color attach="background" args={[env.sky]} />}
      {env.fog && <fog attach="fog" args={[env.fog, 50, 320]} />}
      {env.stars && <Stars radius={260} depth={60} count={2500} factor={6} saturation={0} fade speed={0.3} />}
      {env.earth && <Earth />}
      {env.craters && world === "court" && (
        <group>
          {CRATERS.map((c, i) => (
            <group key={i} position={[c.x, 0, c.z]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1, 0.35]} receiveShadow castShadow>
                <torusGeometry args={[c.r, c.r * 0.16, 8, 32]} />
                <meshStandardMaterial color="#b9b8b2" roughness={1} />
              </mesh>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]} receiveShadow>
                <circleGeometry args={[c.r, 32]} />
                <meshStandardMaterial color="#77766f" roughness={1} />
              </mesh>
            </group>
          ))}
        </group>
      )}
    </>
  );
}
