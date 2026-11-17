"use client";

import { CameraControls, CameraControlsImpl } from "@react-three/drei";
import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Box3, MathUtils, PerspectiveCamera, Sphere, Spherical, Vector3 } from "three";
import { useSim } from "@/lib/store";
import { WORLDS, type Vec3 } from "@/lib/world/catalog";
import { periodicTableCamera } from "@/lib/periodic-table";
import { fitCourtFlight, measureFraming, VIEW_SAFE as SAFE } from "@/lib/world/camera-framing";
import { view } from "@/lib/world/runtime";

/** Shared handle so drag code can pause orbiting while an object is held. */
export const controlsRef: { current: CameraControlsImpl | null } = { current: null };

const ZOOM = { close: 4.5, medium: 9, wide: 18 } as const;
/** Default glide; user zooms use it too. */
const SMOOTH = 0.45;
/** Lesson shots look down on the subject between ~30° and ~63° from straight above: never edge-on, never a flat map. */
const POLAR = { min: 0.52, max: 1.1 } as const;

const ndc = new Vector3();
const orbit = new Spherical();

/** Longer trips take a little longer, so a big move reads as one calm glide, not a whip. */
export function glideTime(travel: number): number {
  return MathUtils.clamp(0.4 + travel * 0.05, SMOOTH, 0.9);
}

/** Keeps the student's orbit direction; only tilts back into the pleasant band. */
export function shotDirection(dir: Vector3): Vector3 {
  orbit.setFromVector3(dir);
  orbit.phi = MathUtils.clamp(orbit.phi, POLAR.min, POLAR.max);
  return new Vector3().setFromSpherical(orbit).normalize();
}

/** Camera distance that fits a sphere of radius r inside the safe area. */
export function fitDistance(r: number, fovDeg: number, aspect: number): number {
  const half = MathUtils.degToRad(fovDeg / 2);
  const v = Math.atan(Math.tan(half) * ((SAFE.top - SAFE.bottom) / 2));
  const h = Math.atan(Math.tan(half) * aspect * ((SAFE.right - SAFE.left) / 2));
  return r / Math.sin(Math.min(v, h));
}

/** The student grabbed the view (drag, pinch, wheel): the lesson stops steering, and their zoom feels like their own again. */
function userTookCamera() {
  const c = controlsRef.current;
  // Controls are off while an object is held: the wheel then pushes the object, not the view.
  if (!c?.enabled) return;
  if (c.smoothTime > SMOOTH) c.smoothTime = SMOOTH;
  useSim.getState().takeCamera();
}

