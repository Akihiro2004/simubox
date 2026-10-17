"use client";

import { useEffect, useMemo } from "react";
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import { useSim } from "@/lib/store";
import { solveProjectile } from "@/lib/engine/projectile";
import { createLunarTerrain, createLunarCraterGeometry } from "@/lib/world/lunar-terrain";

export function LunarGround({ color }: { color: string }) {
  const projectile = useSim((s) => s.projectile);
  const craters = useSim((s) => s.environment?.craters ?? false);
  const range = projectile ? solveProjectile(projectile).range : 60;
  const finiteRange = Number.isFinite(range) ? Math.max(60, range) : 60;
  const center = finiteRange / 2;
  const flatRadius = Math.max(100, center + 25);
  const geometry = useMemo(() => createLunarTerrain(flatRadius), [flatRadius]);
  const craterGeometry = useMemo(() => craters ? createLunarCraterGeometry(flatRadius, center) : null, [flatRadius, center, craters]);
  const dust = useMemo(() => {
    const canvas = document.createElement("canvas");
    const size = 512;
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const pixels = ctx.createImageData(size, size);
    let seed = 7241;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const value = 224 + (seed >>> 28);
      pixels.data.set([value, value, value, 255], i);
    }
    ctx.putImageData(pixels, 0, 0);
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
    map.wrapS = map.wrapT = RepeatWrapping;
    map.repeat.set(160, 160);
    return map;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => craterGeometry?.dispose(), [craterGeometry]);
  useEffect(() => () => dust.dispose(), [dust]);
  return (
    <group position={[center, 0, 0]}>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial color={color} map={dust} bumpMap={dust} bumpScale={0.025} vertexColors roughness={1} />
      </mesh>
      {craterGeometry && <mesh geometry={craterGeometry} receiveShadow>
        <meshStandardMaterial color={color} map={dust} bumpMap={dust} bumpScale={0.025} vertexColors roughness={1} />
      </mesh>}
    </group>
  );
}
