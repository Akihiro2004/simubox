"use client";

import { Line } from "@react-three/drei";
import { Html } from "@/components/world/html";
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { Matrix4, Object3D, Quaternion, Vector3, type Group, type InstancedMesh } from "three";
import { elementBySymbol, elementColor, elementRadius, getMolecule, loadCompound, measureAngle, molarMass, onCompoundsChange, shells, type Molecule, type MoleculeId } from "@/lib/engine/chemistry";
import { PERIODIC_ELEMENTS } from "@/lib/periodic-table";
import { noteFocus, useSim } from "@/lib/store";
import { useCompoundJob } from "@/lib/player";
import { LoaderCircle } from "lucide-react";
import { Mat } from "./assets";

const SCALE = 1.15; // world meters per Ångström for small molecules: big enough to inspect
const FIT = 1.05; // larger molecules shrink to fit within this radius (m) on the bench
const UP = new Vector3(0, 1, 0);

function useAnimate(): boolean {
  return useSim((s) => s.settings.motion !== "off");
}

/** Library molecule, or a PubChem compound (fetched again after a reload or a saved experiment). */
function useMolecule(id: MoleculeId): Molecule | undefined {
  const [, refresh] = useReducer((x: number) => x + 1, 0);
  useEffect(() => onCompoundsChange(refresh), []);
  const m = getMolecule(id);
  useEffect(() => {
    if (!m && id.startsWith("cid:")) loadCompound({ cid: Number(id.slice(4)) }).catch(() => {});
  }, [m, id]);
  return m;
}

/** All atoms of one element as a single instanced mesh. */
function AtomGroup({ el, atoms, pos, scale, picked, onPick }: { el: string; atoms: number[]; pos: Vector3[]; scale: number; picked: number | null; onPick: (i: number) => void }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new Object3D();
    atoms.forEach((a, k) => {
      o.position.copy(pos[a]);
      o.scale.setScalar(a === picked ? 1.12 : 1);
      o.updateMatrix();
      m.setMatrixAt(k, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [atoms, pos, picked]);
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, atoms.length]}
      castShadow
      onClick={(e) => {
        e.stopPropagation();
        if (e.instanceId !== undefined) onPick(atoms[e.instanceId]);
      }}
    >
      <sphereGeometry args={[elementRadius(el) * scale, atoms.length > 30 ? 14 : 24, atoms.length > 30 ? 10 : 16]} />
      <Mat c={elementColor(el)} r={0.3} />
    </instancedMesh>
  );
}

/** Every bond lane (double bonds draw two) as one instanced cylinder mesh. */
function Bonds({ m, pos, scale }: { m: Molecule; pos: Vector3[]; scale: number }) {
  const ref = useRef<InstancedMesh>(null);
  const lanes = useMemo(() => {
    const out: Matrix4[] = [];
    for (const b of m.bonds) {
      const a = pos[b.a], c = pos[b.b];
      const dir = c.clone().sub(a);
      const len = dir.length();
      dir.normalize();
      const q = new Quaternion().setFromUnitVectors(UP, dir);
      // Perpendicular for drawing double/triple bonds side by side.
      const ref = Math.abs(dir.z) < 0.9 ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0);
      const off = new Vector3().crossVectors(dir, ref).normalize().multiplyScalar(0.075 * scale);
      const r = (b.order === 1 ? 0.06 : 0.04) / 0.06;
      for (const k of b.order === 1 ? [0] : b.order === 2 ? [-0.5, 0.5] : [-1, 0, 1]) {
        out.push(new Matrix4().compose(a.clone().add(c).multiplyScalar(0.5).addScaledVector(off, k), q, new Vector3(r, len, r)));
      }
    }
    return out;
  }, [m, pos, scale]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    lanes.forEach((mat, i) => mesh.setMatrixAt(i, mat));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [lanes]);
  if (!lanes.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, lanes.length]} castShadow>
      <cylinderGeometry args={[0.06 * scale, 0.06 * scale, 1, 10]} />
      <Mat c="#e2e8f0" r={0.35} />
    </instancedMesh>
  );
}

