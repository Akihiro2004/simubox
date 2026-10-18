"use client";

import { Suspense } from "react";
import { useSim } from "@/lib/store";
import { isGiantPlanet, type LightMood } from "@/lib/environment";
import { DistantEarth } from "./distant-earth";
import { Starfield } from "./starfield";
import { Color } from "three";
import { COURT_CRATERS, ROCKY_COURT } from "@/lib/world/court-terrain";

/** Light colours and strengths for each mood (day = the template's own). */
export const MOOD: Record<Exclude<LightMood, "day">, { sky: string; ground: string; hemi: number; ambient: number; sun: string; sunI: number; fill: number }> = {
  harsh: { sky: "#d9dde6", ground: "#3a3a3a", hemi: 0.22, ambient: 0.05, sun: "#ffffff", sunI: 3.8, fill: 0.12 },
  dusk: { sky: "#f3c49b", ground: "#8a6a55", hemi: 0.55, ambient: 0.12, sun: "#ffb27a", sunI: 2.2, fill: 0.35 },
  night: { sky: "#6d7fb8", ground: "#1f2533", hemi: 0.3, ambient: 0.08, sun: "#a9bcff", sunI: 0.9, fill: 0.2 },
  dim: { sky: "#7fc6d9", ground: "#3b5f66", hemi: 0.45, ambient: 0.1, sun: "#bfe6f0", sunI: 1.2, fill: 0.3 },
};

// Sparse, staggered craters with generous gaps, clear of the measured lanes.

/** Sky, haze, stars, Earth and craters for a restyled world. */
export function EnvironmentLayer() {
  const env = useSim((s) => s.environment);
  const world = useSim((s) => s.world);
  if (!env) return null;
  return (
    <>
      {env.sky && <color attach="background" args={[env.sky]} />}
      {env.fog && <fog attach="fog" args={[env.fog, 50, 320]} />}
      {env.stars && <Starfield />}
      {env.earth && <Suspense fallback={null}><DistantEarth /></Suspense>}
      {env.craters && env.preset !== "moon" && !isGiantPlanet(env.preset) && world === "court" && (
        <group>
          {COURT_CRATERS.map((c, i) => (
            <group key={i} position={[c.x, ROCKY_COURT.surfaceY + .005, c.z]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1, 0.35]} receiveShadow castShadow>
                <torusGeometry args={[c.r, c.r * 0.16, 8, 32]} />
                <meshStandardMaterial color={new Color(env.ground ?? "#b9b8b2").multiplyScalar(1.12)} roughness={1} />
              </mesh>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]} receiveShadow>
                <circleGeometry args={[c.r, 32]} />
                <meshStandardMaterial color={new Color(env.ground ?? "#77766f").multiplyScalar(.65)} roughness={1} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
              </mesh>
            </group>
          ))}
        </group>
      )}
    </>
  );
}
