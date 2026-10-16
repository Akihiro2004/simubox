"use client";

// Scenery and static colliders for the five newer worlds. Their science
// lives in ./modules; this file is only the place itself.

import { Html, RoundedBox, Stars } from "@react-three/drei";
import { CuboidCollider, CylinderCollider, RigidBody } from "@react-three/rapier";
import { BackSide } from "three";
import { Mat } from "./assets";
import { TANK_HALF, WATER_Y } from "./modules/fluid";
import { MathFrame, ObservatoryDeck, OceanHabitat, PlinthBand, RadialMarks, Rim } from "./scenery";
import { OakFloor, Trim } from "./architecture";
import { surfaceBump } from "./surfaces";
import { useSim } from "@/lib/store";
import { AquariumLife } from "./aquarium-life";

const S = { castShadow: true, receiveShadow: true } as const;

/** Space: a dark sky dome around a floating glass deck. */
export function SpaceMap({ animate }: { animate: boolean }) {
  return (
    <>
      <mesh>
        <sphereGeometry args={[90, 32, 24]} />
        <meshBasicMaterial color="#0b1026" side={BackSide} />
      </mesh>
      <Stars radius={70} depth={20} count={2500} factor={3.5} saturation={0.2} fade speed={animate ? 0.15 : 0} />
      <mesh position={[0, -0.1, 0]} receiveShadow>
        <cylinderGeometry args={[12.8, 12.8, 0.2, 96]} />
        <meshStandardMaterial color="#192941" roughness={0.58} metalness={0.25} />
      </mesh>
      <ObservatoryDeck />
      {[4.2, 8.4, 12.6].map((r) => (
        <mesh key={r} position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r - 0.03, r, 128]} />
          <meshBasicMaterial color="#4c5a8f" transparent opacity={0.6} />
        </mesh>
      ))}
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[0.1, 12.8]} position={[0, -0.1, 0]} />
      </RigidBody>
    </>
  );
}

/** Ocean: a glass tank with a sandy floor, rocks, weed and a wooden dock. */
export function OceanMap() {
  const glass = { color: "#dff3ff", transparent: true, opacity: 0.08, roughness: 0.05, depthWrite: false } as const;
  const h = WATER_Y + 0.6;
  return (
    <>
      <RoundedBox args={[TANK_HALF * 2 + 0.5, 0.4, TANK_HALF * 2 + 0.5]} radius={0.08} position={[0, -0.2, 0]} receiveShadow>
        <meshStandardMaterial color="#e8d6ae" roughness={1} bumpMap={surfaceBump("stone")} bumpScale={.025} />
      </RoundedBox>
      <RoundedBox args={[TANK_HALF * 2 + 0.3, 1.2, TANK_HALF * 2 + 0.3]} radius={0.2} position={[0, -0.95, 0]}>
        <Mat c="#8fb1c4" r={0.9} />
      </RoundedBox>
      {[[-2.4, -2.2, 0.5], [2.1, -2.6, 0.35], [-2.8, 2.5, 0.42]].map(([x, z, r], i) => (
        <mesh key={i} position={[x, r * 0.6, z]} scale={[1, 0.7, 0.9]} {...S}>
          <dodecahedronGeometry args={[r, 0]} />
          <Mat c="#9aa5ad" flat />
        </mesh>
      ))}
      <OceanHabitat />
      <AquariumLife />
      {[-TANK_HALF, TANK_HALF].map(v => <group key={v}>
        <Trim size={[TANK_HALF * 2 + .12, .06, .1]} at={[0, h, v]} color="#93b0b4" />
        <Trim size={[.1, .06, TANK_HALF * 2 + .12]} at={[v, h, 0]} color="#93b0b4" />
        <Trim size={[TANK_HALF * 2 + .12, .07, .1]} at={[0, .035, v]} color="#a6b6ad" />
        <Trim size={[.1, .07, TANK_HALF * 2 + .12]} at={[v, .035, 0]} color="#a6b6ad" />
      </group>)}
      {/* Glass walls, a rim, and a dock in the near corner above the water. */}
      {[[0, -TANK_HALF, TANK_HALF * 2, 0.06], [0, TANK_HALF, TANK_HALF * 2, 0.06], [-TANK_HALF, 0, 0.06, TANK_HALF * 2], [TANK_HALF, 0, 0.06, TANK_HALF * 2]].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, h / 2, z]}>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial {...glass} />
        </mesh>
      ))}
      <group position={[2.95, WATER_Y + 0.22, 2.95]}>
        <RoundedBox args={[1.6, 0.14, 1.6]} radius={0.03} {...S}>
          <Mat c="#b98a5b" r={0.85} />
        </RoundedBox>
        {[[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]].map(([x, z], i) => (
          <mesh key={i} position={[x, -(WATER_Y + 0.22) / 2, z]} castShadow>
            <cylinderGeometry args={[0.07, 0.07, WATER_Y + 0.22, 10]} />
            <Mat c="#8a6040" />
          </mesh>
        ))}
      </group>
      <Html position={[-TANK_HALF + 0.1, WATER_Y + 0.05, TANK_HALF]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
        <div className="ground-label whitespace-nowrap !text-[#2c6e94] ![text-shadow:none]">water surface</div>
      </Html>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[TANK_HALF + 0.25, 0.2, TANK_HALF + 0.25]} position={[0, -0.2, 0]} friction={0.8} />
        <CuboidCollider args={[TANK_HALF, h, 0.05]} position={[0, h, -TANK_HALF]} />
        <CuboidCollider args={[TANK_HALF, h, 0.05]} position={[0, h, TANK_HALF]} />
        <CuboidCollider args={[0.05, h, TANK_HALF]} position={[-TANK_HALF, h, 0]} />
        <CuboidCollider args={[0.05, h, TANK_HALF]} position={[TANK_HALF, h, 0]} />
        <CuboidCollider args={[0.8, 0.07, 0.8]} position={[2.95, WATER_Y + 0.22, 2.95]} />
      </RigidBody>
    </>
  );
}

