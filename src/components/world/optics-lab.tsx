"use client";

// The Light Lab: a bright studio around a high-contrast optical table (the
// rays run across its top) and a white projection screen on the back wall
// for colour mixing. Only the place itself; the optics live in modules/optics.

import { RoundedBox } from "@react-three/drei";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import { BufferGeometry, CanvasTexture, Float32BufferAttribute, Object3D, SRGBColorSpace, type InstancedMesh } from "three";
import { OPTICS_TABLE } from "@/lib/modules";
import { TABLE, WHITE_SPECTRUM, wavelengthColor } from "@/lib/engine/optics";
import { Mat } from "./assets";

const TOP = OPTICS_TABLE.center[1];
const HALF_X = TABLE.x + 0.15;
const HALF_Z = TABLE.z + 0.15;

/** Mounting holes every 25 cm, like a real optical breadboard. */
function Holes() {
  const ref = useRef<InstancedMesh>(null);
  const spots = useMemo(() => {
    const out: [number, number][] = [];
    for (let x = -TABLE.x; x <= TABLE.x + 1e-6; x += 0.25) for (let z = -TABLE.z; z <= TABLE.z + 1e-6; z += 0.25) out.push([x, z]);
    return out;
  }, []);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new Object3D();
    spots.forEach(([x, z], i) => {
      o.position.set(x, TOP + 0.001, z);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [spots]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, spots.length]} frustumCulled={false}>
      <circleGeometry args={[0.012, 8]} />
      <meshBasicMaterial color="#14171c" />
    </instancedMesh>
  );
}

export function OpticalTable() {
  return (
    <>
      <RoundedBox args={[2 * HALF_X, 0.08, 2 * HALF_Z]} radius={0.02} position={[0, TOP - 0.04, 0]} castShadow receiveShadow>
        <Mat c="#364f59" r={0.78} m={0.12} />
      </RoundedBox>
      <RoundedBox args={[2 * HALF_X + 0.06, 0.05, 2 * HALF_Z + 0.06]} radius={0.02} position={[0, TOP - 0.1, 0]}>
        <Mat c="#b5a17f" r={0.5} m={0.25} />
      </RoundedBox>
      <Holes />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * (HALF_X - 0.3), (TOP - 0.12) / 2, sz * (HALF_Z - 0.25)]} castShadow>
          <cylinderGeometry args={[0.09, 0.11, TOP - 0.12, 14]} />
          <Mat c="#5b6470" r={0.5} m={0.4} />
        </mesh>
      ))}
      {/* A metre rule along the front edge. */}
      <mesh position={[0, TOP + 0.002, HALF_Z - 0.07]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2 * TABLE.x, 0.06]} />
        <meshBasicMaterial color="#d9c38a" />
      </mesh>
      <RulerTicks />
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[HALF_X, 0.04, HALF_Z]} position={[0, TOP - 0.04, 0]} friction={0.8} />
      </RigidBody>
    </>
  );
}

function RulerTicks() {
  const geometry = useMemo(() => {
    const vertices: number[] = [];
    for (let i = 0; i <= Math.round(2 * TABLE.x * 10); i++) {
      const x = -TABLE.x + i * 0.1, length = i % 10 === 0 ? 0.06 : 0.035;
      vertices.push(x, TOP + 0.004, HALF_Z - 0.1, x, TOP + 0.004, HALF_Z - 0.1 + length);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <lineSegments geometry={geometry}><lineBasicMaterial color="#594528" /></lineSegments>;
}

function LabPanel({ spectrum = false }: { spectrum?: boolean }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024; canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#f8f3e8"; ctx.fillRect(0, 0, 1024, 512);
    ctx.fillStyle = "#416e74"; ctx.font = "700 46px sans-serif";
    ctx.fillText(spectrum ? "A WORLD OF COLOUR" : "LIGHT LAB", 60, 85);
    ctx.font = "24px sans-serif"; ctx.fillStyle = "#6b807e";
    ctx.fillText(spectrum ? "Visible light · wavelength in nanometres" : "Explore. Measure. Discover.", 60, 130);
    if (spectrum) {
      WHITE_SPECTRUM.forEach((nm, i) => { ctx.fillStyle = wavelengthColor(nm); ctx.fillRect(65 + i * 100, 205, 100, 110); });
      ctx.fillStyle = "#526d6c"; ctx.font = "24px monospace";
      ctx.fillText("700 nm", 65, 355); ctx.fillText("405 nm", 850, 355);
      ctx.font = "24px sans-serif"; ctx.fillText("Longer wavelength", 65, 435); ctx.fillText("Shorter wavelength", 740, 435);
    } else {
      ctx.strokeStyle = "#b9cdca"; ctx.lineWidth = 3;
      ctx.strokeRect(60, 180, 904, 265);
      ctx.setLineDash([12, 10]); ctx.beginPath(); ctx.moveTo(260, 310); ctx.lineTo(760, 310); ctx.stroke();
      ctx.setLineDash([]); ctx.strokeStyle = "#6b999f"; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(700, 205); ctx.lineTo(700, 410); ctx.stroke();
      ctx.strokeStyle = "#d99a51"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(390, 210); ctx.lineTo(700, 310); ctx.lineTo(390, 410); ctx.stroke();
      ctx.fillStyle = "#526d6c"; ctx.font = "22px sans-serif"; ctx.fillText("Angles are measured from the normal", 80, 483);
    }
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace; map.anisotropy = 4; return map;
  }, [spectrum]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh><planeGeometry args={[spectrum ? 2.8 : 3.36, spectrum ? 1.4 : 1.72]} /><meshBasicMaterial map={texture} /></mesh>;
}

/** Back-wall decor (wall-local: x along the wall, z = 0.13 is the inner face): the screen and a spectrum strip. */
export function OpticsBackWall() {
  return (
    <>
      <RoundedBox args={[3.5, 1.85, 0.04]} radius={0.02} position={[0, 2.2, 0.14]}>
        <Mat c="#3a404c" />
      </RoundedBox>
      <group position={[0, 2.2, 0.165]}><LabPanel /></group>
      {WHITE_SPECTRUM.map((nm, i) => (
        <mesh key={nm} position={[2.35 + i * 0.13, 3.05, 0.15]}>
          <planeGeometry args={[0.13, 0.32]} />
          <meshBasicMaterial color={wavelengthColor(nm)} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/** A side-wall poster: the parts of the electromagnetic spectrum, long waves to short. */
export function SpectrumPoster() {
  return (
    <group position={[0.8, 2.3, 0.14]}>
      <RoundedBox args={[2.92, 1.52, 0.03]} radius={0.02}>
        <Mat c="#e8ebf0" />
      </RoundedBox>
      <group position={[0, 0, 0.02]}><LabPanel spectrum /></group>
    </group>
  );
}
