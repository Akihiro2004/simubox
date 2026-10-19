"use client";

import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Color, Object3D, type InstancedMesh, type Mesh } from "three";
import { Html } from "@/components/world/html";
import { useSim } from "@/lib/store";
import { labGauge } from "@/lib/modules";
import { stepWithin, type Md } from "@/lib/engine/md";
import { OSMOSIS_BOX, SOLUTE, countLeft, createOsmosis, isotonicPosition } from "@/lib/engine/osmosis";

// A glass tank on the lab pedestal (top at y ≈ 0.8), 2 m × 1 m × 1 m.
const TOP = 0.8;
const S = 2 / OSMOSIS_BOX[0];
const [BL, BH, BD] = OSMOSIS_BOX.map((v) => v * S);
const WATER_C = new Color("#60a5fa"), SOLUTE_C = new Color("#f97316");

export function OsmosisModule({ animate }: { animate: boolean }) {
  const o = useSim((s) => s.modules.osmosis);
  const mesh = useRef<InstancedMesh>(null);
  const wall = useRef<Mesh>(null);
  const sim = useRef<Md | null>(null);
  const tmp = useMemo(() => new Object3D(), []);
  const avg = useRef(0.5);
  const last = useRef(0);
  const [read, setRead] = useState({ membrane: 0.5, left: 0, right: 0 });
  // Any change of setup starts a fresh tank.
  useEffect(() => { sim.current = null; avg.current = 0.5; }, [o]);

  useFrame(({ clock }, dt) => {
    if (!o) return;
    sim.current ??= createOsmosis(o);
    const md = sim.current;
    if (animate) stepWithin(md, Math.min(24, Math.round(Math.min(dt, 0.05) * 900)));
    const m = mesh.current;
    if (!m) return;
    for (let i = 0; i < md.n; i++) {
      tmp.position.set(md.pos[i * 3] * S - BL / 2, md.pos[i * 3 + 1] * S - BH / 2, md.pos[i * 3 + 2] * S - BD / 2);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    const x = md.membraneX / OSMOSIS_BOX[0];
    if (wall.current) wall.current.position.x = x * BL - BL / 2;
    // A slow running average: a small tank jiggles, so read where it settles.
    avg.current += (x - avg.current) * Math.min(1, dt * 0.4);
    if (clock.elapsedTime - last.current > 0.25) {
      last.current = clock.elapsedTime;
      labGauge.membrane = avg.current;
      const left = countLeft(md, SOLUTE);
      setRead({ membrane: avg.current, left, right: md.types.filter((t) => t === SOLUTE).length - left });
    }
  });

  const colorsKey = o ? `${o.mode}-${o.soluteLeft}-${o.soluteRight}` : "";
  const n = o ? 120 + o.soluteLeft + o.soluteRight : 0;
  // Colour each particle once per setup (water blue, solute orange).
  useEffect(() => {
    const m = mesh.current;
    if (!m || !o) return;
    const solute = o.soluteLeft + o.soluteRight;
    for (let i = 0; i < 120 + solute; i++) m.setColorAt(i, i < 120 ? WATER_C : SOLUTE_C);
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [colorsKey, o]);

  if (!o) return null;
  const osmosis = o.mode === "osmosis";
  const predicted = osmosis ? isotonicPosition(o) : 0.5;
  return (
    <group position={[0, TOP + BH / 2 + 0.05, 0]}>
      <mesh>
        <boxGeometry args={[BL, BH, BD]} />
        <meshStandardMaterial color="#e0f2fe" transparent opacity={0.1} roughness={0.05} depthWrite={false} />
        <Edges color="#9fb3c8" />
      </mesh>
      {osmosis && (
        <mesh ref={wall} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[BD, BH]} />
          <meshStandardMaterial color="#a78bfa" transparent opacity={0.35} side={2} depthWrite={false} />
        </mesh>
      )}
      <instancedMesh key={colorsKey} ref={mesh} args={[undefined, undefined, n]} frustumCulled={false}>
        <sphereGeometry args={[0.5 * S, 8, 6]} />
        <meshStandardMaterial roughness={0.4} />
      </instancedMesh>
      <Html position={[0, -BH / 2 - 0.35, BD / 2]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <div className="tag flex max-w-[340px] flex-col items-center px-3.5 py-1.5 text-center leading-tight !whitespace-normal" role="status">
          <span className="text-[14px] font-extrabold">{osmosis ? "Osmosis" : "Diffusion"}: <span style={{ color: "#2563eb" }}>water</span> and <span style={{ color: "#ea580c" }}>solute</span></span>
          <span className="text-[12px] font-semibold text-ink-3">
            {osmosis
              ? `Solute ${read.left} left, ${read.right} right. Membrane at ${Math.round(read.membrane * 100)}% (equal concentrations at ${Math.round(predicted * 100)}%).`
              : `Solute on the left: ${read.left} of ${read.left + read.right}. Random motion spreads it until it is even.`}
          </span>
          <span className="text-[11px] font-semibold text-ink-3">
            {osmosis ? "Live particles: water passes the purple membrane, solute can't, so water moves toward the stronger solution." : "Live particles: nothing pushes them; diffusion is just random bumping."}
          </span>
        </div>
      </Html>
    </group>
  );
}
