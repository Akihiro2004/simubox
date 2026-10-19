"use client";

// Original procedural low-poly models, one per catalog asset. Each model is
// centered on its bounding box (see ASSETS[].size) so colliders line up.

import { RoundedBox } from "@react-three/drei";
import { useMemo } from "react";
import { Shape } from "three";
import type { AssetId } from "@/lib/world/catalog";
import { isFurniture } from "@/lib/world/furnishings";
import { FurnitureModel } from "./furniture";
import { isNature } from "@/lib/world/nature";
import { NatureModel } from "./nature";
import { isLearningAsset } from "@/lib/world/learning-assets";
import { LearningModel } from "./learning-assets";

export function Mat({ c, r = 0.65, m = 0, e, ei = 0.8, o = 1, flat }: { c: string; r?: number; m?: number; e?: string; ei?: number; o?: number; flat?: boolean }) {
  // Remount when transparency flips: three.js only compiles `transparent` once per material.
  return <meshStandardMaterial key={o < 1 ? "t" : "o"} color={c} roughness={r} metalness={m} emissive={e ?? "#000000"} emissiveIntensity={e ? ei : 0} transparent={o < 1} opacity={o} flatShading={flat} depthWrite={o >= 1} />;
}

const S = { castShadow: true, receiveShadow: true } as const;

function Ball({ r, c, stripe }: { r: number; c: string; stripe?: string }) {
  return (
    <group>
      <mesh {...S}>
        <sphereGeometry args={[r, 28, 20]} />
        <Mat c={c} r={0.45} />
      </mesh>
      {stripe && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r * 1.002, r * 0.12, 6, 32]} />
          <Mat c={stripe} r={0.5} />
        </mesh>
      )}
    </group>
  );
}

/** Wedge (ramp) geometry: right triangle in x/y, extruded along z. */
export function wedgeVertices(w: number, h: number, d: number): Float32Array {
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2, z0 = -d / 2, z1 = d / 2;
  return new Float32Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1]);
}

function Wedge({ w, h, d, c }: { w: number; h: number; d: number; c: string }) {
  const geo = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-w / 2, -h / 2);
    shape.lineTo(w / 2, -h / 2);
    shape.lineTo(w / 2, h / 2);
    shape.closePath();
    return shape;
  }, [w, h]);
  return (
    <mesh {...S} position={[0, 0, -d / 2]}>
      <extrudeGeometry args={[geo, { depth: d, bevelEnabled: false }]} />
      <Mat c={c} flat />
    </mesh>
  );
}

function Foliage({ y, r, c }: { y: number; r: number; c: string }) {
  return (
    <mesh {...S} position={[0, y, 0]}>
      <icosahedronGeometry args={[r, 1]} />
      <Mat c={c} flat r={0.9} />
    </mesh>
  );
}

