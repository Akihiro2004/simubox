"use client";

import { Edges } from "@react-three/drei";
import { Html } from "@/components/world/html";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Object3D, type InstancedMesh } from "three";
import { useSim } from "@/lib/store";
import { SUBSTANCES, phaseAt, rmsSpeed } from "@/lib/engine/physics2";
import { MATTER_BOX, createMd, modelTemperature, stepWithin, type Md } from "@/lib/engine/md";

// The particle box sits above the lab's display pedestal (top at y ≈ 0.8).
const TOP = 0.8;

// ---------- states of matter ----------

const BOX = 1.5;
const SCALE = BOX / MATTER_BOX.box[0];
const PARTICLE_COLOR = { water: "#4fa3d9", iron: "#9ca3af", nitrogen: "#a5b4fc", chocolate: "#8b5a3c" } as const;

export function ParticlesModule({ animate }: { animate: boolean }) {
  const p = useSim((s) => s.modules.particles);
  const mesh = useRef<InstancedMesh>(null);
  const tmp = useMemo(() => new Object3D(), []);
  // The molecular dynamics state lives outside React; temperature changes steer its thermostat.
  const sim = useRef<Md | null>(null);
  const target = p ? modelTemperature(p.temperatureC, SUBSTANCES[p.substance].melt, SUBSTANCES[p.substance].boil) : 0.3;

  useFrame((_, dt) => {
    if (!p) return;
    // Created on the first frame; afterwards temperature changes only steer the thermostat.
    sim.current ??= createMd({ ...MATTER_BOX, temperature: target, seed: 7, start: target > 0.9 ? "spread" : "lattice" });
    const m = mesh.current, md = sim.current;
    md.temperature = target;
    if (!m) return;
    // About 900 model steps per second; slow devices fall back to slow motion.
    if (animate) stepWithin(md, Math.min(24, Math.round(Math.min(dt, 0.05) * 900)));
    const half = MATTER_BOX.box[0] / 2;
    for (let i = 0; i < md.n; i++) {
      tmp.position.set((md.pos[i * 3] - half) * SCALE, (md.pos[i * 3 + 1] - half) * SCALE, (md.pos[i * 3 + 2] - half) * SCALE);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  if (!p) return null;
  const s = SUBSTANCES[p.substance];
  const phase = phaseAt(p.substance, p.temperatureC);
  return (
    <group position={[0, TOP + BOX / 2 + 0.05, 0]}>
      <mesh>
        <boxGeometry args={[BOX, BOX, BOX]} />
        <meshStandardMaterial color="#e0f2fe" transparent opacity={0.12} roughness={0.05} depthWrite={false} />
        <Edges color="#9fb3c8" />
      </mesh>
      <instancedMesh ref={mesh} args={[undefined, undefined, MATTER_BOX.n]} frustumCulled={false}>
        <sphereGeometry args={[0.5 * SCALE, 10, 8]} />
        <meshStandardMaterial color={PARTICLE_COLOR[p.substance]} roughness={0.35} />
      </instancedMesh>
      <Html position={[0, BOX / 2 + 0.45, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <div className="tag flex flex-col items-center rounded-[16px] px-3.5 py-1.5 leading-tight">
          <span className="text-[15px] font-extrabold">
            {s.name} at {Math.round(p.temperatureC)} °C: {phase}
          </span>
          <span className="text-[12px] font-semibold text-ink-3">
            {phase === "gas" ? `Real particles fly at about ${Math.round(rmsSpeed(p.substance, p.temperatureC))} m/s` : phase === "liquid" ? "Particles slide past each other" : "Particles vibrate in place"}
          </span>
          <span className="text-[11px] font-semibold text-ink-3">Live simulation: {MATTER_BOX.n} particles pulled together by real intermolecular forces</span>
        </div>
      </Html>
    </group>
  );
}
