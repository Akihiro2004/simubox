"use client";

import { Instances, Instance, RoundedBox } from "@react-three/drei";
import { Trim } from "./architecture";
import { Mat } from "./assets";

export function Rim({ radius, y, color, width = .035 }: { radius: number; y: number; color: string; width?: number }) {
  return <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
    <ringGeometry args={[radius - width, radius, 128]} /><meshStandardMaterial color={color} roughness={.45} metalness={.35} />
  </mesh>;
}

export function RadialMarks({ radius, count = 60, color = "#a58d66", y = .012 }: { radius: number; count?: number; color?: string; y?: number }) {
  return <Instances limit={count} frames={1}>
    <boxGeometry args={[.018, .01, .18]} /><meshStandardMaterial color={color} roughness={.55} />
    {Array.from({ length: count }, (_, i) => {
      const a = i * Math.PI * 2 / count;
      return <Instance key={i} position={[Math.sin(a) * radius, y, Math.cos(a) * radius]} rotation={[0, a, 0]} scale={[i % 5 ? 1 : 1.8, 1, i % 5 ? .5 : 1.4]} />;
    })}
  </Instances>;
}

export function PlinthBand({ radius, y, color }: { radius: number; y: number; color: string }) {
  return <mesh position={[0, y, 0]} castShadow><cylinderGeometry args={[radius, radius, .045, 96]} /><Mat c={color} r={.4} m={.45} /></mesh>;
}

export function Sconce({ x }: { x: number }) {
  return <group position={[x, 2.5, .24]}>
    <Trim size={[.13, .32, .08]} at={[0, 0, 0]} color="#a38a5e" />
    <mesh position={[0, 0, .095]} castShadow><cylinderGeometry args={[.12, .17, .23, 20]} /><meshStandardMaterial color="#f0dfbc" emissive="#ffc979" emissiveIntensity={.3} roughness={.85} /></mesh>
  </group>;
}

export function StudyWall() {
  return <group position={[1.55, 1.8, .22]}>
    <Trim size={[1.6, .08, .35]} at={[0, 0, .08]} color="#a97c50" />
    {[-.55, -.38, -.2, -.04].map((x, i) => <Trim key={x} size={[.12, .3 + i * .025, .22]} at={[x, .21, .08]} color={["#c49b61", "#76928a", "#eee1c8", "#b77b60"][i]} />)}
    <RoundedBox args={[.4, .48, .05]} position={[.46, .28, -.01]} radius={.015}><Mat c="#81613f" /></RoundedBox>
    <mesh position={[.46, .28, .02]}><planeGeometry args={[.31, .38]} /><Mat c="#e9d9b5" /></mesh>
  </group>;
}

export function WorkshopWall() {
  return <group position={[.2, 2.05, .21]}>
    <Trim size={[3.6, 1.5, .065]} at={[0, 0, 0]} color="#b5976b" />
    <Instances limit={104} frames={1}>
      <cylinderGeometry args={[.022, .022, .008, 6]} /><meshStandardMaterial color="#735f45" />
      {Array.from({ length: 104 }, (_, i) => <Instance key={i} position={[-1.56 + (i % 13) * .26, -.6 + Math.floor(i / 13) * .17, .037]} rotation={[Math.PI / 2, 0, 0]} />)}
    </Instances>
    {[-1.25, -.6, .15, .95].map((x, i) => <group key={x} position={[x, .12, .1]} rotation={[0, 0, i % 2 ? -.2 : .15]}>
      <Trim size={[.085, .4, .06]} at={[0, -.13, 0]} color={["#ad6950", "#567e87", "#c39a55", "#688277"][i]} />
      <Trim size={[i % 2 ? .12 : .3, .14, .09]} at={[0, .13, 0]} color="#9aaca9" />
    </group>)}
    <Trim size={[3.7, .09, .38]} at={[0, -.8, .12]} color="#887252" />
    <Trim size={[3.2, .025, .09]} at={[0, -.86, .19]} color="#f7dfac" />
  </group>;
}

