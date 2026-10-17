"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, CanvasTexture, CylinderGeometry, Euler, Matrix4, Quaternion, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector3, type BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type XYZ = [number, number, number];
const COLORS = { cream: "#f8edd9", wood: "#c49a72", teal: "#397e79", mint: "#88b9a1", coral: "#e58b6e", gold: "#d8ae62", ink: "#384e53", paper: "#fff7e7" };
type Pigment = keyof typeof COLORS;

/** All the stationary props share eight draw calls, regardless of part count. */
export function createWorkshopGeometry() {
  const batches = new Map<Pigment, BufferGeometry[]>();
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3(1, 1, 1);
  const add = (color: Pigment, geometry: BufferGeometry, p: XYZ, r: XYZ = [0, 0, 0]) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    rotation.setFromEuler(new Euler(...r));
    g.applyMatrix4(matrix.compose(position.set(...p), rotation, scale));
    const batch = batches.get(color) ?? [];
    batch.push(g);
    batches.set(color, batch);
  };
  const box = (c: Pigment, p: XYZ, s: XYZ, r?: XYZ) => add(c, new BoxGeometry(...s), p, r);
  const cylinder = (c: Pigment, p: XYZ, top: number, bottom: number, h: number, r?: XYZ) => add(c, new CylinderGeometry(top, bottom, h, 16), p, r);
  const ball = (c: Pigment, p: XYZ, radius: number) => add(c, new SphereGeometry(radius, 16, 12), p);
  const ring = (c: Pigment, p: XYZ, radius: number, tube: number, r: XYZ) => add(c, new TorusGeometry(radius, tube, 6, 48), p, r);

  // Simu's little charging dock.
  cylinder("teal", [-3.15, 0.055, -0.35], 0.64, 0.68, 0.11);
  cylinder("cream", [-3.15, 0.12, -0.35], 0.55, 0.58, 0.05);
  ring("gold", [-3.15, 0.153, -0.35], 0.49, 0.014, [Math.PI / 2, 0, 0]);

  // A brass orrery: a small solar system in the back corner.
  const ox = 2.85, oz = -1.4;
  cylinder("teal", [ox, 0.08, oz], 0.56, 0.64, 0.16);
  cylinder("gold", [ox, 0.19, oz], 0.44, 0.48, 0.06);
  cylinder("gold", [ox, 0.77, oz], 0.035, 0.035, 1.12);
  ball("gold", [ox, 1.32, oz], 0.28);
  ring("gold", [ox, 1.27, oz], 0.65, 0.015, [1.1, 0.12, -0.2]);
  ring("gold", [ox, 1.27, oz], 0.93, 0.012, [1.1, 0.12, -0.2]);
  ball("teal", [ox - 0.64, 1.39, oz], 0.14);
  ball("coral", [ox + 0.88, 1.1, oz + 0.1], 0.2);
  ring("cream", [ox + 0.88, 1.1, oz + 0.1], 0.29, 0.035, [1.1, 0, 0.2]);

  // Books and a succulent balance the taller solar model.
  box("coral", [-2.65, 0.1, -1.65], [1.02, 0.18, 0.68], [0, -0.12, 0]);
  box("paper", [-2.65, 0.11, -1.65], [0.94, 0.09, 0.7], [0, -0.12, 0]);
  box("teal", [-2.58, 0.28, -1.65], [0.88, 0.16, 0.62], [0, 0.08, 0]);
  box("paper", [-2.58, 0.28, -1.65], [0.8, 0.09, 0.64], [0, 0.08, 0]);
  cylinder("cream", [-2.58, 0.52, -1.65], 0.23, 0.17, 0.34);
  cylinder("wood", [-2.58, 0.7, -1.65], 0.205, 0.205, 0.025);
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 7;
    add(i % 2 ? "teal" : "mint", new SphereGeometry(1, 12, 8).scale(0.09, 0.26, 0.06), [-2.58 + Math.sin(a) * 0.12, 0.85, -1.65 + Math.cos(a) * 0.12], [Math.cos(a) * 0.65, 0, -Math.sin(a) * 0.65]);
  }

  // Three colored sample tubes in a wooden rack, with solid frosted sleeves.
  box("wood", [0.6, 0.08, -1.72], [1.12, 0.12, 0.44]);
  box("wood", [0.6, 0.47, -1.72], [1.12, 0.07, 0.4]);
  for (const x of [0.12, 1.08]) box("wood", [x, 0.28, -1.72], [0.065, 0.43, 0.35]);
  (["mint", "coral", "gold"] as const).forEach((color, i) => {
    const x = 0.27 + i * 0.33;
    cylinder(color, [x, 0.35, -1.72], 0.09, 0.09, 0.38);
    ball(color, [x, 0.16, -1.72], 0.09);
    cylinder("cream", [x, 0.61, -1.72], 0.09, 0.09, 0.18);
    cylinder("teal", [x, 0.72, -1.72], 0.105, 0.105, 0.05);
  });

  // Notebook, pencil, and a few tactile building blocks at the front edge.
  box("teal", [-2.9, 0.065, 1.5], [0.95, 0.1, 0.7], [0, 0.17, 0]);
  box("paper", [-2.9, 0.13, 1.5], [0.85, 0.035, 0.64], [0, 0.17, 0]);
  box("coral", [-2.9, 0.155, 1.5], [0.035, 0.018, 0.67], [0, 0.17, 0]);
  cylinder("gold", [-2.18, 0.08, 1.48], 0.032, 0.032, 0.7, [Math.PI / 2, 0, -0.24]);
  cylinder("ink", [-2.1, 0.08, 1.82], 0, 0.032, 0.1, [Math.PI / 2, 0, -0.24]);
  box("coral", [3.25, 0.2, 1.3], [0.34, 0.4, 0.34], [0, 0.2, 0]);
  ball("mint", [3.58, 0.2, 0.98], 0.2);
  cylinder("gold", [3.72, 0.19, 1.5], 0, 0.21, 0.38);

  // A front brass badge and inset edge detailing.
  box("gold", [0, -0.23, 2.506], [0.85, 0.15, 0.012]);
  for (const x of [-0.34, 0.34]) ball("ink", [x, -0.23, 2.52], 0.018);

  return Array.from(batches, ([color, parts]) => {
    const geometry = mergeGeometries(parts)!;
    parts.forEach((g) => g.dispose());
    return { color: COLORS[color], geometry };
  });
}

function fieldTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#dceae3";
  ctx.fillRect(0, 0, 1024, 512);
  ctx.strokeStyle = "#cadcd2";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 32; x < 1024; x += 32) { ctx.moveTo(x, 0); ctx.lineTo(x, 512); }
  for (let y = 32; y < 512; y += 32) { ctx.moveTo(0, y); ctx.lineTo(1024, y); }
  ctx.stroke();
  // Painted contact shadows keep the objects grounded even without shadow maps.
  for (const [x, z, rx, rz] of [[-3.15, -0.35, 0.72, 0.55], [-2.58, -1.65, 0.65, 0.38], [2.85, -1.4, 0.8, 0.48], [0.6, -1.72, 0.75, 0.3], [-2.9, 1.5, 0.65, 0.4], [3.5, 1.3, 0.6, 0.4]]) {
    ctx.save();
    ctx.translate((x / 7.95 + 0.5) * 1024, (z / 4.05 + 0.5) * 512);
    ctx.scale(rx * 1024 / 7.95, rz * 512 / 4.05);
    const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    shadow.addColorStop(0, "rgba(43, 73, 62, 0.21)");
    shadow.addColorStop(1, "rgba(43, 73, 62, 0)");
    ctx.fillStyle = shadow;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  ctx.strokeStyle = "#729d91";
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, 976, 464);
  ctx.beginPath();
  for (let x = 48; x < 990; x += 16) { ctx.moveTo(x, 488); ctx.lineTo(x, x % 64 === 48 ? 472 : 480); }
  ctx.stroke();
  ctx.fillStyle = "#4c7a71";
  ctx.font = "600 14px monospace";
  ctx.fillText("SIMUBOX  /  THE CURIOSITY LAB", 48, 56);
  ctx.font = "12px monospace";
  ctx.fillText("MAKE ROOM FOR A LITTLE WONDER.", 48, 451);
  ctx.fillText("EXP. 001", 879, 451);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function LandingWorkshop() {
  const batches = useMemo(() => createWorkshopGeometry(), []);
  const texture = useMemo(() => fieldTexture(), []);
  useEffect(() => () => {
    batches.forEach(({ geometry }) => geometry.dispose());
    texture.dispose();
  }, [batches, texture]);
  return (
    <group>
      {batches.map(({ color, geometry }) => (
        <mesh key={color} geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial color={color} roughness={0.65} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow>
        <planeGeometry args={[7.95, 4.05]} />
        <meshStandardMaterial map={texture} roughness={0.9} />
      </mesh>
    </group>
  );
}
