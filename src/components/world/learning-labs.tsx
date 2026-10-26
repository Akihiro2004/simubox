"use client";

import { Instance, Instances, Line, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useRef, type ReactNode } from "react";
import { MathUtils, type Group } from "three";
import { wallBlocksView } from "@/lib/world/cutaway";
import type { Vec3 } from "@/lib/world/catalog";
import { LabBoard } from "./lab-board";
import { Mat } from "./assets";
import { surfaceBump } from "./surfaces";

const WOOD = "#ba936a", INK = "#36585a", CREAM = "#eee7d6";

export function Box({ size, at, color, radius = .025, shadow = true }: { size: Vec3; at: Vec3; color: string; radius?: number; shadow?: boolean }) {
  return <RoundedBox args={size} position={at} radius={Math.min(radius, ...size.map(v => v / 3))} smoothness={2} castShadow={shadow} receiveShadow><Mat c={color} /></RoundedBox>;
}

/** Wall colours: plaster, dado panel, skirting/rails, battens (null hides the battens). */
export type WallTone = { wall: string; dado: string; skirting: string; rail: string; batten: string | null };
const TONES: Record<"maths" | "mechanics", WallTone> = {
  maths: { wall: "#e6e7ed", dado: "#b7c1d2", skirting: "#6c778f", rail: CREAM, batten: null },
  mechanics: { wall: "#eae3d4", dado: "#a4b7ad", skirting: INK, rail: CREAM, batten: "#d8e0cf" },
};

/** The same camera-facing cutaway rule as the other furnished rooms. */
export function Wall({ side, maths, tone = TONES[maths ? "maths" : "mechanics"], animate, children }: { side: "back" | "front" | "left" | "right"; maths?: boolean; tone?: WallTone; animate: boolean; children?: ReactNode }) {
  const scaler = useRef<Group>(null), decor = useRef<Group>(null), hidden = useRef(false);
  const back = side === "back", front = side === "front", left = side === "left";
  const length = back || front ? 12.4 : 10.4;
  const normal: [number, number] = back ? [0, -1] : front ? [0, 1] : left ? [-1, 0] : [1, 0];
  const position: Vec3 = back ? [0, 0, -5.08] : front ? [0, 0, 5.08] : left ? [-6.08, 0, 0] : [6.08, 0, 0];
  useFrame(({ camera }, dt) => {
    if (!scaler.current) return;
    hidden.current = wallBlocksView(normal, camera.position.x, camera.position.z, hidden.current);
    scaler.current.scale.y = animate ? MathUtils.damp(scaler.current.scale.y, hidden.current ? .055 : 1, 9, dt) : hidden.current ? .055 : 1;
    if (decor.current) decor.current.visible = scaler.current.scale.y > .45;
  });
  return <group position={position} rotation={[0, back ? 0 : front ? Math.PI : left ? Math.PI / 2 : -Math.PI / 2, 0]}>
    <group ref={scaler}>
      <Box size={[length, 4.8, .24]} at={[0, 2.4, 0]} color={tone.wall} radius={.06} shadow={false} />
      <Box size={[length - .25, .86, .04]} at={[0, .57, .145]} color={tone.dado} shadow={false} />
      {[.13, 1.04, 4.63].map(y => <Box key={y} size={[length - .15, y === .13 ? .22 : .09, .1]} at={[0, y, .17]} color={y === .13 ? tone.skirting : tone.rail} shadow={false} />)}
      {tone.batten && <Instances limit={15} frames={1}>
        <boxGeometry args={[.035, .72, .025]} /><meshStandardMaterial color={tone.batten} roughness={.7} />
        {Array.from({ length: Math.floor(length / .85) }, (_, i) => <Instance key={i} position={[-length / 2 + .5 + i * .85, .59, .18]} />)}
      </Instances>}
      <group ref={decor}>{children}</group>
    </group>
  </group>;
}

