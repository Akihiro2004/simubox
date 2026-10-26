"use client";

import { Instance, Instances, RoundedBox } from "@react-three/drei";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useState } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import type { Vec3 } from "@/lib/world/catalog";
import { Mat } from "./assets";
import { LabBoard } from "./lab-board";
import { Box, Plant, Stool, Wall, Window, type WallTone } from "./learning-labs";
import { surfaceBump } from "./surfaces";

// The Anatomy Lab: a bright teaching hall around a central dais where the body
// stands. Back and left walls carry the light box, specimen shelves and the
// body-systems chart; the right and front walls lower as the camera orbits.

const TONE: WallTone = { wall: "#e4ece7", dado: "#a9c3bb", skirting: "#3e6661", rail: "#f2efe6", batten: null };
const OAK = "#c49b6d", TEAL = "#3e6661", PAPER = "#f4f1e8";

function LightBox() {
  const [films, setFilms] = useState<CanvasTexture[] | null>(null);
  useEffect(() => {
    let alive = true;
    // The films are projected from the body's real bones, loaded with the body itself.
    void import("./modules/anatomy").then(m => m.xrayTextures()).then(t => { if (alive) setFilms(t); }, e => console.warn("X-ray films unavailable", e));
    return () => { alive = false; };
  }, []);
  useEffect(() => () => films?.forEach(t => t.dispose()), [films]);
  return <group position={[-.9, 2.55, .22]}>
    <Box size={[3.7, 1.75, .12]} at={[0, 0, 0]} color="#d9dfe2" radius={.04} />
    <mesh position={[0, 0, .065]}><planeGeometry args={[3.5, 1.55]} /><meshBasicMaterial color="#eef6fb" toneMapped={false} /></mesh>
    {[0, 1, 2].map(i => <mesh key={i} position={[(i - 1) * 1.13, 0, .075]}><planeGeometry args={[1.02, 1.32]} />{/* Keyed: three.js compiles a material with or without a map only once. */}
      {films ? <meshBasicMaterial key="film" map={films[i]} toneMapped={false} /> : <meshBasicMaterial key="blank" color="#0d1622" toneMapped={false} />}</mesh>)}
    <Box size={[3.75, .09, .2]} at={[0, -.93, .05]} color={TEAL} />
  </group>;
}

const SYSTEM_CHIPS: [string, string][] = [["Skin", "#e8b99c"], ["Muscles", "#b7473f"], ["Skeleton", "#d9cdb0"], ["Nerves", "#e8c84f"], ["Heart & blood", "#c8393f"], ["Lungs", "#e7a2a4"], ["Digestion", "#d98a7a"], ["Kidneys", "#9b4a3c"]];

/** The body-systems legend, drawn row by row so every colour dot sits beside its name. */
function SystemsChart() {
  const map = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 564;
    const g = c.getContext("2d")!;
    g.fillStyle = PAPER; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = TEAL; g.font = "800 44px system-ui, sans-serif"; g.textBaseline = "middle";
    g.fillText("BODY SYSTEMS", 40, 62);
    g.fillStyle = "#c9d8d3"; g.fillRect(40, 100, 432, 4);
    SYSTEM_CHIPS.forEach(([name, color], i) => {
      const y = 152 + i * 54;
      g.fillStyle = color; g.beginPath(); g.arc(60, y, 15, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(0,0,0,0.12)"; g.lineWidth = 2; g.stroke();
      g.fillStyle = "#33413f"; g.font = "700 34px system-ui, sans-serif"; g.fillText(name, 96, y + 2);
    });
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, []);
  useEffect(() => () => map.dispose(), [map]);
  return <group position={[3.35, 2.6, .22]}>
    <Box size={[2.1, 2.3, .08]} at={[0, 0, 0]} color={OAK} />
    <mesh position={[0, 0, .045]}><planeGeometry args={[1.95, 2.15]} /><meshBasicMaterial map={map} toneMapped={false} /></mesh>
  </group>;
}

