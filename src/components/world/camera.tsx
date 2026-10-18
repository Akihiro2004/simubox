"use client";

import { CameraControls, CameraControlsImpl } from "@react-three/drei";
import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Box3, MathUtils, PerspectiveCamera, Sphere, Vector3 } from "three";
import { view } from "@/lib/world/runtime";
import { useSim } from "@/lib/store";
import { WORLDS } from "@/lib/world/catalog";
import { periodicTableCamera } from "@/lib/periodic-table";
import { fitCourtFlight, VIEW_SAFE as SAFE } from "@/lib/world/camera-framing";

/** Shared handle so drag code can pause orbiting while an object is held. */
export const controlsRef: { current: CameraControlsImpl | null } = { current: null };

const ZOOM = { close: 4.5, medium: 9, wide: 18 } as const;

/**
 * Screen area not covered by UI, in normalized device coordinates: the
 * answer card sits on the left, the composer at the bottom, controls right.
 */
const ndc = new Vector3();

/** Camera distance that fits a sphere of radius r inside the safe area. */
export function fitDistance(r: number, fovDeg: number, aspect: number): number {
  const half = MathUtils.degToRad(fovDeg / 2);
  const v = Math.atan(Math.tan(half) * ((SAFE.top - SAFE.bottom) / 2));
  const h = Math.atan(Math.tan(half) * aspect * ((SAFE.right - SAFE.left) / 2));
  return r / Math.sin(Math.min(v, h));
}

export function CameraRig({ animate }: { animate: boolean }) {
  const ref = useRef<CameraControlsImpl>(null);
  const cam = useSim((s) => s.camera);
  const world = useSim((s) => s.world);
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    controlsRef.current = ref.current;
    return () => {
      controlsRef.current = null;
    };
  }, []);

  // Lets lessons check that the subject and the speaking guide are visible.
  useEffect(() => {
    view.inView = (points) => {
      camera.updateMatrixWorld();
      return points.every((p) => {
        ndc.set(...p).project(camera);
        return ndc.z < 1 && ndc.x > SAFE.left && ndc.x < SAFE.right && ndc.y > SAFE.bottom && ndc.y < SAFE.top;
      });
    };
    return () => {
      view.inView = null;
    };
  }, [camera]);

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
      // Fit every point, keeping the current viewing angle.
      const sphere = new Sphere().setFromPoints(cam.points.map((q) => new Vector3(...q)));
      const r = Math.max(cam.radius ?? 1.5, sphere.radius + 0.6);
      const fov = camera instanceof PerspectiveCamera ? camera.fov : 32;
      const dist = fitDistance(r, fov, size.width / Math.max(1, size.height));
      const dir = p.sub(t).normalize();
      const pos = sphere.center.clone().addScaledVector(dir, dist);
      void c.setLookAt(pos.x, Math.max(pos.y, sphere.center.y + 1), pos.z, sphere.center.x, sphere.center.y, sphere.center.z, smooth);
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
      smoothTime={animate ? 0.45 : 0.01}
      draggingSmoothTime={0.12}
      dollyToCursor
    />
  );
}
