"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Color, Object3D, type Group, type InstancedMesh, type Mesh } from "three";
import { Html } from "@/components/world/html";
import { noteFocus, useSim } from "@/lib/store";
import { circuitLive, siFormat } from "@/lib/modules";
import { BOARD_COLS, BOARD_ROWS, PART_INFO, adjacent, placePart, resistorBands, solveCircuit, type Board, type CircuitResult, type CircuitState, type Part, type Pt } from "@/lib/engine/circuit";
import { editBoard, selectPart, useCircuitUi } from "@/lib/circuit-ui";
import { Mat } from "../assets";

// The board lies on the workshop mat. Grid points are S apart (board units); the
// whole board is scaled by SCALE. Part models are built along +x from a to b.
export const BOARD_POS: [number, number, number] = [-1.2, 0.08, 1.1];
const SCALE = 1.6;
const S = 0.24;
const Y = 0.03; // top of the board surface
const local = ([c, r]: Pt): [number, number] => [(c - (BOARD_COLS - 1) / 2) * S, (r - (BOARD_ROWS - 1) / 2) * S];
const DOTS_PER_EDGE = 4;
const MAX_EDGES = 260;

/** Dots drift at a speed proportional to the current (board units/s per amp), clamped so tiny and huge currents stay visible. */
const driftSpeed = (amps: number) => (amps < 1e-6 ? 0 : Math.min(0.9, Math.max(0.012, amps * 0.35)));

function useTransient(board: Board, animate: boolean) {
  // Capacitors need time steps; everything else is solved once per change.
  const hasTime = board.parts.some((p) => p.kind === "capacitor");
  // Capacitor charge carried between time steps (one mutable object for the board's lifetime).
  const [state] = useState<CircuitState>(() => ({ cap: {} }));
  const steady = useMemo(() => solveCircuit(board, state), [board, state]);
  const [live, setLive] = useState<CircuitResult | null>(null);
  const last = useRef(0);
  useFrame(({ clock }, dt) => {
    if (!hasTime || !animate) return;
    // Real time, in 5 ms steps (at most 8 a frame, so slow devices run in slow motion).
    const steps = Math.min(8, Math.max(1, Math.round(Math.min(dt, 0.05) / 0.005)));
    let r: CircuitResult | null = null;
    for (let k = 0; k < steps; k++) r = solveCircuit(board, state, 0.005);
    circuitLive.board = board;
    circuitLive.result = r;
    if (clock.elapsedTime - last.current > 0.1) {
      last.current = clock.elapsedTime;
      setLive(r);
    }
  });
  const result = hasTime && live ? live : steady;
  useEffect(() => {
    if (!hasTime) {
      circuitLive.board = board;
      circuitLive.result = steady;
    }
  }, [board, steady, hasTime]);
  return result;
}

