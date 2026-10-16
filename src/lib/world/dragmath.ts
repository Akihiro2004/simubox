// Pure geometry for picking up and moving objects. No three.js, so it can be
// unit-tested. Vectors are [x, y, z].

export type V3 = [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Where a ray hits the plane through `point` with normal `normal` (null if parallel or behind). */
export function rayPlane(origin: V3, dir: V3, normal: V3, point: V3): V3 | null {
  const denom = dot(normal, dir);
  if (Math.abs(denom) < 1e-6) return null;
  const t = dot(normal, sub(point, origin)) / denom;
  return t < 0 ? null : add(origin, mul(dir, t));
}

/** Where a ray hits the horizontal plane y = h (null if it never reaches it). */
export function rayHeight(origin: V3, dir: V3, h: number): V3 | null {
  if (Math.abs(dir[1]) < 1e-6) return null;
  const t = (h - origin[1]) / dir[1];
  return t < 0 ? null : add(origin, mul(dir, t));
}

export interface DragSpace {
  /** Camera-facing drag plane: a point on it and its normal. */
  planePoint: V3;
  planeNormal: V3;
  /** Grab point minus object centre, so the object doesn't jump to the cursor. */
  offset: V3;
  /** Lowest and highest allowed centre heights (floor + half height, ceiling - half height). */
  minY: number;
  maxY: number;
  /** Horizontal bounds for the centre. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Object centre for a cursor ray. The object follows the cursor on the
 * camera-facing plane; if that would put it through the floor or ceiling it
 * instead slides along the floor/ceiling under the cursor. Always clamped to
 * the world bounds. Returns null only if the ray can't place it at all.
 */
export function dragTarget(origin: V3, dir: V3, s: DragSpace): V3 | null {
  const onPlane = rayPlane(origin, dir, s.planeNormal, s.planePoint);
  let centre = onPlane ? sub(onPlane, s.offset) : null;

  const handOff = (y: number) => {
    // The grab point sits offset[1] above the centre, so aim the ray at that height.
    const hit = rayHeight(origin, dir, y + s.offset[1]);
    return hit ? ([hit[0] - s.offset[0], y, hit[2] - s.offset[2]] as V3) : null;
  };
  if (!centre || centre[1] < s.minY) centre = handOff(s.minY) ?? centre;
  else if (centre[1] > s.maxY) centre = handOff(s.maxY) ?? centre;
  if (!centre) return null;

  return [clamp(centre[0], s.minX, s.maxX), clamp(centre[1], s.minY, s.maxY), clamp(centre[2], s.minZ, s.maxZ)];
}

/** Release velocity from recent samples: displacement over the last `windowMs`. */
export function releaseVelocity(samples: { t: number; p: V3 }[], windowMs = 90, maxSpeed = 12): V3 {
  if (samples.length < 2) return [0, 0, 0];
  const last = samples[samples.length - 1];
  let first = samples[0];
  for (const s of samples) {
    if (last.t - s.t <= windowMs) {
      first = s;
      break;
    }
  }
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0.004) return [0, 0, 0];
  const v = mul(sub(last.p, first.p), 1 / dt);
  const speed = Math.hypot(...v);
  return speed > maxSpeed ? mul(v, maxSpeed / speed) : v;
}
