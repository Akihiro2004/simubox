import { Box3, MathUtils, Vector3 } from "three";
import type { Vec3 } from "./catalog";

export const VIEW_SAFE = { left: -.45, right: .62, bottom: -.6, top: .8 } as const;

/** Fit the projected flight bounds, including depth, instead of a mostly empty sphere. */
export function fitCourtFlight(points: Vec3[], fov: number, aspect: number, direction: Vector3, padding = .8) {
  const vertices = points.map(p => new Vector3(...p));
  const target = new Box3().setFromPoints(vertices).getCenter(new Vector3());
  // Looking along the field gives a portrait screen useful depth and height.
  const dir = aspect < .8 ? new Vector3(-1, .9, 1).normalize() : direction.clone().normalize();
  const right = new Vector3(0, 1, 0).cross(dir).normalize();
  const up = dir.clone().cross(right).normalize();
  const tan = Math.tan(MathUtils.degToRad(fov / 2));
  let distance = 12;
  for (const point of vertices) {
    const q = point.clone().sub(target), x = q.dot(right), y = q.dot(up), depth = q.dot(dir);
    const horizontal = (Math.abs(x) + padding) / (tan * Math.max(.2, aspect) * (x < 0 ? -VIEW_SAFE.left : VIEW_SAFE.right));
    const vertical = (Math.abs(y) + padding) / (tan * (y < 0 ? -VIEW_SAFE.bottom : VIEW_SAFE.top));
    distance = Math.max(distance, depth + horizontal, depth + vertical);
  }
  return { target, position: target.clone().addScaledVector(dir, distance) };
}