export { CourtLandscape } from "./court-campus";

export function ObservatoryDeck() {
  return <>
    <PlinthBand radius={12.82} y={-.2} color="#5e7591" />
    <Rim radius={12.5} y={.012} color="#819fbc" width={.075} />
    <RadialMarks radius={12.12} count={96} color="#7797b4" />
    {Array.from({ length: 12 }, (_, i) => <group key={i} rotation={[0, i * Math.PI / 6, 0]}>
      <Trim size={[.055, .012, 3.5]} at={[0, .009, 10.2]} color="#344963" />
      <Trim size={[.65, .035, .11]} at={[0, .025, 12.4]} color="#b0d8e1" />
      <Trim size={[.45, .2, .26]} at={[0, -.24, 12.35]} color="#4a617e" />
    </group>)}
  </>;
}

export function OceanHabitat() {
  return <>
    <Instances limit={72} frames={1} castShadow receiveShadow>
      <dodecahedronGeometry args={[.1, 0]} /><meshStandardMaterial roughness={.9} />
      {Array.from({ length: 72 }, (_, i) => {
        const a = i * 2.39996, r = .15 + i % 9 * .055, center = i % 2 ? [-2.5, -2.4] : [2.3, -2.7];
        return <Instance key={i} position={[center[0] + Math.cos(a) * r, .07 + i % 3 * .05, center[1] + Math.sin(a) * r]} scale={[1.5, .7, 1]} color={["#c8b5a0", "#98aaa5", "#b48d76"][i % 3]} />;
      })}
    </Instances>
    {[-2.9, 2.5].map((x, i) => <group key={x} position={[x, .12, -2.4]}>
      {Array.from({ length: 6 }, (_, n) => <mesh key={n} position={[Math.sin(n * 2.4) * .22, n % 3 * .11, Math.cos(n * 2.4) * .22]} rotation={[0, 0, Math.sin(n) * .35]} castShadow>
        <capsuleGeometry args={[.055, .3 + n % 3 * .12, 3, 8]} /><Mat c={i ? "#b98a86" : "#d0af78"} r={.9} />
      </mesh>)}
    </group>)}
    {/* Dock seams and mooring caps add scale without changing the water model. */}
    {Array.from({ length: 9 }, (_, i) => <Trim key={i} size={[.012, .009, 1.5]} at={[2.22 + i * .18, 2.897, 2.95]} color="#806749" />)}
    {[[2.25, 2.25], [3.65, 2.25], [2.25, 3.65], [3.65, 3.65]].map(([x, z], i) => <mesh key={i} position={[x, 3.02, z]} castShadow><cylinderGeometry args={[.095, .095, .12, 12]} /><Mat c="#e0d4bc" r={.65} /></mesh>)}
  </>;
}

export function MathFrame() {
  return <>
    {[-5.83, 5.83].map(v => <group key={v}>
      <Trim size={[.1, .035, 11.7]} at={[v, .012, 0]} color="#668e92" />
      <Trim size={[11.7, .035, .1]} at={[0, .012, v]} color="#668e92" />
    </group>)}
    <group position={[-.4, 2.55, -.9]} rotation={[0, Math.PI / 4, 0]}>
      {[-3.55, 3.55].map(x => <Trim key={x} size={[.09, 4.76, .12]} at={[x, 0, -.03]} color="#657d83" />)}
      {[-2.34, 2.34].map(y => <Trim key={y} size={[7.19, .09, .12]} at={[0, y, -.03]} color="#657d83" />)}
      <Trim size={[2.4, .055, .28]} at={[0, -2.41, .09]} color="#b69963" />
    </group>
    <Instances limit={44} frames={1}>
      <boxGeometry args={[.025, .008, .16]} /><meshStandardMaterial color="#739191" />
      {Array.from({ length: 44 }, (_, i) => <Instance key={i} position={[-5.25 + (i % 22) * .5, .022, i < 22 ? -5.58 : 5.58]} scale={[1, 1, i % 2 ? .5 : 1]} />)}
    </Instances>
  </>;
}