export function CircuitBoard3D({ board, animate }: { board: Board; animate: boolean }) {
  const result = useTransient(board, animate);
  const building = useCircuitUi((u) => u.building);
  const selected = useCircuitUi((u) => u.selected);

  // Fuses blow, LEDs and bulbs burn out: mark them broken once (the next solve then opens them).
  useEffect(() => {
    const burnt = board.parts.filter((p) => !p.broken && result.parts[p.id]?.burns);
    if (!burnt.length) return;
    const s = useSim.getState();
    s.set({ modules: { ...s.modules, circuit: { ...board, parts: board.parts.map((p) => (burnt.includes(p) ? { ...p, broken: true } : p)) } } });
    const p = burnt[0];
    noteFocus({ kind: "circuit_event", id: p.id, label: p.kind === "fuse" ? `The fuse "${p.id}" just blew (too much current)` : `The ${PART_INFO[p.kind].name.toLowerCase()} "${p.id}" just burnt out (too much current)` });
  }, [board, result]);

  const wires = board.parts.filter((p) => p.kind === "wire");
  const others = board.parts.filter((p) => p.kind !== "wire");
  return (
    <group position={BOARD_POS} scale={SCALE}>
      <RoundedBox args={[(BOARD_COLS - 1) * S + 0.3, 0.06, (BOARD_ROWS - 1) * S + 0.3]} radius={0.02} position={[0, -0.03 + Y - 0.03, 0]} receiveShadow>
        <Mat c="#f6f1e7" r={0.9} />
      </RoundedBox>
      <Wires wires={wires} result={result} selected={selected} />
      <Junctions parts={board.parts} />
      {others.map((p) => (
        <PartModel key={p.id} part={p} res={result.parts[p.id]} selected={selected === p.id} readings={board.readings} animate={animate} />
      ))}
      <FlowDots board={board} result={result} animate={animate} />
      {building && <GridDots />}
      <Html position={[0, 0, ((BOARD_ROWS - 1) * S) / 2 + 0.11]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
        <div className="ground-label whitespace-nowrap !text-ink-2 ![text-shadow:none]">
          {result.short ? "⚠ Short circuit!" : board.flow === "electron" ? "Blue dots: electrons drifting from − to +" : "Yellow dots: conventional current from + to −"}
        </div>
      </Html>
    </group>
  );
}

// ---------- wires and junctions (one draw call each) ----------

function Wires({ wires, result, selected }: { wires: Part[]; result: CircuitResult; selected: string | null }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new Object3D(), col = new Color();
    wires.forEach((w, i) => {
      const [x1, z1] = local(w.a), [x2, z2] = local(w.b);
      o.position.set((x1 + x2) / 2, Y + 0.004, (z1 + z2) / 2);
      o.rotation.set(0, -Math.atan2(z2 - z1, x2 - x1), 0);
      o.scale.set(Math.hypot(x2 - x1, z2 - z1) + 0.012, 1, 1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      // Wires carrying current look a touch warmer, like they are working.
      m.setColorAt(i, col.set(w.id === selected ? "#2f80ed" : Math.abs(result.parts[w.id]?.i ?? 0) > 1e-4 ? "#3a2f2a" : "#2a2d33"));
    });
    m.count = wires.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [wires, result, selected]);
  const pick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4 || e.instanceId === undefined) return;
    const w = wires[e.instanceId];
    if (!w) return;
    e.stopPropagation();
    const ui = useCircuitUi.getState();
    if (ui.building && ui.tool === "erase") editBoard((b) => ({ ...b, parts: b.parts.filter((p) => p.id !== w.id) }));
    else if (!ui.building || ui.tool === "select") selectPart(w.id);
  };
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAX_EDGES]} onClick={pick} frustumCulled={false}>
      <boxGeometry args={[1, 0.008, 0.014]} />
      <meshStandardMaterial roughness={0.5} />
    </instancedMesh>
  );
}

function Junctions({ parts }: { parts: Part[] }) {
  const ref = useRef<InstancedMesh>(null);
  const points = useMemo(() => {
    const deg = new Map<string, number>();
    for (const p of parts) for (const q of [p.a, p.b]) deg.set(`${q}`, (deg.get(`${q}`) ?? 0) + 1);
    return [...deg].filter(([, d]) => d >= 3).map(([k]) => k.split(",").map(Number) as Pt);
  }, [parts]);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new Object3D();
    points.forEach((p, i) => {
      const [x, z] = local(p);
      o.position.set(x, Y + 0.006, z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.count = points.length;
    m.instanceMatrix.needsUpdate = true;
  }, [points]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 120]} frustumCulled={false}>
      <cylinderGeometry args={[0.016, 0.016, 0.008, 12]} />
      <meshStandardMaterial color="#1c1e22" />
    </instancedMesh>
  );
}

// ---------- current flow ----------

// Charge carriers are always in the wires: dots are drawn everywhere current
// *could* flow, and move only when it does. In a loop the current is the same
// all the way round, so an open switch stops it everywhere at once.

