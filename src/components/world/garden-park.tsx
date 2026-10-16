"use client";

import { Instance, Instances, Line } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Shape, ShapeGeometry, Vector2, Vector3 } from "three";
import { PARK_LAYOUT } from "@/lib/world/park-layout";
import { Mat } from "./assets";
import { surfaceBump } from "./surfaces";

function GardenPath({ points, width }: { points: number[][]; width: number }) {
  const { geometry, left, right } = useMemo(() => {
    const curve = new CatmullRomCurve3(points.map(([x, z]) => new Vector3(x, .016, z)));
    const vertices: number[] = [], indices: number[] = [], left: [number, number, number][] = [], right: [number, number, number][] = [];
    for (let i = 0; i <= 80; i++) {
      const p = curve.getPoint(i / 80), tangent = curve.getTangent(i / 80);
      const nx = -tangent.z * width / 2, nz = tangent.x * width / 2;
      const l: [number, number, number] = [p.x + nx, p.y, p.z + nz], r: [number, number, number] = [p.x - nx, p.y, p.z - nz];
      left.push(l); right.push(r); vertices.push(...l, ...r);
      if (i < 80) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return { geometry, left, right };
  }, [points, width]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <>
    <mesh geometry={geometry} receiveShadow><Mat c="#d6c8a7" r={1} /></mesh>
    <Line points={left} color="#c0b18b" lineWidth={2} />
    <Line points={right} color="#c0b18b" lineWidth={2} />
    {Array.from({ length: 16 }, (_, i) => <Line key={i} points={[left[i * 5], right[i * 5]]} color="#c6b996" lineWidth={.6} />)}
  </>;
}

const MAIN_PATH = [[1.4, 5.2], [2, 3.3], [2.6, .6], [2, -1.6], [1.9, -3.2], [2.8, -4]];
const POND_PATH = [[1.9, 3.3], [1.1, 2.6], [.3, 2.15], [-.85, 1.8]];
const SHORE = [[-1.7, 0], [-1.2, 1], [.2, 1.1], [1.4, .6], [1.3, -.7], [.2, -1.05], [-1.3, -.7]];

function Pond() {
  const { geometry, stones } = useMemo(() => {
    const curve = new CatmullRomCurve3(SHORE.map(([x, z]) => new Vector3(x, 0, z)), true);
    const shape = new Shape(curve.getPoints(100).map(p => new Vector2(p.x, -p.z)));
    return { geometry: new ShapeGeometry(shape), stones: curve.getPoints(37).slice(0, 37) };
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <group position={[PARK_LAYOUT.pond[0], 0, PARK_LAYOUT.pond[1]]}>
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, .008, 0]} receiveShadow><Mat c="#a4a387" r={.95} /></mesh>
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, .015, 0]} scale={[.93, .93, 1]} receiveShadow><Mat c="#75a8a2" r={.23} m={.15} /></mesh>
    <Instances limit={37} frames={1} castShadow receiveShadow>
      <dodecahedronGeometry args={[.13, 0]} /><meshStandardMaterial roughness={1} />
      {stones.map((p, i) => <Instance key={i} position={[p.x, .035, p.z]} rotation={[0, i * .9, 0]} scale={[1 + i % 3 * .17, .5, .9]} color={["#c4bda4", "#b5b29b", "#d3cbb1"][i % 3]} />)}
    </Instances>
    {[[.3, .35], [-.8, -.2], [.7, -.3]].map(([x, z], i) => <group key={i} position={[x, .025, z]}>
      <mesh rotation={[-Math.PI / 2, 0, i]}><circleGeometry args={[.14 + i * .025, 28, .2, 5.9]} /><Mat c={i % 2 ? "#728b59" : "#8da36b"} r={.8} /></mesh>
      {i === 0 && <mesh position={[0, .035, 0]} scale={[1, .5, 1]}><sphereGeometry args={[.06, 10, 8]} /><Mat c="#e5bfbd" /></mesh>}
    </group>)}
  </group>;
}

export function GardenPark() {
  return <>
    <mesh position={[0, -.3, 0]} receiveShadow castShadow><cylinderGeometry args={[6.8, 6.65, .6, 80]} /><meshStandardMaterial color="#a6b883" roughness={1} bumpMap={surfaceBump("stone")} bumpScale={.018} /></mesh>
    <mesh position={[0, -.7, 0]} castShadow><cylinderGeometry args={[6.64, 6.5, .24, 80]} /><Mat c="#a69676" r={.95} /></mesh>
    <mesh position={[0, -.94, 0]} castShadow><cylinderGeometry args={[6.5, 6.28, .3, 80]} /><Mat c="#c2b79c" r={.95} /></mesh>
    <GardenPath points={MAIN_PATH} width={1.08} />
    <GardenPath points={POND_PATH} width={.78} />
    <Pond />
    {PARK_LAYOUT.trees.map(([x, z], i) => <mesh key={i} position={[x, .005, z]} rotation={[-Math.PI / 2, 0, i]} scale={[1.2, 1, 1]} receiveShadow>
      <circleGeometry args={[1.05, 48]} /><Mat c="#8c996b" r={1} />
    </mesh>)}
    <Instances limit={150} frames={1} castShadow receiveShadow>
      <sphereGeometry args={[1, 8, 6]} /><meshStandardMaterial roughness={1} />
      {Array.from({ length: 150 }, (_, i) => {
        const center = PARK_LAYOUT.shrubs[i % 6], a = i * 2.39996, r = .2 + i % 7 * .065;
        return <Instance key={i} position={[center[0] + Math.cos(a) * r, .09, center[1] + Math.sin(a) * r]} rotation={[Math.sin(a) * .3, a, .1]} scale={[.025, .12 + i % 3 * .025, .025]} color={i % 3 ? "#849a62" : "#a6b47c"} />;
      })}
    </Instances>
    {/* Low mixed planting frames the front without hiding the central lawn. */}
    <Instances limit={90} frames={1} castShadow receiveShadow>
      <sphereGeometry args={[1, 8, 6]} /><meshStandardMaterial roughness={1} />
      {Array.from({ length: 90 }, (_, i) => { const a = .55 + Math.floor(i / 30) * .8, t = i * 2.39996, r = .08 + i % 7 * .07; return <Instance key={i} position={[Math.cos(a) * 5.45 + Math.sin(t) * r, .15, Math.sin(a) * 5.45 + Math.cos(t) * r]} rotation={[Math.sin(t) * .5, t, .3]} scale={[.04, .2 + i % 4 * .035, .05]} color={i % 3 ? "#869d63" : "#afbd84"} />; })}
    </Instances>
    <Instances limit={36} frames={1} castShadow>
      <icosahedronGeometry args={[.045, 1]} /><meshStandardMaterial roughness={.9} />
      {Array.from({ length: 36 }, (_, i) => { const a = .55 + Math.floor(i / 12) * .8, t = i * 2.4, r = .1 + i % 5 * .08; return <Instance key={i} position={[Math.cos(a) * 5.45 + Math.sin(t) * r, .34 + i % 3 * .04, Math.sin(a) * 5.45 + Math.cos(t) * r]} color={i % 3 ? "#e3d6b2" : "#c9abc0"} />; })}
    </Instances>
  </>;
}
