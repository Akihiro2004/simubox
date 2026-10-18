"use client";

// Ripple tank: a real wave simulation on the water surface. Each cell's wave
// speed comes from the dispersion relation at its depth, so the ripples have
// exactly the wavelength the lesson quotes, slow down over the shallow plate,
// bounce off barriers and spread through gaps on their own.

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BufferAttribute, Color, DoubleSide, PlaneGeometry, type Mesh } from "three";
import { Html } from "@/components/world/html";
import { RIPPLE_TANK, windDrivenRipple, type RippleState } from "@/lib/modules";
import { useSim } from "@/lib/store";
import { WaveField, discCells, paintSegment, type Driver } from "@/lib/engine/wave2d";
import { doppler, formatFrequency, formatLength, formatSpeed, waterWave } from "@/lib/engine/waves";
import { Mat } from "../assets";

const [HX, HZ] = RIPPLE_TANK.half;
const NX = 180;
const DX = (2 * HX) / (NX - 1);
const NY = Math.round((2 * HZ) / DX) + 1;
const SOURCE_X = -1.05;
const BAR_X = -1.35;
/** Visual height boost: real ripples are a centimetre high. */
const LIFT = 5;

const Tag = ({ children, tone }: { children: React.ReactNode; tone?: "fact" | "warning" }) => <div className={`tag flex items-center gap-1.5 whitespace-nowrap px-2.5 py-0.5 text-[12px] ${tone ? `tag-dot tag-${tone}` : ""}`}>{children}</div>;

type Seg = [[number, number], [number, number]];

/** Barrier pieces in tank coordinates (x along the tank, z across it). */
export function barrierSegments(r: RippleState): Seg[] {
  const bx = r.barrierX;
  const g = r.gapWidth / 2;
  switch (r.barrier) {
    case "none":
      return [];
    case "wall":
      return [[[bx, -HZ], [bx, HZ]]];
    case "gap":
      return [[[bx, -HZ], [bx, -g]], [[bx, g], [bx, HZ]]];
    case "double_slit": {
      const s = Math.max(r.separation, r.gapWidth + 0.06) / 2;
      return [[[bx, -HZ], [bx, -s - g]], [[bx, -s + g], [bx, s - g]], [[bx, s + g], [bx, HZ]]];
    }
    case "reflector": {
      const a = (r.reflectorAngle * Math.PI) / 180;
      const h = 0.75;
      return [[[bx - Math.sin(a) * h, -Math.cos(a) * h], [bx + Math.sin(a) * h, Math.cos(a) * h]]];
    }
  }
}

/** The shallow plate covers the far side of a line tilted 25°, so straight waves meet it at an angle. */
const TILT = Math.tan((25 * Math.PI) / 180);
export const overShallowPlate = (x: number, z: number) => x - 0.15 > TILT * z;

function sourcePoints(r: RippleState): [number, number][] {
  if (r.source === "two_point") return [[SOURCE_X, -r.separation / 2], [SOURCE_X, r.separation / 2]];
  return [[SOURCE_X, 0]];
}

const cell = (x: number, z: number): [number, number] => [(x + HX) / DX, (z + HZ) / DX];

function buildField(r: RippleState): WaveField {
  const field = new WaveField(NX, NY, DX);
  const deep = waterWave(r.frequency, r.depth).speed;
  const shallow = waterWave(r.frequency, r.shallowDepth).speed;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const x = -HX + i * DX, z = -HZ + j * DX;
    field.speed[field.index(i, j)] = r.shallow && overShallowPlate(x, z) ? shallow : deep;
  }
  // Sloping "beaches" at the edges, as in a real ripple tank.
  field.addBeach(14);
  for (const [a, b] of barrierSegments(r)) paintSegment(field, cell(...a), cell(...b), 1.1, (k) => (field.rigid[k] = 1));
  return field;
}