export function AssetModel({ asset, color }: { asset: AssetId; color?: string }) {
  if (isLearningAsset(asset)) return <LearningModel asset={asset} color={color} />;
  if (isNature(asset)) return <NatureModel asset={asset} color={color} />;
  if (isFurniture(asset)) return <FurnitureModel asset={asset} color={color} />;
  switch (asset) {
    case "ball_red":
      return <Ball r={0.15} c={color ?? "#ef4444"} stripe="#fff7ed" />;
    case "ball_blue":
      return <Ball r={0.15} c={color ?? "#3b82f6"} stripe="#fef9c3" />;
    case "basketball":
      return (
        <group>
          <Ball r={0.12} c={color ?? "#f97316"} />
          {[0, Math.PI / 2].map((ry) => (
            <mesh key={ry} rotation={[0, ry, 0]}>
              <torusGeometry args={[0.1205, 0.004, 4, 32]} />
              <Mat c="#431407" />
            </mesh>
          ))}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.1205, 0.004, 4, 32]} />
            <Mat c="#431407" />
          </mesh>
        </group>
      );
    case "soccer_ball":
      return (
        <group>
          <mesh {...S}>
            <icosahedronGeometry args={[0.11, 2]} />
            <Mat c={color ?? "#f8fafc"} r={0.5} />
          </mesh>
          {[[0, 1, 0], [0, -1, 0], [1, 0.3, 0], [-1, 0.3, 0], [0, 0.3, 1], [0, 0.3, -1], [0.7, -0.5, 0.7], [-0.7, -0.5, -0.7]].map((p, i) => {
            const l = Math.hypot(p[0], p[1], p[2]);
            return (
              <mesh key={i} position={[(p[0] / l) * 0.1, (p[1] / l) * 0.1, (p[2] / l) * 0.1]}>
                <sphereGeometry args={[0.028, 8, 6]} />
                <Mat c="#1e293b" />
              </mesh>
            );
          })}
        </group>
      );
    case "tennis_ball":
      return <Ball r={0.0335} c={color ?? "#d9f99d"} stripe="#f8fafc" />;
    case "bowling_ball":
      return (
        <group>
          <mesh {...S}>
            <sphereGeometry args={[0.11, 28, 20]} />
            <Mat c={color ?? "#1e3a8a"} r={0.15} m={0.2} />
          </mesh>
          {[[0.03, 0.09], [-0.03, 0.09], [0, 0.06]].map(([x, z], i) => (
            <mesh key={i} position={[x, 0.065, z * 0.8]}>
              <sphereGeometry args={[0.013, 8, 6]} />
              <Mat c="#020617" />
            </mesh>
          ))}
        </group>
      );
    case "feather":
      return (
        <group>
          <mesh {...S} scale={[0.03, 0.008, 0.13]}>
            <sphereGeometry args={[1, 16, 10]} />
            <Mat c={color ?? "#f5f5f4"} r={0.9} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.002, 0.002, 0.28, 4]} />
            <Mat c="#a8a29e" />
          </mesh>
        </group>
      );
    case "apple":
      return (
        <group>
          <mesh {...S} scale={[1, 0.95, 1]}>
            <sphereGeometry args={[0.045, 20, 14]} />
            <Mat c={color ?? "#dc2626"} r={0.35} />
          </mesh>
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.003, 0.004, 0.02, 5]} />
            <Mat c="#78350f" />
          </mesh>
          <mesh position={[0.012, 0.055, 0]} rotation={[0, 0, -0.8]} scale={[0.012, 0.003, 0.007]}>
            <sphereGeometry args={[1, 8, 6]} />
            <Mat c="#16a34a" />
          </mesh>
        </group>
      );
    case "book":
      return (
        <group>
          <RoundedBox args={[0.22, 0.05, 0.16]} radius={0.008} {...S}>
            <Mat c={color ?? "#6366f1"} />
          </RoundedBox>
          <mesh position={[0.006, 0, 0]}>
            <boxGeometry args={[0.2, 0.038, 0.15]} />
            <Mat c="#fefce8" />
          </mesh>
        </group>
      );
    case "box":
      return (
        <group>
          <RoundedBox args={[0.4, 0.4, 0.4]} radius={0.015} {...S}>
            <Mat c={color ?? "#d6a76c"} r={0.9} />
          </RoundedBox>
          <mesh position={[0, 0.201, 0]}>
            <boxGeometry args={[0.08, 0.002, 0.4]} />
            <Mat c="#e7d3b0" />
          </mesh>
        </group>
      );
    case "toy_block":
      return (
        <RoundedBox args={[0.14, 0.14, 0.14]} radius={0.02} {...S}>
          <Mat c={color ?? "#facc15"} r={0.5} />
        </RoundedBox>
      );
    case "pillow":
      return (
        <RoundedBox args={[0.5, 0.14, 0.34]} radius={0.06} smoothness={4} {...S}>
          <Mat c={color ?? "#e0e7ff"} r={0.95} />
        </RoundedBox>
      );
    case "mug":
      return (
        <group>
          <mesh {...S}>
            <cylinderGeometry args={[0.042, 0.038, 0.11, 18]} />
            <Mat c={color ?? "#f472b6"} r={0.4} />
          </mesh>
          <mesh position={[0, 0.054, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.036, 18]} />
            <Mat c="#3b1d0e" />
          </mesh>
          <mesh position={[0.046, 0, 0]}>
            <torusGeometry args={[0.024, 0.007, 6, 14]} />
            <Mat c={color ?? "#f472b6"} r={0.4} />
          </mesh>
        </group>
      );
    case "toy_car":
      return (
        <group>
          <RoundedBox args={[0.3, 0.07, 0.15]} radius={0.02} position={[0, -0.01, 0]} {...S}>
            <Mat c={color ?? "#22c55e"} r={0.35} />
          </RoundedBox>
          <RoundedBox args={[0.15, 0.06, 0.13]} radius={0.02} position={[-0.02, 0.045, 0]} {...S}>
            <Mat c="#bae6fd" r={0.2} />
          </RoundedBox>
          {[[-0.09, 0.075], [0.09, 0.075], [-0.09, -0.075], [0.09, -0.075]].map(([x, z], i) => (
            <mesh key={i} position={[x, -0.045, z]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.025, 0.025, 0.02, 12]} />
              <Mat c="#1f2937" />
            </mesh>
          ))}
        </group>
      );
    case "dice":
      return (
        <group>
          <RoundedBox args={[0.1, 0.1, 0.1]} radius={0.015} {...S}>
            <Mat c={color ?? "#ffffff"} r={0.3} />
          </RoundedBox>
          {[[0, 0.051, 0], [0.051, 0.02, 0.02], [0.051, -0.02, -0.02], [-0.02, -0.02, 0.051], [0.02, 0.02, 0.051]].map((p, i) => (
            <mesh key={i} position={p as [number, number, number]}>
              <sphereGeometry args={[0.009, 8, 6]} />
              <Mat c="#0f172a" />
            </mesh>
          ))}
        </group>
      );
    case "rocket_toy":
      return (
        <group>
          <mesh {...S} position={[0, -0.04, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.3, 16]} />
            <Mat c={color ?? "#e2e8f0"} r={0.3} />
          </mesh>
          <mesh {...S} position={[0, 0.17, 0]}>
            <coneGeometry args={[0.06, 0.14, 16]} />
            <Mat c="#ef4444" />
          </mesh>
          <mesh position={[0, 0.02, 0.058]}>
            <circleGeometry args={[0.025, 16]} />
            <Mat c="#38bdf8" e="#0ea5e9" ei={0.4} />
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh key={i} castShadow rotation={[0, (i * Math.PI * 2) / 3, 0]} position={[Math.sin((i * Math.PI * 2) / 3) * 0.07, -0.18, Math.cos((i * Math.PI * 2) / 3) * 0.07]}>
              <boxGeometry args={[0.01, 0.12, 0.06]} />
              <Mat c="#ef4444" />
            </mesh>
          ))}
        </group>
      );
    case "ramp":
      return <Wedge w={1.2} h={0.5} d={0.6} c={color ?? "#a78bfa"} />;
    case "crate":
      return (
        <group>
          <RoundedBox args={[0.6, 0.6, 0.6]} radius={0.02} {...S}>
            <Mat c={color ?? "#b45309"} r={0.85} />
          </RoundedBox>
          {[-0.2, 0, 0.2].map((y) => (
            <mesh key={y} position={[0, y, 0]}>
              <boxGeometry args={[0.612, 0.025, 0.612]} />
              <Mat c="#92400e" r={0.9} />
            </mesh>
          ))}
        </group>
      );
    case "cone":
      return (
        <group>
          <mesh {...S} position={[0, -0.215, 0]}>
            <boxGeometry args={[0.3, 0.02, 0.3]} />
            <Mat c={color ?? "#fb923c"} />
          </mesh>
          <mesh {...S} position={[0, 0.01, 0]}>
            <coneGeometry args={[0.12, 0.43, 18]} />
            <Mat c={color ?? "#fb923c"} r={0.5} />
          </mesh>
          <mesh position={[0, 0.0, 0]}>
            <cylinderGeometry args={[0.068, 0.082, 0.06, 18, 1, true]} />
            <Mat c="#f8fafc" />
          </mesh>
        </group>
      );
    case "plant":
      return (
        <group>
          <mesh {...S} position={[0, -0.22, 0]}>
            <cylinderGeometry args={[0.16, 0.12, 0.26, 16]} />
            <Mat c="#d4bea0" r={0.85} />
          </mesh>
          <mesh position={[0, -.08, 0]}><cylinderGeometry args={[.145, .145, .018, 20]} /><Mat c="#544735" /></mesh>
          {Array.from({ length: 9 }, (_, i) => {
            const a = i * 2.39996;
            return <group key={i} position={[0, -.07 + (i % 3) * .06, 0]} rotation={[0, a, -.45 - (i % 3) * .18]}>
              <mesh position={[0, .13, 0]} scale={[.055, .18, .022]} {...S}><sphereGeometry args={[1, 10, 8]} /><Mat c={color ?? (i % 2 ? "#638650" : "#819c5b")} r={.85} /></mesh>
              <mesh position={[0, .06, 0]}><cylinderGeometry args={[.006, .008, .16, 5]} /><Mat c="#5d7547" /></mesh>
            </group>;
          })}
        </group>
      );
    case "flower":
      return (
        <group position={[0, -0.225, 0]}>
          <mesh position={[0, 0.17, 0]}>
            <cylinderGeometry args={[0.008, 0.01, 0.34, 6]} />
            <Mat c="#15803d" />
          </mesh>
          <mesh position={[0.03, 0.12, 0]} rotation={[0, 0, -0.9]} scale={[0.05, 0.012, 0.025]}>
            <sphereGeometry args={[1, 8, 6]} />
            <Mat c="#22c55e" />
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} castShadow position={[Math.cos((i * Math.PI * 2) / 5) * 0.045, 0.37, Math.sin((i * Math.PI * 2) / 5) * 0.045]}>
              <sphereGeometry args={[0.035, 10, 8]} />
              <Mat c={color ?? "#f472b6"} r={0.6} />
            </mesh>
          ))}
          <mesh position={[0, 0.375, 0]}>
            <sphereGeometry args={[0.03, 10, 8]} />
            <Mat c="#fde047" />
          </mesh>
        </group>
      );
    case "tree":
      return (
        <group position={[0, -1.3, 0]}>
          <mesh {...S} position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.1, 0.16, 1.2, 8]} />
            <Mat c="#92400e" r={0.9} />
          </mesh>
          <Foliage y={1.45} r={0.7} c={color ?? "#779358"} />
          <Foliage y={2.05} r={0.5} c={color ?? "#91a968"} />
          <group position={[-.3, 0, .2]}><Foliage y={1.7} r={.38} c={color ?? "#68864f"} /></group>
        </group>
      );
    case "rock":
      return (
        <mesh {...S} scale={[0.32, 0.22, 0.27]}>
          <dodecahedronGeometry args={[1, 0]} />
          <Mat c={color ?? "#94a3b8"} flat r={0.95} />
        </mesh>
      );
    case "sun":
      return (
        <group>
          <mesh>
            <sphereGeometry args={[0.5, 32, 20]} />
            <Mat c={color ?? "#fbbf24"} e={color ?? "#f59e0b"} ei={1.6} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.72, 24, 16]} />
            <meshBasicMaterial color="#fde68a" transparent opacity={0.18} depthWrite={false} />
          </mesh>
        </group>
      );
    case "planet":
      return (
        <group>
          <mesh {...S}>
            <sphereGeometry args={[0.3, 28, 20]} />
            <Mat c={color ?? "#60a5fa"} r={0.6} />
          </mesh>
          <mesh rotation={[0.4, 0, 0]} scale={[1.01, 0.25, 1.01]}>
            <sphereGeometry args={[0.3, 20, 10]} />
            <Mat c="#86efac" o={0.85} />
          </mesh>
        </group>
      );
    case "moon":
      return (
        <group>
          <mesh {...S}>
            <sphereGeometry args={[0.15, 24, 16]} />
            <Mat c={color ?? "#cbd5e1"} r={0.95} />
          </mesh>
          {[[0.08, 0.08, 0.1], [-0.1, 0.02, 0.1], [0.02, -0.09, 0.11]].map((p, i) => (
            <mesh key={i} position={p as [number, number, number]}>
              <sphereGeometry args={[0.03, 10, 8]} />
              <Mat c="#94a3b8" />
            </mesh>
          ))}
        </group>
      );
    case "cloud":
      return (
        <group>
          {[[-0.35, -0.05, 0, 0.3], [0, 0.05, 0, 0.38], [0.35, -0.05, 0.05, 0.28], [0.1, -0.08, 0.2, 0.25]].map(([x, y, z, r], i) => (
            <mesh key={i} position={[x, y, z]} castShadow>
              <sphereGeometry args={[r, 16, 12]} />
              <Mat c={color ?? "#ffffff"} r={1} />
            </mesh>
          ))}
        </group>
      );
    case "water_drop":
      return (
        <group>
          <mesh position={[0, -0.02, 0]}>
            <sphereGeometry args={[0.06, 16, 12]} />
            <Mat c={color ?? "#38bdf8"} r={0.1} o={0.85} />
          </mesh>
          <mesh position={[0, 0.045, 0]}>
            <coneGeometry args={[0.052, 0.08, 16]} />
            <Mat c={color ?? "#38bdf8"} r={0.1} o={0.85} />
          </mesh>
        </group>
      );
    case "lightbulb":
      return (
        <group>
          <mesh position={[0, 0.03, 0]}>
            <sphereGeometry args={[0.075, 20, 14]} />
            <Mat c={color ?? "#fde68a"} e="#fbbf24" ei={1.2} o={0.95} />
          </mesh>
          <mesh position={[0, -0.08, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.035, 0.08, 12]} />
            <Mat c="#94a3b8" m={0.6} r={0.3} />
          </mesh>
        </group>
      );
    case "battery":
      return (
        <group>
          <mesh {...S}>
            <cylinderGeometry args={[0.055, 0.055, 0.24, 18]} />
            <Mat c={color ?? "#334155"} />
          </mesh>
          <mesh position={[0, 0.09, 0]}>
            <cylinderGeometry args={[0.056, 0.056, 0.06, 18]} />
            <Mat c="#d97706" m={0.4} r={0.4} />
          </mesh>
          <mesh position={[0, 0.125, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.012, 10]} />
            <Mat c="#cbd5e1" m={0.7} r={0.3} />
          </mesh>
        </group>
      );
    case "magnet":
      return (
        <group>
          <mesh {...S} position={[0, 0.03, 0]} rotation={[0, 0, 0]}>
            <torusGeometry args={[0.1, 0.035, 10, 24, Math.PI]} />
            <Mat c={color ?? "#ef4444"} />
          </mesh>
          {[-0.1, 0.1].map((x) => (
            <mesh key={x} position={[x, -0.06, 0]} castShadow>
              <boxGeometry args={[0.07, 0.18, 0.07]} />
              <Mat c={x < 0 ? "#cbd5e1" : color ?? "#ef4444"} m={x < 0 ? 0.5 : 0} />
            </mesh>
          ))}
        </group>
      );
    case "beaker":
      return (
        <group>
          <mesh>
            <cylinderGeometry args={[0.07, 0.07, 0.2, 20, 1, true]} />
            <Mat c="#e0f2fe" r={0.05} o={0.35} />
          </mesh>
          <mesh position={[0, -0.04, 0]}>
            <cylinderGeometry args={[0.066, 0.066, 0.11, 20]} />
            <Mat c={color ?? "#22d3ee"} r={0.1} o={0.75} e={color ?? "#22d3ee"} ei={0.15} />
          </mesh>
        </group>
      );
    case "flask":
      return (
        <group>
          <mesh position={[0, -0.05, 0]}>
            <coneGeometry args={[0.09, 0.16, 20, 1, true]} />
            <Mat c="#ede9fe" r={0.05} o={0.35} />
          </mesh>
          <mesh position={[0, -0.08, 0]}>
            <coneGeometry args={[0.07, 0.1, 20]} />
            <Mat c={color ?? "#c084fc"} o={0.8} e={color ?? "#a855f7"} ei={0.25} />
          </mesh>
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.022, 0.022, 0.1, 12, 1, true]} />
            <Mat c="#ede9fe" r={0.05} o={0.35} />
          </mesh>
        </group>
      );
    case "thermometer":
      return (
        <group>
          <mesh>
            <cylinderGeometry args={[0.014, 0.014, 0.36, 10]} />
            <Mat c="#f8fafc" r={0.1} o={0.6} />
          </mesh>
          <mesh position={[0, -0.05, 0]}>
            <cylinderGeometry args={[0.006, 0.006, 0.25, 6]} />
            <Mat c={color ?? "#ef4444"} e="#ef4444" ei={0.3} />
          </mesh>
          <mesh position={[0, -0.18, 0]}>
            <sphereGeometry args={[0.024, 12, 10]} />
            <Mat c={color ?? "#ef4444"} />
          </mesh>
        </group>
      );
    case "ice_cube":
      return (
        <RoundedBox args={[0.12, 0.12, 0.12]} radius={0.02} {...S}>
          <Mat c={color ?? "#bae6fd"} r={0.05} o={0.7} />
        </RoundedBox>
      );
  }
}