export function Window({ x }: { x: number }) {
  return <group position={[x, 2.7, .2]}>
    <Box size={[2.25, 2.3, .13]} at={[0, 0, 0]} color={WOOD} />
    <mesh position={[0, 0, .075]}><planeGeometry args={[2.02, 2.07]} /><meshBasicMaterial color="#b9d7dc" /></mesh>
    <mesh position={[.45, .58, .08]}><circleGeometry args={[.22, 24]} /><meshBasicMaterial color="#fff0bb" /></mesh>
    <Box size={[2.08, .065, .08]} at={[0, 0, .14]} color={CREAM} />
    <Box size={[.065, 2.13, .08]} at={[0, 0, .14]} color={CREAM} />
    <Box size={[2.42, .12, .42]} at={[0, -1.17, .1]} color={CREAM} />
    {[-1.18, 1.18].map(x => <Box key={x} size={[.13, 2.45, .14]} at={[x, 0, .1]} color={CREAM} />)}
  </group>;
}

export function Plant({ at }: { at: Vec3 }) {
  return <group position={at}>
    <mesh castShadow position={[0, .16, 0]}><cylinderGeometry args={[.23, .17, .32, 16]} /><Mat c="#d1af87" /></mesh>
    <mesh position={[0, .33, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[.2, 16]} /><Mat c="#655e45" /></mesh>
    {Array.from({ length: 6 }, (_, i) => <mesh key={i} position={[Math.cos(i) * .11, .53 + i % 2 * .12, Math.sin(i) * .11]} rotation={[Math.sin(i) * .5, 0, Math.cos(i) * -.5]} scale={[.12, .31, .075]} castShadow><sphereGeometry args={[1, 12, 8]} /><Mat c={i % 2 ? "#527e65" : "#789a73"} /></mesh>)}
  </group>;
}

function Cabinet({ at, maths, children }: { at: Vec3; maths: boolean; children?: ReactNode }) {
  return <group position={at}>
    <Box size={[1.65, 1.3, 1.05]} at={[0, .78, 0]} color={maths ? "#78998b" : "#728e89"} />
    <Box size={[1.78, .13, 1.15]} at={[0, 1.49, 0]} color={WOOD} />
    {[-.39, .39].map(x => <group key={x}>
      <Box size={[.73, 1.06, .055]} at={[x, .8, .55]} color={CREAM} />
      <Box size={[.055, .22, .07]} at={[x + (x < 0 ? .22 : -.22), .92, .6]} color={INK} />
    </group>)}
    <Box size={[1.48, .12, .85]} at={[0, .12, 0]} color={INK} />
    {children}
  </group>;
}

function Abacus() {
  return <group position={[0, 1.58, 0]}>
    {[-.65, .65].map(x => <Box key={x} size={[.1, .95, .14]} at={[x, .46, 0]} color={WOOD} />)}
    {[0, .92].map(y => <Box key={y} size={[1.4, .1, .3]} at={[0, y, 0]} color={WOOD} />)}
    {[.2, .42, .64].map(y => <Box key={y} size={[1.2, .022, .022]} at={[0, y, 0]} color="#b4a16e" radius={.005} />)}
    <Instances limit={18} frames={1} castShadow><sphereGeometry args={[.075, 12, 8]} /><meshStandardMaterial roughness={.55} />
      {Array.from({ length: 18 }, (_, i) => <Instance key={i} position={[-.48 + i % 6 * .16, .2 + Math.floor(i / 6) * .22, 0]} color={["#5e9295", "#d0a555", "#d28b68"][Math.floor(i / 6)]} />)}
    </Instances>
  </group>;
}

function Instruments() {
  return <group position={[0, 1.56, 0]}>
    <Box size={[1.24, .09, .7]} at={[0, .045, 0]} color={INK} />
    <Box size={[.08, .85, .08]} at={[0, .5, 0]} color="#c7a364" />
    <group position={[0, .83, 0]} rotation={[0, 0, .15]}>
      <Box size={[1.3, .055, .06]} at={[0, 0, 0]} color="#c7a364" />
      {[-.5, .5].map(x => <group key={x} position={[x, -.25, 0]}>
        <Box size={[.015, .5, .015]} at={[0, .25, 0]} color={INK} radius={.002} />
        <mesh castShadow><cylinderGeometry args={[.21, .08, .09, 20]} /><Mat c="#c7a364" m={.4} /></mesh>
      </group>)}
    </group>
  </group>;
}

function Shelves({ maths }: { maths: boolean }) {
  return <group position={[0, 2.05, .4]}>
    {[-1, 1].map(x => <Box key={x} size={[.08, 2.8, .44]} at={[x, -.6, 0]} color={WOOD} />)}
    {[-1.9, -.8, 0, .8].map(y => <Box key={y} size={[2.1, .09, .5]} at={[0, y, 0]} color={WOOD} />)}
    {[-.47, .47].map(x => <group key={x}><Box size={[.8, .65, .37]} at={[x, -1.5, 0]} color={x < 0 ? "#9aaa96" : "#dbcaac"} /><Box size={[.25, .12, .015]} at={[x, -1.4, .2]} color="#f4ecd8" /></group>)}
    {Array.from({ length: 7 }, (_, i) => <Box key={i} size={[.16, .42 + i % 3 * .07, .3]} at={[-.78 + i * .22, -.53 + i % 3 * .035, 0]} color={[INK, "#d2ad67", "#c88c6b", "#96afa0"][i % 4]} />)}
    {[-.65, 0, .65].map((x, i) => <mesh key={x} position={[x, .3, 0]} castShadow>
      {maths ? i === 0 ? <sphereGeometry args={[.2, 20, 14]} /> : i === 1 ? <coneGeometry args={[.22, .45, 20]} /> : <boxGeometry args={[.36, .36, .36]} /> : <cylinderGeometry args={[.17, .19, .22 + i * .1, 20]} />}
      <Mat c={i % 2 ? "#cfaa60" : INK} m={maths ? 0 : .4} />
    </mesh>)}
  </group>;
}

function Poster({ x, maths }: { x: number; maths: boolean }) {
  return <group position={[x, 2.75, .22]}>
    <Box size={[1.65, 2, .09]} at={[0, 0, 0]} color={WOOD} />
    <LabBoard position={[0, 0, .055]} width={1.5} height={1.85} background="#f3eddb" lines={maths ? [
      { text: "A LITTLE CURIOSITY", size: 108, color: INK }, { text: "A world of possibilities.", size: 136, color: "#b0824d" }, { text: "Count. Sketch. Discover.", size: 90, color: INK },
    ] : [{ text: "PREDICT", size: 145, color: INK }, { text: "MEASURE", size: 145, color: "#b0824d" }, { text: "COMPARE", size: 145, color: INK }, { text: "One variable at a time.", size: 100, color: INK }]} />
    {maths ? <group position={[0, -.45, .075]}>
      <Line points={[[-.5, .4, 0], [-.5, -.45, 0], [.5, -.45, 0], [-.5, .4, 0]]} color="#5d8d84" lineWidth={2} />
      <Line points={[[-.5, -.28, .01], [-.33, -.28, .01], [-.33, -.45, .01]]} color="#b59354" lineWidth={2} />
      <mesh position={[.27, .18, 0]}><ringGeometry args={[.23, .25, 32]} /><meshBasicMaterial color="#b59354" /></mesh>
    </group> : <group position={[0, -.45, .075]}>
      <mesh position={[-.2, 0, 0]}><ringGeometry args={[.24, .3, 24]} /><meshBasicMaterial color="#5d8d84" /></mesh>
      <Line points={[[-.2, 0, .01], [.5, 0, .01], [.37, .1, .01], [.5, 0, .01], [.37, -.1, .01]]} color="#c28e52" lineWidth={3} />
    </group>}
  </group>;
}

export function Stool({ at }: { at: Vec3 }) {
  return <group position={at}>
    <mesh castShadow position={[0, .65, 0]}><cylinderGeometry args={[.38, .38, .12, 24]} /><Mat c={WOOD} /></mesh>
    {[-.22, .22].flatMap(x => [-.22, .22].map(z => <Box key={`${x}${z}`} size={[.075, .6, .075]} at={[x, .3, z]} color={INK} />))}
    <Box size={[.5, .06, .06]} at={[0, .23, .22]} color={INK} />
  </group>;
}

function FractionGallery() {
  return <group position={[.1, 2.75, .22]}>
    <Box size={[5.5, 2.25, .09]} at={[0, 0, 0]} color="#d8c7aa" shadow={false} />
    {([2, 3, 4] as const).map((parts, i) => <group key={parts} position={[(i - 1) * 1.7, .15, .07]}>
      <mesh><circleGeometry args={[.62, 48]} /><meshBasicMaterial color="#f6edda" /></mesh>
      <mesh position={[0, 0, .006]}><circleGeometry args={[.61, 48, 0, Math.PI * 2 / parts]} /><meshBasicMaterial color={["#cb9078", "#7b9eaf", "#b3a2c2"][i]} /></mesh>
      {Array.from({ length: parts }, (_, k) => <Line key={k} points={[[0, 0, .012], [Math.cos(k * Math.PI * 2 / parts) * .62, Math.sin(k * Math.PI * 2 / parts) * .62, .012]]} color="#d8c7aa" lineWidth={1.5} />)}
      <LabBoard position={[0, -.88, .01]} width={.75} height={.33} background="#d8c7aa" lines={[{ text: `1/${parts}`, size: 260, color: "#4d596c" }]} />
    </group>)}
  </group>;
}

function DrawingTools() {
  return <>
    <group position={[3.1, 1.06, 1.95]} rotation={[-Math.PI / 2, 0, -.2]}>
      <mesh><ringGeometry args={[.32, .48, 32, 1, 0, Math.PI]} /><Mat c="#b89b5d" m={.3} /></mesh>
      {Array.from({ length: 7 }, (_, i) => <mesh key={i} position={[Math.cos(i * Math.PI / 6) * .4, Math.sin(i * Math.PI / 6) * .4, .005]} rotation={[0, 0, i * Math.PI / 6]}><boxGeometry args={[.11, .015, .01]} /><Mat c="#f4e8ce" /></mesh>)}
    </group>
    <group position={[-3.6, 1.065, 1.65]} rotation={[0, -.2, 0]}>
      <RoundedBox args={[.75, .055, .58]} radius={.025}><Mat c="#557e78" /></RoundedBox>
      <mesh position={[0, .035, 0]}><boxGeometry args={[.68, .025, .52]} /><Mat c="#f4ead4" /></mesh>
      <mesh position={[0, .05, 0]}><boxGeometry args={[.025, .01, .51]} /><Mat c="#c99b63" /></mesh>
      <mesh position={[.65, .02, 0]} rotation={[Math.PI / 2, 0, -.3]}><cylinderGeometry args={[.025, .025, .7, 6]} /><Mat c="#d3a651" /></mesh>
    </group>
  </>;
}

/** A mathematics atelier: side teaching wall, oval island and fraction gallery. */
function MathRoom({ animate }: { animate: boolean }) {
  return <>
    <Box size={[12.4, .34, 10.4]} at={[0, -.17, 0]} color="#e4dbc8" radius={.09} />
    <Box size={[12.2, .85, 10.2]} at={[0, -.78, 0]} color="#b2b6c7" radius={.18} />
    <Box size={[12.25, .06, 10.25]} at={[0, -.36, 0]} color="#63718b" />
    <Instances limit={120} frames={1} receiveShadow>
      <boxGeometry args={[.985, .018, .985]} /><meshStandardMaterial roughness={.9} bumpMap={surfaceBump("stone")} bumpScale={.006} />
      {Array.from({ length: 10 }, (_, row) => Array.from({ length: 12 }, (_, col) => <Instance key={`${row}-${col}`} position={[-5.5 + col, .012, -4.5 + row]} color={["#e5dfd1", "#eee7d9", "#e9e3d6"][(row + col * 3) % 3]} />))}
    </Instances>
    <Wall side="back" maths animate={animate}>
      <LabBoard position={[.1, 4.22, .17]} width={5.7} height={.65} background="#e6e7ed" lines={[{ text: "THE MATH STUDIO / A PLACE FOR IDEAS", size: 90, color: "#4e5c77" }]} />
      <Window x={-4.35} /><FractionGallery />
    </Wall>
    <Wall side="left" maths animate={animate} />
    <Wall side="right" maths animate={animate}><Window x={-2.5} /><Poster x={1.7} maths /></Wall>
    <Wall side="front" maths animate={animate}><Poster x={-3.8} maths /><Window x={2.9} /></Wall>
    <group position={[0, 0, -4.35]}>
      <Box size={[4.9, 1.1, .9]} at={[0, .65, 0]} color="#8f9eb4" />
      <Box size={[5.08, .1, 1.02]} at={[0, 1.25, 0]} color="#d5bc96" />
      {[-1.6, 0, 1.6].map((x, i) => <group key={x}><Box size={[1.43, .81, .045]} at={[x, .65, .48]} color={["#d7c9b1", "#c7becf", "#c3ced0"][i]} /><Box size={[.32, .045, .04]} at={[x, .92, .52]} color="#5d6b80" /></group>)}

    </group>
    <Cabinet at={[4.8, 0, -4.1]} maths><Abacus /></Cabinet>
    <group position={[-3.9, 0, -4.15]}>
      <Box size={[2.2, .26, 1.1]} at={[0, .45, 0]} color={WOOD} />
      <Box size={[2.02, .17, .93]} at={[0, .67, 0]} color="#a5aec4" radius={.07} />
      {[-.85, .85].map(x => <Box key={x} size={[.13, .36, .85]} at={[x, .18, 0]} color={WOOD} />)}
    </group>
    <Stool at={[4.8, 0, 1.6]} /><Stool at={[-4.5, 0, 2.5]} />
    <Plant at={[5.25, 0, 4.15]} />
    <mesh position={[0, .03, .6]} rotation={[-Math.PI / 2, 0, 0]} scale={[5.5, 3.6, 1]} receiveShadow><circleGeometry args={[1, 64]} /><meshStandardMaterial color="#ccac91" roughness={1} bumpMap={surfaceBump("woven")} bumpScale={.008} /></mesh>
    <mesh position={[0, .95, .6]} scale={[5.15, 1, 3.1]} castShadow receiveShadow><cylinderGeometry args={[1, 1, .18, 80]} /><Mat c="#e6d6b8" /></mesh>
    <mesh position={[0, .85, .6]} scale={[5.05, 1, 3]}><cylinderGeometry args={[1, 1, .06, 80]} /><Mat c="#8c98ad" /></mesh>
    {[-2.3, 2.3].map(x => <group key={x} position={[x, 0, .6]}><mesh position={[0, .45, 0]} castShadow><cylinderGeometry args={[.4, .57, .8, 24]} /><Mat c="#8c98ad" /></mesh><mesh position={[0, .07, 0]}><cylinderGeometry args={[.7, .7, .14, 32]} /><Mat c="#c6ac87" /></mesh></group>)}
    <DrawingTools />
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[6.2, .17, 5.2]} position={[0, -.17, 0]} />
      {[-1, 1].map(sign => <group key={sign}><CuboidCollider args={[.12, 2.4, 5.2]} position={[sign * 6.08, 2.4, 0]} /><CuboidCollider args={[6.2, 2.4, .12]} position={[0, 2.4, sign * 5.08]} /></group>)}
    </RigidBody>
  </>;
}