/** Glass specimen jars on oak shelves. */
function SpecimenShelves() {
  const jars = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ x: -.95 + (i % 4) * .63, y: .52 + Math.floor(i / 4) * .78, h: .34 + ((i * 7) % 3) * .06, c: ["#d98a7a", "#c8393f", "#e7a2a4", "#9b4a3c", "#e8c17c", "#b7473f"][(i * 5) % 6] })), []);
  return <group position={[0, 0, .45]}>
    {[-1.3, 1.3].map(x => <Box key={x} size={[.08, 2.6, .5]} at={[x, 1.3, 0]} color={OAK} />)}
    {[.26, 1.04, 1.82, 2.58].map(y => <Box key={y} size={[2.66, .07, .52]} at={[0, y, 0]} color={OAK} />)}
    <Instances limit={12} frames={1}><cylinderGeometry args={[.13, .13, 1, 20]} /><meshStandardMaterial color="#dff3f2" transparent opacity={.35} roughness={.05} depthWrite={false} />
      {jars.map((j, i) => <Instance key={i} position={[j.x, j.y - .21 + j.h / 2, 0]} scale={[1, j.h, 1]} />)}
    </Instances>
    <Instances limit={12} frames={1} castShadow><sphereGeometry args={[.075, 14, 10]} /><meshStandardMaterial roughness={.5} />
      {jars.map((j, i) => <Instance key={i} position={[j.x, j.y - .21 + j.h * .45, 0]} scale={[1, 1.25, .9]} color={j.c} />)}
    </Instances>
    <Instances limit={12} frames={1}><cylinderGeometry args={[.14, .14, .04, 20]} /><meshStandardMaterial color={TEAL} roughness={.4} />
      {jars.map((j, i) => <Instance key={i} position={[j.x, j.y - .21 + j.h + .02, 0]} />)}
    </Instances>
  </group>;
}

const STEEL = "#c9ced2", PAD = "#86aea4";

