"use client";

import { RoundedBox } from "@react-three/drei";
import { CuboidCollider } from "@react-three/rapier";
import { FURNITURE_PARTS, type FurnitureId } from "@/lib/world/furnishings";

export function FurnitureModel({ asset, color }: { asset: FurnitureId; color?: string }) {
  const hasAccent = FURNITURE_PARTS[asset].some(p => p.accent);
  return <group>{FURNITURE_PARTS[asset].map((p, i) => (
    <RoundedBox key={i} args={p.size} position={p.position} radius={Math.min(p.radius ?? .02, Math.min(...p.size) / 3)} smoothness={2} castShadow receiveShadow>
      <meshStandardMaterial color={color && (p.accent || (p.color === "#ad754b" && !hasAccent)) ? color : p.color} roughness={.72} emissive={asset === "desk_lamp" && i === 3 ? "#ffcb70" : "#000000"} emissiveIntensity={.7} />
    </RoundedBox>
  ))}</group>;
}

export function FurnitureColliders({ asset, scale, mass, restitution }: { asset: FurnitureId; scale: number; mass: number; restitution: number }) {
  const parts = FURNITURE_PARTS[asset];
  const volume = parts.reduce((sum, p) => sum + p.size[0] * p.size[1] * p.size[2], 0);
  return <>{parts.map((p, i) => <CuboidCollider key={i}
    args={[p.size[0] * scale / 2, p.size[1] * scale / 2, p.size[2] * scale / 2]}
    position={[p.position[0] * scale, p.position[1] * scale, p.position[2] * scale]}
    mass={mass * p.size[0] * p.size[1] * p.size[2] / volume} restitution={restitution} friction={.7} />)}</>;
}