/** Math: a square graph-paper platform. */
export function MathMap() {
  const lines = Array.from({ length: 23 }, (_, i) => -5.5 + i * 0.5);
  return (
    <>
      <RoundedBox args={[12, 0.3, 12]} radius={0.08} position={[0, -0.15, 0]} receiveShadow>
        <Mat c="#fbfcfe" r={0.95} />
      </RoundedBox>
      <RoundedBox args={[11.8, 1, 11.8]} radius={0.25} position={[0, -0.75, 0]}>
        <Mat c="#c9d3df" r={0.9} />
      </RoundedBox>
      <MathFrame />
      {lines.map((v) => (
        <group key={v}>
          <mesh position={[v, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[Number.isInteger(v) ? 0.02 : 0.01, 11.6]} />
            <meshBasicMaterial color={Number.isInteger(v) ? "#c3d0e0" : "#e1e8f1"} />
          </mesh>
          <mesh position={[0, 0.002, v]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
            <planeGeometry args={[Number.isInteger(v) ? 0.02 : 0.01, 11.6]} />
            <meshBasicMaterial color={Number.isInteger(v) ? "#c3d0e0" : "#e1e8f1"} />
          </mesh>
        </group>
      ))}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[6, 0.15, 6]} position={[0, -0.15, 0]} friction={0.8} />
      </RigidBody>
    </>
  );
}

/** Geography: a round study floor with a compass rose. */
export function GlobeMap() {
  return (
    <>
      <mesh position={[0, -0.2, 0]} {...S}>
        <cylinderGeometry args={[5, 5, 0.4, 72]} />
        <Mat c="#d9c8a7" r={0.95} />
      </mesh>
      <mesh position={[0, -0.85, 0]}>
        <cylinderGeometry args={[4.95, 4.2, 0.9, 72]} />
        <Mat c="#8a6040" r={0.9} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, (i * Math.PI) / 2]}>
          <circleGeometry args={[3.6, 3, Math.PI / 2 - Math.PI / 12, Math.PI / 6]} />
          <meshBasicMaterial color={i === 0 ? "#c17159" : "#b9a27c"} />
        </mesh>
      ))}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.7, 3.78, 96]} />
        <meshBasicMaterial color="#8a6040" />
      </mesh>
      <RadialMarks radius={4.58} color="#9a7a4c" />
      <Rim radius={4.82} y={.008} color="#a78f5c" width={.06} />
      <Rim radius={3.58} y={.007} color="#b39b71" width={.02} />
      <PlinthBand radius={4.85} y={-.47} color="#b59a64" />
      {(["N", "E", "S", "W"] as const).map((d, i) => {
        const a = (i * Math.PI) / 2;
        return (
          <Html key={d} position={[Math.sin(a) * 4.2, 0.02, -Math.cos(a) * 4.2]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
            <div className="text-[14px] font-extrabold text-[#6b4b2e]">{d}</div>
          </Html>
        );
      })}
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[0.2, 5]} position={[0, -0.2, 0]} />
      </RigidBody>
    </>
  );
}

/** Workshop interior (inside the shared four-wall room): bench, pegboard, shelves. */
export function WorkshopInterior() {
  const wave = useSim(s => Boolean(s.modules.wave));
  const lever = useSim(s => Boolean(s.modules.lever));
  const x = wave || lever ? 0 : -1.2;
  const z = wave ? .4 : lever ? .6 : 1.1;
  const w = wave ? 6.3 : lever ? 5.8 : 4.45;
  const d = wave ? 3.2 : lever ? 2.2 : 3.05;
  return <>
    <OakFloor />
    <RoundedBox args={[w, .014, d]} radius={.06} position={[x, .014, z]} receiveShadow>
      <meshStandardMaterial color="#9eafa4" roughness={1} bumpMap={surfaceBump("woven")} bumpScale={.008} />
    </RoundedBox>
    {[-1, 1].map(side => <group key={side}>
      <Trim size={[w - .1, .004, .025]} at={[x, .024, z + side * (d / 2 - .06)]} color="#e2d8b9" />
      <Trim size={[.025, .004, d - .1]} at={[x + side * (w / 2 - .06), .024, z]} color="#e2d8b9" />
    </group>)}
  </>;
}
