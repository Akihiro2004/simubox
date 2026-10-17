"use client";

import { Line } from "@react-three/drei";
import { Html } from "@/components/world/html";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { Quaternion, Vector3, type Group } from "three";
import { ELEMENT_COLORS, ELEMENT_RADII, MOLECULES, elementBySymbol, measureAngle, shells, type MoleculeId } from "@/lib/engine/chemistry";
import { useSim } from "@/lib/store";
import { Mat } from "./assets";

const SCALE = 1.15; // world meters per Ångström: big enough to inspect
const UP = new Vector3(0, 1, 0);

function useAnimate(): boolean {
  return useSim((s) => s.settings.motion !== "off");
}

function Bond({ a, b, order }: { a: Vector3; b: Vector3; order: number }) {
  const { mid, quat, len, offset } = useMemo(() => {
    const dir = b.clone().sub(a);
    const len = dir.length();
    dir.normalize();
    const quat = new Quaternion().setFromUnitVectors(UP, dir);
    // Perpendicular for drawing double/triple bonds side by side.
    const ref = Math.abs(dir.z) < 0.9 ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0);
    const offset = new Vector3().crossVectors(dir, ref).normalize().multiplyScalar(0.075);
    return { mid: a.clone().add(b).multiplyScalar(0.5), quat, len, offset };
  }, [a, b]);
  const lanes = order === 1 ? [0] : order === 2 ? [-0.5, 0.5] : [-1, 0, 1];
  const r = order === 1 ? 0.06 : 0.04;
  return (
    <>
      {lanes.map((k) => (
        <mesh key={k} position={mid.clone().addScaledVector(offset, k)} quaternion={quat} castShadow>
          <cylinderGeometry args={[r, r, len, 14]} />
          <Mat c="#e2e8f0" r={0.35} />
        </mesh>
      ))}
    </>
  );
}

