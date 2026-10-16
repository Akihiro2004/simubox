"use client";

import { Edges, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Object3D, type Group, type InstancedMesh } from "three";
import { useSim } from "@/lib/store";
import { SUBSTANCES, agitation, phaseAt, rmsSpeed } from "@/lib/engine/physics2";
import { CELL_PARTS, CELL_SUMMARY, ORGANELLES, type OrganelleId } from "@/lib/engine/biology";
import { Mat } from "../assets";

// Both models sit above the lab's display pedestal (top at y ≈ 0.8).
const TOP = 0.8;

// ---------- states of matter ----------

const N = 64;
const BOX = 1.5;
const PARTICLE_COLOR = { water: "#4fa3d9", iron: "#9ca3af", nitrogen: "#a5b4fc", chocolate: "#8b5a3c" } as const;

export function ParticlesModule({ animate }: { animate: boolean }) {
  const p = useSim((s) => s.modules.particles);
  const mesh = useRef<InstancedMesh>(null);
  // Per-particle state lives in refs: positions, velocities, lattice homes.
  const sim = useMemo(() => {
    const home = Array.from({ length: N }, (_, i) => [((i % 4) - 1.5) * 0.3, (Math.floor(i / 16) - 1.5) * 0.3, ((Math.floor(i / 4) % 4) - 1.5) * 0.3] as [number, number, number]);
    return { pos: home.map((h) => [...h] as [number, number, number]), vel: home.map((_, i) => [Math.sin(i * 12.9898) % 0.5, Math.sin(i * 78.233) % 0.5, Math.sin(i * 37.719) % 0.5] as [number, number, number]), home, tmp: new Object3D() };
  }, []);

  useFrame(({ clock }, dt) => {
    const m = mesh.current;
    if (!m || !p) return;
    const phase = phaseAt(p.substance, p.temperatureC);
    const a = agitation(p.temperatureC);
    const step = animate ? Math.min(dt, 0.033) : 0;
    const half = BOX / 2 - 0.08;
    sim.pos.forEach((q, i) => {
      const v = sim.vel[i];
      if (phase === "solid") {
        // Vibrate around a fixed lattice spot; hotter = bigger jiggle.
        const t = clock.elapsedTime * 12 + i;
        const amp = 0.012 * a;
        q[0] = sim.home[i][0] + Math.sin(t) * amp;
        q[1] = sim.home[i][1] + Math.cos(t * 1.3) * amp;
        q[2] = sim.home[i][2] + Math.sin(t * 0.7) * amp;
      } else {
        const speed = (phase === "gas" ? 1.6 : 0.35) * a;
        for (let k = 0; k < 3; k++) {
          v[k] += (Math.random() - 0.5) * (phase === "gas" ? 0.2 : 1.2) * step * 10;
          const len = Math.hypot(v[0], v[1], v[2]) || 1;
          q[k] += (v[k] / len) * speed * step;
        }
        // Liquids pool in the bottom of the box; gases fill all of it.
        const floor = -half, ceil = phase === "liquid" ? -half + 0.75 : half;
        if (phase === "liquid") v[1] -= 3 * step;
        for (let k = 0; k < 3; k++) {
          const lo = k === 1 ? floor : -half, hi = k === 1 ? ceil : half;
          if (q[k] < lo) {
            q[k] = lo;
            v[k] = Math.abs(v[k]);
          }
          if (q[k] > hi) {
            q[k] = hi;
            v[k] = -Math.abs(v[k]);
          }
        }
      }
      sim.tmp.position.set(q[0], q[1], q[2]);
      sim.tmp.updateMatrix();
      m.setMatrixAt(i, sim.tmp.matrix);
    });
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
      <instancedMesh ref={mesh} args={[undefined, undefined, N]} frustumCulled={false}>
        <sphereGeometry args={[0.07, 14, 10]} />
        <meshStandardMaterial color={PARTICLE_COLOR[p.substance]} roughness={0.35} />
      </instancedMesh>
      <Html position={[0, BOX / 2 + 0.45, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <div className="tag flex flex-col items-center rounded-[16px] px-3.5 py-1.5 leading-tight">
          <span className="text-[15px] font-extrabold">
            {s.name} at {Math.round(p.temperatureC)} °C: {phase}
          </span>
          <span className="text-[12px] font-semibold text-ink-3">
            {phase === "gas" ? `Particles fly at about ${Math.round(rmsSpeed(p.substance, p.temperatureC))} m/s` : phase === "liquid" ? "Particles slide past each other" : "Particles vibrate in place"}
          </span>
          <span className="text-[11px] font-semibold text-ink-3">Simplified particle model</span>
        </div>
      </Html>
    </group>
  );
}

// ---------- cells ----------

const LAYOUT: Record<OrganelleId, { at: [number, number, number]; count?: number }> = {
  membrane: { at: [0, 0, 0] },
  wall: { at: [0, 0, 0] },
  cytoplasm: { at: [0, 0, 0] },
  capsule: { at: [0, 0, 0] },
  nucleus: { at: [0.15, 0.1, 0] },
  nucleoid: { at: [0, 0, 0] },
  mitochondria: { at: [-0.75, -0.35, 0.3], count: 3 },
  chloroplasts: { at: [0.75, -0.45, -0.2], count: 4 },
  ribosomes: { at: [0, 0, 0], count: 30 },
  er: { at: [0.75, 0.35, 0.1] },
  golgi: { at: [-0.6, 0.55, -0.1] },
  vacuole: { at: [-0.2, -0.4, -0.4] },
  flagellum: { at: [-1.3, 0, 0] },
};

function Organelle({ id, kind, lit }: { id: OrganelleId; kind: string; lit: boolean }) {
  const o = ORGANELLES[id];
  const L = LAYOUT[id];
  const e = lit ? o.color : undefined;
  const ei = lit ? 0.6 : 0;
  switch (id) {
    case "membrane":
      return kind === "bacteria" ? null : (
        <mesh scale={kind === "plant" ? [1.42, 1.02, 0.92] : [1.4, 1.05, 1]}>
          {kind === "plant" ? <boxGeometry args={[1.45, 1.45, 1.45, 8, 8, 8]} /> : <sphereGeometry args={[1, 48, 32]} />}
          <meshStandardMaterial color={o.color} transparent opacity={0.22} roughness={0.2} depthWrite={false} emissive={e ?? "#000000"} emissiveIntensity={ei} />
        </mesh>
      );
    case "wall":
      return kind === "bacteria" ? (
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.45, 1.2, 10, 24]} />
          <meshStandardMaterial color={o.color} transparent opacity={0.3} depthWrite={false} emissive={e ?? "#000000"} emissiveIntensity={ei} />
        </mesh>
      ) : (
        <mesh scale={[1.48, 1.08, 0.98]}>
          <boxGeometry args={[1.5, 1.5, 1.5]} />
          <meshStandardMaterial color={o.color} transparent opacity={0.25} wireframe={false} depthWrite={false} emissive={e ?? "#000000"} emissiveIntensity={ei} />
        </mesh>
      );
    case "capsule":
      return (
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.55, 1.3, 10, 24]} />
          <meshStandardMaterial color={o.color} transparent opacity={0.16} depthWrite={false} emissive={e ?? "#000000"} emissiveIntensity={ei} />
        </mesh>
      );
    case "cytoplasm":
      return null;
    case "nucleus":
      return (
        <group position={L.at}>
          <mesh>
            <sphereGeometry args={[0.38, 32, 24]} />
            <Mat c={o.color} o={0.9} e={e} ei={ei} />
          </mesh>
          <mesh position={[0.08, 0.05, 0.1]}>
            <sphereGeometry args={[0.12, 20, 14]} />
            <Mat c="#5b4bb5" />
          </mesh>
        </group>
      );
    case "nucleoid":
      return (
        <mesh rotation={[0.4, 0.2, 0]}>
          <torusKnotGeometry args={[0.22, 0.03, 80, 8, 3, 5]} />
          <Mat c={o.color} e={e} ei={ei} />
        </mesh>
      );
    case "mitochondria":
    case "chloroplasts":
      return (
        <>
          {Array.from({ length: L.count ?? 1 }, (_, i) => (
            <mesh key={i} position={[L.at[0] + (i % 2) * 0.28 - (id === "chloroplasts" ? i * 0.12 : 0), L.at[1] + i * 0.24, L.at[2] - i * 0.12]} rotation={[0.3 * i, 0.8 * i, 0.5]} scale={[1, 0.55, 0.55]}>
              <capsuleGeometry args={[0.1, 0.18, 6, 14]} />
              <Mat c={o.color} e={e} ei={ei} />
            </mesh>
          ))}
        </>
      );
    case "ribosomes":
      return (
        <>
          {Array.from({ length: kind === "bacteria" ? 14 : L.count ?? 20 }, (_, i) => {
            const a = i * 2.4, r = 0.45 + (i % 5) * 0.12;
            return (
              <mesh key={i} position={[Math.cos(a) * r * (kind === "bacteria" ? 1.3 : 1), Math.sin(a * 1.3) * 0.55 * (kind === "bacteria" ? 0.5 : 1), Math.sin(a) * 0.4]}>
                <sphereGeometry args={[0.025, 8, 6]} />
                <Mat c={o.color} e={e} ei={ei} />
              </mesh>
            );
          })}
        </>
      );
    case "er":
      return (
        <group position={L.at}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[0, i * 0.09 - 0.09, 0]} rotation={[Math.PI / 2, 0, 0.3]}>
              <torusGeometry args={[0.2 + i * 0.05, 0.025, 8, 32, Math.PI * 1.3]} />
              <Mat c={o.color} e={e} ei={ei} />
            </mesh>
          ))}
        </group>
      );
    case "golgi":
      return (
        <group position={L.at}>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[0, i * 0.07, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1 - i * 0.12, 1, 1]}>
              <torusGeometry args={[0.18, 0.025, 6, 24, Math.PI]} />
              <Mat c={o.color} e={e} ei={ei} />
            </mesh>
          ))}
        </group>
      );
    case "vacuole":
      return (
        <mesh position={kind === "plant" ? [-0.25, -0.1, -0.15] : L.at} scale={kind === "plant" ? [1.6, 1.2, 1] : [0.6, 0.6, 0.6]}>
          <sphereGeometry args={[0.3, 24, 18]} />
          <meshStandardMaterial color={o.color} transparent opacity={0.6} depthWrite={false} emissive={e ?? "#000000"} emissiveIntensity={ei} />
        </mesh>
      );
    case "flagellum":
      return (
        <mesh position={L.at} rotation={[0, 0, Math.PI / 2]}>
          <torusKnotGeometry args={[0.2, 0.02, 60, 6, 1, 4]} />
          <Mat c={o.color} e={e} ei={ei} />
        </mesh>
      );
  }
}

