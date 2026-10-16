// Live, non-React runtime handles: Rapier bodies and Three groups by object
// id, plus a tiny event bus. Kept outside Zustand so physics frames never
// trigger React renders.

import type { RapierRigidBody } from "@react-three/rapier";
import { Vector3, type Object3D } from "three";
import type { Vec3 } from "./catalog";

export const bodies = new Map<string, RapierRigidBody>();
export const nodes = new Map<string, Object3D>();

/** False for bodies removed from, or left behind by, a freed physics world. */
function alive(b: RapierRigidBody): boolean {
  try {
    return b.isValid();
  } catch {
    // A remounted <Physics> frees the old world; touching its bodies throws.
    return false;
  }
}

/** Live body for an object id, dropping stale handles as it finds them. */
export function getBody(id: string): RapierRigidBody | undefined {
  const b = bodies.get(id);
  if (b && !alive(b)) {
    bodies.delete(id);
    return undefined;
  }
  return b;
}

/** All live bodies (stale handles are pruned). */
export function liveBodies(): [string, RapierRigidBody][] {
  const out: [string, RapierRigidBody][] = [];
  for (const [id, b] of bodies) {
    if (alive(b)) out.push([id, b]);
    else bodies.delete(id);
  }
  return out;
}

export type SimEvent = "projectile_landed" | "objects_settled" | "answer";
const bus = new EventTarget();

export function emit(event: SimEvent, detail?: unknown) {
  bus.dispatchEvent(new CustomEvent(event, { detail }));
}

export function on(event: SimEvent, fn: (detail: unknown) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent).detail);
  bus.addEventListener(event, h);
  return () => bus.removeEventListener(event, h);
}

/** Resolves on the event, on timeout (false) or when the signal aborts. */
export function waitFor(event: SimEvent, timeoutMs: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const off = on(event, () => done(true));
    const t = setTimeout(() => done(false), timeoutMs);
    const abort = () => done(false);
    signal.addEventListener("abort", abort);
    function done(v: boolean) {
      off();
      clearTimeout(t);
      signal.removeEventListener("abort", abort);
      resolve(v);
    }
  });
}

/** Current world position of an object (live physics if it has a body). */
export function livePosition(id: string): Vec3 | null {
  const b = getBody(id);
  if (b) {
    const t = b.translation();
    return [t.x, t.y, t.z];
  }
  const n = nodes.get(id);
  if (n) {
    const p = n.getWorldPosition(new Vector3());
    return [p.x, p.y, p.z];
  }
  return null;
}

export function liveSpeed(id: string): number {
  const b = getBody(id);
  if (!b) return 0;
  const v = b.linvel();
  return Math.hypot(v.x, v.y, v.z);
}

export function allSettled(): boolean {
  for (const [, b] of liveBodies()) {
    if (!b.isDynamic()) continue;
    const v = b.linvel();
    if (Math.hypot(v.x, v.y, v.z) > 0.05) return false;
  }
  return true;
}

/** Ids a lesson just spawned; their models grow in once on first mount. */
const fresh = new Set<string>();
export function markFresh(id: string) {
  fresh.add(id);
}
/** True once per freshly spawned id (later remounts don't replay the grow-in). */
export function takeFresh(id: string): boolean {
  return fresh.delete(id);
}

/**
 * The camera rig registers here so lesson code can ask whether points are
 * clearly on screen (outside the cards and composer). Null until mounted.
 */
export const view: { inView: ((points: Vec3[]) => boolean) | null } = { inView: null };