function FlowDots({ board, result, animate }: { board: Board; result: CircuitResult; animate: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  const tmp = useMemo(() => new Object3D(), []);
  const phase = useRef(new Map<string, number>());
  const speedNow = useRef(new Map<string, number>());
  const electron = board.flow === "electron";
  const lanes = useMemo(
    () =>
      board.parts
        .filter((p) => !p.broken && !(p.kind === "switch" && !p.closed) && p.kind !== "capacitor" && p.kind !== "voltmeter")
        .map((p) => {
          const r = result.parts[p.id];
          // Battery readings are "current leaving +", which flows b → a inside it.
          const iab = r ? (p.kind === "battery" ? -r.i : r.i) : 0;
          return { p, target: Math.sign(iab) * driftSpeed(Math.abs(iab)) * (electron ? -1 : 1), a: local(p.a), b: local(p.b) };
        }),
    [board, result, electron],
  );
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    const step = Math.min(dt, 0.05);
    let n = 0;
    for (const l of lanes) {
      if (n + DOTS_PER_EDGE > MAX_EDGES * DOTS_PER_EDGE) break;
      const len = Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]);
      // Ease towards the new current so opening or closing a switch reads as a stop or a start.
      const cur = speedNow.current.get(l.p.id) ?? l.target;
      const v = animate ? cur + (l.target - cur) * Math.min(1, step * 7) : cur;
      speedNow.current.set(l.p.id, v);
      let ph = phase.current.get(l.p.id) ?? 0;
      if (animate) ph = (ph + (v * step) / len) % 1;
      phase.current.set(l.p.id, ph);
      for (let k = 0; k < DOTS_PER_EDGE; k++) {
        const t = (((k / DOTS_PER_EDGE + ph) % 1) + 1) % 1;
        tmp.position.set(l.a[0] + (l.b[0] - l.a[0]) * t, Y + 0.022, l.a[1] + (l.b[1] - l.a[1]) * t);
        tmp.updateMatrix();
        m.setMatrixAt(n++, tmp.matrix);
      }
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAX_EDGES * DOTS_PER_EDGE]} frustumCulled={false}>
      <sphereGeometry args={[0.011, 6, 4]} />
      <meshBasicMaterial color={electron ? "#2f80ed" : "#f0a800"} toneMapped={false} />
    </instancedMesh>
  );
}

// ---------- building: grid dots ----------

