"use client";

// Signals spreading through a floor plan. The coloured map is the real
// strength (path loss plus a typical loss for each wall the straight line
// crosses); the moving fronts are a wave simulation of the same plan, so
// reflections, shadows behind walls and spreading through doorways appear on
// their own. Drag the source or the device to move them.

import { Line, RoundedBox } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { DataTexture, LinearFilter, Plane, Raycaster, RGBAFormat, Vector2, Vector3, type Mesh, type MeshBasicMaterial } from "three";
import { Html } from "@/components/world/html";
import { useSim } from "@/lib/store";
import { patchSignal, signalReception, type SignalState } from "@/lib/modules";
import { WaveField, discCells, paintSegment, type Driver } from "@/lib/engine/wave2d";
import { PLAN, SIGNAL_KINDS, WALL_LOSS, formatFrequency, formatLength, formatStrength, reception, shownWavelength, strengthLevel, wallWaveProps, type WallMaterial } from "@/lib/engine/waves";
import { controlsRef } from "../camera";
import { Mat } from "../assets";

const NX = 180;
const DX = (2 * PLAN.x) / NX;
const NZ = Math.round((2 * PLAN.z) / DX);
const HEAT = 2; // heat map: one value per 2×2 wave cells
const WALL_H = 0.85;
const SHOWN_SPEED = 1; // m/s: the wave fronts are slowed right down

export const WALL_COLORS: Record<WallMaterial, string> = { drywall: "#e7e2d6", wood: "#b98a5b", glass: "#bfe6ff", brick: "#b8614a", concrete: "#9aa1a8", metal: "#7d8b99" };

const Tag = ({ children, tone }: { children: React.ReactNode; tone?: "fact" | "warning" }) => <div className={`tag flex items-center gap-1.5 whitespace-nowrap px-2.5 py-0.5 text-[12px] ${tone ? `tag-dot tag-${tone}` : ""}`}>{children}</div>;

const toCell = (x: number, z: number): [number, number] => [(x + PLAN.x) / DX, (z + PLAN.z) / DX];

function buildField(s: SignalState): WaveField | null {
  if (SIGNAL_KINDS[s.kind].band === "light") return null;
  const f = new WaveField(NX, NZ, DX, SHOWN_SPEED);
  for (const w of s.walls) {
    const p = wallWaveProps(s.kind, w.material);
    paintSegment(f, toCell(...w.from), toCell(...w.to), 1.4, (k) => {
      if (p.rigid) f.rigid[k] = 1;
      else {
        f.speed[k] = SHOWN_SPEED * p.speed;
        f.damping[k] = p.absorb;
      }
    });
  }
  f.addBeach(10);
  return f;
}

/** Strength 0..1 on a coarse grid (recomputed only when the setup changes). */
function heatGrid(s: SignalState): Float32Array {
  const w = NX / HEAT, h = NZ / HEAT;
  const out = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const p: [number, number] = [-PLAN.x + (i + 0.5) * DX * HEAT, -PLAN.z + (j + 0.5) * DX * HEAT];
    out[j * w + i] = strengthLevel(s.kind, reception(s.kind, s.source, p, s.walls, s.soundHz));
  }
  return out;
}

/** Red (nothing) through yellow to green (strong). */
function heatColor(v: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [[0, [229, 72, 77]], [0.35, [247, 144, 52]], [0.6, [246, 206, 70]], [0.8, [140, 201, 96]], [1, [48, 164, 108]]];
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [a, ca] = stops[i - 1], [b, cb] = stops[i];
      const t = (v - a) / (b - a);
      return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
    }
  }
  return stops[stops.length - 1][1];
}

