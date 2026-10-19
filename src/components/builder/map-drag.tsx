"use client";

import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect } from "react";
import { Plane, Raycaster, Vector2, Vector3 } from "three";
import { useBuilder } from "@/lib/builder/store";
import { editObject, finishMapDrag, rememberEdit, undoEdit } from "@/lib/builder/actions";
import { useSim } from "@/lib/store";
import { livePosition } from "@/lib/world/runtime";
import type { SceneObject } from "@/lib/world/scene";
import { controlsRef } from "../world/camera";

const grab = { id: "", x: 0, y: 0, moved: false, last: 0, play: false, plane: new Plane(), offset: new Vector3() };

/** Items the student placed from Build & Discover can be slid around in play mode too (physics items are thrown instead). */
export const playMovable = (o: SceneObject) => !!o.learnerPlaced && o.physics !== "dynamic";

export function beginMapGrab(e: ThreeEvent<PointerEvent>, o: SceneObject): boolean {
  const play = !useBuilder.getState().editing;
  if (play && !playMovable(o)) return false;
  grab.play = play;
  const at = new Vector3(...(livePosition(o.id) ?? o.position));
  grab.plane.setFromNormalAndCoplanarPoint(new Vector3(0, 1, 0), at);
  const hit = e.ray.intersectPlane(grab.plane, new Vector3());
  if (!hit) return true;
  grab.id = o.id;
  grab.x = e.nativeEvent.clientX;
  grab.y = e.nativeEvent.clientY;
  grab.moved = false;
  grab.last = 0;
  grab.offset.copy(hit).sub(at);
  if (controlsRef.current) controlsRef.current.enabled = false;
  return true;
}

/** Editing drags move pinned furniture too, without giving it a throwing impulse. */
export function MapDragController() {
  const { camera, gl } = useThree();
  useEffect(() => {
    const ray = new Raycaster(), ndc = new Vector2(), hit = new Vector3();
    const end = (cancel = false) => {
      if (!grab.id) return;
      const moved = grab.moved;
      grab.id = "";
      grab.moved = false;
      if (controlsRef.current) controlsRef.current.enabled = true;
      if (moved) { if (cancel) undoEdit(); else finishMapDrag(); }
    };
    const move = (e: PointerEvent) => {
      if (!grab.id) return;
      if (!(useBuilder.getState().editing || grab.play) || !useSim.getState().objects[grab.id]) return end();
      if (!grab.moved && Math.hypot(e.clientX - grab.x, e.clientY - grab.y) < 4) return;
      if (performance.now() - grab.last < 32) return;
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(grab.plane, hit)) return;
      hit.sub(grab.offset);
      if (!grab.moved) { rememberEdit(); grab.moved = true; }
      editObject(grab.id, { position: [Math.round(hit.x * 10) / 10, hit.y, Math.round(hit.z * 10) / 10] }, false);
      grab.last = performance.now();
    };
    const up = () => end();
    const cancel = () => end(true);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") end(true); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", up);
      end();
    };
  }, [camera, gl]);
  return null;
}
