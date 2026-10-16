"use client";

import { Instance, Instances } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import type { NatureId } from "@/lib/world/nature";
import { useMotion } from "@/lib/useMotion";
import { useSim } from "@/lib/store";

function Fish({ color, silver }: { color?: string; silver: boolean }) {
  const tail = useRef<Group>(null), time = useRef(0);
  const animate = useMotion();
  useFrame((_, dt) => {
    if (animate && !useSim.getState().paused) time.current += Math.min(dt, .05);
    if (tail.current) tail.current.rotation.y = Math.sin(time.current * 7) * .4;
  });
  const c = color ?? (silver ? "#83b8c0" : "#e6ae56");
  return <group>
    <mesh scale={[.25, .125, .085]} castShadow><sphereGeometry args={[1, 20, 14]} /><meshStandardMaterial color={c} roughness={.45} /></mesh>
    {!silver && [-.065, .035].map(x => <mesh key={x} position={[x, 0, 0]} scale={[.022, .126, .086]}><sphereGeometry args={[1, 12, 10]} /><meshStandardMaterial color="#f6e7ca" /></mesh>)}
    <group ref={tail} position={[-.22, 0, 0]}>
      <mesh position={[-.055, 0, 0]} rotation={[0, 0, -Math.PI / 2]} scale={[1, 1, .35]}><coneGeometry args={[.13, .17, 3]} /><meshStandardMaterial color={silver ? "#5c919e" : "#ba7a49"} side={2} /></mesh>
    </group>
    <mesh position={[-.02, .105, 0]} rotation={[0, 0, -.5]} scale={[1, 1, .24]}><coneGeometry args={[.085, .1, 3]} /><meshStandardMaterial color={c} /></mesh>
    {[-1, 1].map(side => <group key={side} position={[.15, .025, side * .065]}>
      <mesh><sphereGeometry args={[.027, 10, 8]} /><meshStandardMaterial color="#fff8e8" /></mesh>
      <mesh position={[.009, 0, side * .02]}><sphereGeometry args={[.014, 8, 6]} /><meshStandardMaterial color="#243b3c" /></mesh>
    </group>)}
  </group>;
}

export function NatureModel({ asset, color }: { asset: NatureId; color?: string }) {
  if (asset === "reef_fish" || asset === "silver_fish") return <Fish color={color} silver={asset === "silver_fish"} />;
  if (asset === "flowering_bush") return <group>
    <Instances limit={5} frames={1} castShadow receiveShadow>
      <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial roughness={.95} />
      {[[-.32, -.05, 0], [.3, -.02, .1], [0, .06, -.2], [0, .1, .18], [0, -.06, 0]].map((p, i) => <Instance key={i} position={[p[0], p[1], p[2]]} scale={[.33, .3, .3]} color={i % 2 ? "#819761" : "#6f8856"} />)}
    </Instances>
    <Instances limit={24} frames={1} castShadow>
      <icosahedronGeometry args={[.065, 1]} /><meshStandardMaterial color={color ?? "#d3a2a2"} roughness={.8} />
      {Array.from({ length: 24 }, (_, i) => { const a = i * 2.39996, r = .22 + i % 4 * .08; return <Instance key={i} position={[Math.cos(a) * r, .14 + i % 3 * .045, Math.sin(a) * r * .8]} />; })}
    </Instances>
  </group>;
  if (asset === "fern") return <Instances limit={24} frames={1} castShadow receiveShadow>
    <sphereGeometry args={[1, 10, 6]} /><meshStandardMaterial roughness={.9} />
    {Array.from({ length: 24 }, (_, i) => { const a = (i % 8) * Math.PI / 4, r = .1 + Math.floor(i / 8) * .12; return <Instance key={i} position={[Math.cos(a) * r, -.1 + Math.floor(i / 8) * .04, Math.sin(a) * r]} scale={[.055, .23 - Math.floor(i / 8) * .03, .04]} rotation={[Math.sin(a) * -.7, 0, Math.cos(a) * -.7]} color={color ?? (i % 2 ? "#6b8c55" : "#90a96b")} />; })}
  </Instances>;
  if (asset === "kelp") return <group>
    {Array.from({ length: 8 }, (_, i) => <group key={i} position={[(i % 3 - 1) * .16, -.75, (Math.floor(i / 3) - 1) * .16]} rotation={[0, i * 2.4, (i % 3 - 1) * .12]}>
      <mesh position={[0, .5 + i % 3 * .08, 0]} scale={[.055, .6 + i % 3 * .06, .022]} castShadow><sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color={color ?? (i % 2 ? "#6b9c7a" : "#88ac85")} roughness={.8} /></mesh>
    </group>)}
  </group>;
  if (asset === "anemone") return <group>
    <mesh position={[0, -.19, 0]} scale={[.28, .08, .28]} castShadow><sphereGeometry args={[1, 16, 10]} /><meshStandardMaterial color="#b1a58c" roughness={.8} /></mesh>
    {Array.from({ length: 16 }, (_, i) => { const a = i * Math.PI / 8; return <mesh key={i} position={[Math.cos(a) * .16, -.04 + i % 3 * .025, Math.sin(a) * .16]} rotation={[Math.sin(a) * .45, 0, -Math.cos(a) * .45]} castShadow>
      <capsuleGeometry args={[.028, .25 + i % 3 * .025, 3, 8]} /><meshStandardMaterial color={color ?? "#c3a4b7"} roughness={.65} />
    </mesh>; })}
  </group>;
  return <group>
    {Array.from({ length: 7 }, (_, i) => <group key={i} position={[(i - 3) * .07, -.4, Math.sin(i * 2) * .1]} rotation={[0, i * .9, (i - 3) * -.09]}>
      <mesh position={[0, .3, 0]} castShadow><capsuleGeometry args={[.025, .55 + i % 3 * .08, 3, 6]} /><meshStandardMaterial color={color ?? "#d08b82"} roughness={.9} /></mesh>
      {[-1, 1].map(side => <mesh key={side} position={[side * .065, .45, 0]} rotation={[0, 0, side * -.55]}><capsuleGeometry args={[.02, .22, 3, 6]} /><meshStandardMaterial color={color ?? "#dca18d"} /></mesh>)}
    </group>)}
  </group>;
}