function GridDots() {
  const ref = useRef<InstancedMesh>(null);
  const dots = useRef<InstancedMesh>(null);
  const pending = useCircuitUi((u) => u.pending);
  const tool = useCircuitUi((u) => u.tool);
  const [hover, setHover] = useState<Pt | null>(null);
  const points = useMemo(() => Array.from({ length: BOARD_COLS * BOARD_ROWS }, (_, i) => [i % BOARD_COLS, Math.floor(i / BOARD_COLS)] as Pt), []);
  useLayoutEffect(() => {
    const o = new Object3D();
    for (const m of [ref.current, dots.current]) {
      if (!m) continue;
      points.forEach((p, i) => {
        const [x, z] = local(p);
        o.position.set(x, Y + 0.002, z);
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }, [points]);
  const placing = tool !== "select" && tool !== "erase";
  const tap = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4 || e.instanceId === undefined || !placing) return;
    e.stopPropagation();
    const pt = points[e.instanceId];
    const ui = useCircuitUi.getState();
    const from = ui.pending;
    if (!from) return useCircuitUi.setState({ pending: pt });
    if (from[0] === pt[0] && from[1] === pt[1]) return useCircuitUi.setState({ pending: null });
    const kind = ui.tool as Part["kind"];
    const straight = from[0] === pt[0] || from[1] === pt[1];
    if (kind === "wire" ? straight : adjacent(from, pt)) {
      editBoard((b) => ({ ...b, parts: placePart(b.parts, { kind, a: from, b: pt }) }));
      if (kind === "wire") return useCircuitUi.setState({ pending: pt }); // keep drawing from here
      useCircuitUi.setState({ pending: null });
      const placed = useSim.getState().modules.circuit as Board;
      const part = placed.parts.find((p) => p.kind === kind && ((`${p.a}` === `${from}` && `${p.b}` === `${pt}`)));
      if (part) selectPart(part.id);
    } else useCircuitUi.setState({ pending: pt });
  };
  const preview = pending && hover && (useCircuitUi.getState().tool === "wire" ? pending[0] === hover[0] || pending[1] === hover[1] : adjacent(pending, hover)) ? [local(pending), local(hover)] : null;
  return (
    <>
      <instancedMesh
        ref={ref}
        args={[undefined, undefined, points.length]}
        onClick={tap}
        onPointerMove={(e) => e.instanceId !== undefined && setHover(points[e.instanceId])}
        onPointerOut={() => setHover(null)}
      >
        {/* Generous invisible tap targets; the visible dots are drawn small below. */}
        <sphereGeometry args={[0.05, 8, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={dots} args={[undefined, undefined, points.length]} raycast={() => null}>
        <cylinderGeometry args={[0.011, 0.011, 0.004, 10]} />
        <meshBasicMaterial color={placing ? "#5b7a99" : "#9fb3c8"} />
      </instancedMesh>
      {pending && (
        <mesh position={[local(pending)[0], Y + 0.01, local(pending)[1]]}>
          <cylinderGeometry args={[0.04, 0.04, 0.006, 20]} />
          <meshBasicMaterial color="#2f80ed" />
        </mesh>
      )}
      {preview && (
        <mesh position={[(preview[0][0] + preview[1][0]) / 2, Y + 0.012, (preview[0][1] + preview[1][1]) / 2]} rotation={[0, -Math.atan2(preview[1][1] - preview[0][1], preview[1][0] - preview[0][0]), 0]}>
          <boxGeometry args={[Math.hypot(preview[1][0] - preview[0][0], preview[1][1] - preview[0][1]), 0.004, 0.02]} />
          <meshBasicMaterial color="#2f80ed" transparent opacity={0.6} />
        </mesh>
      )}
    </>
  );
}

// ---------- parts ----------

const Lead = ({ from, to }: { from: number; to: number }) => (
  <mesh position={[(from + to) / 2, 0.012, 0]} rotation={[0, 0, Math.PI / 2]}>
    <cylinderGeometry args={[0.004, 0.004, Math.abs(to - from), 6]} />
    <Mat c="#b8bcc4" m={0.8} r={0.3} />
  </mesh>
);
const H = S / 2; // half a part's length

function PartModel({ part, res, selected, readings, animate }: { part: Part; res: CircuitResult["parts"][string] | undefined; selected: boolean; readings: boolean; animate: boolean }) {
  const [x1, z1] = local(part.a), [x2, z2] = local(part.b);
  const level = res?.level ?? 0;
  const spin = useRef<Group>(null);
  const pulse = useRef<Mesh>(null);
  useFrame(({ clock }, dt) => {
    if (!animate) return;
    if (part.kind === "motor" && spin.current) spin.current.rotation.x += Math.min(level, 2) * dt * 18;
    if (part.kind === "buzzer" && pulse.current) {
      const t = (clock.elapsedTime * 2.2) % 1;
      pulse.current.scale.setScalar(level ? 1 + t * 1.8 : 0.001);
      (pulse.current.material as { opacity: number }).opacity = level ? 0.5 * (1 - t) : 0;
    }
  });
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return;
    e.stopPropagation();
    const ui = useCircuitUi.getState();
    if (ui.building && ui.tool === "erase") {
      editBoard((b) => ({ ...b, parts: b.parts.filter((p) => p.id !== part.id) }));
      return;
    }
    if (ui.building && ui.tool !== "select") return;
    if (part.kind === "switch" && !ui.building) editBoard((b) => ({ ...b, parts: b.parts.map((p) => (p.id === part.id ? { ...p, closed: !p.closed } : p)) }));
    selectPart(part.id);
  };
  const glow = (c: string, k: number) => ({ color: c, emissive: c, emissiveIntensity: k, toneMapped: false });
  const body = (() => {
    switch (part.kind) {
      case "battery":
        return (
          <group rotation={[0, 0, Math.PI / 2]} position={[0, 0.04, 0]}>
            <mesh castShadow><cylinderGeometry args={[0.034, 0.034, 0.17, 18]} /><Mat c="#1c1e22" r={0.4} /></mesh>
            {/* + end (towards a) is copper-gold. */}
            <mesh position={[0, -0.06, 0]}><cylinderGeometry args={[0.035, 0.035, 0.05, 18]} /><Mat c="#f0a800" m={0.4} r={0.3} /></mesh>
            <mesh position={[0, -0.092, 0]}><cylinderGeometry args={[0.012, 0.012, 0.012, 10]} /><Mat c="#d1d5db" m={0.9} r={0.2} /></mesh>
          </group>
        );
      case "resistor": {
        const bands = resistorBands(part.value ?? 100);
        return (
          <group position={[0, 0.02, 0]}>
            <Lead from={-H} to={H} />
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.018, 0.018, 0.1, 14]} /><Mat c="#e8d3a8" r={0.6} {...(Math.abs(res?.p ?? 0) > 0.02 ? { e: "#ff5a1f", ei: Math.min(1.2, Math.abs(res!.p) / 0.25) } : {})} /></mesh>
            {bands.map((c, i) => (
              <mesh key={i} position={[-0.03 + i * 0.02 + (i === 3 ? 0.008 : 0), 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.0186, 0.0186, 0.008, 14]} /><Mat c={c} r={0.5} /></mesh>
            ))}
          </group>
        );
      }
      case "bulb": {
        // Dim filaments glow orange, bright ones near white.
        const hot = Math.min(level, 1.2);
        const c = part.broken ? "#5f6670" : hot < 0.3 ? "#ff8a3d" : hot < 0.7 ? "#ffc56b" : "#fff2c4";
        return (
          <group>
            <Lead from={-H} to={-0.03} /><Lead from={0.03} to={H} />
            <mesh position={[0, 0.025, 0]}><cylinderGeometry args={[0.03, 0.034, 0.04, 14]} /><Mat c="#9ca3af" m={0.6} r={0.3} /></mesh>
            <mesh position={[0, 0.085, 0]}>
              <sphereGeometry args={[0.048, 18, 14]} />
              {part.broken ? <meshStandardMaterial color="#5f6670" transparent opacity={0.5} /> : <meshStandardMaterial {...glow(c, 0.05 + hot * 2.2)} transparent opacity={0.95} />}
            </mesh>
          </group>
        );
      }
      case "switch":
        return (
          <group>
            {[-0.07, 0.07].map((x) => <mesh key={x} position={[x, 0.008, 0]}><cylinderGeometry args={[0.014, 0.014, 0.016, 10]} /><Mat c="#5f6670" /></mesh>)}
            <group position={[-0.07, 0.018, 0]} rotation={[0, 0, part.closed ? 0 : 0.55]}>
              <mesh position={[0.07, 0, 0]} castShadow><boxGeometry args={[0.15, 0.012, 0.022]} /><Mat c={part.closed ? "#30a46c" : "#e5484d"} /></mesh>
            </group>
          </group>
        );
      case "led": {
        const c = { red: "#ff3b30", yellow: "#ffcc00", green: "#34c759", blue: "#2f80ed", white: "#f5f5f5" }[part.color ?? "red"];
        const lit = part.broken ? 0 : Math.min(level, 1.3);
        return (
          <group>
            <Lead from={-H} to={-0.02} /><Lead from={0.02} to={H} />
            <mesh position={[0, 0.03, 0]}><cylinderGeometry args={[0.024, 0.026, 0.04, 16]} /><meshStandardMaterial {...glow(c, part.broken ? 0 : 0.08 + lit * 2.5)} transparent opacity={0.85} /></mesh>
            <mesh position={[0, 0.05, 0]}><sphereGeometry args={[0.024, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial {...glow(c, part.broken ? 0 : 0.08 + lit * 2.5)} transparent opacity={0.85} /></mesh>
          </group>
        );
      }
      case "diode":
        return (
          <group position={[0, 0.02, 0]}>
            <Lead from={-H} to={H} />
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.016, 0.016, 0.07, 14]} /><Mat c="#1c1e22" r={0.4} /></mesh>
            {/* The silver band marks the cathode (b), where current leaves. */}
            <mesh position={[0.025, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.0165, 0.0165, 0.01, 14]} /><Mat c="#d1d5db" m={0.7} /></mesh>
          </group>
        );
      case "capacitor":
        return (
          <group>
            <Lead from={-H} to={-0.02} /><Lead from={0.02} to={H} />
            <mesh position={[0, 0.04, 0]} castShadow><cylinderGeometry args={[0.028, 0.028, 0.075, 16]} /><Mat c="#1f5fbf" r={0.4} /></mesh>
            <mesh position={[0.012, 0.04, 0.026]}><boxGeometry args={[0.008, 0.07, 0.004]} /><Mat c="#d1d5db" /></mesh>
          </group>
        );
      case "fuse":
        return (
          <group position={[0, 0.022, 0]}>
            <Lead from={-H} to={H} />
            <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.016, 0.016, 0.09, 14]} /><meshStandardMaterial color="#e0f2fe" transparent opacity={0.4} /></mesh>
            {[-0.05, 0.05].map((x) => <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.018, 0.018, 0.02, 14]} /><Mat c="#d1d5db" m={0.8} r={0.3} /></mesh>)}
            {!part.broken && <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.002, 0.002, 0.08, 4]} /><Mat c="#4b5563" /></mesh>}
          </group>
        );
      case "motor":
        return (
          <group position={[0, 0.04, 0]}>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.036, 0.036, 0.09, 18]} /><Mat c="#9ca3af" m={0.6} r={0.3} /></mesh>
            <group ref={spin} position={[0, 0.05, 0]}>
              <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.004, 0.004, 0.03, 6]} /><Mat c="#4b5563" /></mesh>
              {[0, 1, 2].map((k) => <mesh key={k} rotation={[(k * Math.PI * 2) / 3, 0, 0]} position={[0, 0, 0]}><boxGeometry args={[0.006, 0.07, 0.016]} /><Mat c="#e5484d" /></mesh>)}
            </group>
          </group>
        );
      case "buzzer":
        return (
          <group>
            <mesh position={[0, 0.02, 0]} castShadow><cylinderGeometry args={[0.04, 0.04, 0.03, 20]} /><Mat c="#1c1e22" r={0.5} /></mesh>
            <mesh ref={pulse} position={[0, 0.04, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.045, 0.003, 6, 28]} /><meshBasicMaterial color="#f0a800" transparent opacity={0} /></mesh>
          </group>
        );
      case "ammeter":
      case "voltmeter":
        return (
          <group position={[0, 0.03, 0]}>
            <RoundedBox args={[0.12, 0.05, 0.09]} radius={0.01} castShadow><Mat c={part.kind === "ammeter" ? "#fde68a" : "#bfdbfe"} r={0.5} /></RoundedBox>
            <mesh position={[0, 0.026, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.032, 20]} /><meshStandardMaterial color="#ffffff" /></mesh>
          </group>
        );
      case "ldr":
      case "thermistor":
        return (
          <group position={[0, 0.02, 0]}>
            <Lead from={-H} to={H} />
            {part.kind === "ldr" ? (
              <mesh rotation={[0, 0, 0]}><cylinderGeometry args={[0.028, 0.028, 0.012, 18]} /><Mat c="#c2410c" r={0.4} /></mesh>
            ) : (
              <mesh><sphereGeometry args={[0.02, 12, 8]} /><Mat c="#1c1e22" r={0.4} /></mesh>
            )}
          </group>
        );
      default:
        return null;
    }
  })();
  const reading = (() => {
    if (!res) return null;
    if (part.broken) return part.kind === "fuse" ? "Fuse blown" : "Burnt out";
    if (part.kind === "switch" && !part.closed) return `Open · ${siFormat(Math.abs(res.v), "V")} across the gap`;
    if (part.kind === "ammeter") return siFormat(res.i, "A");
    if (part.kind === "voltmeter") return siFormat(res.v, "V");
    if (!readings) return null;
    if (part.kind === "switch") return part.closed ? "Closed" : "Open";
    if (part.kind === "battery") return `${siFormat(part.value ?? 6, "V", 1)} · ${siFormat(res.i, "A")}`;
    return `${siFormat(Math.abs(res.v), "V")} · ${siFormat(Math.abs(res.i), "A")}`;
  })();
  return (
    <group position={[(x1 + x2) / 2, Y, (z1 + z2) / 2]} rotation={[0, -Math.atan2(z2 - z1, x2 - x1), 0]}>
      {body}
      {/* Easy tap target that leaves the end dots free for building. */}
      <mesh position={[0, 0.04, 0]} onClick={click} onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "")}>
        <boxGeometry args={[S * 0.62, 0.1, 0.1]} />
        <meshBasicMaterial transparent opacity={selected ? 0.18 : 0} color="#2f80ed" depthWrite={false} />
      </mesh>
      {reading && (
        <Html position={[0, 0.16, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
          <div className={`tag whitespace-nowrap px-2 py-0.5 text-[11px] font-bold ${part.broken || (part.kind === "switch" && !part.closed) ? "tag-dot tag-warning" : part.kind === "ammeter" || part.kind === "voltmeter" ? "tag-dot tag-fact" : ""}`}>{reading}</div>
        </Html>
      )}
    </group>
  );
}