function useDrag(which: "source" | "device") {
  const { camera, gl } = useThree();
  const dragging = useRef(false);
  useEffect(() => {
    const ray = new Raycaster(), ndc = new Vector2(), hit = new Vector3(), floor = new Plane(new Vector3(0, 1, 0), -0.05);
    let last = 0;
    const move = (e: PointerEvent) => {
      if (!dragging.current || performance.now() - last < 40) return;
      last = performance.now();
      const r = gl.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(floor, hit)) return;
      const cur = useSim.getState().modules;
      if (cur.signal) useSim.getState().set({ modules: { ...cur, signal: patchSignal(cur.signal, { [which]: [hit.x, hit.z] }) } });
    };
    const up = () => {
      if (!dragging.current) return;
      dragging.current = false;
      if (controlsRef.current) controlsRef.current.enabled = true;
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [camera, gl, which]);
  return {
    onPointerDown: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      dragging.current = true;
      if (controlsRef.current) controlsRef.current.enabled = false;
      document.body.style.cursor = "grabbing";
    },
    onPointerOver: () => (document.body.style.cursor = "grab"),
    onPointerOut: () => !dragging.current && (document.body.style.cursor = ""),
  };
}

function SourceModel({ s }: { s: SignalState }) {
  const drag = useDrag("source");
  const led = useRef<Mesh>(null);
  const band = SIGNAL_KINDS[s.kind].band;
  useFrame(({ clock }) => {
    if (led.current) led.current.scale.setScalar(0.8 + 0.4 * Math.abs(Math.sin(clock.elapsedTime * 3)));
  });
  return (
    <group position={[s.source[0], 0, s.source[1]]} {...drag}>
      {band === "light" ? (
        <>
          <mesh position={[0, 0.6, 0]} castShadow>
            <cylinderGeometry args={[0.03, 0.05, 1.2, 10]} />
            <Mat c="#5f6670" />
          </mesh>
          <mesh ref={led} position={[0, 1.25, 0]}>
            <sphereGeometry args={[0.16, 20, 16]} />
            <meshStandardMaterial color="#fff7d6" emissive="#ffd36b" emissiveIntensity={2} />
          </mesh>
          <pointLight position={[0, 1.25, 0]} color="#ffdc8a" intensity={2.5} distance={6} decay={2} />
        </>
      ) : band === "sound" ? (
        <>
          <RoundedBox args={[0.34, 0.52, 0.3]} radius={0.04} position={[0, 0.26, 0]} castShadow>
            <Mat c="#2b3038" />
          </RoundedBox>
          {[0.36, 0.14].map((y, i) => (
            <mesh key={y} position={[0.16, y, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[i ? 0.06 : 0.11, i ? 0.06 : 0.11, 0.03, 20]} />
              <Mat c="#5f6670" />
            </mesh>
          ))}
        </>
      ) : (
        <>
          <RoundedBox args={[0.46, 0.1, 0.32]} radius={0.03} position={[0, 0.08, 0]} castShadow>
            <Mat c="#f4f6f8" />
          </RoundedBox>
          {[-0.15, 0.15].map((x) => (
            <mesh key={x} position={[x, 0.32, -0.12]} castShadow>
              <cylinderGeometry args={[0.02, 0.02, 0.42, 8]} />
              <Mat c="#2b3038" />
            </mesh>
          ))}
          <mesh ref={led} position={[0.17, 0.135, 0.165]}>
            <sphereGeometry args={[0.025, 10, 8]} />
            <meshBasicMaterial color="#30d158" />
          </mesh>
        </>
      )}
      <Html position={[0, band === "light" ? 1.65 : 0.85, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <Tag>{SIGNAL_KINDS[s.kind].source}</Tag>
      </Html>
    </group>
  );
}

function DeviceModel({ s }: { s: SignalState }) {
  const drag = useDrag("device");
  const r = signalReception(s);
  const band = SIGNAL_KINDS[s.kind].band;
  return (
    <group position={[s.device[0], 0, s.device[1]]} {...drag}>
      {band === "sound" ? (
        <>
          <mesh position={[0, 0.35, 0]} castShadow>
            <capsuleGeometry args={[0.12, 0.4, 6, 12]} />
            <Mat c="#2f80ed" />
          </mesh>
          <mesh position={[0, 0.82, 0]} castShadow>
            <sphereGeometry args={[0.13, 16, 12]} />
            <Mat c="#f2c6a0" />
          </mesh>
        </>
      ) : (
        <RoundedBox args={[0.2, 0.38, 0.04]} radius={0.02} position={[0, 0.22, 0]} rotation={[-0.25, 0, 0]} castShadow>
          <Mat c="#1c1e22" />
        </RoundedBox>
      )}
      <Html position={[0, 1.1, 0]} center zIndexRange={[16, 0]} style={{ pointerEvents: "none" }}>
        <Tag tone={r.bars >= 3 ? "fact" : r.bars <= 1 ? "warning" : undefined}>
          {band === "sound" || band === "light" ? (
            r.quality
          ) : (
            <span className="flex items-end gap-[2px]" aria-label={`${r.bars} of 4 bars`}>
              {[1, 2, 3, 4].map((b) => (
                <span key={b} className="inline-block w-[3px] rounded-[1px]" style={{ height: 3 + b * 2.5, background: b <= r.bars ? "currentColor" : "rgba(127,127,127,.35)" }} />
              ))}
            </span>
          )}{" "}
          · {formatStrength(s.kind, r)}
        </Tag>
      </Html>
    </group>
  );
}

export function SignalModule({ animate }: { animate: boolean }) {
  const s = useSim((st) => st.modules.signal);
  return s ? <SignalPlan s={s} animate={animate} /> : null;
}

/** The plan's running wave simulation (refs, so the frame loop may change it freely). */
interface Sim {
  key: string;
  field: WaveField | null;
  driverKey: string;
  driver: Driver[];
}

function SignalPlan({ s, animate }: { s: SignalState; animate: boolean }) {
  const { kind, walls, soundHz, view } = s;
  const sim = useRef<Sim | null>(null);
  const mat = useRef<MeshBasicMaterial>(null);
  const tex = useRef<DataTexture | null>(null);
  const drawn = useRef("");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed when what it depends on changes
  const heat = useMemo(() => heatGrid(s), [kind, walls, s.source, soundHz]);
  const shown = shownWavelength(kind, soundHz);
  const freq = SHOWN_SPEED / shown.shown;
  const fieldKey = JSON.stringify([kind, walls, animate]);
  const driverKey = `${s.source[0]},${s.source[1]},${freq}`;
  const drawKey = `${fieldKey}:${driverKey}:${view}`;
  useEffect(() => {
    const holder = tex;
    return () => holder.current?.dispose();
  }, []);

  useFrame((_, dt) => {
    const material = mat.current;
    if (!material) return;
    if (!tex.current) {
      const t = new DataTexture(new Uint8Array(NX * NZ * 4), NX, NZ, RGBAFormat);
      t.magFilter = t.minFilter = LinearFilter;
      tex.current = t;
    }
    if (material.map !== tex.current) {
      material.map = tex.current;
      material.needsUpdate = true;
    }
    if (sim.current?.key !== fieldKey) sim.current = { key: fieldKey, field: buildField(s), driverKey: "", driver: [] };
    const run = sim.current;
    const field = run.field;
    if (run.driverKey !== driverKey) {
      run.driverKey = driverKey;
      run.driver = field ? [{ cells: discCells(field, ...toCell(...s.source), 1.6), amplitude: 1, frequency: freq }] : [];
      // Reduced motion: let the waves fill the plan once, then hold still.
      if (field && !animate) for (let i = 0; i < 300; i++) field.advance(1 / 60, run.driver, 4);
    }
    const running = field && animate && view !== "strength" && !useSim.getState().paused;
    // Heat-only, reduced-motion and paused views keep exactly the same pixels.
    if (!running && drawn.current === drawKey) return;
    if (running) field.advance(Math.min(dt, 1 / 30), run.driver, 4);
    const data = tex.current.image.data as Uint8Array;
    const hw = NX / HEAT;
    const showHeat = view !== "waves";
    const showWaves = view !== "strength" && field;
    for (let row = 0; row < NZ; row++) {
      // Texture rows run from the front of the plan (+z) to the back.
      const j = NZ - 1 - row;
      for (let i = 0; i < NX; i++) {
        const o = (row * NX + i) * 4;
        const k = j * NX + i;
        let [r, g, b] = showHeat ? heatColor(heat[Math.floor(j / HEAT) * hw + Math.floor(i / HEAT)]) : [255, 255, 255];
        let a = showHeat ? 150 : 0;
        if (showWaves) {
          const u = Math.max(-1, Math.min(1, field.u[k] * 2.2));
          if (u > 0) [r, g, b] = [r + (255 - r) * u * 0.8, g + (255 - g) * u * 0.8, b + (255 - b) * u * 0.8];
          else [r, g, b] = [r * (1 + u * 0.55), g * (1 + u * 0.55), b * (1 + u * 0.4)];
          a = Math.max(a, Math.round(Math.abs(u) * 210));
        }
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = a;
      }
    }
    tex.current.needsUpdate = true;
    drawn.current = drawKey;
  });

  const r = signalReception(s);
  const k = SIGNAL_KINDS[kind];
  const materials = [...new Set(walls.map((w) => w.material))];
  const scale = shown.real / shown.shown;
  return (
    <group>
      <RoundedBox args={[2 * PLAN.x + 0.2, 0.03, 2 * PLAN.z + 0.2]} radius={0.01} position={[0, 0.015, 0]} receiveShadow>
        <Mat c="#f7f4ec" r={0.95} />
      </RoundedBox>
      <mesh position={[0, 0.034, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2 * PLAN.x, 2 * PLAN.z]} />
        <meshBasicMaterial ref={mat} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {walls.map((w) => {
        const len = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
        const glass = w.material === "glass";
        return (
          <mesh key={w.id} position={[(w.from[0] + w.to[0]) / 2, WALL_H / 2, (w.from[1] + w.to[1]) / 2]} rotation={[0, -Math.atan2(w.to[1] - w.from[1], w.to[0] - w.from[0]), 0]} castShadow={!glass} receiveShadow>
            <boxGeometry args={[len + 0.12, glass ? WALL_H * 0.8 : WALL_H, 0.12]} />
            {glass ? <meshStandardMaterial color={WALL_COLORS.glass} transparent opacity={0.45} roughness={0.05} depthWrite={false} /> : <Mat c={WALL_COLORS[w.material]} r={w.material === "metal" ? 0.3 : 0.85} m={w.material === "metal" ? 0.7 : 0} />}
          </mesh>
        );
      })}
      {/* The straight line between them: what the strength model counts walls along. */}
      <Line points={[[s.source[0], 0.07, s.source[1]], [s.device[0], 0.07, s.device[1]]]} color="#1c1e22" lineWidth={1.5} dashed dashSize={0.12} gapSize={0.09} transparent opacity={0.55} />
      <SourceModel s={s} />
      <DeviceModel s={s} />
      <Html position={[0, 1.55, -PLAN.z]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <Tag tone="fact">
          {k.name} · {formatFrequency(kind === "sound" ? soundHz : k.frequency)} · wavelength {formatLength(shown.real)}
          {k.band !== "light" && !shown.toScale ? ` (drawn ${scale < 1 ? `${(1 / scale).toFixed(0)}× bigger` : `${scale.toFixed(1)}× smaller`})` : ""}
        </Tag>
      </Html>
      <Html position={[0, 0.06, PLAN.z + 0.35]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <div className="flex items-center gap-2 whitespace-nowrap">
          {materials.map((m) => (
            <span key={m} className="ground-label flex items-center gap-1 !text-ink-2 ![text-shadow:none]">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: WALL_COLORS[m] }} />
              {m} −{Number.isFinite(wallLoss(kind, m)) ? `${wallLoss(kind, m)} dB` : "all"}
            </span>
          ))}
          <span className="ground-label !text-ink-2 ![text-shadow:none]">{r.walls.length ? `${r.walls.length} wall${r.walls.length > 1 ? "s" : ""} in the way` : "clear line"}</span>
        </div>
      </Html>
    </group>
  );
}

function wallLoss(kind: SignalState["kind"], m: WallMaterial): number {
  return WALL_LOSS[SIGNAL_KINDS[kind].band][m];
}