/** A clinic examination couch: steel frame, one mattress, a backrest hinged up on a bracket, paper roll. */
function ExamBench({ at }: { at: Vec3 }) {
  const top = .7, hinge = -.46, tilt = -.42;
  return <group position={at}>
    {/* frame */}
    <Box size={[1.9, .045, .66]} at={[0, .62, 0]} color={STEEL} radius={.012} />
    {[-.88, .88].flatMap(x => [-.29, .29].map(z => <Box key={`${x}${z}`} size={[.045, .6, .045]} at={[x, .3, z]} color={STEEL} radius={.01} />))}
    {[-.29, .29].map(z => <Box key={z} size={[1.76, .03, .03]} at={[0, .16, z]} color={STEEL} radius={.008} />)}
    {[-.88, .88].map(x => <Box key={x} size={[.03, .03, .55]} at={[x, .16, 0]} color={STEEL} radius={.008} />)}
    {[-.88, .88].flatMap(x => [-.29, .29].map(z => <mesh key={`f${x}${z}`} position={[x, .012, z]}><cylinderGeometry args={[.03, .035, .024, 12]} /><Mat c="#3a4246" /></mesh>))}
    {/* mattress, from the hinge to the foot */}
    <RoundedBox args={[1.38, .1, .64]} radius={.04} smoothness={3} position={[hinge + .69, top - .025, 0]} castShadow receiveShadow><Mat c={PAD} r={.85} /></RoundedBox>
    {/* backrest, hinged at its lower edge and propped on a bracket */}
    <group position={[hinge, top - .075, 0]} rotation={[0, 0, tilt]}>
      <RoundedBox args={[.44, .1, .64]} radius={.04} smoothness={3} position={[-.22, .05, 0]} castShadow receiveShadow><Mat c={PAD} r={.85} /></RoundedBox>
    </group>
    <Box size={[.03, .16, .4]} at={[hinge - .26, top - .02, 0]} color={STEEL} radius={.008} />
    {/* paper sheet, lifted clear of the mattress, and its roll at the foot */}
    <mesh position={[hinge + .64, top + .026, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[1.24, .5]} /><meshStandardMaterial color="#fbfaf6" roughness={.95} polygonOffset polygonOffsetFactor={-2} /></mesh>
    <mesh position={[.95, top - .01, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[.045, .045, .54, 20]} /><Mat c="#fbfaf6" r={.95} /></mesh>
    {[-.285, .285].map(z => <Box key={z} size={[.07, .09, .015]} at={[.95, top - .03, z]} color={STEEL} radius={.005} />)}
  </group>;
}

/** A school compound microscope, about 32 cm tall. */
function Microscope({ at, turn = 0 }: { at: Vec3; turn?: number }) {
  const WHITE = "#f1f0ec", GREY = "#5b6468", METAL = "#b9c0c4";
  return <group position={at} rotation={[0, turn, 0]} scale={1.1}>
    {/* horseshoe base with the lamp */}
    <RoundedBox args={[.19, .035, .23]} radius={.014} smoothness={3} position={[0, .0175, -.01]} castShadow receiveShadow><Mat c={WHITE} /></RoundedBox>
    <mesh position={[0, .037, .035]}><cylinderGeometry args={[.022, .022, .006, 24]} /><meshStandardMaterial color="#fff6d8" emissive="#ffe9a8" emissiveIntensity={.8} /></mesh>
    {/* pillar and C-arm */}
    <RoundedBox args={[.05, .17, .05]} radius={.012} position={[0, .12, -.09]} castShadow><Mat c={WHITE} /></RoundedBox>
    <group position={[0, .2, -.09]} rotation={[.55, 0, 0]}><RoundedBox args={[.045, .14, .045]} radius={.012} position={[0, .07, 0]} castShadow><Mat c={WHITE} /></RoundedBox></group>
    {/* focus knobs, coarse and fine, both sides */}
    {[-1, 1].map(x => <group key={x}>
      <mesh position={[x * .036, .12, -.09]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.022, .022, .014, 20]} /><Mat c={GREY} /></mesh>
      <mesh position={[x * .047, .12, -.09]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.012, .012, .01, 16]} /><Mat c={METAL} m={.5} /></mesh>
    </group>)}
    {/* stage with slide clips and a slide */}
    <Box size={[.035, .025, .07]} at={[0, .135, -.055]} color={WHITE} radius={.006} />
    <Box size={[.13, .01, .12]} at={[0, .15, .01]} color="#2b2f31" radius={.003} />
    <Box size={[.075, .002, .026]} at={[0, .156, .02]} color="#d9eef3" radius={.001} />
    {[-1, 1].map(x => <Box key={x} size={[.012, .004, .05]} at={[x * .042, .158, .025]} color={METAL} radius={.0015} />)}
    {/* head, nosepiece and three objectives over the stage */}
    <RoundedBox args={[.055, .05, .08]} radius={.014} position={[0, .3, -.005]} castShadow><Mat c={WHITE} /></RoundedBox>
    <mesh position={[0, .267, .012]}><cylinderGeometry args={[.03, .026, .02, 24]} /><Mat c={METAL} m={.6} r={.3} /></mesh>
    {[0, 1, 2].map(i => {
      const a = (i - 1) * .7;
      return <group key={i} position={[Math.sin(a) * .016, .245, .012 + Math.cos(a) * .012]} rotation={[Math.cos(a) * .25, 0, -Math.sin(a) * .25]}>
        <mesh><cylinderGeometry args={[.008, .006, .04 - i * .006, 14]} /><Mat c={METAL} m={.6} r={.3} /></mesh>
        <mesh position={[0, -.004, 0]}><cylinderGeometry args={[.0085, .0085, .004, 14]} /><Mat c={["#d34a3a", "#e3b23c", "#3a76c4"][i]} /></mesh>
      </group>;
    })}
    {/* eyepiece, angled up towards the viewer */}
    <group position={[0, .325, .015]} rotation={[.6, 0, 0]}>
      <mesh position={[0, .04, 0]} castShadow><cylinderGeometry args={[.014, .016, .08, 18]} /><Mat c={GREY} /></mesh>
      <mesh position={[0, .085, 0]}><cylinderGeometry args={[.017, .017, .014, 18]} /><Mat c="#26292b" /></mesh>
    </group>
  </group>;
}

