"use client";

import { Instance, Instances, RoundedBox } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import { isGiantPlanet, type Environment } from "@/lib/environment";
import { Mat } from "./assets";
import { Trim } from "./architecture";
import { Lettering } from "./court-campus";
import { ROCKY_COURT } from "@/lib/world/court-terrain";

/** Deliberately bounded campus, with clear edges rather than an endless green plane. */
export function CampusGround({ color }: { color?: string | null }) {
  return <group>
    <RoundedBox args={[82, 1.4, 46]} radius={.45} smoothness={3} position={[28, -.82, -1]} receiveShadow><Mat c="#b4ad96" /></RoundedBox>
    <RoundedBox args={[81.7, .26, 45.7]} radius={.1} smoothness={3} position={[28, -.15, -1]} receiveShadow><Mat c={color ?? "#8fa77c"} /></RoundedBox>
    {/* A second pedestrian route and timber-edged planting beds complete the foreground. */}
    <Trim size={[73, .025, 3.2]} at={[28, .005, 13]} color="#d4ccba" />
    <Trim size={[3.2, .025, 31]} at={[-9, .008, -1]} color="#d4ccba" />
    {[5, 27, 49].map((x, i) => <group key={x} position={[x, 0, 18]}>
      <RoundedBox args={[13, .24, 3.5]} radius={.1} smoothness={2} position={[0, .1, 0]} receiveShadow><Mat c="#9b8769" /></RoundedBox>
      <RoundedBox args={[12.6, .2, 3.1]} radius={.08} smoothness={2} position={[0, .23, 0]}><Mat c="#708465" /></RoundedBox>
      <Instances limit={24} frames={1}>
        <icosahedronGeometry args={[.18, 0]} /><meshStandardMaterial roughness={1} />
        {Array.from({ length: 24 }, (_, j) => <Instance key={j} position={[-5.5 + (j % 12), .45 + j % 3 * .07, j < 12 ? -.7 : .7]} scale={[1.2, 1, 1]} color={["#e4c993", "#b1aac5", "#d9aba1"][(i + j) % 3]} />)}
      </Instances>
    </group>)}
    {/* Low, asymmetric planted banks frame the long field without hiding the launch. */}
    <Instances limit={10} frames={1} receiveShadow>
      <sphereGeometry args={[1, 16, 8]} /><meshStandardMaterial color={color ?? "#8fa77c"} roughness={1} />
      {Array.from({ length: 10 }, (_, i) => <Instance key={i} position={[-5 + i * 7.5, -.2, -20]} scale={[5.4, 1.2 + i % 3 * .4, 3.4]} />)}
    </Instances>
  </group>;
}

/** Stylized remote view, never presented as a physically scaled planet or surface. */
function GiantBackdrop({ preset, color }: { preset: string; color: string }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 256;
    const c = canvas.getContext("2d")!;
    c.fillStyle = color; c.fillRect(0, 0, 512, 256);
    for (let y = 0; y < 256; y += 2) {
      const band = Math.sin(y * .12) * .11 + Math.sin(y * .39) * .035;
      c.fillStyle = band > 0 ? `rgba(255,242,218,${band})` : `rgba(75,39,25,${-band * 1.8})`;
      c.fillRect(0, y, 512, 2);
    }
    if (preset === "jupiter") {
      c.fillStyle = "#b77359"; c.beginPath(); c.ellipse(330, 166, 30, 12, -.1, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "#d9b28b"; c.lineWidth = 3; c.stroke();
    }
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace; return map;
  }, [preset, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <group position={[30, -22, -95]} rotation={[0, -.4, -.12]}>
    <mesh><sphereGeometry args={[38, 48, 32]} /><meshBasicMaterial map={texture} /></mesh>
    {preset === "saturn" && <mesh rotation={[-1.15, 0, 0]}><ringGeometry args={[44, 66, 96]} /><meshBasicMaterial color="#c7b48b" side={2} transparent opacity={.65} /></mesh>}
  </group>;
}

export function PlanetCourtSetting({ env }: { env: Environment }) {
  const giant = isGiantPlanet(env.preset), color = env.ground ?? "#a78263";
  return <>
    {giant ? <>
      <GiantBackdrop preset={env.preset} color={color} />
      <RoundedBox args={[69, .65, 17]} radius={.28} smoothness={2} position={[28, -.35, 0]} receiveShadow><Mat c="#263c51" m={.25} /></RoundedBox>
      {[-7.7, 7.7].map(z => <group key={z}>
        <Trim size={[68, .08, .12]} at={[28, .02, z]} color="#bbd4d7" />
        <Trim size={[68, .025, .035]} at={[28, -.22, z + Math.sign(z) * .8]} color="#e1bd7e" />
      </group>)}
      {[-3, 12, 27, 42, 57].map(x => <group key={x} position={[x, 0, -7.7]}>
        <Trim size={[.15, 1.1, .15]} at={[0, .55, 0]} color="#637c8b" />
        <Trim size={[x === 57 ? 4 : 14, .06, .06]} at={[x === 57 ? 2 : 7, 1.06, 0]} color="#acc7ce" />
      </group>)}
    </> : <>
      <RoundedBox args={[ROCKY_COURT.width, 1.1, ROCKY_COURT.depth]} radius={.4} smoothness={2} position={[ROCKY_COURT.centerX, ROCKY_COURT.surfaceY - .55, 0]} receiveShadow><Mat c={color} /></RoundedBox>
      <Instances limit={38} frames={1} castShadow receiveShadow>
        <icosahedronGeometry args={[1, 0]} /><meshStandardMaterial roughness={1} />
        {Array.from({ length: 38 }, (_, i) => <Instance key={i} position={[-9 + (i % 19) * 4.1, -.03, (i < 19 ? -1 : 1) * (12 + i % 4 * 2)]} rotation={[i * .7, i * 1.7, .2]} scale={[.6 + i % 4 * .4, .35 + i % 3 * .3, .6 + i % 5 * .25]} color={i % 2 ? color : "#84796f"} />)}
      </Instances>
      <Instances limit={9} frames={1} receiveShadow>
        <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={color} roughness={1} />
        {Array.from({ length: 9 }, (_, i) => <Instance key={i} position={[-7 + i * 8.5, -.7, -18]} scale={[6, 2 + i % 3, 5]} />)}
      </Instances>
    </>}
    {/* Instrument cabinets and a useful location plaque replace campus furniture. */}
    {[-2, 22, 46].map(x => <group key={x} position={[x, 0, -7]}>
      <RoundedBox args={[1.25, .8, .65]} radius={.06} position={[0, .4, 0]} castShadow><Mat c="#bec8ca" m={.25} /></RoundedBox>
      <Trim size={[.8, .35, .025]} at={[0, .45, .34]} color="#344b5a" />
      <Trim size={[.28, .04, .035]} at={[.33, .7, .35]} color="#e3be78" />
    </group>)}
    <group position={[4, 0, -8.4]}>
      <Trim size={[8.5, 1.6, .14]} at={[0, 2, 0]} color="#283f50" />
      {[-3.5, 3.5].map(x => <Trim key={x} size={[.12, 2, .12]} at={[x, 1, 0]} color="#788f99" />)}
      <Lettering text={`${env.preset.toUpperCase()} / ${giant ? "GRAVITY DECK" : "TEST STATION"}\n${giant ? "NO SOLID SURFACE / SIMULATION" : "IDEALIZED / NO AIR DRAG"}`} at={[0, 2, .075]} width={8} height={1.3} upright />
    </group>
  </>;
}
