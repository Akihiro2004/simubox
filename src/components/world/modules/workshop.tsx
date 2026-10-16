"use client";

import { Html, Line, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { MathUtils, Object3D, type Group, type InstancedMesh } from "three";
import { useSim } from "@/lib/store";
import { solveCircuit, solveLever, waveDisplacement, waveSpeed } from "@/lib/engine/physics2";
import type { Modules } from "@/lib/modules";
import { Mat } from "../assets";

const fmt = (v: number, d = 2) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(d));
const Tag = ({ children, tone }: { children: React.ReactNode; tone?: "fact" | "warning" }) => <div className={`tag flex items-center gap-1.5 px-2.5 py-0.5 text-[12px] ${tone ? `tag-dot tag-${tone}` : ""}`}>{children}</div>;

// ---------- circuit ----------

type V2 = [number, number];
/** Point at distance d along a closed/open polyline in the board plane. */
function along(path: V2[], lengths: number[], total: number, d: number): V2 {
  let t = ((d % total) + total) % total;
  for (let i = 0; i < lengths.length; i++) {
    if (t <= lengths[i]) {
      const [a, b] = [path[i], path[i + 1]];
      const k = t / (lengths[i] || 1);
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    }
    t -= lengths[i];
  }
  return path[path.length - 1];
}
function prep(path: V2[]) {
  const lengths = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
  return { path, lengths, total: lengths.reduce((a, b) => a + b, 0) };
}

const BOARD: [number, number, number] = [-1.2, 0.08, 1.1];
const BOARD_SCALE = 1.6;
const W = 1.0, H = 0.6; // half-extents of the wire loop on the board

