"use client";

// Buoyancy for the ocean world: before every physics step, each body that
// dips below the surface gets Archimedes' upward push (ρ·g·V submerged) plus
// a little water drag. Floating depth then comes out of the real densities.

import { useFrame } from "@react-three/fiber";
import { useBeforePhysicsStep } from "@react-three/rapier";
import { useRef } from "react";
import type { Mesh } from "three";
import { useSim } from "@/lib/store";
import { liveBodies } from "@/lib/world/runtime";
import { ASSETS } from "@/lib/world/catalog";
import { FLUIDS, sphereSubmerged } from "@/lib/engine/physics2";
import type { SceneObject } from "@/lib/world/scene";
import { useMotion } from "@/lib/useMotion";

export const WATER_Y = 2.6;
export const TANK_HALF = 3.75;

/** Collision shape of an object as either a ball (radius) or a box (sizes). */
function shapeOf(o: SceneObject): { ball: number } | { box: [number, number, number] } | null {
  if (o.type === "asset") {
    const d = ASSETS[o.asset];
    const s = d.size.map((v) => v * o.scale) as [number, number, number];
    return d.collider === "ball" ? { ball: s[0] / 2 } : { box: s };
  }
  if (o.type === "shape" || o.type === "primitive") {
    const s = o.size.map((v) => v * o.scale) as [number, number, number];
    return o.shape === "sphere" ? { ball: Math.max(...s) / 2 } : { box: s };
  }
  return null;
}

export function Buoyancy() {
  useBeforePhysicsStep((world) => {
    const s = useSim.getState();
    if (s.world !== "ocean") return;
    const rho = FLUIDS[s.modules.fluid ?? "fresh_water"].density;
    const g = Math.abs(s.gravity[1]);
    const dt = world.timestep;
    for (const [id, b] of liveBodies()) {
      if (!b.isDynamic()) continue;
      const o = s.objects[id];
      const shape = o && shapeOf(o);
      if (!shape) continue;
      const p = b.translation();
      if (Math.abs(p.x) > TANK_HALF || Math.abs(p.z) > TANK_HALF) continue;
      let vSub: number, vTot: number;
      if ("ball" in shape) {
        const r = shape.ball;
        vSub = sphereSubmerged(r, WATER_Y - (p.y - r));
        vTot = (4 / 3) * Math.PI * r ** 3;
      } else {
        const [w, h, d] = shape.box;
        vSub = w * d * Math.min(Math.max(WATER_Y - (p.y - h / 2), 0), h);
        vTot = w * h * d;
      }
      if (vSub <= 0) continue;
      const frac = vSub / vTot;
      const v = b.linvel();
      const m = b.mass();
      // Archimedes, plus drag proportional to how much is underwater.
      const drag = 2.5 * frac * m;
      b.applyImpulse({ x: -v.x * drag * dt, y: (rho * g * vSub - v.y * drag) * dt, z: -v.z * drag * dt }, true);
      const av = b.angvel();
      b.applyTorqueImpulse({ x: -av.x * 0.02 * frac * m * dt, y: -av.y * 0.02 * frac * m * dt, z: -av.z * 0.02 * frac * m * dt }, true);
    }
  });
  return null;
}

/** Water volume with a gently moving surface. */
export function Water() {
  const fluid = useSim((s) => s.modules.fluid ?? "fresh_water");
  const surface = useRef<Mesh>(null);
  const time = useRef(0);
  const animate = useMotion();
  useFrame((_, dt) => {
    if (animate && !useSim.getState().paused) time.current += Math.min(dt, .05);
    if (surface.current) surface.current.position.y = WATER_Y + Math.sin(time.current * 1.2) * 0.01;
  });
  const color = FLUIDS[fluid].color;
  const clear = fluid === "fresh_water" || fluid === "sea_water";
  return (
    <group>
      <mesh position={[0, WATER_Y / 2, 0]} renderOrder={2}>
        <boxGeometry args={[TANK_HALF * 2, WATER_Y, TANK_HALF * 2]} />
        <meshStandardMaterial color={color} transparent opacity={clear ? .12 : .32} roughness={0.1} depthWrite={false} />
      </mesh>
      <mesh ref={surface} position={[0, WATER_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
        <planeGeometry args={[TANK_HALF * 2, TANK_HALF * 2]} />
        <meshStandardMaterial color={color} transparent opacity={clear ? .18 : .45} roughness={0.05} metalness={0.1} depthWrite={false} />
      </mesh>
    </group>
  );
}
