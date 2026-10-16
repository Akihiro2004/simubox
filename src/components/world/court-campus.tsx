"use client";

import { Instances, Instance, RoundedBox } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import type { Vec3 } from "@/lib/world/catalog";
import { Trim } from "./architecture";
import { Mat } from "./assets";
import { surfaceBump } from "./surfaces";

/** Painted signs use the system font, so the map needs no font download. */
function Lettering({ text, at, width, height, upright = false }: { text: string; at: Vec3; width: number; height: number; upright?: boolean }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#f6f0db";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = text.split("\n");
    ctx.font = `700 ${lines.length > 1 ? 77 : 116}px Arial, sans-serif`;
    lines.forEach((line, i) => ctx.fillText(line, 384, 128 + (i - (lines.length - 1) / 2) * 104, 720));
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    return map;
  }, [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={at} rotation={upright ? [0, 0, 0] : [-Math.PI / 2, 0, 0]}>
    <planeGeometry args={[width, height]} /><meshBasicMaterial map={texture} transparent alphaTest={.1} depthWrite={false} />
  </mesh>;
}

/** `track` recolours the side tracks when the environment is restyled. */
export function CourtPaint({ track }: { track?: string | null }) {
  return <>
    {[-5.3, 5.3].map(z => <mesh key={z} position={[28, .0028, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[66, 2.05]} /><meshStandardMaterial color={track ?? "#b77f61"} roughness={.95} bumpMap={surfaceBump("stone")} bumpScale={.006} />
    </mesh>)}
    {[-4.22, 4.22].map(z => <Trim key={z} size={[66, .002, .055]} at={[28, .005, z]} color="#eee5cd" />)}
    {Array.from({ length: 12 }, (_, i) => {
      const x = (i + 1) * 5;
      return <Lettering key={x} text={`${x} m`} at={[x, .013, 5.3]} width={1.85} height={.75} />;
    })}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .008, 0]} receiveShadow>
      <circleGeometry args={[1.55, 64]} /><Mat c="#cfb98c" r={.9} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .009, 0]}>
      <ringGeometry args={[1.36, 1.4, 64]} /><meshBasicMaterial color="#f5ecd4" />
    </mesh>
    <Trim size={[.08, .003, 6.7]} at={[0, .007, 0]} color="#f6edda" />
    {[2.4, 3.6, 4.8].map(x => <group key={x} position={[x, .009, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[.28, 3]} /><meshBasicMaterial color="#e4d6ae" /></mesh>
      <Trim size={[.5, .002, .1]} at={[-.27, 0, 0]} color="#e4d6ae" />
    </group>)}
    <Lettering text="START / 0 m" at={[-2.3, .014, 3.3]} width={2.8} height={.65} />
    <Lettering text="MOTION FIELD" at={[7.8, .014, -3.3]} width={4.5} height={.7} />
    {/* Basketball markings at the far end preserve the uninterrupted x-axis. */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[60.8, .008, 0]}>
      <ringGeometry args={[3.55, 3.6, 72, 1, Math.PI / 2, Math.PI]} /><meshBasicMaterial color="#f6edda" />
    </mesh>
  </>;
}

const TREES = Array.from({ length: 22 }, (_, i) => ({
  x: -6 + (i % 15) * 5.4,
  z: i < 15 ? -15.5 - i % 3 * 2.4 : 16 + i % 3 * 2,
  scale: .85 + i % 4 * .17,
})).filter(t => t.z < 0 || t.x > 28);

