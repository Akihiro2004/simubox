"use client";

// Pick up, move and throw objects.
// - The object follows the cursor on a camera-facing plane through the grab
//   point, so it stays under the pointer and can be lifted anywhere in view.
// - Dragging below the floor (or above the ceiling) slides it along the
//   floor (ceiling) under the cursor instead.
// - The scroll wheel pushes the held object away or pulls it closer.
// - A guide line and floor ring show where a lifted object is in 3D.
// - Release throws it with the velocity of the last ~90 ms.

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import type { RapierRigidBody } from "@react-three/rapier";
import { useEffect, useRef } from "react";
import { Raycaster, Vector2, Vector3, type Camera, type Group, type Mesh } from "three";
import { useSim } from "@/lib/store";
import { ASSETS, WORLDS } from "@/lib/world/catalog";
import { getBody } from "@/lib/world/runtime";
import type { SceneObject } from "@/lib/world/scene";
import { dragTarget, releaseVelocity, type DragSpace, type V3 } from "@/lib/world/dragmath";
import { controlsRef } from "./camera";

const KINEMATIC = 2;
const DYNAMIC = 0;
const START_PX = 4; // a plain click selects without moving anything
const WHEEL_M_PER_PX = 0.004;

/** Module-level drag state: pointer moves must not re-render React. */
const drag = {
  phase: "idle" as "idle" | "pending" | "dragging",
  id: "",
  body: null as RapierRigidBody | null,
  downX: 0,
  downY: 0,
  clientX: 0,
  clientY: 0,
  space: null as DragSpace | null,
  floorY: 0,
  target: null as V3 | null,
  samples: [] as { t: number; p: V3 }[],
};

function halfExtents(o: SceneObject): [number, number] {
  if (o.type === "asset") {
    const [w, h, d] = ASSETS[o.asset].size;
    return [(Math.max(w, d) / 2) * o.scale, (h / 2) * o.scale];
  }
  if (o.type === "primitive") return [(Math.max(o.size[0], o.size[2]) / 2) * o.scale, (o.size[1] / 2) * o.scale];
  return [0.3, 0.3];
}

/** Called from an object's pointerdown. The drag only starts once the pointer moves. */
export function beginGrab(e: ThreeEvent<PointerEvent>, o: SceneObject) {
  if (o.physics !== "dynamic" || drag.phase !== "idle") return;
  const b = getBody(o.id);
  if (!b) return;
  const c = b.translation();
  const camera: Camera = e.camera;
  const forward = camera.getWorldDirection(new Vector3());
  const { min, max } = WORLDS[useSim.getState().world].bounds;
  const [r, hh] = halfExtents(o);
  drag.phase = "pending";
  drag.id = o.id;
  drag.body = b;
  drag.downX = drag.clientX = e.nativeEvent.clientX;
  drag.downY = drag.clientY = e.nativeEvent.clientY;
  drag.floorY = min[1];
  drag.space = {
    planePoint: [e.point.x, e.point.y, e.point.z],
    planeNormal: [-forward.x, -forward.y, -forward.z],
    offset: [e.point.x - c.x, e.point.y - c.y, e.point.z - c.z],
    minY: min[1] + hh + 0.01,
    maxY: Math.max(min[1] + hh + 0.01, max[1] - hh - 0.05),
    minX: min[0] + r,
    maxX: max[0] - r,
    minZ: min[2] + r,
    maxZ: max[2] - r,
  };
  // Pointer down on an object must not start orbiting the camera.
  if (controlsRef.current) controlsRef.current.enabled = false;
}

function endGrab(throwIt: boolean) {
  const b = drag.body;
  const wasDragging = drag.phase === "dragging";
  drag.phase = "idle";
  drag.body = null;
  drag.target = null;
  if (controlsRef.current) controlsRef.current.enabled = true;
  document.body.style.cursor = "";
  if (!b || !wasDragging || !getBody(drag.id)) return;
  b.setBodyType(DYNAMIC, true);
  const v = throwIt ? releaseVelocity(drag.samples) : [0, 0, 0];
  b.setLinvel({ x: v[0], y: v[1], z: v[2] }, true);
  b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  b.wakeUp();
}

/** Window-level pointer handling plus the height guide. Mount once inside <Physics>. */
export function DragController() {
  const { camera, gl } = useThree();
  const guide = useRef<Group>(null);
  const line = useRef<Mesh>(null);

  useEffect(() => {
    const ray = new Raycaster();
    const ndc = new Vector2();

    const apply = () => {
      if (!drag.body || !drag.space) return;
      const r = gl.domElement.getBoundingClientRect();
      ndc.set(((drag.clientX - r.left) / r.width) * 2 - 1, -((drag.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const o = ray.ray.origin, d = ray.ray.direction;
      const t = dragTarget([o.x, o.y, o.z], [d.x, d.y, d.z], drag.space);
      if (!t) return;
      drag.target = t;
      drag.body.setNextKinematicTranslation({ x: t[0], y: t[1], z: t[2] });
      drag.samples.push({ t: performance.now(), p: t });
      if (drag.samples.length > 16) drag.samples.shift();
    };

    const move = (e: PointerEvent) => {
      if (drag.phase === "idle") return;
      drag.clientX = e.clientX;
      drag.clientY = e.clientY;
      if (drag.phase === "pending") {
        if (Math.hypot(e.clientX - drag.downX, e.clientY - drag.downY) < START_PX) return;
        if (!drag.body || !getBody(drag.id)) return endGrab(false);
        drag.phase = "dragging";
        drag.samples = [];
        drag.body.setBodyType(KINEMATIC, true);
        document.body.style.cursor = "grabbing";
      }
      apply();
    };

    const wheel = (e: WheelEvent) => {
      if (drag.phase !== "dragging" || !drag.space) return;
      e.preventDefault();
      // Push the drag plane along the camera's horizontal forward direction.
      const f = camera.getWorldDirection(new Vector3()).setY(0).normalize();
      const k = e.deltaY * WHEEL_M_PER_PX;
      const p = drag.space.planePoint;
      drag.space.planePoint = [p[0] + f.x * k, p[1], p[2] + f.z * k];
      apply();
    };

    const up = () => drag.phase !== "idle" && endGrab(true);
    const key = (e: KeyboardEvent) => e.key === "Escape" && drag.phase !== "idle" && endGrab(false);

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", key);
    gl.domElement.addEventListener("wheel", wheel, { passive: false });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
      gl.domElement.removeEventListener("wheel", wheel);
      if (drag.phase !== "idle") endGrab(false);
    };
  }, [camera, gl]);

  // Height guide: a line from the held object down to a ring on the floor.
  useFrame(() => {
    const g = guide.current, l = line.current;
    if (!g || !l) return;
    const t = drag.phase === "dragging" ? drag.target : null;
    g.visible = Boolean(t);
    if (!t) return;
    const h = Math.max(0.001, t[1] - drag.floorY);
    g.position.set(t[0], drag.floorY, t[2]);
    l.scale.y = h;
    l.position.y = h / 2;
  });

  return (
    <group ref={guide} visible={false}>
      <mesh ref={line} renderOrder={10}>
        <cylinderGeometry args={[0.012, 0.012, 1, 6]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.85} depthTest={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} renderOrder={10}>
        <ringGeometry args={[0.16, 0.22, 32]} />
        <meshBasicMaterial color="#ffc531" transparent opacity={0.95} depthTest={false} />
      </mesh>
    </group>
  );
}