export function MoleculeModel({ id, molecule }: { id: string; molecule: MoleculeId }) {
  const m = useMolecule(molecule);
  if (!m) {
    return (
      <Html position={[0, 0, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <div role="status" className="tag whitespace-nowrap">Loading molecule…</div>
      </Html>
    );
  }
  return <LoadedMolecule id={id} m={m} />;
}

function LoadedMolecule({ id, m }: { id: string; m: Molecule }) {
  const spin = useRef<Group>(null);
  const animate = useAnimate();
  const [picked, setPicked] = useState<number | null>(null);
  // Large molecules shrink so they still fit on the pedestal; atoms and bonds scale with them.
  const scale = useMemo(() => {
    const r = Math.max(...m.atoms.map((a) => Math.hypot(...a.pos) + elementRadius(a.el)));
    return Math.min(SCALE, FIT / r);
  }, [m]);
  const ballScale = scale / SCALE;
  const pos = useMemo(() => m.atoms.map((a) => new Vector3(...a.pos).multiplyScalar(scale)), [m, scale]);
  const byElement = useMemo(() => {
    const g = new Map<string, number[]>();
    m.atoms.forEach((a, i) => g.set(a.el, [...(g.get(a.el) ?? []), i]));
    return [...g];
  }, [m]);
  const bottom = useMemo(() => Math.min(-1.25, ...pos.map((p) => p.y - 0.6)), [pos]);

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

  const pick = (i: number) => {
    setPicked(picked === i ? null : i);
    useSim.getState().set({ selectedId: id });
    const el = PERIODIC_ELEMENTS.find((e) => e.symbol === m.atoms[i].el);
    const bonds = m.bonds.filter((b) => b.a === i || b.b === i);
    if (picked !== i) noteFocus({ kind: "atom", id, label: `${el?.name ?? m.atoms[i].el} atom in the ${m.name} molecule (${m.formula})`, detail: `${bonds.length} bond${bonds.length === 1 ? "" : "s"}: ${bonds.map((b) => `${["single", "double", "triple"][b.order - 1]} to ${m.atoms[b.a === i ? b.b : b.a].el}`).join(", ") || "none"}` });
  };
  const pickedEl = picked !== null ? m.atoms[picked].el : null;

  return (
    <group>
      <group ref={spin}>
        {byElement.map(([el, atoms]) => (
          <AtomGroup key={el} el={el} atoms={atoms} pos={pos} scale={ballScale} picked={picked} onPick={pick} />
        ))}
        <Bonds m={m} pos={pos} scale={ballScale} />
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
        {picked !== null && pickedEl && (
          <Html position={pos[picked].clone().add(new Vector3(0, 0.5, 0))} center zIndexRange={[30, 10]} style={{ pointerEvents: "none" }}>
            <div className="tag flex items-center gap-1.5 px-3 py-1">{PERIODIC_ELEMENTS.find((e) => e.symbol === pickedEl)?.name ?? pickedEl} atom</div>
          </Html>
        )}
      </group>
      <Html position={[0, bottom, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <div className="tag flex flex-col items-center rounded-[16px] px-3.5 py-1.5 leading-tight">
          <span className="text-[15px] font-extrabold">
            {m.name}, {m.formula}
          </span>
          <span className="text-[12px] font-semibold text-ink-3">
            {[m.shape && `${m.shape} shape`, `${molarMass(m)} g/mol`, `${m.atoms.length} atoms`].filter(Boolean).join(" · ")}
          </span>
          <span className="text-[11px] font-semibold text-ink-3">Geometry: {m.source}</span>
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

// ---- Loading a compound: atoms gather on the bench while PubChem answers ----

const LOADER_ATOMS = ["C", "H", "N", "C", "O", "H", "C", "H", "C", "N", "H", "O"];

export function CompoundLoading() {
  const job = useCompoundJob((s) => s.job);
  const animate = useAnimate();
  const ring = useRef<Group>(null);
  const core = useRef<Group>(null);
  const atoms = useRef<(Group | null)[]>([]);
  const t0 = useRef(0);

  // An error stays readable for a few seconds, then clears itself.
  useEffect(() => {
    if (!job?.error) return;
    const t = setTimeout(() => useCompoundJob.setState((s) => (s.job === job ? { job: null } : s)), 6000);
    return () => clearTimeout(t);
  }, [job]);

  useFrame(({ clock }) => {
    if (!job) {
      t0.current = 0;
      return;
    }
    if (!t0.current) t0.current = clock.elapsedTime;
    const t = animate ? clock.elapsedTime - t0.current : 0.8;
    // Atoms orbit on three tilted rings, drift inward and back like a molecule assembling.
    LOADER_ATOMS.forEach((_, i) => {
      const g = atoms.current[i];
      if (!g) return;
      const lane = i % 3, phase = (i / LOADER_ATOMS.length) * Math.PI * 2;
      const a = phase + t * (1.6 + lane * 0.35) * (lane === 1 ? -1 : 1);
      const r = job.error ? 0.62 : 0.42 + 0.2 * (0.5 + 0.5 * Math.sin(t * 2.2 + phase));
      const tilt = lane * 1.05;
      g.position.set(Math.cos(a) * r, Math.sin(a) * r * Math.sin(tilt), Math.sin(a) * r * Math.cos(tilt));
    });
    if (ring.current) ring.current.rotation.y = t * 0.4;
    if (core.current) core.current.scale.setScalar(job.error ? 0.8 : 1 + 0.12 * Math.sin(t * 4));
  });

  if (!job) return null;
  return (
    <group position={job.at}>
      <group ref={ring} visible={!job.error}>
        {LOADER_ATOMS.map((el, i) => (
          <group key={i} ref={(g) => void (atoms.current[i] = g)}>
            <mesh>
              <sphereGeometry args={[elementRadius(el) * 0.42, 14, 10]} />
              <Mat c={job.error ? "#cbd5e1" : elementColor(el)} r={0.3} />
            </mesh>
          </group>
        ))}
      </group>
      <group ref={core} visible={!job.error}>
        <mesh>
          <sphereGeometry args={[0.16, 20, 14]} />
          <meshStandardMaterial color={job.error ? "#f87171" : "#a5b4fc"} emissive={job.error ? "#ef4444" : "#818cf8"} emissiveIntensity={0.6} transparent opacity={0.55} depthWrite={false} />
        </mesh>
      </group>
      {/* An error floats above whatever is still on the bench instead of covering its label. */}
      <Html position={[0, job.error ? 1.35 : -1.05, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <div role="status" aria-live="polite" className="tag flex max-w-[280px] flex-col items-center rounded-[16px] px-3.5 py-1.5 text-center leading-tight">
          {job.error ? (
            <>
              <span className="text-[15px] font-extrabold">Couldn’t build {job.name}</span>
              <span className="text-[12px] font-semibold text-ink-3">{job.error}</span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 text-[15px] font-extrabold">
                <LoaderCircle size={15} className="shrink-0 animate-spin" /> Building {job.name}
              </span>
              <span className="text-[12px] font-semibold text-ink-3">Fetching its real 3D shape from PubChem…</span>
            </>
          )}
        </div>
      </Html>
    </group>
  );
}