export function PrimitiveModel({ shape, size, color, opacity, glow }: { shape: string; size: [number, number, number]; color: string; opacity: number; glow: boolean }) {
  const [w, h, d] = size;
  const mat = <Mat c={color} o={opacity} e={glow ? color : undefined} ei={glow ? 1.1 : 0} r={0.5} />;
  switch (shape) {
    case "sphere":
      return (
        <mesh scale={[w / 2, h / 2, d / 2]} castShadow={opacity >= 1} receiveShadow>
          <sphereGeometry args={[1, 32, 20]} />
          {mat}
        </mesh>
      );
    case "box":
      return (
        <RoundedBox args={[w, h, d]} radius={Math.min(w, h, d) * 0.08} castShadow={opacity >= 1} receiveShadow>
          {mat}
        </RoundedBox>
      );
    case "cylinder":
      return (
        <mesh scale={[w / 2, h, d / 2]} castShadow={opacity >= 1} receiveShadow>
          <cylinderGeometry args={[1, 1, 1, 28]} />
          {mat}
        </mesh>
      );
    case "cone":
      return (
        <mesh scale={[w / 2, h, d / 2]} castShadow={opacity >= 1}>
          <coneGeometry args={[1, 1, 28]} />
          {mat}
        </mesh>
      );
    case "torus":
      return (
        <mesh scale={[w / 2, d / 2, h / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow={opacity >= 1}>
          <torusGeometry args={[0.8, 0.2, 14, 40]} />
          {mat}
        </mesh>
      );
    default:
      // ring: a flat orbit/outline in the x-z plane
      return (
        <mesh scale={[w / 2, d / 2, 1]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.97, 1, 64]} />
          <meshBasicMaterial color={color} transparent opacity={opacity} side={2} />
        </mesh>
      );
  }
}

/** Convex hull vertices for the ramp collider. */
export function rampHull(scale: number): Float32Array {
  return wedgeVertices(1.2 * scale, 0.5 * scale, 0.6 * scale);
}

