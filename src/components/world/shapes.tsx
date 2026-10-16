"use client";

// Shapes the AI can build and morph: solids, prisms, extrusions of a 2D
// outline, lathes (spun profiles), tubes along a path, lines and arrows.
// Size, colour and opacity ease toward their targets over `morphMs`, so a
// morph_shape command reads as a smooth transformation.

import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { CatmullRomCurve3, Color, ExtrudeGeometry, LatheGeometry, MathUtils, Quaternion, Shape, TubeGeometry, Vector2, Vector3, type Group, type MeshStandardMaterial } from "three";
import type { SceneObject } from "@/lib/world/scene";
import type { Vec3 } from "@/lib/world/catalog";

type ShapeObject = Extract<SceneObject, { type: "shape" }>;
const UP = new Vector3(0, 1, 0);

/** Geometry at unit size for the simple solids; scaled by the object's size. */
function UnitGeometry({ shape, sides }: { shape: ShapeObject["shape"]; sides: number }) {
  switch (shape) {
    case "box":
      return <boxGeometry args={[1, 1, 1]} />;
    case "sphere":
      return <sphereGeometry args={[0.5, 40, 28]} />;
    case "cylinder":
      return <cylinderGeometry args={[0.5, 0.5, 1, 40]} />;
    case "cone":
      return <coneGeometry args={[0.5, 1, 40]} />;
    case "pyramid":
      // Square base exactly 1 wide: a 4-sided cone with circumradius 1/√2.
      return <coneGeometry args={[Math.SQRT1_2, 1, 4]} />;
    case "prism":
      return <cylinderGeometry args={[0.5, 0.5, 1, Math.max(3, sides)]} />;
    case "torus":
      return <torusGeometry args={[0.35, 0.15, 20, 48]} />;
    case "capsule":
      return <capsuleGeometry args={[0.25, 0.5, 8, 20]} />;
    case "tetrahedron":
      return <tetrahedronGeometry args={[0.5]} />;
    case "octahedron":
      return <octahedronGeometry args={[0.5]} />;
    case "dodecahedron":
      return <dodecahedronGeometry args={[0.5]} />;
    case "icosahedron":
      return <icosahedronGeometry args={[0.5]} />;
    case "ring":
      return <ringGeometry args={[0.47, 0.5, 64]} />;
    default:
      return <planeGeometry args={[1, 1]} />;
  }
}

/** Per-axis scale that turns the unit geometry into `size`. */
function unitScale(shape: ShapeObject["shape"], [w, h, d]: Vec3): Vec3 {
  if (shape === "torus") return [w, h / 0.3, d];
  if (shape === "capsule") return [w / 0.5, h, d / 0.5];
  if (shape === "ring" || shape === "plane") return [w, d, 1];
  return [w, h, d];
}

