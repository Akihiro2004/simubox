"use client";

import { Html, Line } from "@react-three/drei";
import { useMemo } from "react";
import { Quaternion, Vector3 } from "three";
import { useSim } from "@/lib/store";
import { compileExpression, sampleExpression } from "@/lib/engine/expr";
import type { Modules } from "@/lib/modules";
import { Mat } from "../assets";

// A standing graph board facing the default camera. 1 unit = U metres.
export const U = 0.3;
export const X_RANGE = 11;
export const Y_RANGE = 7;
const BOARD_CENTER: [number, number, number] = [-0.4, 2.55, -0.9];
const UP = new Vector3(0, 1, 0);

const toBoard = (x: number, y: number): [number, number, number] => [x * U, y * U, 0.02];

function Grid() {
  const lines = useMemo(() => {
    const out: { pts: [number, number, number][]; major: boolean }[] = [];
    for (let x = -X_RANGE; x <= X_RANGE; x++) out.push({ pts: [toBoard(x, -Y_RANGE), toBoard(x, Y_RANGE)], major: x % 5 === 0 });
    for (let y = -Y_RANGE; y <= Y_RANGE; y++) out.push({ pts: [toBoard(-X_RANGE, y), toBoard(X_RANGE, y)], major: y % 5 === 0 });
    return out;
  }, []);
  return (
    <>
      {lines.map((l, i) => (
        <Line key={i} points={l.pts} color={l.major ? "#b8c4d4" : "#dbe2ec"} lineWidth={l.major ? 1.2 : 0.8} />
      ))}
      <Line points={[toBoard(-X_RANGE, 0), toBoard(X_RANGE, 0)]} color="#1c1e22" lineWidth={2} />
      <Line points={[toBoard(0, -Y_RANGE), toBoard(0, Y_RANGE)]} color="#1c1e22" lineWidth={2} />
      {[-10, -5, 5, 10].map((x) => (
        <Html key={`x${x}`} position={toBoard(x, -0.6)} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <div className="text-[11px] font-bold text-ink-3">{x}</div>
        </Html>
      ))}
      {[-5, 5].map((y) => (
        <Html key={`y${y}`} position={toBoard(-0.6, y)} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <div className="text-[11px] font-bold text-ink-3">{y}</div>
        </Html>
      ))}
      <Html position={toBoard(X_RANGE - 0.4, 0.6)} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
        <div className="text-[13px] font-extrabold italic text-ink">x</div>
      </Html>
      <Html position={toBoard(0.6, Y_RANGE - 0.4)} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
        <div className="text-[13px] font-extrabold italic text-ink">y</div>
      </Html>
    </>
  );
}

/** Curve segments clipped to the board; breaks at asymptotes and off-board parts. */
function useCurve(expression: string, xMin: number, xMax: number) {
  return useMemo(() => {
    try {
      const f = compileExpression(expression);
      const pts = sampleExpression(f, Math.max(xMin, -X_RANGE), Math.min(xMax, X_RANGE), 400);
      const segs: [number, number, number][][] = [];
      let cur: [number, number, number][] = [];
      for (const p of pts) {
        if (!p || Math.abs(p[1]) > Y_RANGE) {
          if (cur.length > 1) segs.push(cur);
          cur = [];
        } else cur.push(toBoard(p[0], p[1]));
      }
      if (cur.length > 1) segs.push(cur);
      return segs;
    } catch {
      return [];
    }
  }, [expression, xMin, xMax]);
}

function Curve({ fn }: { fn: Modules["plot"] extends infer P ? (P extends { functions: (infer F)[] } ? F : never) : never }) {
  const segs = useCurve(fn.expression, fn.xMin, fn.xMax);
  const end = segs[segs.length - 1]?.at(-1);
  return (
    <>
      {segs.map((s, i) => (
        <Line key={i} points={s} color={fn.color} lineWidth={3.5} />
      ))}
      {end && (
        <Html position={[end[0] + 0.1, end[1] + 0.18, 0.03]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
          <div className="tag tag-dot flex items-center gap-1.5 px-2.5 py-0.5 text-[12px]" style={{ ["--dot" as string]: fn.color }}>
            {fn.label ?? `y = ${fn.expression}`}
          </div>
        </Html>
      )}
    </>
  );
}

function Arrow2D({ from, to, color, label }: { from: [number, number]; to: [number, number]; color: string; label?: string }) {
  const a = new Vector3(...toBoard(...from)), b = new Vector3(...toBoard(...to));
  const dir = b.clone().sub(a);
  const len = Math.max(0.01, dir.length());
  const q = new Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  const head = Math.min(0.18, len * 0.4);
  return (
    <group position={a} quaternion={q}>
      <mesh position={[0, (len - head) / 2, 0]}>
        <cylinderGeometry args={[0.022, 0.022, len - head, 10]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, len - head / 2, 0]}>
        <coneGeometry args={[0.06, head, 14]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {label && (
        <Html position={[0.15, len / 2, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
          <div className="tag tag-dot flex items-center gap-1.5 px-2.5 py-0.5 text-[12px]" style={{ ["--dot" as string]: color }}>
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

export function MathModule() {
  const plot = useSim((s) => s.modules.plot);
  if (!plot) return null;
  const w = 2 * X_RANGE * U + 0.3, h = 2 * Y_RANGE * U + 0.3;
  return (
    <group position={BOARD_CENTER} rotation={[0, Math.PI / 4, 0]}>
      <mesh position={[0, 0, -0.04]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.12, h + 0.12, 0.06]} />
        <Mat c="#d5dce5" />
      </mesh>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color="#fbfcfe" roughness={0.9} />
      </mesh>
      {[-0.32, 0.32].map((k) => (
        <mesh key={k} position={[k * w, -h / 2 - 0.62, -0.15]} rotation={[0.25, 0, 0]} castShadow>
          <boxGeometry args={[0.07, 1.3, 0.07]} />
          <Mat c="#5f6670" />
        </mesh>
      ))}
      <Grid />
      {plot.functions.map((f) => (
        <Curve key={f.id} fn={f} />
      ))}
      {plot.vectors.map((v) => (
        <Arrow2D key={v.id} from={v.from} to={v.to} color={v.color} label={v.label} />
      ))}
      {plot.points.map((p) => (
        <group key={p.id} position={toBoard(p.x, p.y)}>
          <mesh>
            <sphereGeometry args={[0.07, 16, 12]} />
            <meshBasicMaterial color={p.color} />
          </mesh>
          <Html position={[0.12, 0.2, 0.02]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
            <div className="tag px-2.5 py-0.5 text-[12px]">
              {p.label ? `${p.label} ` : ""}({+p.x.toFixed(2)}, {+p.y.toFixed(2)})
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}