function Bulb({ at, brightness, label }: { at: V2; brightness: number; label?: string }) {
  return (
    <group position={[at[0], 0, at[1]]}>
      <mesh position={[0, 0.05, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.07, 0.1, 16]} />
        <Mat c="#9ca3af" m={0.6} r={0.3} />
      </mesh>
      <mesh position={[0, 0.17, 0]}>
        <sphereGeometry args={[0.1, 20, 16]} />
        <meshStandardMaterial color="#fff7d6" emissive="#ffc531" emissiveIntensity={0.1 + brightness * 2.4} transparent opacity={0.92} />
      </mesh>
      {brightness > 0.02 && <pointLight position={[0, 0.25, 0]} color="#ffcf6b" intensity={brightness * 1.6} distance={1.6} decay={2} />}
      {label && (
        <Html position={[0, 0.42, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
          <Tag>{label}</Tag>
        </Html>
      )}
    </group>
  );
}

function Circuit({ c, animate }: { c: NonNullable<Modules["circuit"]>; animate: boolean }) {
  const set = useSim((s) => s.set);
  const r = solveCircuit({ layout: c.layout, voltage: c.voltage, resistances: Array(c.bulbs).fill(c.resistance), closed: c.closed });
  const series = c.layout === "series";
  // Bulb spots: series along the top and right edges; parallel as rungs.
  // Series: bulbs sit on the loop. Parallel: each bulb is its own rung between the rails.
  const bulbs: V2[] = series
    ? ([[-0.5, -H], [0.5, -H], [W, -0.15], [W, 0.35]] as V2[]).slice(0, c.bulbs)
    : Array.from({ length: c.bulbs }, (_, i) => [W - (c.bulbs - 1 - i) * 0.25, 0] as V2);
  const xmax = series ? W : bulbs[bulbs.length - 1][0];
  const loops = useMemo(() => {
    if (series) return [prep([[-W, 0], [-W, -H], [W, -H], [W, H], [-W, H], [-W, 0]])];
    return bulbs.map(([x]) => prep([[-W, 0], [-W, -H], [x, -H], [x, H], [-W, H], [-W, 0]]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depends on layout and count only
  }, [series, c.bulbs]);
  const dots = useRef<InstancedMesh>(null);
  const tmp = useMemo(() => new Object3D(), []);
  const offset = useRef(0);
  const PER = 14;
  useFrame((_, dt) => {
    const m = dots.current;
    if (!m) return;
    // Electron drift speed shown proportional to current (not to scale: real drift is mm/s).
    if (animate) offset.current += dt * 0.6 * Math.min(r.current, 3);
    let n = 0;
    loops.forEach((loop, li) => {
      const speedScale = series ? 1 : r.branches[li]?.current / Math.max(r.current, 1e-9) * loops.length;
      for (let i = 0; i < PER; i++) {
        const [x, z] = along(loop.path, loop.lengths, loop.total, (i / PER) * loop.total + offset.current * speedScale);
        tmp.position.set(x, 0.035, z);
        tmp.scale.setScalar(c.closed ? 1 : 0.001);
        tmp.updateMatrix();
        m.setMatrixAt(n++, tmp.matrix);
      }
    });
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  });
  const wire = (pts: V2[]) => <Line points={pts.map(([x, z]) => [x, 0.03, z] as [number, number, number])} color="#1c1e22" lineWidth={3.5} />;
  return (
    <group position={BOARD} scale={BOARD_SCALE}>
      <RoundedBox args={[2.4, 0.06, 1.6]} radius={0.02} position={[0, -0.03, 0]} receiveShadow>
        <Mat c="#f6f1e7" r={0.9} />
      </RoundedBox>
      {/* Battery (+) to the top rail, around, back through the switch to (-). */}
      {wire(series ? [[-W, -0.18], [-W, -H], [W, -H], [W, H], [0.15, H]] : [[-W, -0.18], [-W, -H], [xmax, -H]])}
      {!series && wire([[0.15, H], [xmax, H]])}
      {!series && bulbs.map(([x], i) => <group key={i}>{wire([[x, -H], [x, -0.12]])}{wire([[x, 0.12], [x, H]])}</group>)}
      {wire([[-0.55, H], [-W, H], [-W, 0.18]])}
      {/* Battery on the left edge. */}
      <group position={[-W, 0.09, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.09, 0.09, 0.36, 20]} />
          <Mat c="#1c1e22" />
        </mesh>
        <mesh position={[0, -0.14, 0]}>
          <cylinderGeometry args={[0.092, 0.092, 0.1, 20]} />
          <Mat c="#ffc531" />
        </mesh>
      </group>
      <Html position={[-W - 0.05, 0.35, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <Tag tone="fact">
          {fmt(c.voltage, 1)} V battery · {fmt(r.current)} A
        </Tag>
      </Html>
      {/* Switch: click to open or close. */}
      <group
        position={[-0.2, 0.03, H]}
        onClick={(e) => {
          e.stopPropagation();
          const cur = useSim.getState().modules;
          if (cur.circuit) set({ modules: { ...cur, circuit: { ...cur.circuit, closed: !cur.circuit.closed } } });
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        <mesh position={[0.35, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.02, 12]} />
          <Mat c="#5f6670" />
        </mesh>
        <mesh position={[-0.35, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.02, 12]} />
          <Mat c="#5f6670" />
        </mesh>
        <group position={[-0.35, 0.02, 0]} rotation={[0, 0, c.closed ? 0 : 0.6]}>
          <mesh position={[0.35, 0, 0]} castShadow>
            <boxGeometry args={[0.7, 0.03, 0.05]} />
            <Mat c={c.closed ? "#30a46c" : "#e5484d"} />
          </mesh>
        </group>
        <Html position={[0, 0.3, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
          <Tag tone={c.closed ? undefined : "warning"}>Switch {c.closed ? "closed" : "open"}</Tag>
        </Html>
      </group>
      {/* Every bulb has the same resistance, so one label speaks for all of them. */}
      {bulbs.map((b, i) => (
        <Bulb key={i} at={b} brightness={r.branches[i]?.brightness ?? 0} label={i === bulbs.length - 1 ? `${bulbs.length > 1 ? "Each bulb: " : ""}${fmt(r.branches[i]?.current ?? 0)} A · ${fmt(r.branches[i]?.voltage ?? 0, 1)} V` : undefined} />
      ))}
      <instancedMesh ref={dots} args={[undefined, undefined, PER * 4]} frustumCulled={false}>
        <sphereGeometry args={[0.022, 8, 6]} />
        <meshBasicMaterial color="#2f80ed" />
      </instancedMesh>
      <Html position={[0, 0.02, 1.05]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
        <div className="ground-label whitespace-nowrap !text-ink-2 ![text-shadow:none]">{series ? "Series circuit: one path" : "Parallel circuit: separate paths"}</div>
      </Html>
    </group>
  );
}

// ---------- waves ----------

const ROPE_N = 72;
const ROPE: [number, number, number] = [0, 1.75, -2.4];
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

const LEVER: [number, number, number] = [0.7, 0, -0.6];

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
  const { circuit, wave, lever } = useSim((s) => s.modules);
  return (
    <>
      {circuit && <Circuit c={circuit} animate={animate} />}
      {wave && <Wave w={wave} animate={animate} />}
      {lever && <Lever l={lever} animate={animate} />}
    </>
  );
}

