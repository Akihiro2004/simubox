"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, Object3D, Plane, Raycaster, Vector2, Vector3, type Group, type InstancedMesh } from "three";
import { create } from "zustand";
import { Html } from "@/components/world/html";
import { noteFocus, useSim } from "@/lib/store";
import { siFormat } from "@/lib/modules";
import { SIZES, TABLE_HALF, TEST_MATERIALS, compassReading, facesOf, fieldAt, forceOn, formatTesla, pullStep, traceFieldLines, type MagnetItem, type MagnetLab } from "@/lib/engine/magnet";
import { controlsRef } from "../camera";
import { Mat } from "../assets";
import { BOARD_POS } from "./circuit";

/** The lab is built in real metres and drawn K times larger on the workshop mat. */
const K = 8;
/** Sits on top of the workshop mat, level with the circuit board. */
const LIFT = 0.05;
export const LAB_ORIGIN: [number, number, number] = [BOARD_POS[0], BOARD_POS[1] + LIFT, BOARD_POS[2]];
const TOP = 0.0; // table surface, local
const MID = SIZES.bar[2] / 2; // magnets' mid-height: the plane the field is drawn in

export const useMagnetUi = create<{ selected: string | null; dragging: boolean }>(() => ({ selected: null, dragging: false }));

const isSource = (i: MagnetItem) => i.kind === "bar" || i.kind === "horseshoe" || i.kind === "coil" || i.kind === "wire";

function patchItem(id: string, patch: Partial<MagnetItem>) {
  const s = useSim.getState();
  const lab = s.modules.magnet;
  if (lab) s.set({ modules: { ...s.modules, magnet: { ...lab, items: lab.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) } } });
}

export function itemName(i: MagnetItem): string {
  if (i.kind === "object") return TEST_MATERIALS[i.test ?? "steel_clip"].name;
  return { bar: "Bar magnet", horseshoe: "Horseshoe magnet", coil: "Electromagnet (coil)", wire: "Wire with current", compass: "Compass", object: "Object" }[i.kind];
}

/** Tell the guide what the student picked and what the field is doing there. */
export function selectItem(id: string | null) {
  useMagnetUi.setState({ selected: id });
  const lab = useSim.getState().modules.magnet;
  const it = id ? lab?.items.find((i) => i.id === id) : undefined;
  if (!lab || !it) return;
  const r = compassReading(lab, it.x, it.z);
  noteFocus({ kind: "magnet_item", id: it.id, label: `${itemName(it)} "${it.id}" in the magnet lab`, detail: `field there ${formatTesla(r.tesla)}${it.kind === "object" ? (TEST_MATERIALS[it.test ?? "steel_clip"].magnetic ? ", a magnetic material" : ", not magnetic") : ""}` });
}

