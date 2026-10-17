"use client";

// drei's <Html>, trimmed to what the studio uses, with one fix: drei unmounts
// each label's React root synchronously in a layout-effect cleanup, so any label
// leaving during a 3D re-render logs "Attempted to synchronously unmount a root
// while React was already rendering". This one unmounts right after that render.

import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Vector3, type Camera, type Group, type Object3D, type PerspectiveCamera } from "three";

type Size = { width: number; height: number };
type CalculatePosition = (obj: Object3D, camera: Camera, size: Size) => number[];

const v1 = new Vector3();
const v2 = new Vector3();
const v3 = new Vector3();

const defaultPosition: CalculatePosition = (obj, camera, size) => {
  v1.setFromMatrixPosition(obj.matrixWorld).project(camera);
  return [(v1.x * 0.5 + 0.5) * size.width, (-v1.y * 0.5 + 0.5) * size.height];
};

export function Html({
  children,
  position,
  center,
  style,
  zIndexRange = [16777271, 0],
  portal,
  calculatePosition = defaultPosition,
}: {
  children?: ReactNode;
  position?: [number, number, number] | Vector3;
  center?: boolean;
  style?: CSSProperties;
  /** Nearer labels get the higher z-index within this range. */
  zIndexRange?: [number, number];
  portal?: RefObject<HTMLElement | null>;
  calculatePosition?: CalculatePosition;
}) {
  const { gl, camera, size, events } = useThree();
  const group = useRef<Group>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const root = useRef<Root | null>(null);
  const last = useRef([NaN, NaN]);
  const shown = useRef(true);
  const target = portal?.current ?? (events.connected as HTMLElement | undefined) ?? (gl.domElement.parentNode as HTMLElement | null);

  useLayoutEffect(() => {
    if (!target) return;
    const el = (box.current = document.createElement("div"));
    el.style.cssText = "position:absolute;top:0;left:0;";
    target.appendChild(el);
    const r = (root.current = createRoot(el));
    last.current = [NaN, NaN];
    shown.current = true;
    return () => {
      el.remove();
      box.current = root.current = null;
      setTimeout(() => r.unmount());
    };
  }, [target]);

  useLayoutEffect(() => {
    root.current?.render(<div style={{ position: "absolute", transform: center ? "translate3d(-50%,-50%,0)" : "none", ...style }}>{children}</div>);
  });

  useFrame(() => {
    const g = group.current;
    const el = box.current;
    if (!g || !el) return;
    camera.updateMatrixWorld();
    g.updateWorldMatrix(true, false);
    const [x, y] = calculatePosition(g, camera, size);
    if (Math.abs(x - last.current[0]) < 0.001 && Math.abs(y - last.current[1]) < 0.001) return;
    last.current = [x, y];
    const objectPos = v1.setFromMatrixPosition(g.matrixWorld);
    const cameraPos = v2.setFromMatrixPosition(camera.matrixWorld);
    const visible = v3.subVectors(objectPos, cameraPos).angleTo(camera.getWorldDirection(v3.clone())) <= Math.PI / 2;
    if (visible !== shown.current) el.style.display = (shown.current = visible) ? "block" : "none";
    const { near, far } = camera as PerspectiveCamera;
    const a = (zIndexRange[1] - zIndexRange[0]) / (far - near);
    el.style.zIndex = String(Math.round(a * objectPos.distanceTo(cameraPos) + zIndexRange[1] - a * far));
    el.style.transform = `translate3d(${x}px,${y}px,0)`;
  });

  return <group ref={group} position={position} />;
}