function drivers(r: RippleState, field: WaveField, t: number): Driver[] {
  if (r.source === "plane") {
    const cells: number[] = [];
    paintSegment(field, cell(BAR_X, -HZ + 0.12), cell(BAR_X, HZ - 0.12), 0.8, (k) => cells.push(k));
    return [{ cells, amplitude: r.amplitude, frequency: r.frequency }];
  }
  return sourcePoints(r).map(([x, z]) => {
    const [ci, cj] = cell(movingX(r, x, t), z);
    return { cells: discCells(field, ci, cj, 1.6), amplitude: r.amplitude, frequency: r.frequency };
  });
}

/** A moving dipper sweeps along the tank (Doppler effect), then starts over. */
function movingX(r: RippleState, x: number, t: number): number {
  if (!(r.sourceSpeed > 0) || r.source !== "point") return x;
  const span = 2.3;
  return x - 0.15 + ((t * r.sourceSpeed) % span);
}

// Scratch colours for the frame loop (module-level: not React state).
const BASE = new Color("#4e9fc6");
const CREST = new Color("#e9f7ff");
const TROUGH = new Color("#1b4f73");
const BARRIER = new Color("#3b4148");
const tmp = new Color();

/** The tank's running simulation, rebuilt when its structure changes (the waves start again). */
interface Sim {
  key: string;
  field: WaveField;
  still: Driver[];
}