export function MagnetLab3D({ lab, animate }: { lab: MagnetLab; animate: boolean }) {
  const dragging = useMagnetUi((u) => u.dragging);
  const selected = useMagnetUi((u) => u.selected);
  // Field lines are the costly part: fewer and shorter while a magnet is being dragged.
  // Frame the table when the lab opens: the magnets are real-sized, so they need a close view.
  useEffect(() => {
    useSim.getState().focus({ target: LAB_ORIGIN, distance: 5.5 });
  }, []);
  const lines = useMemo(() => (lab.lines ? traceFieldLines(lab, dragging ? 4 : 9, dragging ? 320 : 700) : []), [lab, dragging]);
  return (
    <group position={LAB_ORIGIN}>
      <group scale={K}>
        <RoundedBox args={[TABLE_HALF[0] * 2 + 0.02, 0.006, TABLE_HALF[1] * 2 + 0.02]} radius={0.003} position={[0, TOP - 0.003, 0]} receiveShadow>
          <Mat c="#f6f1e7" r={0.9} />
        </RoundedBox>
        {lab.filings && <Filings lab={lab} />}
        {lab.compasses && <CompassGrid lab={lab} />}
        {lines.length > 0 && <FieldLines lines={lines} />}
        {lab.items.map((it) => (
          <Item key={it.id} it={it} lab={lab} selected={selected === it.id} animate={animate} />
        ))}
        <Forces lab={lab} />
        {lab.earth && (
          <Html position={[TABLE_HALF[0] - 0.02, MID, -TABLE_HALF[1] + 0.015]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
            <div className="tag tag-dot tag-fact whitespace-nowrap px-2 py-0.5 text-[11px] font-bold">↑ North (Earth&apos;s field 20 µT)</div>
          </Html>
        )}
        <DragController />
      </group>
    </group>
  );
}

// ---------- field lines (one geometry) with direction arrows (one instanced mesh) ----------

function FieldLines({ lines }: { lines: [number, number][][] }) {
  const arrows = useRef<InstancedMesh>(null);
  const { geometry, marks } = useMemo(() => {
    const pos: number[] = [];
    const marks: { x: number; z: number; a: number }[] = [];
    for (const l of lines) {
      for (let i = 1; i < l.length; i++) {
        pos.push(l[i - 1][0], MID, l[i - 1][1], l[i][0], MID, l[i][1]);
        if (i % 40 === 20) marks.push({ x: l[i][0], z: l[i][1], a: Math.atan2(l[i][1] - l[i - 1][1], l[i][0] - l[i - 1][0]) });
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    return { geometry: g, marks };
  }, [lines]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    const m = arrows.current;
    if (!m) return;
    const o = new Object3D();
    marks.forEach((k, i) => {
      o.position.set(k.x, MID, k.z);
      o.rotation.set(0, -k.a, -Math.PI / 2);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.count = marks.length;
    m.instanceMatrix.needsUpdate = true;
  }, [marks]);
  return (
    <>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color="#2f6fd1" transparent opacity={0.75} />
      </lineSegments>
      <instancedMesh ref={arrows} args={[undefined, undefined, 400]} frustumCulled={false}>
        <coneGeometry args={[0.0018, 0.005, 8]} />
        <meshBasicMaterial color="#2f6fd1" />
      </instancedMesh>
    </>
  );
}

// ---------- iron filings: little slivers that line up with the field ----------

const FIL_X = 44, FIL_Z = 30;
function Filings({ lab }: { lab: MagnetLab }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const faces = facesOf(lab.items);
    const o = new Object3D();
    let n = 0;
    for (let i = 0; i < FIL_X; i++) for (let j = 0; j < FIL_Z; j++) {
      // A little jitter so the pattern looks sprinkled rather than printed.
      const x = -TABLE_HALF[0] + ((i + 0.5 + Math.sin(i * 12.9 + j * 4.1) * 0.3) / FIL_X) * TABLE_HALF[0] * 2;
      const z = -TABLE_HALF[1] + ((j + 0.5 + Math.sin(j * 7.3 + i * 3.7) * 0.3) / FIL_Z) * TABLE_HALF[1] * 2;
      if (lab.items.some((it) => isSource(it) && it.kind !== "wire" && Math.hypot(x - it.x, z - it.z) < 0.042)) continue;
      const B = fieldAt(lab, x, z, faces);
      const t = Math.hypot(B[0], B[2]);
      if (t < 4e-5) continue; // too weak to line filings up
      const s = Math.min(1, Math.max(0.35, Math.log10(t / 4e-5) / 2.5));
      o.position.set(x, TOP + 0.0004, z);
      o.rotation.set(0, Math.atan2(-B[2], B[0]), 0);
      o.scale.set(s, 1, 1);
      o.updateMatrix();
      m.setMatrixAt(n++, o.matrix);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  }, [lab]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, FIL_X * FIL_Z]} frustumCulled={false}>
      <boxGeometry args={[0.006, 0.0004, 0.0008]} />
      <meshStandardMaterial color="#3f4652" roughness={0.6} metalness={0.3} />
    </instancedMesh>
  );
}

// ---------- grid of tiny compass needles ----------

function CompassGrid({ lab }: { lab: MagnetLab }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const faces = facesOf(lab.items);
    const o = new Object3D();
    let n = 0;
    for (let i = 0; i < 13; i++) for (let j = 0; j < 9; j++) {
      const x = -TABLE_HALF[0] + ((i + 0.5) / 13) * TABLE_HALF[0] * 2, z = -TABLE_HALF[1] + ((j + 0.5) / 9) * TABLE_HALF[1] * 2;
      if (lab.items.some((it) => isSource(it) && it.kind !== "wire" && Math.hypot(x - it.x, z - it.z) < 0.045)) continue;
      const B = fieldAt(lab, x, z, faces);
      o.position.set(x, MID, z);
      o.rotation.set(0, Math.atan2(-B[2], B[0]), -Math.PI / 2);
      o.updateMatrix();
      m.setMatrixAt(n++, o.matrix);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  }, [lab]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 13 * 9]} frustumCulled={false}>
      <coneGeometry args={[0.0022, 0.012, 6]} />
      <meshStandardMaterial color="#e5484d" />
    </instancedMesh>
  );
}

