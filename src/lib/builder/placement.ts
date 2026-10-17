import { Euler, Matrix4 } from "three";
import { ASSETS, WORLDS, type Vec3, type WorldId } from "../world/catalog";
import type { SceneObject } from "../world/scene";

export function objectSize(o: SceneObject): Vec3 {
  return (o.type === "asset" ? ASSETS[o.asset].size : o.type === "primitive" || o.type === "shape" ? o.size : [1.8, 1.8, 1.8]).map(v => v * o.scale) as Vec3;
}
export function halfBounds(o: SceneObject): Vec3 {
  const [x, y, z] = objectSize(o).map(v => v / 2);
  const e = new Matrix4().makeRotationFromEuler(new Euler(...o.rotation.map(v => v * Math.PI / 180) as Vec3)).elements;
  return [Math.abs(e[0]) * x + Math.abs(e[4]) * y + Math.abs(e[8]) * z, Math.abs(e[1]) * x + Math.abs(e[5]) * y + Math.abs(e[9]) * z, Math.abs(e[2]) * x + Math.abs(e[6]) * y + Math.abs(e[10]) * z];
}
export function boundPosition(o: SceneObject, world: WorldId, position: Vec3): Vec3 | null {
  if (!position.every(Number.isFinite) || !o.rotation.every(Number.isFinite) || !Number.isFinite(o.scale)) return null;
  const { min, max } = WORLDS[world].bounds;
  const half = halfBounds(o);
  if (half.some((h, axis) => h * 2 > max[axis] - min[axis])) return null;
  return position.map((v, axis) => Math.min(max[axis] - half[axis], Math.max(min[axis] + half[axis], v))) as Vec3;
}
/** Search outward for a clear footprint instead of dropping purchases inside furniture. */
export function findPlacement(o: SceneObject, world: WorldId, objects: Record<string, SceneObject>): Vec3 | null {
  const { min, max } = WORLDS[world].bounds;
  const [hx, hy, hz] = halfBounds(o);
  const start: Vec3 = [world === "court" ? 3 : 0, world === "ocean" ? 3.1 + hy : min[1] + hy + .02, world === "space" ? 7 : 1.8];
  const candidates: Vec3[] = [start];
  for (let x = min[0] + hx + .03; x <= max[0] - hx; x += .35) {
    if (world === "court" && x > 12) break;
    for (let z = min[2] + hz + .03; z <= max[2] - hz; z += .35) candidates.push([x, start[1], z]);
  }
  candidates.sort((a, b) => Math.hypot(a[0] - start[0], a[2] - start[2]) - Math.hypot(b[0] - start[0], b[2] - start[2]));
  const occupied = Object.values(objects).filter(v => v.visible).map(v => ({ o: v, h: halfBounds(v) }));
  for (const p of candidates) {
    const at = boundPosition(o, world, p);
    if (!at) return null;
    if (occupied.every(({ o: other, h }) => Math.abs(at[0] - other.position[0]) > hx + h[0] + .08 || Math.abs(at[2] - other.position[2]) > hz + h[2] + .08 || Math.abs(at[1] - other.position[1]) > hy + h[1] + .03)) return at;
  }
  return null;
}