export function CameraRig({ animate }: { animate: boolean }) {
  const ref = useRef<CameraControlsImpl>(null);
  const cam = useSim((s) => s.camera);
  const world = useSim((s) => s.world);
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    controlsRef.current = ref.current;
    return () => {
      controlsRef.current = null;
    };
  }, []);

  // Lets the lesson ask whether its subject is already well framed before moving anything.
  useEffect(() => {
    view.framing = (points) => {
      camera.updateMatrixWorld();
      return measureFraming(points.map((p) => ndc.set(...p).project(camera).toArray() as Vec3));
    };
    return () => {
      view.framing = null;
    };
  }, [camera]);

  // Wheel zoom doesn't fire camera-controls' controlstart, so it is caught here.
  useEffect(() => {
    const el = gl.domElement;
    el.addEventListener("wheel", userTookCamera, { passive: true });
    return () => el.removeEventListener("wheel", userTookCamera);
  }, [gl]);

  // Keep the orbit target inside the world so the view can't get lost.
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const { min, max } = WORLDS[world].bounds;
    c.setBoundary(new Box3(new Vector3(min[0] - 2, -1, min[2] - 2), new Vector3(max[0] + 2, max[1] + 2, max[2] + 2)));
  }, [world]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = WORLDS[world];
    const t = c.getTarget(new Vector3());
    const p = c.getPosition(new Vector3());
    const smooth = animate;
    c.smoothTime = animate ? SMOOTH : 0.01;
    if (cam.preset === "periodic_table" && world === "lab") {
      const { position: p, target: t } = periodicTableCamera(size.width / Math.max(1, size.height));
      void c.setLookAt(...p, ...t, smooth);
      return;
    }
    if (cam.points?.length) {
      if (world === "court") {
        const fov = camera instanceof PerspectiveCamera ? camera.fov : 32;
        const fit = fitCourtFlight(cam.points, fov, size.width / Math.max(1, size.height), p.clone().sub(t), Math.max(.8, cam.radius ?? 0));
        void c.setLookAt(fit.position.x, fit.position.y, fit.position.z, fit.target.x, fit.target.y, fit.target.z, smooth);
        return;
      }
      // Fit every point, keeping the student's orbit direction.
      const sphere = new Sphere().setFromPoints(cam.points.map((q) => new Vector3(...q)));
      const r = Math.max(cam.radius ?? 1.5, sphere.radius + 0.6);
      const fov = camera instanceof PerspectiveCamera ? camera.fov : 32;
      const dist = fitDistance(r, fov, size.width / Math.max(1, size.height));
      const dir = shotDirection(p.clone().sub(t));
      const pos = sphere.center.clone().addScaledVector(dir, dist);
      pos.y = Math.max(pos.y, sphere.center.y + 1);
      if (animate) c.smoothTime = glideTime(pos.distanceTo(p) + sphere.center.distanceTo(t));
      void c.setLookAt(pos.x, pos.y, pos.z, sphere.center.x, sphere.center.y, sphere.center.z, smooth);
      return;
    }
    if (cam.target) {
      const target = new Vector3(...cam.target);
      const dir = p.sub(t).normalize();
      const dist = cam.distance ?? ZOOM[cam.zoom ?? "medium"];
      const pos = target.clone().addScaledVector(dir, dist);
      void c.setLookAt(pos.x, Math.max(pos.y, target.y + 1), pos.z, target.x, target.y, target.z, smooth);
      return;
    }
    const dist = Math.max(8, p.distanceTo(t));
    switch (cam.preset) {
      case "top":
        void c.setLookAt(t.x + 0.01, t.y + dist, t.z + 0.01, t.x, t.y, t.z, smooth);
        break;
      case "front":
        void c.setLookAt(t.x, t.y + 1.5, t.z + dist, t.x, t.y, t.z, smooth);
        break;
      case "side":
        void c.setLookAt(t.x + dist, t.y + 1.5, t.z, t.x, t.y, t.z, smooth);
        break;
      default: {
        const aspect = size.width / Math.max(1, size.height);
        // Leave room for tall cutaway walls and the composer. The old desktop
        // framing clipped the wall caps; resize must also refit the diorama.
        const padding = world === "lab" ? 1.65 : world === "math" ? 1.6 : world === "space" || world === "globe" ? 1.55 : 1.3;
        const k = Math.max(padding, padding / Math.max(.25, aspect));
        const [px, py, pz] = w.camera.position, [tx, ty, tz] = w.camera.target;
        void c.setLookAt(tx + (px - tx) * k, ty + (py - ty) * k, tz + (pz - tz) * k, tx, ty, tz, smooth);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requests and viewport changes refit; ordinary store renders must not interrupt orbiting
  }, [cam.nonce, size.width, size.height]);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={2.5}
      maxDistance={world === "court" ? 1500 : 100}
      minPolarAngle={0.12}
      maxPolarAngle={cam.preset === "periodic_table" ? Math.PI / 2 : 1.42}
      // A touch slower than the default: camera moves glide and settle like a dolly shot.
      smoothTime={animate ? SMOOTH : 0.01}
      draggingSmoothTime={0.12}
      dollyToCursor
      onControlStart={userTookCamera}
    />
  );
}