export function RippleTank({ r: raw, animate }: { r: RippleState; animate: boolean }) {
  const r = useMemo(() => windDrivenRipple(raw), [raw]);
  const mesh = useRef<Mesh>(null);
  const dippers = useRef<Mesh[]>([]);
  const sim = useRef<Sim | null>(null);
  const drawn = useRef<{ key: string; view: RippleState["view"] } | null>(null);
  const { frequency, depth, source, separation, barrier, gapWidth, barrierX, sourceSpeed, shallow, shallowDepth } = r;
  // Amplitude and view only change the drawing, so they don't restart the waves.
  const key = JSON.stringify([frequency, depth, source, separation, barrier, gapWidth, barrierX, r.reflectorAngle, shallow, shallowDepth, sourceSpeed, r.amplitude, animate]);
  const moving = sourceSpeed > 0 && source === "point";

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const running = animate && !useSim.getState().paused;
    // A settled or paused field has identical vertices, colours and normals.
    // Keep the existing GPU buffers until either its input or display changes.
    if (!running && drawn.current?.key === key && drawn.current.view === r.view) return;
    if (sim.current?.key !== key) {
      const field = buildField(r);
      sim.current = { key, field, still: drivers(r, field, 0) };
      // Reduced motion: settle the pattern once and show it still.
      if (!animate) for (let s = 0; s < 360; s++) field.advance(1 / 60, moving ? drivers(r, field, field.time) : sim.current.still, 8);
    }
    const { field, still } = sim.current;
    const cur = r;
    if (running) field.advance(Math.min(dt, 1 / 15), moving ? drivers(cur, field, field.time) : still, 12);
    const g = m.geometry;
    if (!g.getAttribute("color")) g.setAttribute("color", new BufferAttribute(new Float32Array(NX * NY * 3), 3));
    const pos = g.getAttribute("position") as BufferAttribute;
    const col = g.getAttribute("color") as BufferAttribute;
    const nor = g.getAttribute("normal") as BufferAttribute;
    const A = Math.max(cur.amplitude, 1e-4);
    const intensity = cur.view === "intensity";
    const u = field.u;
    // The plane lies in its own XY (the mesh is turned flat): row 0 is the back of the tank, like the field's j = 0; height is local z.
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const k = j * NX + i;
        const h = intensity ? 0 : u[k];
        pos.setZ(k, h * LIFT);
        if (field.rigid[k]) tmp.copy(BARRIER);
        else if (intensity) tmp.copy(TROUGH).lerp(CREST, Math.min(1, Math.sqrt(field.intensity[k]) / (A * 0.75)));
        else {
          const v = Math.max(-1, Math.min(1, h / A));
          tmp.copy(BASE).lerp(v > 0 ? CREST : TROUGH, Math.abs(v) * 0.85);
        }
        col.setXYZ(k, tmp.r, tmp.g, tmp.b);
        // Normal from the height slope (cheaper than recomputing the mesh), in the plane's own axes.
        const l = i > 0 ? u[k - 1] : u[k], rr = i < NX - 1 ? u[k + 1] : u[k];
        const b = j > 0 ? u[k - NX] : u[k], f = j < NY - 1 ? u[k + NX] : u[k];
        const sx = intensity ? 0 : ((l - rr) * LIFT) / (2 * DX), sz = intensity ? 0 : ((b - f) * LIFT) / (2 * DX);
        const n = 1 / Math.hypot(sx, 1, sz);
        nor.setXYZ(k, sx * n, -sz * n, n);
      }
    }
    pos.needsUpdate = col.needsUpdate = nor.needsUpdate = true;
    if (drawn.current?.key !== key || drawn.current.view !== r.view) drawn.current = { key, view: r.view };
    // Dippers bob with the source.
    const pts = cur.source === "plane" ? [[BAR_X, 0] as [number, number]] : sourcePoints(cur);
    pts.forEach(([x, z], i) => {
      const d = dippers.current[i];
      if (!d) return;
      const s = Math.sin(2 * Math.PI * cur.frequency * field.time);
      d.position.set(cur.source === "plane" ? BAR_X : movingX(cur, x, field.time), 0.06 + s * 0.025 * (cur.windSpeed === undefined ? 1 : Math.min(1, cur.windSpeed / 10)), z);
    });
  });

  const w = waterWave(frequency, depth);
  const sw = shallow ? waterWave(frequency, shallowDepth) : null;
  const dop = sourceSpeed > 0 && source === "point" ? doppler(frequency, w.speed, sourceSpeed) : null;
  const [cx, cy, cz] = RIPPLE_TANK.center;
  const barriers = barrierSegments(r);

  return (
    <group position={[cx, cy, cz]}>
      {r.windSpeed !== undefined && <group position={[-1.5, .6, -1.3]}>
        <mesh rotation={[0, Math.PI / 2, 0]}><cylinderGeometry args={[.22, .22, .25, 20]} /><Mat c="#78938e" /></mesh>
        <mesh position={[0, -.3, 0]}><boxGeometry args={[.1, .5, .1]} /><Mat c="#a4b7b0" /></mesh>
        <Html position={[.6, .45, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}><span className="tag whitespace-nowrap text-[11px]">Wind → {r.windSpeed} m/s · qualitative forcing, not ocean height</span></Html>
      </group>}
      {/* Stand and glass tank. */}
      <RoundedBox args={[2 * HX + 0.3, 0.08, 2 * HZ + 0.3]} radius={0.03} position={[0, -0.16, 0]} receiveShadow castShadow>
        <Mat c="#6d7b86" r={0.6} />
      </RoundedBox>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * (HX + 0.05), (-cy - 0.16) / 2 - 0.04, sz * (HZ + 0.05)]} castShadow>
          <boxGeometry args={[0.08, cy - 0.2, 0.08]} />
          <Mat c="#4b5563" m={0.4} r={0.4} />
        </mesh>
      ))}
      <mesh position={[0, -0.11, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2 * HX, 2 * HZ]} />
        <meshStandardMaterial color="#d9e6ec" roughness={0.9} />
      </mesh>
      {shallow && <ShallowPlate />}
      {([[0, -HZ - 0.03, 2 * HX + 0.12, 0.06], [0, HZ + 0.03, 2 * HX + 0.12, 0.06], [-HX - 0.03, 0, 0.06, 2 * HZ], [HX + 0.03, 0, 0.06, 2 * HZ]] as const).map(([x, z, wx, wz], i) => (
        <mesh key={i} position={[x, -0.04, z]}>
          <boxGeometry args={[wx, 0.2, wz]} />
          <meshStandardMaterial color="#dff3ff" transparent opacity={0.22} roughness={0.05} depthWrite={false} />
        </mesh>
      ))}
      <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2 * HX, 2 * HZ, NX - 1, NY - 1]} />
        <meshStandardMaterial vertexColors roughness={0.25} metalness={0.05} side={DoubleSide} />
      </mesh>
      {barriers.map(([a, b], i) => {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        return (
          <mesh key={i} position={[(a[0] + b[0]) / 2, 0.02, (a[1] + b[1]) / 2]} rotation={[0, -Math.atan2(b[1] - a[1], b[0] - a[0]), 0]} castShadow>
            <boxGeometry args={[len, 0.1, 0.035]} />
            <Mat c="#3b4148" r={0.5} />
          </mesh>
        );
      })}
      {/* Dippers: little balls on a bar (or one long bar for straight waves). */}
      {(source === "plane" ? [0] : sourcePoints(r).map((_, i) => i)).map((i) => (
        <mesh key={`${source}-${i}`} ref={(m) => void (m && (dippers.current[i] = m))} castShadow>
          {source === "plane" ? <boxGeometry args={[0.06, 0.06, 2 * HZ - 0.3]} /> : <sphereGeometry args={[0.05, 16, 12]} />}
          <Mat c="#f0a800" r={0.4} />
        </mesh>
      ))}
      <Html position={[0, 0.55, -HZ]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <Tag tone="fact">
          Water waves · λ = {formatLength(w.wavelength)} · v = f × λ = {formatFrequency(frequency)} × {formatLength(w.wavelength)} = {formatSpeed(w.speed)}
        </Tag>
      </Html>
      <Html position={[-HX + 0.55, 0.12, HZ + 0.12]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <div className="ground-label whitespace-nowrap !text-[#2c6e94] ![text-shadow:none]">{formatLength(depth)} deep{shallow ? "" : ` · ${w.regime} water`}</div>
      </Html>
      {sw && (
        <Html position={[HX - 0.55, 0.12, HZ + 0.12]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
          <Tag>
            Shallow ({formatLength(shallowDepth)}): λ = {formatLength(sw.wavelength)}, v = {formatSpeed(sw.speed)}
          </Tag>
        </Html>
      )}
      {dop && (
        <Html position={[0, 0.32, HZ + 0.1]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
          <Tag tone="warning">
            Ahead {formatFrequency(dop.ahead)} · behind {formatFrequency(dop.behind)}
          </Tag>
        </Html>
      )}
      {(barrier === "gap" || barrier === "double_slit") && (
        <Html position={[barrierX, 0.3, -HZ + 0.15]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
          <Tag>
            Gap {formatLength(gapWidth)} ≈ {(gapWidth / w.wavelength).toFixed(1)} λ
          </Tag>
        </Html>
      )}
    </group>
  );
}

/** The glass plate that makes part of the tank shallow. */
function ShallowPlate() {
  const geom = useMemo(() => {
    // Region x - 0.15 > TILT·z, clipped to the tank.
    const g = new PlaneGeometry(1, 1, 1, 1);
    const p = g.attributes.position as BufferAttribute;
    const corners: [number, number][] = [[0.15 + TILT * -HZ, -HZ], [HX, -HZ], [HX, HZ], [0.15 + TILT * HZ, HZ]];
    // PlaneGeometry vertex order: top-left, top-right, bottom-left, bottom-right (in its XY plane).
    const order = [corners[0], corners[1], corners[3], corners[2]];
    order.forEach(([x, z], k) => p.setXYZ(k, x, -z, 0));
    g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <mesh geometry={geom} position={[0, -0.07, 0]}>
      <meshStandardMaterial color="#bfe9ff" transparent opacity={0.55} roughness={0.1} side={DoubleSide} depthWrite={false} />
    </mesh>
  );
}
