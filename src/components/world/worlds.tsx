"use client";

// Fixed diorama decor for each world, with explicit static colliders.
// Rooms have four walls; any wall between the camera and the room lowers to
// a baseboard stub (a dollhouse cutaway), so orbiting always shows inside.

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { CuboidCollider, CylinderCollider, RigidBody } from "@react-three/rapier";
import { useRef } from "react";
import { MathUtils, type Group } from "three";
import type { WorldId } from "@/lib/world/catalog";
import { wallBlocksView } from "@/lib/world/cutaway";
import { AssetModel, Mat } from "./assets";
import { Artwork, BedroomTextiles, DrapedWindow, OakFloor, WallFinish, Trim, LabWall } from "./architecture";
import { GlobeMap, MathMap, OceanMap, SpaceMap, WorkshopInterior } from "./maps";
import { CourtLandscape, PlinthBand, Rim, Sconce, StudyWall, WorkshopWall } from "./scenery";
import { CourtPaint } from "./court-campus";
import { useSim } from "@/lib/store";
import { GardenPark } from "./garden-park";
import { PeriodicTable } from "./periodic-table";

const S = { castShadow: true, receiveShadow: true } as const;
const HALF = 4.08; // wall centre-line distance from the room centre
const WALL_H = 3.8;
const STUB = 0.07; // lowered walls keep ~27 cm as a baseboard

type Side = "-x" | "+x" | "-z" | "+z";
/** Wall frames: local +z faces into the room, local x runs along the wall. */
const SIDES: Record<Side, { pos: [number, number]; rotY: number; normal: [number, number] }> = {
  "-z": { pos: [0, -HALF], rotY: 0, normal: [0, -1] },
  "+z": { pos: [0, HALF], rotY: Math.PI, normal: [0, 1] },
  "-x": { pos: [-HALF, 0], rotY: Math.PI / 2, normal: [-1, 0] },
  "+x": { pos: [HALF, 0], rotY: -Math.PI / 2, normal: [1, 0] },
};

function Wall({ side, color, animate, children }: { side: Side; color: string; animate: boolean; children?: React.ReactNode }) {
  const scaler = useRef<Group>(null);
  const decor = useRef<Group>(null);
  const hidden = useRef(false);
  const f = SIDES[side];
  useFrame(({ camera }, dt) => {
    const g = scaler.current;
    if (!g) return;
    hidden.current = wallBlocksView(f.normal, camera.position.x, camera.position.z, hidden.current);
    const target = hidden.current ? STUB : 1;
    g.scale.y = animate ? MathUtils.damp(g.scale.y, target, 9, dt) : target;
    // Windows and posters vanish before they get squashed.
    if (decor.current) decor.current.visible = g.scale.y > 0.45;
  });
  return (
    <group position={[f.pos[0], 0, f.pos[1]]} rotation={[0, f.rotY, 0]}>
      <group ref={scaler}>
        <RoundedBox args={[8.4, WALL_H, 0.24]} radius={0.06} position={[0, WALL_H / 2, 0]} receiveShadow>
          <Mat c={color} r={0.92} />
        </RoundedBox>
        <group ref={decor}><WallFinish lab={color === "#e5eeea"} />{children}</group>
      </group>
    </group>
  );
}

/** Floor slab, box-like base, four cutaway walls and solid colliders. */
function Room({ floor, base, wall, animate, decor, children }: { floor: string; base: string; wall: string; animate: boolean; decor: Partial<Record<Side, React.ReactNode>>; children?: React.ReactNode }) {
  return (
    <>
      <RoundedBox args={[8.4, 0.34, 8.4]} radius={0.08} position={[0, -0.17, 0]} receiveShadow>
        <Mat c={floor} r={0.8} />
      </RoundedBox>
      <RoundedBox args={[8.2, 1.2, 8.2]} radius={0.22} position={[0, -0.92, 0]}>
        <Mat c={base} r={0.9} />
      </RoundedBox>
      <RoundedBox args={[8.25, .055, 8.25]} radius={.025} position={[0, -.36, 0]}><Mat c="#8c806b" r={.5} m={.25} /></RoundedBox>
      {(Object.keys(SIDES) as Side[]).map((side) => (
        <Wall key={side} side={side} color={wall} animate={animate}>
          {decor[side]}
        </Wall>
      ))}
      {/* Colliders stay solid whether a wall is shown or lowered. */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[4.2, 0.17, 4.2]} position={[0, -0.17, 0]} friction={0.8} />
        <CuboidCollider args={[0.12, 2.5, 4.2]} position={[-HALF, 1.9, 0]} />
        <CuboidCollider args={[0.12, 2.5, 4.2]} position={[HALF, 1.9, 0]} />
        <CuboidCollider args={[4.2, 2.5, 0.12]} position={[0, 1.9, -HALF]} />
        <CuboidCollider args={[4.2, 2.5, 0.12]} position={[0, 1.9, HALF]} />
        <CuboidCollider args={[4.2, 0.1, 4.2]} position={[0, 3.7, 0]} />
      </RigidBody>
      {children}
    </>
  );
}