const LABEL_AT: Partial<Record<OrganelleId, [number, number, number]>> = {
  membrane: [-1.25, 0.75, 0.2],
  wall: [1.2, 0.85, 0.4],
  nucleus: [0.4, 0.55, 0.2],
  mitochondria: [-0.95, -0.7, 0.4],
  chloroplasts: [0.95, -0.85, 0],
  er: [1.05, 0.45, 0.2],
  golgi: [-0.75, 0.85, 0],
  vacuole: [-0.25, -0.75, -0.3],
  ribosomes: [0.3, -0.25, 0.6],
  nucleoid: [0, 0.35, 0.2],
  flagellum: [-1.5, 0.3, 0],
  capsule: [0.9, 0.55, 0.3],
};

export function CellModule({ animate }: { animate: boolean }) {
  const c = useSim((s) => s.modules.cell);
  const spin = useRef<Group>(null);
  useFrame((_, dt) => {
    if (animate && spin.current) spin.current.rotation.y += dt * 0.15;
  });
  if (!c) return null;
  const parts = CELL_PARTS[c.kind];
  return (
    <group position={[0, TOP + 1.3, 0]}>
      <group ref={spin} scale={c.kind === "bacteria" ? 0.9 : 1}>
        {parts.map((id) => (
          <Organelle key={id} id={id} kind={c.kind} lit={c.highlight === id} />
        ))}
      </group>
      {parts
        .filter((id) => LABEL_AT[id])
        .map((id) => (
          <Html key={id} position={LABEL_AT[id]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
            <div className={`tag tag-dot flex items-center gap-1.5 px-2.5 py-0.5 text-[12px] ${c.highlight === id ? "tag-fact" : ""}`} style={{ ["--dot" as string]: ORGANELLES[id].color }}>
              {ORGANELLES[id].name}
            </div>
          </Html>
        ))}
      <Html position={[0, -1.35, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <div className="tag flex max-w-[300px] flex-col items-center rounded-[16px] px-3.5 py-1.5 text-center leading-tight !whitespace-normal">
          <span className="text-[15px] font-extrabold capitalize">{c.kind} cell</span>
          <span className="text-[12px] font-semibold text-ink-3">{CELL_SUMMARY[c.kind]}</span>
          <span className="text-[11px] font-semibold text-ink-3">Simplified model, not to scale</span>
        </div>
      </Html>
    </group>
  );
}
