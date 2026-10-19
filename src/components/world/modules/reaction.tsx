"use client";

import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Color, Object3D, type InstancedMesh } from "three";
import { Html } from "@/components/world/html";
import { LabBoard } from "@/components/world/lab-board";
import { useSim } from "@/lib/store";
import { labGauge } from "@/lib/modules";
import { balance, createReactionBox, progress, runsInBox, setReactionConditions, stepReaction, RATE_REACTION, type Balanced, type ReactionBox } from "@/lib/engine/reactions";

// Board behind the lab pedestal (top at y ≈ 0.8); the box sits on the pedestal.
const TOP = 0.8;
const BOX = 1.5;

function useBalanced(equation: string): Balanced | string {
  return useMemo(() => {
    try {
      return balance(equation);
    } catch (e) {
      return e instanceof Error ? e.message : "Can't balance that";
    }
  }, [equation]);
}

export function ReactionModule({ animate }: { animate: boolean }) {
  const r = useSim((s) => s.modules.reaction);
  const b = useBalanced(r?.equation ?? "");
  const box = !!r && runsInBox(r.equation);
  if (!r) return null;
  const lines = typeof b === "string"
    ? [{ text: "Balancing", size: 30, color: "#a7d7c5" }, { text: r.equation, size: 40 }, { text: b, size: 30, color: "#fca5a5" }]
    : [
        { text: "Balanced equation", size: 28, color: "#a7d7c5" },
        { text: b.text, size: 48 },
        { text: `Atoms before → after: ${Object.entries(b.atoms).map(([el, [l, rr]]) => `${el} ${l} → ${rr}`).join("   ")}`, size: 28 },
        ...(b.simplest ? [{ text: "Atoms alone allow other balances too; this is the simplest, the way chemists write it.", size: 24, color: "#fde68a" }] : []),
        { text: `Mass before → after: ${b.mass[0].toFixed(2)} g → ${b.mass[1].toFixed(2)} g (per mole of reaction). Atoms are only rearranged, so no mass is lost.`, size: 26, color: "#d6e6df" },
      ];
  return (
    <group>
      <LabBoard lines={lines} position={[0, box ? 3.15 : 2.1, -0.6]} width={2.8} height={box ? 0.95 : 1.3} />
      {box && <CollisionBox animate={animate} />}
    </group>
  );
}

const SCALE = BOX / 10;

function CollisionBox({ animate }: { animate: boolean }) {
  const r = useSim((s) => s.modules.reaction)!;
  const mesh = useRef<InstancedMesh>(null);
  const sim = useRef<ReactionBox | null>(null);
  const tmp = useMemo(() => new Object3D(), []);
  const colors = useMemo(() => RATE_REACTION.colors.map((c) => new Color(c)), []);
  const seen = useRef({ events: 0, times: [] as number[], read: 0 });
  const [readout, setReadout] = useState({ rate: 0, done: 0 });

  // A fresh box when the amount of reactant changes; temperature, Eₐ and catalyst steer the running one.
  useEffect(() => {
    sim.current = null;
    seen.current = { events: 0, times: [], read: 0 };
  }, [r.particles]);

  useFrame(({ clock }, dt) => {
    sim.current ??= createReactionBox({ perReactant: r.particles, tempC: r.temperatureC, eaKJ: r.activationKJ, catalyst: r.catalyst });
    const b = sim.current;
    setReactionConditions(b, r.temperatureC, r.activationKJ, r.catalyst);
    if (animate) stepReaction(b, Math.min(24, Math.round(Math.min(dt, 0.05) * 900)), 2.5);
    const m = mesh.current;
    if (!m) return;
    const { md } = b;
    for (let i = 0; i < md.n; i++) {
      tmp.position.set((md.pos[i * 3] - 5) * SCALE, (md.pos[i * 3 + 1] - 5) * SCALE, (md.pos[i * 3 + 2] - 5) * SCALE);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      m.setColorAt(i, colors[md.types[i]]);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    // Reactions per real second over the last 3 s, read four times a second.
    const now = clock.elapsedTime, s = seen.current;
    for (; s.events < b.events.length; s.events++) s.times.push(now);
    s.times = s.times.filter((t) => t > now - 3);
    if (now - s.read > 0.25) {
      s.read = now;
      const rate = s.times.length / Math.min(3, Math.max(now - (s.times[0] ?? now), 1));
      labGauge.reactionRate = rate;
      labGauge.reactionProgress = progress(b);
      setReadout({ rate, done: progress(b) });
    }
  });

  const n = r.particles * 2;
  return (
    <group position={[0, TOP + BOX / 2 + 0.05, 0]}>
      <mesh>
        <boxGeometry args={[BOX, BOX, BOX]} />
        <meshStandardMaterial color="#e0f2fe" transparent opacity={0.1} roughness={0.05} depthWrite={false} />
        <Edges color="#9fb3c8" />
      </mesh>
      <instancedMesh key={n} ref={mesh} args={[undefined, undefined, n]} frustumCulled={false}>
        <sphereGeometry args={[0.5 * SCALE, 8, 6]} />
        <meshStandardMaterial roughness={0.4} />
      </instancedMesh>
      <Html position={[0, -BOX / 2 - 0.35, BOX / 2]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <div className="tag flex max-w-[320px] flex-col items-center px-3.5 py-1.5 text-center leading-tight !whitespace-normal" role="status" aria-live="polite">
          <span className="text-[14px] font-extrabold">NO + O₃ → NO₂ + O₂ at {Math.round(r.temperatureC)} °C</span>
          <span className="mt-0.5 flex flex-wrap justify-center gap-x-2 text-[12px] font-semibold">
            {RATE_REACTION.species.map((sp, i) => (
              <span key={sp} className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: RATE_REACTION.colors[i] }} />{sp}</span>
            ))}
          </span>
          <span className="text-[12px] font-semibold text-ink-3">
            {readout.rate.toFixed(1)} reactions/s · {Math.round(readout.done * 100)}% reacted · Eₐ {(r.activationKJ * (r.catalyst ? 0.5 : 1)).toFixed(1)} kJ/mol{r.catalyst ? " (catalyst)" : ""}
          </span>
          <span className="text-[11px] font-semibold text-ink-3">Live collision model: molecules react only when they hit hard enough (sped up). Real Eₐ {RATE_REACTION.eaKJ.toFixed(1)} kJ/mol.</span>
        </div>
      </Html>
    </group>
  );
}