export function CourtLandscape() {
  return <>
    {/* The low near-side border keeps the launcher visible from the home camera. */}
    {[-8.5, 8.5].map(z => <group key={z}>
      <Trim size={[67, .16, .16]} at={[28, .08, z]} color="#b8b49d" />
      <Trim size={[67, .025, 1.9]} at={[28, -.004, z - Math.sign(z) * .6]} color="#d0c9ad" />
      {Array.from({ length: 17 }, (_, i) => <Trim key={i} size={[.025, .003, 1.8]} at={[-4 + i * 4, .012, z - Math.sign(z) * .6]} color="#b5af98" />)}
    </group>)}
    {[-8.5, 8.5].map(z => <group key={z}>
      {[0, 10, 20, 30, 40, 50, 60].map(x => <group key={x} position={[x, 0, z]}>
        <Trim size={[.08, z > 0 ? .65 : 1.15, .08]} at={[0, z > 0 ? .325 : .575, 0]} color="#4b6861" />
        {x < 60 && <>
          <Trim size={[10, .035, .035]} at={[5, z > 0 ? .58 : 1.03, 0]} color="#6f8778" />
          <Trim size={[10, .035, .035]} at={[5, .3, 0]} color="#6f8778" />
        </>}
      </group>)}
    </group>)}
    {/* A paved spectator concourse anchors the field in a larger sports campus. */}
    <Trim size={[70, .018, 5.5]} at={[28, -.006, -11.4]} color="#c8c1a8" />
    {Array.from({ length: 18 }, (_, i) => <Trim key={i} size={[.03, .003, 5.4]} at={[-6 + i * 4, .005, -11.4]} color="#b0ae96" />)}
    {[2, 18, 36, 53].map(x => <group key={x} position={[x, 0, -9.1]}>
      <Trim size={[.15, .2, .15]} at={[0, .1, 0]} color="#89968a" />
      <Trim size={[.09, 4.2, .09]} at={[0, 2.1, 0]} color="#3e5a56" />
      <Trim size={[1, .11, .48]} at={[.28, 4.15, 0]} color="#405b57" />
      <Trim size={[.8, .015, .37]} at={[.28, 4.085, 0]} color="#f3e1b6" />
    </group>)}
    <group position={[-2, 0, -10.6]}>
      {[-1.2, 1.2].map(x => <Trim key={x} size={[.1, 2.9, .1]} at={[x, 1.45, 0]} color="#49645c" />)}
      <RoundedBox args={[3.7, 1.5, .16]} position={[0, 2.8, 0]} radius={.06} castShadow><Mat c="#3b5f5d" /></RoundedBox>
      <Lettering text={"SIMUBOX\nATHLETICS"} at={[0, 2.8, .085]} width={3.35} height={1.2} upright />
      <Trim size={[3.7, .055, .2]} at={[0, 2.02, 0]} color="#c3a171" />
    </group>
    {/* Planters break up the concourse with varied planting, rather than one repeating hedge. */}
    {[12, 22, 43, 56].map((x, i) => <group key={x} position={[x, 0, -12]}>
      <RoundedBox args={[2.3, .5, 1.15]} position={[0, .25, 0]} radius={.06} castShadow receiveShadow><Mat c="#b3ad95" /></RoundedBox>
      <Trim size={[2.12, .02, .98]} at={[0, .51, 0]} color="#6b6d4b" />
      {[-.7, 0, .7].map(dx => <mesh key={dx} position={[dx, .8, 0]} scale={[.6, .45, .45]} castShadow><icosahedronGeometry args={[1, 1]} /><Mat c={i % 2 ? "#9aab72" : "#7f9863"} flat /></mesh>)}
    </group>)}
    <Instances limit={72} frames={1} castShadow receiveShadow>
      <icosahedronGeometry args={[.45, 1]} /><meshStandardMaterial roughness={1} />
      {Array.from({ length: 72 }, (_, i) => <Instance key={i} position={[-5 + (i % 36) * 1.9, .25, i < 36 ? -14.5 : 10.4]} scale={[1.2 + i % 3 * .17, .6 + i % 4 * .08, 1]} color={["#81995e", "#94a770", "#728951"][i % 3]} />)}
    </Instances>
    <Instances limit={22} frames={1} castShadow>
      <cylinderGeometry args={[.12, .2, 1.7, 8]} /><meshStandardMaterial color="#8b7351" roughness={1} />
      {TREES.map((t, i) => <Instance key={i} position={[t.x, .85 * t.scale, t.z]} scale={t.scale} />)}
    </Instances>
    <Instances limit={44} frames={1} castShadow receiveShadow>
      <icosahedronGeometry args={[1.05, 1]} /><meshStandardMaterial roughness={1} />
      {TREES.flatMap((t, i) => [0, 1].map(layer => <Instance key={`${i}-${layer}`} position={[t.x, (2 + layer * 1.1) * t.scale, t.z]} scale={[t.scale * (layer ? .8 : 1.2), t.scale, t.scale]} color={["#73905c", "#89a16a", "#9bae77"][(i + layer) % 3]} />))}
    </Instances>
  </>;
}
