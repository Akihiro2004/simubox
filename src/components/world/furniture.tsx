"use client";

import { RoundedBox } from "@react-three/drei";
import { CuboidCollider } from "@react-three/rapier";
import { FURNITURE_PARTS, type FurnitureId } from "@/lib/world/furnishings";
import { surfaceBump } from "./surfaces";

export function FurnitureModel({ asset, color }: { asset: FurnitureId; color?: string }) {
  const hasAccent = FURNITURE_PARTS[asset].some(p => p.accent);
  return <group>{FURNITURE_PARTS[asset].map((p, i) => (
    <RoundedBox key={i} args={p.size} position={p.position} radius={Math.min(p.radius ?? .02, Math.min(...p.size) / 3)} smoothness={2} castShadow receiveShadow>
      <meshStandardMaterial color={color && (p.accent || (p.color === "#ad754b" && !hasAccent)) ? color : p.color} roughness={.72} bumpMap={surfaceBump(p.color === "#ad754b" ? "wood" : "woven")} bumpScale={p.color === "#ad754b" ? .012 : .003} emissive={asset === "desk_lamp" && i === 3 ? "#ffcb70" : "#000000"} emissiveIntensity={.7} />
    </RoundedBox>
  ))}
    {asset === "ball_rack" && [-.17, .31].flatMap((y, row) => [-.55, -.18, .19, .56].map((x, i) => <mesh key={`${row}-${i}`} position={[x, y, 0]} castShadow>
      <sphereGeometry args={[.14, 18, 12]} /><meshStandardMaterial color={color ?? ["#c98246", "#e9dfc8", "#b8bf6d", "#628e9a"][(i + row) % 4]} roughness={.65} />
    </mesh>))}
  </group>;
}

export function FurnitureColliders({ asset, scale, mass, restitution }: { asset: FurnitureId; scale: number; mass: number; restitution: number }) {
  const parts = FURNITURE_PARTS[asset];
  const volume = parts.reduce((sum, p) => sum + p.size[0] * p.size[1] * p.size[2], 0);
  return <>{parts.map((p, i) => <CuboidCollider key={i}
    args={[p.size[0] * scale / 2, p.size[1] * scale / 2, p.size[2] * scale / 2]}
    position={[p.position[0] * scale, p.position[1] * scale, p.position[2] * scale]}
    mass={mass * p.size[0] * p.size[1] * p.size[2] / volume} restitution={restitution} friction={.7} />)}</>;
}
