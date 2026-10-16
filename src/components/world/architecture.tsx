"use client";

import { RoundedBox, Instances, Instance } from "@react-three/drei";
import type { Vec3 } from "@/lib/world/catalog";
import { surfaceBump } from "./surfaces";

export function Trim({ size, at, color = "#e9dfcb" }: { size: Vec3; at: Vec3; color?: string }) {
  return <mesh position={at} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={.8} /></mesh>;
}

/** One instanced draw for staggered oak planks; deterministic across resets. */
export function OakFloor() {
  return <Instances limit={144} frames={1} castShadow receiveShadow>
    <boxGeometry args={[1.36, .018, .45]} />
    <meshStandardMaterial roughness={.83} bumpMap={surfaceBump("wood")} bumpScale={.016} />
    {Array.from({ length: 18 }, (_, row) => Array.from({ length: 8 }, (_, col) => {
      const x = -4.84 + col * 1.38 + (row % 2) * .69;
      // Clip the end planks to the room footprint.
      const left = Math.max(-3.94, x - .68), right = Math.min(3.94, x + .68);
      if (right <= left) return null;
      return <Instance key={`${row}-${col}`} position={[(left + right) / 2, -.001, -3.91 + row * .46]} scale={[(right - left) / 1.36, 1, 1]} color={["#c4996e", "#cba278", "#c39970", "#bb9065", "#d0a77c"][(row * 7 + col * 3) % 5]} />;
    }))}
  </Instances>;
}

export function WallFinish({ lab = false }: { lab?: boolean }) {
  return <>
    <Trim size={[8.1, .22, .065]} at={[0, .11, .15]} color={lab ? "#6d8c83" : "#a77851"} />
    <Trim size={[8.1, .06, .08]} at={[0, .25, .16]} />
    <Trim size={[8.1, .12, .1]} at={[0, 3.64, .15]} />
    {!lab && <>
      <Trim size={[8.1, .64, .035]} at={[0, .59, .14]} color="#b8c4b3" />
      <Trim size={[8.1, .045, .08]} at={[0, .93, .16]} />
      {Array.from({ length: 12 }, (_, i) => <Trim key={i} size={[.035, .61, .025]} at={[-3.8 + i * .69, .59, .17]} color="#dce1ce" />)}
    </>}
  </>;
}

export function DrapedWindow({ x }: { x: number }) {
  return <group position={[x, 2.25, .15]}>
    <Trim size={[2.05, 1.73, .09]} at={[0, 0, 0]} color="#c5b38f" />
    <mesh position={[0, 0, .052]}><planeGeometry args={[1.87, 1.55]} /><meshBasicMaterial color="#cce0df" /></mesh>
    <mesh position={[.42, .36, .056]}><circleGeometry args={[.2, 32]} /><meshBasicMaterial color="#fff5d4" /></mesh>
    {[-.92, 0, .92].map(v => <Trim key={v} size={[.055, 1.59, .07]} at={[v, 0, .09]} color="#faf3e1" />)}
    <Trim size={[1.9, .05, .065]} at={[0, -.08, .09]} color="#faf3e1" />
    <Trim size={[2.23, .09, .32]} at={[0, -.88, .14]} />
    <Trim size={[2.65, .045, .045]} at={[0, .98, .18]} color="#78664a" />
    {[-1, 1].flatMap(side => Array.from({ length: 6 }, (_, i) => <mesh key={`${side}-${i}`} position={[side * (.88 + i * .065), -.16, .2 + (i % 2) * .025]} castShadow>
      <cylinderGeometry args={[.057, .067, 2.12, 8]} /><meshStandardMaterial color={i % 2 ? "#d4c7ad" : "#e9deca"} roughness={1} />
    </mesh>))}
  </group>;
}

export function Artwork({ x, y = 2.3, variant = 0 }: { x: number; y?: number; variant?: number }) {
  return <group position={[x, y, .18]}>
    <RoundedBox args={[.92, 1.22, .07]} radius={.018} castShadow><meshStandardMaterial color="#8a6040" /></RoundedBox>
    <mesh position={[0, 0, .04]}><planeGeometry args={[.8, 1.1]} /><meshStandardMaterial color="#efe6d2" /></mesh>
    <mesh position={[.13, .22, .045]}><circleGeometry args={[.21, 32]} /><meshStandardMaterial color={variant ? "#c98652" : "#cbab66"} /></mesh>
    <mesh position={[-.1, -.23, .05]} scale={[1, 1.4, 1]}><circleGeometry args={[.3, 3]} /><meshStandardMaterial color={variant ? "#8c9d8e" : "#527c72"} /></mesh>
    <Trim size={[.48, .018, .008]} at={[0, -.45, .055]} color="#b7a68b" />
  </group>;
}

export function BedroomTextiles() {
  return <group position={[0, .015, .8]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[1.45, 64]} /><meshStandardMaterial color="#d9c8a7" roughness={1} bumpMap={surfaceBump("woven")} bumpScale={.012} /></mesh>
    {[1.1, 1.22, 1.37].map(r => <mesh key={r} position={[0, .002, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[r, r + .025, 64]} /><meshStandardMaterial color="#8e9e8d" roughness={1} /></mesh>)}
  </group>;
}

export function LabWall() {
  return <>
    <Trim size={[5.2, .43, .04]} at={[.4, 1.2, .15]} color="#98b9af" />
    <Trim size={[2.05, .09, .42]} at={[-1.6, 2.15, .29]} color="#657e74" />
    <Trim size={[1.85, .025, .15]} at={[-1.6, 2.09, .36]} color="#fff1bd" />
    {[-2.3, -1.95, -1.6, -1.25, -.9].map((x, i) => <group key={x} position={[x, 2.36, .27]}>
      <mesh castShadow><cylinderGeometry args={[.095, .095, .32, 12]} /><meshStandardMaterial color={["#b4cbb1", "#ddba81", "#9bbbc4"][i % 3]} roughness={.35} /></mesh>
      <Trim size={[.19, .045, .19]} at={[0, .18, 0]} color="#f3ebdb" />
      <Trim size={[.1, .09, .01]} at={[0, 0, .097]} color="#f8f5e9" />
    </group>)}
  </>;
}