export function MoleculeModel({ id, molecule }: { id: string; molecule: MoleculeId }) {
  const m = MOLECULES[molecule];
  const spin = useRef<Group>(null);
  const animate = useAnimate();
  const [picked, setPicked] = useState<number | null>(null);
  const pos = useMemo(() => m.atoms.map((a) => new Vector3(...a.pos).multiplyScalar(SCALE)), [m]);

  useFrame((_, dt) => {
    if (animate && spin.current) spin.current.rotation.y += dt * 0.35;
  });

  const angle = m.angles[0];
  const arc = useMemo(() => {
    if (!angle) return null;
    const [ia, ic, ib] = angle.atoms;
    const c = pos[ic];
    const u = pos[ia].clone().sub(c).normalize();
    const v = pos[ib].clone().sub(c).normalize();
    const r = 0.42;
    const pts: Vector3[] = [];
    // Interpolate around the bend; for 180° pick a stable normal.
    const axis = new Vector3().crossVectors(u, v);
    if (axis.lengthSq() < 1e-6) axis.set(0, 0, 1);
    axis.normalize();
    const total = (measureAngle(m, angle.atoms) * Math.PI) / 180;
    for (let i = 0; i <= 24; i++) pts.push(u.clone().applyAxisAngle(axis, (total * i) / 24).multiplyScalar(r).add(c));
    const label = u.clone().applyAxisAngle(axis, total / 2).multiplyScalar(r + 0.28).add(c);
    return { pts, label };
  }, [angle, pos, m]);

  return (
    <group>
      <group ref={spin}>
        {m.atoms.map((a, i) => (
          <mesh
            key={i}
            position={pos[i]}
            castShadow
            onClick={(e) => {
              e.stopPropagation();
              setPicked(picked === i ? null : i);
              useSim.getState().set({ selectedId: id });
            }}
          >
            <sphereGeometry args={[ELEMENT_RADII[a.el] ?? 0.3, 32, 24]} />
            <Mat c={ELEMENT_COLORS[a.el] ?? "#a78bfa"} r={0.3} e={picked === i ? "#ffffff" : undefined} ei={0.25} />
          </mesh>
        ))}
        {m.bonds.map((b, i) => (
          <Bond key={i} a={pos[b.a]} b={pos[b.b]} order={b.order} />
        ))}
        {m.lonePairs.map((lp, i) => {
          const d = new Vector3(...lp.dir).normalize();
          return (
            <mesh key={i} position={pos[lp.atom].clone().addScaledVector(d, 0.48)} quaternion={new Quaternion().setFromUnitVectors(UP, d)} scale={[0.15, 0.27, 0.15]}>
              <sphereGeometry args={[1, 20, 14]} />
              <meshStandardMaterial color="#c084fc" transparent opacity={0.38} emissive="#a855f7" emissiveIntensity={0.3} depthWrite={false} />
            </mesh>
          );
        })}
        {arc && (
          <>
            <Line points={arc.pts} color="#facc15" lineWidth={2.5} />
            <Html position={arc.label} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
              <div className="tag flex items-center gap-1.5 px-3 py-1 tag-dot tag-fact">{angle!.deg}°</div>
            </Html>
          </>
        )}
        {picked !== null && (
          <Html position={pos[picked].clone().add(new Vector3(0, 0.5, 0))} center zIndexRange={[30, 10]} style={{ pointerEvents: "none" }}>
            <div className="tag flex items-center gap-1.5 px-3 py-1">{elementBySymbol(m.atoms[picked].el)?.name ?? m.atoms[picked].el} atom</div>
          </Html>
        )}
      </group>
      <Html position={[0, -1.25, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <div className="tag flex flex-col items-center rounded-[16px] px-3.5 py-1.5 leading-tight">
          <span className="text-[15px] font-extrabold">
            {m.name}, {m.formula}
          </span>
          <span className="text-[12px] font-semibold text-ink-3">{m.shape} shape</span>
        </div>
      </Html>
    </group>
  );
}

/** Fibonacci-sphere packing for nucleons. */
function nucleus(count: number): Vector3[] {
  const r = 0.09 * Math.cbrt(count);
  const pts: Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
    const rad = Math.sqrt(1 - y * y);
    const th = i * 2.399963;
    pts.push(new Vector3(Math.cos(th) * rad, y, Math.sin(th) * rad).multiplyScalar(r));
  }
  return pts;
}

export function AtomModel({ element }: { element: string }) {
  const info = elementBySymbol(element);
  const animate = useAnimate();
  const shellRefs = useRef<(Group | null)[]>([]);
  const parts = useMemo(() => (info ? nucleus(info.massNumber) : []), [info]);
  useFrame((_, dt) => {
    if (!animate) return;
    shellRefs.current.forEach((g, i) => {
      if (g) g.rotation.y += dt * (1.2 / (i + 1));
    });
  });
  if (!info) return null;
  const sh = shells(info.z);
  return (
    <group>
      {parts.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.07, 14, 10]} />
          {/* exactly z protons, spread evenly among the nucleons */}
          <Mat c={Math.floor(((i + 1) * info.z) / info.massNumber) > Math.floor((i * info.z) / info.massNumber) ? "#f87171" : "#cbd5e1"} r={0.4} />
        </mesh>
      ))}
      {sh.map((n, i) => {
        const R = 0.55 + i * 0.36;
        return (
          <group key={i} rotation={[0.35 + i * 0.12, 0, i * 0.2]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[R, 0.006, 6, 96]} />
              <meshBasicMaterial color="#a5b4fc" transparent opacity={0.6} />
            </mesh>
            <group ref={(g) => void (shellRefs.current[i] = g)}>
              {Array.from({ length: n }).map((_, k) => (
                <mesh key={k} position={[Math.cos((k / n) * Math.PI * 2) * R, 0, Math.sin((k / n) * Math.PI * 2) * R]}>
                  <sphereGeometry args={[0.055, 12, 10]} />
                  <Mat c="#38bdf8" e="#0ea5e9" ei={0.8} />
                </mesh>
              ))}
            </group>
          </group>
        );
      })}
      <Html position={[0, -0.75 - sh.length * 0.36, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <div className="tag flex flex-col items-center rounded-[16px] px-3.5 py-1.5 leading-tight">
          <span className="text-[15px] font-extrabold">
            {info.name} ({info.symbol})
          </span>
          <span className="text-[12px] font-semibold text-ink-3">
            {info.z} protons, {info.massNumber - info.z} neutrons, electrons {sh.join(" + ")}
          </span>
          <span className="text-[11px] font-semibold text-ink-3">Simplified model, not to scale</span>
        </div>
      </Html>
    </group>
  );
}