/** Furnished teaching rooms; the central work area stays clear for experiments. */
export function LearningLabMap({ maths = false, animate }: { maths?: boolean; animate: boolean }) {
  if (maths) return <MathRoom animate={animate} />;
  const accent = maths ? "#648c7e" : "#b48c53";
  return <>
    <Box size={[12.4, .34, 10.4]} at={[0, -.17, 0]} color={WOOD} radius={.09} />
    <Box size={[12.2, .85, 10.2]} at={[0, -.78, 0]} color={maths ? "#a9baab" : "#b6ab93"} radius={.18} />
    <Box size={[12.25, .06, 10.25]} at={[0, -.36, 0]} color={INK} />
    <Instances limit={156} frames={1} receiveShadow>
      <boxGeometry args={[.98, .018, .77]} /><meshStandardMaterial roughness={.83} bumpMap={surfaceBump("wood")} bumpScale={.012} />
      {Array.from({ length: 13 }, (_, row) => Array.from({ length: 12 }, (_, col) => <Instance key={`${row}-${col}`} position={[-5.5 + col, .012, -4.62 + row * .77]} color={["#c7a77f", "#c0a078", "#cfb18a", "#d4b792"][(row * 3 + col * 7) % 4]} />))}
    </Instances>
    <Wall side="back" maths={maths} animate={animate}>
      <LabBoard position={[0, 4.22, .17]} width={6.8} height={.64} background={maths ? "#e5e9de" : "#eae3d4"} lines={[{ text: maths ? "SIMUBOX  /  THE MATH STUDIO" : "SIMUBOX  /  THE MECHANICS LAB", size: 104, color: INK }]} />
      {!maths && <group position={[0, 2.65, .23]}>
        <Box size={[6.9, 2.2, .12]} at={[0, 0, 0]} color={WOOD} />
        <LabBoard position={[0, 0, .08]} width={6.65} height={1.95} lines={[{ text: "THE LAWS BEHIND EVERY MOVE", size: 46, color: "#b7d2c7" }, { text: "F = ma    ·    p = mv    ·    J = Δp", size: 91, color: "#f4d997" }, { text: "Push. Predict. Measure. Try again.", size: 45 }]} />
      </group>}
    </Wall>
    <Wall side="left" maths={maths} animate={animate}><Window x={1.8} /><Poster x={-1.6} maths={maths} /></Wall>
    <Wall side="right" maths={maths} animate={animate}><Window x={-1.8} /><Poster x={1.6} maths={maths} /></Wall>
    <Wall side="front" maths={maths} animate={animate}><Shelves maths={maths} /><Window x={-3.4} /><Poster x={3.5} maths={maths} /></Wall>
    <Cabinet at={[-4.8, 0, -4.1]} maths={maths}>{maths ? <Abacus /> : <Instruments />}</Cabinet>
    <Cabinet at={[4.8, 0, -4.1]} maths={maths}>
      <Plant at={[.35, 1.56, 0]} />
      <mesh position={[-.4, 1.8, .1]} castShadow>{maths ? <icosahedronGeometry args={[.24, 0]} /> : <cylinderGeometry args={[.19, .22, .45, 24]} />}<Mat c={accent} m={maths ? .1 : .5} /></mesh>
    </Cabinet>
    <group position={[-5.95, 0, -.65]} rotation={[0, Math.PI / 2, 0]}><Shelves maths={maths} /></group>
    <Stool at={[-4.9, 0, 2.4]} />
    <Plant at={[-5.05, 0, 4.1]} />
    <mesh position={[0, .025, 3.65]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[7.2, 1.1]} /><meshStandardMaterial color={maths ? "#97b2a0" : "#b7af91"} roughness={1} bumpMap={surfaceBump("woven")} bumpScale={.008} /></mesh>
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[6.2, .17, 5.2]} position={[0, -.17, 0]} />
      {[-1, 1].map(sign => <group key={sign}><CuboidCollider args={[.12, 2.4, 5.2]} position={[sign * 6.08, 2.4, 0]} /><CuboidCollider args={[6.2, 2.4, .12]} position={[0, 2.4, sign * 5.08]} /></group>)}
    </RigidBody>
  </>;
}