// ---------- forces between magnets ----------

function Forces({ lab }: { lab: MagnetLab }) {
  const magnets = lab.items.filter((i) => i.kind === "bar" || i.kind === "horseshoe" || i.kind === "coil");
  const forces = useMemo(() => (magnets.length < 2 ? [] : magnets.map((m) => ({ m, f: forceOn(lab, m.id) }))), [lab, magnets.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {forces.map(({ m, f }) => {
        const size = Math.hypot(f[0], f[1]);
        if (size < 1e-3) return null;
        const others = magnets.filter((o) => o.id !== m.id);
        const near = others.reduce((a, b) => (Math.hypot(b.x - m.x, b.z - m.z) < Math.hypot(a.x - m.x, a.z - m.z) ? b : a));
        const attract = f[0] * (near.x - m.x) + f[1] * (near.z - m.z) > 0;
        const len = Math.min(0.05, 0.012 + Math.log10(1 + size * 10) * 0.02);
        const a = Math.atan2(f[1], f[0]);
        return (
          <group key={m.id} position={[m.x, MID + 0.012, m.z]} rotation={[0, -a, 0]}>
            <mesh position={[len / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.0012, 0.0012, len, 6]} /><meshBasicMaterial color={attract ? "#30a46c" : "#e5484d"} /></mesh>
            <mesh position={[len, 0, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.003, 0.007, 10]} /><meshBasicMaterial color={attract ? "#30a46c" : "#e5484d"} /></mesh>
            <Html position={[len + 0.012, 0, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
              <div className={`tag tag-dot ${attract ? "tag-fact" : "tag-warning"} whitespace-nowrap px-2 py-0.5 text-[11px] font-bold`}>{attract ? "Attract" : "Repel"} · {siFormat(size, "N")}</div>
            </Html>
          </group>
        );
      })}
    </>
  );
}

// ---------- items ----------

function PoleTag({ at, n }: { at: [number, number, number]; n: boolean }) {
  return (
    <Html position={at} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
      <div className="grid h-5 w-5 place-items-center rounded-full text-[11px] font-black text-white shadow" style={{ background: n ? "#e5484d" : "#2f6fd1" }}>{n ? "N" : "S"}</div>
    </Html>
  );
}

function Item({ it, lab, selected, animate }: { it: MagnetItem; lab: MagnetLab; selected: boolean; animate: boolean }) {
  const needle = useRef<Group>(null);
  const body = useRef<Group>(null);
  const live = useRef({ x: it.x, z: it.z, stuck: false });
  useEffect(() => { live.current = { x: it.x, z: it.z, stuck: false }; }, [it.x, it.z, lab.items.length]);
  const magnetic = it.kind === "object" && TEST_MATERIALS[it.test ?? "steel_clip"].magnetic;
  const t = (it.angleDeg * Math.PI) / 180;
  const reading = it.kind === "compass" || selected ? compassReading(lab, it.x, it.z) : null;
  useFrame((_, dt) => {
    if (it.kind === "compass" && needle.current && reading) {
      // The needle swings towards the field direction (damped, like a real one).
      const target = (reading.angleDeg * Math.PI) / 180;
      const cur = needle.current.rotation.y;
      let d = target - cur;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      needle.current.rotation.y = animate ? cur + d * Math.min(1, dt * 6) : target;
    }
    // Magnetic materials creep up the field gradient towards the magnet until they touch it.
    if (magnetic && animate && body.current && !live.current.stuck && !useMagnetUi.getState().dragging) {
      const p = live.current, r = pullStep(lab, p.x, p.z, Math.min(dt, 0.05));
      if (r.moving) {
        p.x = r.x;
        p.z = r.z;
        body.current.position.set(p.x, 0, p.z);
        if (r.stuck) {
          p.stuck = true;
          patchItem(it.id, { x: p.x, z: p.z }); // remember where it stuck
        }
      }
    }
  });
  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    selectItem(it.id);
    drag.id = it.id;
    drag.startX = e.nativeEvent.clientX;
    drag.startY = e.nativeEvent.clientY;
    if (controlsRef.current) controlsRef.current.enabled = false;
  };
  const hover = { onPointerOver: () => (document.body.style.cursor = "grab"), onPointerOut: () => (document.body.style.cursor = "") };
  const [L, W, H] = SIZES.bar;
  const ring = selected ? <mesh position={[0, 0.0004, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.045, 0.048, 40]} /><meshBasicMaterial color="#2f80ed" /></mesh> : null;
  let model: React.ReactNode = null;
  switch (it.kind) {
    case "bar":
      model = (
        <group rotation={[0, t, 0]} position={[0, MID, 0]}>
          <mesh position={[L / 4, 0, 0]} castShadow><boxGeometry args={[L / 2, H, W]} /><Mat c="#e5484d" r={0.5} /></mesh>
          <mesh position={[-L / 4, 0, 0]} castShadow><boxGeometry args={[L / 2, H, W]} /><Mat c="#4c6ef5" r={0.5} /></mesh>
          <PoleTag at={[L / 2 - 0.008, H, 0]} n /><PoleTag at={[-L / 2 + 0.008, H, 0]} n={false} />
        </group>
      );
      break;
    case "horseshoe": {
      const h = SIZES.horseshoe, off = h.gap / 2 + h.width / 2;
      model = (
        <group rotation={[0, t, 0]} position={[0, MID, 0]}>
          {[-1, 1].map((s) => <mesh key={s} position={[0, 0, s * off]} castShadow><boxGeometry args={[h.arm, h.height, h.width]} /><Mat c="#9ca3af" m={0.6} r={0.35} /></mesh>)}
          <mesh position={[-h.arm / 2 - h.width / 2, 0, 0]} castShadow><boxGeometry args={[h.width, h.height, off * 2 + h.width]} /><Mat c="#9ca3af" m={0.6} r={0.35} /></mesh>
          <mesh position={[h.arm / 2 - 0.006, 0, -off]}><boxGeometry args={[0.012, h.height + 0.0005, h.width + 0.0005]} /><Mat c="#e5484d" /></mesh>
          <mesh position={[h.arm / 2 - 0.006, 0, off]}><boxGeometry args={[0.012, h.height + 0.0005, h.width + 0.0005]} /><Mat c="#4c6ef5" /></mesh>
          <PoleTag at={[h.arm / 2, h.height, -off]} n /><PoleTag at={[h.arm / 2, h.height, off]} n={false} />
        </group>
      );
      break;
    }
    case "coil": {
      const { length, radius } = SIZES.coil, north = (it.current ?? 2) >= 0;
      model = (
        <group rotation={[0, t, 0]} position={[0, radius, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[radius * 0.55, radius * 0.55, length * (it.core ? 1.15 : 1), 16]} /><Mat c={it.core ? "#6b7280" : "#e5e7eb"} m={it.core ? 0.7 : 0} r={0.4} o={it.core ? 1 : 0.4} /></mesh>
          {Array.from({ length: 14 }, (_, k) => (
            <mesh key={k} position={[-length / 2 + ((k + 0.5) / 14) * length, 0, 0]} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[radius * 0.75, 0.0014, 6, 20]} /><Mat c="#c8743a" m={0.6} r={0.3} /></mesh>
          ))}
          {it.current ? <><PoleTag at={[length / 2 + 0.004, radius, 0]} n={north} /><PoleTag at={[-length / 2 - 0.004, radius, 0]} n={!north} /></> : null}
        </group>
      );
      break;
    }
    case "wire":
      model = (
        <group>
          <mesh position={[0, 0.02, 0]} castShadow><cylinderGeometry args={[0.0018, 0.0018, 0.04, 10]} /><Mat c="#c8743a" m={0.7} r={0.3} /></mesh>
          <Html position={[0, 0.045, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
            <div className="tag whitespace-nowrap px-2 py-0.5 text-[11px] font-bold">{(it.current ?? 5) >= 0 ? "⊙" : "⊗"} {Math.abs(it.current ?? 5)} A {(it.current ?? 5) >= 0 ? "up" : "down"}</div>
          </Html>
        </group>
      );
      break;
    case "compass":
      model = (
        <group>
          <mesh position={[0, 0.002, 0]}><cylinderGeometry args={[0.009, 0.009, 0.004, 24]} /><Mat c="#f8fafc" r={0.4} /></mesh>
          <group ref={needle} position={[0, 0.0045, 0]}>
            <mesh position={[0.004, 0, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.0016, 0.008, 6]} /><Mat c="#e5484d" /></mesh>
            <mesh position={[-0.004, 0, 0]} rotation={[0, 0, Math.PI / 2]}><coneGeometry args={[0.0016, 0.008, 6]} /><Mat c="#9ca3af" /></mesh>
          </group>
        </group>
      );
      break;
    case "object": {
      const k = it.test ?? "steel_clip";
      const c = { steel_clip: "#9ca3af", iron_nail: "#6b7280", nickel: "#cbd5e1", copper: "#c8743a", aluminium: "#e5e7eb", plastic: "#f472b6", wood: "#b07a47" }[k];
      model = (
        <mesh position={[0, 0.0015, 0]} castShadow>
          {k === "iron_nail" || k === "wood" ? <boxGeometry args={[0.025, 0.003, 0.003]} /> : k === "steel_clip" ? <torusGeometry args={[0.005, 0.0008, 6, 16]} /> : <cylinderGeometry args={[0.007, 0.007, 0.0018, 18]} />}
          <Mat c={c} m={k === "plastic" || k === "wood" ? 0 : 0.7} r={0.35} />
        </mesh>
      );
      break;
    }
  }
  return (
    <group ref={body} position={[it.x, 0, it.z]} onPointerDown={down} {...hover}>
      {model}
      {ring}
      {selected && reading && (
        <Html position={[0, 0.03, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
          <div className="tag tag-dot tag-fact whitespace-nowrap px-2 py-0.5 text-[11px] font-bold">{formatTesla(reading.tesla)}</div>
        </Html>
      )}
    </group>
  );
}

// ---------- dragging items across the table ----------

const drag = { id: "", startX: 0, startY: 0, moved: false, last: 0 };

function DragController() {
  const { camera, gl } = useThree();
  useEffect(() => {
    const plane = new Plane(new Vector3(0, 1, 0), -LAB_ORIGIN[1]), ray = new Raycaster(), ndc = new Vector2(), hit = new Vector3();
    const move = (e: PointerEvent) => {
      if (!drag.id) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 4) return;
      if (!drag.moved) { drag.moved = true; useMagnetUi.setState({ dragging: true }); document.body.style.cursor = "grabbing"; }
      // ~10 updates a second while dragging keeps weak devices smooth; the full-quality field follows on release.
      if (performance.now() - drag.last < 90) return;
      drag.last = performance.now();
      const r = gl.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(plane, hit)) return;
      const x = Math.max(-TABLE_HALF[0] + 0.01, Math.min(TABLE_HALF[0] - 0.01, (hit.x - LAB_ORIGIN[0]) / K));
      const z = Math.max(-TABLE_HALF[1] + 0.01, Math.min(TABLE_HALF[1] - 0.01, (hit.z - LAB_ORIGIN[2]) / K));
      patchItem(drag.id, { x, z });
    };
    const up = () => {
      if (!drag.id) return;
      const id = drag.id, moved = drag.moved;
      drag.id = "";
      drag.moved = false;
      if (controlsRef.current) controlsRef.current.enabled = true;
      document.body.style.cursor = "";
      if (moved) { useMagnetUi.setState({ dragging: false }); selectItem(id); }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
  }, [camera, gl]);
  return null;
}

export { patchItem };
