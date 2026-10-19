"use client";

import { Line, RoundedBox } from "@react-three/drei";
import { Html } from "@/components/world/html";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { MathUtils, Object3D, type Group, type InstancedMesh } from "three";
import { useSim } from "@/lib/store";
import { solveLever, waveDisplacement, waveSpeed } from "@/lib/engine/physics2";
import { circuitBoard, type Modules } from "@/lib/modules";
import { CircuitBoard3D } from "./circuit";
import { MagnetLab3D } from "./magnet";
import { Mat } from "../assets";
import { RippleTank } from "./ripple";

const fmt = (v: number, d = 2) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(d));
const Tag = ({ children, tone }: { children: React.ReactNode; tone?: "fact" | "warning" }) => <div className={`tag flex items-center gap-1.5 px-2.5 py-0.5 text-[12px] ${tone ? `tag-dot tag-${tone}` : ""}`}>{children}</div>;

// ---------- waves ----------

const ROPE_N = 72;
const ROPE: [number, number, number] = [0, 1.75, 0.4];
const HALF_LEN = 2.6;

function Wave({ w, animate }: { w: NonNullable<Modules["wave"]>; animate: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  const tmp = useMemo(() => new Object3D(), []);
  const t = useRef(0);
  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    if (animate) t.current += Math.min(dt, 0.05);
    for (let i = 0; i < ROPE_N; i++) {
      const x0 = -HALF_LEN + (2 * HALF_LEN * i) / (ROPE_N - 1);
      const d = waveDisplacement(w, x0 + HALF_LEN, t.current);
      if (w.kind === "transverse") tmp.position.set(x0, d, 0);
      else tmp.position.set(x0 + d * 0.35, 0, 0);
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  const lam = Math.min(w.wavelength, 2 * HALF_LEN);
  return (
    <group position={ROPE}>
      <Line points={[[-HALF_LEN, 0, 0], [HALF_LEN, 0, 0]]} color="#c7ced8" lineWidth={1} dashed dashSize={0.1} gapSize={0.08} />
      <instancedMesh ref={mesh} args={[undefined, undefined, ROPE_N]} frustumCulled={false}>
        {w.kind === "transverse" ? <sphereGeometry args={[0.05, 10, 8]} /> : <boxGeometry args={[0.025, 0.5, 0.5]} />}
        <meshStandardMaterial color="#2f80ed" roughness={0.4} />
      </instancedMesh>
      {/* Wavelength bracket and amplitude bar. */}
      <Line points={[[-HALF_LEN, -1.25, 0], [-HALF_LEN + lam, -1.25, 0]]} color="#f0a800" lineWidth={2.5} />
      <Html position={[-HALF_LEN + lam / 2, -1.45, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <Tag tone="fact">wavelength λ = {fmt(w.wavelength)} m</Tag>
      </Html>
      {w.kind === "transverse" && (
        <>
          <Line points={[[HALF_LEN + 0.2, 0, 0], [HALF_LEN + 0.2, w.amplitude, 0]]} color="#e5484d" lineWidth={2.5} />
          <Html position={[HALF_LEN + 0.25, w.amplitude + 0.25, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
            <Tag>amplitude {fmt(w.amplitude)} m</Tag>
          </Html>
        </>
      )}
      <Html position={[0, 1.55, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <Tag tone="fact">
          {w.kind === "transverse" ? "Transverse" : "Longitudinal"} wave · speed v = f × λ = {fmt(w.frequency)} × {fmt(w.wavelength)} = {fmt(waveSpeed(w))} m/s
        </Tag>
      </Html>
    </group>
  );
}

// ---------- lever ----------

const LEVER: [number, number, number] = [0, 0, 0.6];

function Lever({ l, animate }: { l: NonNullable<Modules["lever"]>; animate: boolean }) {
  const beam = useRef<Group>(null);
  const r = solveLever(l);
  const maxT = Math.max(r.leftTorque, r.rightTorque, 1e-9);
  // Tilt toward the heavier side, up to 14°. (Right side down = negative z rotation.)
  const target = r.balanced ? 0 : (-(r.net / maxT) * 14 * Math.PI) / 180;
  useFrame((_, dt) => {
    if (beam.current) beam.current.rotation.z = animate ? MathUtils.damp(beam.current.rotation.z, target, 3, dt) : target;
  });
  const box = (kg: number) => 0.12 + 0.1 * Math.cbrt(kg);
  return (
    <group position={LEVER}>
      <mesh position={[0, 0.3, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.32, 0.6, 3]} />
        <Mat c="#5f6670" />
      </mesh>
      <group ref={beam} position={[0, 0.62, 0]}>
        <RoundedBox args={[5, 0.07, 0.24]} radius={0.02} castShadow>
          <Mat c="#c08a5a" />
        </RoundedBox>
        {[-2, -1, 1, 2].map((x) => (
          <mesh key={x} position={[x, 0.036, 0.121]}>
            <boxGeometry args={[0.012, 0.05, 0.002]} />
            <meshBasicMaterial color="#1c1e22" />
          </mesh>
        ))}
        {(["left", "right"] as const).map((side) => {
          const kg = side === "left" ? l.leftMass : l.rightMass;
          const d = side === "left" ? -l.leftDistance : l.rightDistance;
          const s = box(kg);
          const torque = side === "left" ? r.leftTorque : r.rightTorque;
          return (
            <group key={side} position={[d, 0.035 + s / 2, 0]}>
              <RoundedBox args={[s, s, s]} radius={0.02} castShadow>
                <Mat c={side === "left" ? "#2f80ed" : "#e5484d"} />
              </RoundedBox>
              <Html position={[0, s / 2 + 0.3, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
                <Tag>
                  {fmt(kg, 1)} kg at {fmt(Math.abs(d), 1)} m · {fmt(torque, 1)} N·m
                </Tag>
              </Html>
            </group>
          );
        })}
      </group>
      <Html position={[0, 0.05, 0.75]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <Tag tone={r.balanced ? "fact" : "warning"}>{r.balanced ? "Balanced: the turning effects are equal" : `The ${r.heavierSide} side wins (more N·m)`}</Tag>
      </Html>
    </group>
  );
}

export function WorkshopModules({ animate }: { animate: boolean }) {
  const { circuit, wave, lever, ripple, magnet } = useSim((s) => s.modules);
  return (
    <>
      {!magnet && circuitBoard(circuit) && <CircuitBoard3D board={circuitBoard(circuit)!} animate={animate} />}
      {magnet && <MagnetLab3D lab={magnet} animate={animate} />}
      {wave && <Wave w={wave} animate={animate} />}
      {lever && <Lever l={lever} animate={animate} />}
      {ripple && <RippleTank r={ripple} animate={animate} />}
    </>
  );
}