function useCustomGeometry(o: ShapeObject) {
  const key = JSON.stringify([o.shape, o.points, o.path, o.shape === "extrusion" ? o.size[2] : 0, o.shape === "tube" ? o.size[0] : 0]);
  return useMemo(() => {
    if (o.shape === "extrusion" && o.points) {
      const s = new Shape(o.points.map(([x, y]) => new Vector2(x, y)));
      const g = new ExtrudeGeometry(s, { depth: o.size[2], bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
      g.center();
      return g;
    }
    if (o.shape === "lathe" && o.points) {
      const g = new LatheGeometry(o.points.map(([r, y]) => new Vector2(Math.max(0, r), y)), 48);
      g.center();
      return g;
    }
    if (o.shape === "tube" && o.path && o.path.length >= 2) {
      return new TubeGeometry(new CatmullRomCurve3(o.path.map((p) => new Vector3(...p))), 96, Math.max(0.01, o.size[0] / 2), 14, false);
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt only when the shape definition changes
  }, [key]);
}

export function ShapeModel({ o, animate }: { o: ShapeObject; animate: boolean }) {
  const group = useRef<Group>(null);
  const mat = useRef<MeshStandardMaterial>(null);
  const custom = useCustomGeometry(o);
  // Custom geometries are built at their first size; later sizes scale relative to it.
  const [firstSize] = useState(o.size);
  const target = useMemo(() => {
    const isCustom = o.shape === "extrusion" || o.shape === "lathe" || o.shape === "tube";
    return isCustom ? (o.size.map((v, i) => v / (firstSize[i] || 1)) as Vec3) : unitScale(o.shape, o.size);
  }, [o.shape, o.size, firstSize]);
  const color = useMemo(() => new Color(o.color ?? "#8ea2ff"), [o.color]);

  useFrame((_, dt) => {
    const g = group.current;
    // ~99% of the way there after morphMs.
    const k = animate ? 4.6 / Math.max(0.05, o.morphMs / 1000) : 1000;
    if (g) {
      g.scale.set(MathUtils.damp(g.scale.x, target[0], k, dt), MathUtils.damp(g.scale.y, target[1], k, dt), MathUtils.damp(g.scale.z, target[2], k, dt));
    }
    const m = mat.current;
    if (m) {
      m.color.lerp(color, Math.min(1, k * dt));
      m.opacity = MathUtils.damp(m.opacity, o.opacity, k, dt);
      m.transparent = m.opacity < 0.999;
      m.depthWrite = !m.transparent;
    }
  });

  if (o.shape === "line" || o.shape === "arrow") return <PathShape o={o} />;

  const material = (
    <meshStandardMaterial ref={mat} color={o.color ?? "#8ea2ff"} roughness={0.45} metalness={0.05} emissive={o.glow ? (o.color ?? "#8ea2ff") : "#000000"} emissiveIntensity={o.glow ? 0.8 : 0} wireframe={o.wireframe} side={o.shape === "ring" || o.shape === "plane" ? 2 : 0} />
  );
  const flat = o.shape === "ring" || o.shape === "plane";
  return (
    <group ref={group} scale={target}>
      {custom ? (
        <mesh geometry={custom} castShadow receiveShadow>
          {material}
        </mesh>
      ) : (
        <mesh castShadow={!flat} receiveShadow rotation={flat ? [-Math.PI / 2, 0, 0] : o.shape === "torus" ? [Math.PI / 2, 0, 0] : o.shape === "pyramid" ? [0, Math.PI / 4, 0] : [0, 0, 0]}>
          <UnitGeometry shape={o.shape} sides={o.sides ?? 6} />
          {material}
        </mesh>
      )}
    </group>
  );
}

function PathShape({ o }: { o: ShapeObject }) {
  const pts = (o.path ?? []).map((p) => new Vector3(...p));
  const width = Math.max(1, Math.min(8, o.size[0] * 40));
  if (o.shape === "line" || pts.length < 2) return <Line points={pts.length >= 2 ? pts : [new Vector3(), new Vector3(0, 0.01, 0)]} color={o.color ?? "#1c1e22"} lineWidth={width} />;
  // Arrow from the first point to the second.
  const [a, b] = pts;
  const dir = b.clone().sub(a);
  const len = Math.max(0.05, dir.length());
  const q = new Quaternion().setFromUnitVectors(UP, dir.normalize());
  const r = Math.max(0.015, o.size[0] / 2);
  const head = Math.min(len * 0.35, r * 6);
  return (
    <group position={a} quaternion={q}>
      <mesh position={[0, (len - head) / 2, 0]} castShadow>
        <cylinderGeometry args={[r, r, len - head, 12]} />
        <meshStandardMaterial color={o.color ?? "#1c1e22"} roughness={0.4} />
      </mesh>
      <mesh position={[0, len - head / 2, 0]} castShadow>
        <coneGeometry args={[r * 2.6, head, 18]} />
        <meshStandardMaterial color={o.color ?? "#1c1e22"} roughness={0.4} />
      </mesh>
    </group>
  );
}
