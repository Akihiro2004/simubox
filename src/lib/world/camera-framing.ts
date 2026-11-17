import { Box3, MathUtils, Sphere, Vector3 } from "three";
import type { Vec3 } from "./catalog";

export const VIEW_SAFE = { left: -.45, right: .62, bottom: -.6, top: .8 } as const;

/**
 * Lesson camera tuning. A subject between minFill and maxFill of the free
 * screen, fully inside it, is "well framed" (the dead zone): the camera
 * stays put. Otherwise a shot frames it at targetFill.
 */
export const SHOT = { minFill: .4, maxFill: .95, targetFill: .6, minRadius: 1.1, holdMs: 1200 } as const;

export interface Framing {
  /** Every point is on screen, clear of the cards, rail and composer. */
  inside: boolean;
  /** How much of the free screen the points span (largest of width and height share). */
  fill: number;
}

/** Measures points already projected to normalized device coordinates against the free screen area. */
export function measureFraming(ndc: Vec3[]): Framing {
  if (!ndc.length) return { inside: true, fill: SHOT.targetFill };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, inside = true;
  for (const [x, y, z] of ndc) {
    if (z >= 1 || x < VIEW_SAFE.left || x > VIEW_SAFE.right || y < VIEW_SAFE.bottom || y > VIEW_SAFE.top) inside = false;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const fill = Math.max((x1 - x0) / (VIEW_SAFE.right - VIEW_SAFE.left), (y1 - y0) / (VIEW_SAFE.top - VIEW_SAFE.bottom));
  return { inside, fill };
}

/** Outside the dead zone: off screen, too small to read or too big to see whole. */
export function needsShot(f: Framing): boolean {
  return !f.inside || f.fill < SHOT.minFill || f.fill > SHOT.maxFill;
}

const sphere = new Sphere();
const radiusOf = (points: Vec3[]) => sphere.setFromPoints(points.map((p) => new Vector3(...p))).radius;

/** Framing radius that makes the subject fill about targetFill of the free screen; tiny things aren't framed nose-close. */
export function shotRadius(points: Vec3[]): number {
  return Math.max(SHOT.minRadius, radiusOf(points) / SHOT.targetFill);
}

/**
 * The previous beat stays in the shot when it sits close to the new one,
 * so "compare A with B" keeps both in view; a far-away earlier subject is let go.
 */
export function beatPoints(previous: Vec3[], current: Vec3[]): Vec3[] {
  if (!previous.length || !current.length) return current;
  const both = [...previous, ...current];
  return radiusOf(both) <= Math.max(2.5, radiusOf(current) * 1.8) ? both : current;
}

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