function Trolley({ at }: { at: Vec3 }) {
  return <group position={at}>
    {[.42, .86].map(y => <Box key={y} size={[.9, .04, .55]} at={[0, y, 0]} color="#e3e6e4" radius={.012} />)}
    {[-.42, .42].flatMap(x => [-.25, .25].map(z => <Box key={`${x}${z}`} size={[.03, .86, .03]} at={[x, .43, z]} color={STEEL} radius={.008} />))}
    {[-.42, .42].flatMap(x => [-.25, .25].map(z => <mesh key={`w${x}${z}`} position={[x, .03, z]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.03, .03, .02, 14]} /><Mat c="#3a4246" /></mesh>))}
    <Microscope at={[-.15, .88, 0]} turn={.5} />
    <mesh position={[.25, .97, .05]} castShadow><cylinderGeometry args={[.06, .06, .18, 20]} /><meshStandardMaterial color="#cfe9f2" transparent opacity={.5} depthWrite={false} /></mesh>
    <Box size={[.2, .03, .14]} at={[.22, .455, 0]} color={TEAL} radius={.008} />
  </group>;
}

export function AnatomyRoom({ animate }: { animate: boolean }) {
  return <>
    <Box size={[12.4, .34, 10.4]} at={[0, -.17, 0]} color="#e9e6dd" radius={.09} />
    <Box size={[12.2, .85, 10.2]} at={[0, -.78, 0]} color="#a9c3bb" radius={.18} />
    <Box size={[12.25, .06, 10.25]} at={[0, -.36, 0]} color={TEAL} />
    <Instances limit={120} frames={1} receiveShadow>
      <boxGeometry args={[.985, .018, .985]} /><meshStandardMaterial roughness={.85} bumpMap={surfaceBump("stone")} bumpScale={.005} />
      {Array.from({ length: 10 }, (_, row) => Array.from({ length: 12 }, (_, col) => <Instance key={`${row}-${col}`} position={[-5.5 + col, .012, -4.5 + row]} color={["#efede6", "#e8e6de", "#f3f1ea"][(row * 5 + col * 3) % 3]} />))}
    </Instances>
    <Wall side="back" tone={TONE} animate={animate}>
      <LabBoard position={[0, 4.22, .17]} width={6.8} height={.64} background={TONE.wall} lines={[{ text: "SIMUBOX  /  THE ANATOMY LAB", size: 104, color: TEAL }]} />
      <LightBox /><SystemsChart /><Window x={-4.5} />
    </Wall>
    <Wall side="left" tone={TONE} animate={animate}><SpecimenShelves /><Window x={2.6} /></Wall>
    <Wall side="right" tone={TONE} animate={animate}><Window x={-1.6} /><Window x={1.9} /></Wall>
    <Wall side="front" tone={TONE} animate={animate}><Window x={-2.4} /><Window x={2.4} /></Wall>

    {/* The dais: the body stands on its top at y = 0.25. */}
    <mesh position={[0, .012, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[2.35, 72]} /><meshStandardMaterial color="#cfe0da" roughness={1} bumpMap={surfaceBump("woven")} bumpScale={.008} /></mesh>
    <mesh position={[0, .07, 0]} castShadow receiveShadow><cylinderGeometry args={[1.25, 1.3, .12, 64]} /><Mat c="#f3f1eb" r={.5} /></mesh>
    <mesh position={[0, .19, 0]} castShadow receiveShadow><cylinderGeometry args={[.95, .98, .12, 64]} /><Mat c="#faf9f5" r={.4} /></mesh>
    <mesh position={[0, .252, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.86, .93, 72]} /><meshBasicMaterial color="#7fd1c0" toneMapped={false} /></mesh>
    <mesh position={[0, .132, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.18, 1.24, 72]} /><meshBasicMaterial color="#a8ddd2" toneMapped={false} /></mesh>

    <ExamBench at={[-3.9, 0, -4.2]} />
    <Trolley at={[4.6, 0, -4.2]} />
    <Stool at={[-4.9, 0, -2.6]} />
    <Plant at={[5.3, 0, -1.8]} /><Plant at={[-5.3, 0, 4.2]} />
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[6.2, .17, 5.2]} position={[0, -.17, 0]} />
      <CuboidCollider args={[.98, .125, .98]} position={[0, .125, 0]} />
      {[-1, 1].map(sign => <group key={sign}><CuboidCollider args={[.12, 2.4, 5.2]} position={[sign * 6.08, 2.4, 0]} /><CuboidCollider args={[6.2, 2.4, .12]} position={[0, 2.4, sign * 5.08]} /></group>)}
    </RigidBody>
  </>;
}