// ---------- wall decor (wall-local coordinates: x along the wall, z = 0.13 is the inner face) ----------

function Window({ x, y = 2.1 }: { x: number; y?: number }) {
  return (
    <group position={[x, y, 0.13]}>
      <RoundedBox args={[1.5, 1.2, 0.08]} radius={0.04}>
        <Mat c="#ffffff" />
      </RoundedBox>
      <mesh position={[0, 0, 0.045]}>
        <planeGeometry args={[1.34, 1.04]} />
        <meshBasicMaterial color="#bfe3ff" />
      </mesh>
      {[
        [-0.28, 0.18, 0.13],
        [-0.12, 0.22, 0.17],
        [0.05, 0.17, 0.12],
      ].map(([cx, cy, r], i) => (
        <mesh key={i} position={[cx, cy, 0.05]}>
          <circleGeometry args={[r, 20]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
      <mesh position={[0, 0, 0.06]}>
        <boxGeometry args={[0.04, 1.06, 0.02]} />
        <Mat c="#ffffff" />
      </mesh>
    </group>
  );
}

function Door({ x }: { x: number }) {
  return (
    <group position={[x, 0, 0.13]}>
      <RoundedBox args={[1.1, 2.3, 0.08]} radius={0.03} position={[0, 1.15, 0]}>
        <Mat c="#ffffff" />
      </RoundedBox>
      <RoundedBox args={[0.94, 2.16, 0.06]} radius={0.03} position={[0, 1.1, 0.03]}>
        <Mat c="#d9ad80" r={0.8} />
      </RoundedBox>
      <mesh position={[0.34, 1.05, 0.09]}>
        <sphereGeometry args={[0.045, 12, 10]} />
        <Mat c="#f2c14e" m={0.5} r={0.3} />
      </mesh>
    </group>
  );
}

function Clock({ x, y }: { x: number; y: number }) {
  return (
    <group position={[x, y, 0.15]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.06, 32]} />
        <Mat c="#ffffff" />
      </mesh>
      <mesh position={[0, 0.07, 0.035]}>
        <boxGeometry args={[0.03, 0.18, 0.01]} />
        <meshBasicMaterial color="#1c1e22" />
      </mesh>
      <mesh position={[0.06, 0, 0.035]} rotation={[0, 0, -Math.PI / 2]}>
        <boxGeometry args={[0.025, 0.14, 0.01]} />
        <meshBasicMaterial color="#1c1e22" />
      </mesh>
    </group>
  );
}

// ---------- worlds ----------

function Bedroom({ animate }: { animate: boolean }) {
  return (
    <Room
      floor="#b88759"
      base="#bdac91"
      wall="#efe6d3"
      animate={animate}
      decor={{
        "-z": <><DrapedWindow x={-0.6} /><Artwork x={2.3} /><Sconce x={3.45} /></>,
        "-x": <><DrapedWindow x={-1.9} /><Artwork x={1.25} variant={1} /></>,
        "+x": <><DrapedWindow x={0.6} /><Artwork x={-2.1} /></>,
        "+z": <><Door x={-1.8} /><StudyWall /><Sconce x={-3.15} /></>,
      }}
    >
      <OakFloor />
      <BedroomTextiles />
    </Room>
  );
}

function Lab({ animate }: { animate: boolean }) {
  return (
    <Room
      floor="#f1f4f7"
      base="#8fa99e"
      wall="#e5eeea"
      animate={animate}
      decor={{
        "-z": <><Window x={1.4} y={2.3} /><LabWall /></>,
        "-x": <PeriodicTable x={-0.2} />,
        "+x": <><Clock x={0.6} y={2.6} /><LabWall /></>,
        "+z": <Door x={-1.8} />,
      }}
    >
      {[-3, -2, -1, 0, 1, 2, 3].map((v) => (
        <group key={v}>
          <mesh position={[v, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.015, 8.3]} />
            <meshBasicMaterial color="#dde3ea" />
          </mesh>
          <mesh position={[0, 0.002, v]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
            <planeGeometry args={[0.015, 8.3]} />
            <meshBasicMaterial color="#dde3ea" />
          </mesh>
        </group>
      ))}
      <Rim radius={1.35} y={.008} color="#a0b6ad" width={.025} />
    </Room>
  );
}

function Court() {
  const markers = Array.from({ length: 12 }, (_, i) => (i + 1) * 5);
  // set_environment can hide the campus scenery and recolour the ground (Moon, Mars...).
  const scenery = useSim((s) => s.environment?.scenery ?? true);
  const ground = useSim((s) => s.environment?.ground ?? null);
  const surface = useSim((s) => s.environment?.surface ?? null);
  return (
    <>
      {scenery && <CourtLandscape />}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[20, -0.01, 0]} receiveShadow>
        <planeGeometry args={[3000, 3000]} />
        <Mat c={ground ?? "#a3b780"} r={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[28, 0.002, 0]} receiveShadow>
        <planeGeometry args={[66, 13]} />
        <Mat c={surface ?? "#688e9e"} r={0.85} />
      </mesh>
      {[-6.3, 6.3].map((z) => (
        <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[28, 0.004, z]}>
          <planeGeometry args={[66, 0.08]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[28, 0.004, 0]}>
        <planeGeometry args={[66, 0.05]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
      </mesh>
      {markers.map((x) => (
        <group key={x} position={[x, 0.005, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.06, 12.6]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={x % 10 === 0 ? 0.85 : 0.45} />
          </mesh>
        </group>
      ))}
      {/* Perimeter paving and lane-end border. Measurements keep their original coordinates. */}
      {[-7.1, 7.1].map(z => <Trim key={z} size={[66, .035, 1.1]} at={[28, -.005, z]} color="#c9c5ad" />)}
      <Trim size={[.14, .01, 13]} at={[-4.9, .008, 0]} color="#f8edd6" />
      <CourtPaint track={surface} />
      <group position={[61, 0, 0]}>
        <mesh position={[0.4, 1.6, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 3.2, 10]} />
          <Mat c="#5f6670" />
        </mesh>
        <RoundedBox args={[0.08, 1.05, 1.8]} radius={0.02} position={[0, 3.25, 0]} castShadow>
          <Mat c="#ffffff" />
        </RoundedBox>
        <mesh position={[-0.3, 3.0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.23, 0.02, 8, 24]} />
          <Mat c="#f97316" />
        </mesh>
      </group>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[1500, 0.5, 1500]} position={[20, -0.5, 0]} friction={0.9} />
      </RigidBody>
    </>
  );
}

function Park() {
  return (
    <>
      <GardenPark />
      <group position={[-7, 8, -9]}>
        <AssetModel asset="sun" />
      </group>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[0.3, 6.7]} position={[0, -0.3, 0]} friction={0.9} />
      </RigidBody>
    </>
  );
}

function Stage() {
  return (
    <>
      <mesh position={[0, -0.2, 0]} {...S}>
        <cylinderGeometry args={[5, 5, 0.4, 64]} />
        <Mat c="#ffffff" r={0.6} />
      </mesh>
      <mesh position={[0, -0.8, 0]}>
        <cylinderGeometry args={[4.95, 4.2, 0.8, 64]} />
        <Mat c="#d5dce5" r={0.9} />
      </mesh>
      <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.6, 4.68, 96]} />
        <meshBasicMaterial color="#e4e9f0" />
      </mesh>
      <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.9, 1.95, 96]} />
        <meshBasicMaterial color="#ffc531" />
      </mesh>
      {Array.from({ length: 48 }, (_, i) => {
        const a = i * Math.PI / 24;
        return <group key={i} rotation={[0, a, 0]}><Trim size={[.018, .008, i % 4 === 0 ? .2 : .09]} at={[0, .006, 4.4]} color="#9aafa7" /></group>;
      })}
      <mesh position={[0, -.42, 0]}><cylinderGeometry args={[5.015, 5.015, .035, 96]} /><Mat c="#b59a64" m={.45} r={.4} /></mesh>
      <PlinthBand radius={4.93} y={-.59} color="#768d8d" />
      <Rim radius={4.85} y={.008} color="#bca777" width={.035} />
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[0.2, 5]} position={[0, -0.2, 0]} />
      </RigidBody>
    </>
  );
}

export function WorldDecor({ world, animate }: { world: WorldId; animate: boolean }) {
  switch (world) {
    case "bedroom":
      return <Bedroom animate={animate} />;
    case "lab":
      return <Lab animate={animate} />;
    case "court":
      return <Court />;
    case "park":
      return <Park />;
    case "stage":
      return <Stage />;
    case "space":
      return <SpaceMap animate={animate} />;
    case "ocean":
      return <OceanMap />;
    case "math":
      return <MathMap />;
    case "globe":
      return <GlobeMap />;
    case "workshop":
      return (
        <Room floor="#cdb08a" base="#8c9a91" wall="#e8ebee" animate={animate} decor={{ "-z": <WorkshopWall />, "-x": <><Window x={-1.4} /><Artwork x={1.3} /></>, "+x": <Window x={0.6} />, "+z": <><Door x={-1.8} /><StudyWall /></> }}>
          <WorkshopInterior />
        </Room>
      );
  }
}
