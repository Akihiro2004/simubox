"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, type BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Stationary equipment, furniture and botanical detail, merged by material. */
function buildDecor() {
  const batches = new Map<string, BufferGeometry[]>();
  const add = (c: string, g: BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    g.rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z);
    const normalized = g.index ? g.toNonIndexed() : g;
    if (normalized !== g) g.dispose();
    const parts = batches.get(c) ?? [];
    parts.push(normalized);
    batches.set(c, parts);
  };
  const box = (c: string, x: number, y: number, z: number, w: number, h: number, d: number) => add(c, new BoxGeometry(w, h, d), x, y, z);
  const teal = "#638f91", wood = "#bf9f78", cream = "#f2eadb", metal = "#8a9fa6", gold = "#c4a565";
  for (const x of [-2.8, 2.8]) {
    box(teal, x, 0.68, -3.55, 1.55, 1.3, 0.65);
    box(wood, x, 1.36, -3.52, 1.65, 0.09, 0.76);
    for (const dx of [-0.38, 0.38]) {
      box(cream, x + dx, 0.72, -3.21, 0.7, 1.1, 0.035);
      box(gold, x + dx, 0.84, -3.17, 0.28, 0.035, 0.025);
    }
    for (const dx of [-0.58, 0.58]) box(metal, x + dx, 0.08, -3.5, 0.08, 0.16, 0.45);
  }
  // Spare lenses on a rack and a compact spectrometer on the side counter.
  box(metal, -2.8, 1.45, -3.5, 1.02, 0.07, 0.34);
  for (let i = 0; i < 3; i++) {
    const x = -3.1 + i * 0.3;
    box(metal, x, 1.67, -3.5, 0.025, 0.4, 0.025);
    add(teal, new TorusGeometry(0.15, 0.023, 6, 24), x, 1.86, -3.5);
    add("#b7d9d9", new CylinderGeometry(0.132, 0.132, 0.015, 24), x, 1.86, -3.5, Math.PI / 2);
  }
  box(cream, 2.65, 1.6, -3.48, 0.65, 0.36, 0.42);
  box(teal, 2.65, 1.63, -3.25, 0.49, 0.2, 0.035);
  for (const x of [2.5, 2.75]) add(gold, new CylinderGeometry(0.03, 0.03, 0.02, 12), x, 1.63, -3.22, Math.PI / 2);
  // A small plant and two reference books give the workbench some warmth.
  box(teal, 3.22, 1.46, -3.48, 0.35, 0.09, 0.4);
  box(cream, 3.22, 1.55, -3.48, 0.33, 0.08, 0.38);
  add(wood, new CylinderGeometry(0.14, 0.11, 0.23, 16), 3.22, 1.7, -3.48);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    add(i % 2 ? teal : "#8caa83", new SphereGeometry(1, 12, 8).scale(0.055, 0.17, 0.07), 3.22 + Math.sin(a) * 0.08, 1.93, -3.48 + Math.cos(a) * 0.08, Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
  }
  // Stools and warm floor inlays sit clear of Simu's presenting spot.
  for (const z of [-0.6, 1.1]) {
    add(teal, new CylinderGeometry(0.28, 0.28, 0.1, 24), -3.4, 0.62, z);
    for (const [dx, dz] of [[-0.16, -0.16], [0.16, -0.16], [0, 0.16]]) box(metal, -3.4 + dx, 0.3, z + dz, 0.035, 0.6, 0.035);
  }
  for (const x of [-3.8, 3.8]) box(gold, x, 0.008, 0, 0.025, 0.01, 7.6);
  for (const z of [-3.8, 3.8]) box(gold, 0, 0.008, z, 7.6, 0.01, 0.025);
  return Array.from(batches, ([color, parts]) => {
    const geometry = mergeGeometries(parts)!;
    parts.forEach((part) => part.dispose());
    return { color, geometry };
  });
}

export function OpticsDecor() {
  const batches = useMemo(() => buildDecor(), []);
  useEffect(() => () => batches.forEach(({ geometry }) => geometry.dispose()), [batches]);
  return <group>{batches.map(({ color, geometry }) => <mesh key={color} geometry={geometry} castShadow receiveShadow><meshStandardMaterial color={color} roughness={0.7} /></mesh>)}</group>;
}
