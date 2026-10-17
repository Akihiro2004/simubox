"use client";

import { RoundedBox } from "@react-three/drei";
import { BallCollider, CuboidCollider, CylinderCollider } from "@react-three/rapier";
import { LEARNING_PARTS, type LearningAssetId, type LearningPart } from "@/lib/world/learning-assets";

function Part({ part: p, color }: { part: LearningPart; color?: string }) {
  const material = <meshStandardMaterial color={p.accent && color ? color : p.color} roughness={.65} />;
  if (p.shape === "box") return <RoundedBox args={p.size} position={p.position} radius={Math.min(...p.size) * .1} smoothness={2} castShadow receiveShadow>{material}</RoundedBox>;
  return <mesh position={p.position} scale={p.shape === "sphere" ? p.size : undefined} castShadow receiveShadow>
    {p.shape === "sphere" ? <sphereGeometry args={[.5, 16, 12]} /> : p.shape === "cone" ? <coneGeometry args={[p.size[0] / 2, p.size[1], 6]} /> : <cylinderGeometry args={[p.size[0] / 2, p.size[0] / 2, p.size[1], 16]} />}
    {material}
  </mesh>;
}

export function LearningModel({ asset, color }: { asset: LearningAssetId; color?: string }) {
  return <group>{LEARNING_PARTS[asset].map((p, i) => <Part key={i} part={p} color={color} />)}</group>;
}

export function LearningColliders({ asset, scale, mass, restitution }: { asset: LearningAssetId; scale: number; mass: number; restitution: number }) {
  const parts = LEARNING_PARTS[asset].filter(p => !p.decorative);
  const volumes = parts.map(p => p.size[0] * p.size[1] * p.size[2]);
  const total = volumes.reduce((a, b) => a + b, 0);
  return <>{parts.map((p, i) => {
    const size = p.size.map(v => v * scale) as [number, number, number];
    const common = { position: p.position.map(v => v * scale) as [number, number, number], mass: mass * volumes[i] / total, restitution, friction: .6 };
    if (p.shape === "sphere") return <BallCollider key={i} args={[Math.max(...size) / 2]} {...common} />;
    if (p.shape === "cylinder") return <CylinderCollider key={i} args={[size[1] / 2, size[0] / 2]} {...common} />;
    return <CuboidCollider key={i} args={[size[0] / 2, size[1] / 2, size[2] / 2]} {...common} />;
  })}</>;
}
