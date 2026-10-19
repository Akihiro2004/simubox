"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { BallCollider, ConvexHullCollider, CuboidCollider, RigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef, useState } from "react";
import { MathUtils, type Group } from "three";
import { useShallow } from "zustand/react/shallow";
import { useSim } from "@/lib/store";
import { ASSETS, WORLDS, type Vec3 } from "@/lib/world/catalog";
import { fishPose, isFish } from "@/lib/world/nature";
import { bodies, liveBodies, livePosition, nodes, takeFresh } from "@/lib/world/runtime";
import { Appear } from "./appear";
import type { SceneObject } from "@/lib/world/scene";
import { AssetModel, PrimitiveModel, rampHull } from "./assets";
import { AtomModel, MoleculeModel } from "./chem";
import { ShapeModel } from "./shapes";
import { useMotion } from "@/lib/useMotion";
import { beginGrab, DragController } from "./drag";
import { isFurniture } from "@/lib/world/furnishings";
import { FurnitureColliders } from "./furniture";
import { isLearningAsset } from "@/lib/world/learning-assets";
import { LearningColliders } from "./learning-assets";
import { beginMapGrab, MapDragController, playMovable } from "../builder/map-drag";
import { useBuilder } from "@/lib/builder/store";
import { isPlanetary } from "@/lib/environment";

const DEG = Math.PI / 180;

export function objectRadius(o: SceneObject): number {
  if (o.type === "asset") return (Math.max(...ASSETS[o.asset].size) / 2) * o.scale;
  if (o.type === "primitive") return (Math.max(...o.size) / 2) * o.scale;
  return 1.3;
}

function Colliders({ o }: { o: SceneObject }) {
  const s = o.scale;
  const common = { mass: o.massKg, restitution: o.bounciness, friction: 0.6 };
  if (o.type === "asset") {
    if (isLearningAsset(o.asset)) return <LearningColliders asset={o.asset} scale={s} mass={o.massKg} restitution={o.bounciness} />;
    if (isFurniture(o.asset)) return <FurnitureColliders asset={o.asset} scale={s} mass={o.massKg} restitution={o.bounciness} />;
    const def = ASSETS[o.asset];
    if (o.asset === "ramp") return <ConvexHullCollider args={[rampHull(s)]} {...common} />;
    if (def.collider === "ball") return <BallCollider args={[(def.size[0] / 2) * s]} {...common} />;
    return <CuboidCollider args={[(def.size[0] / 2) * s, (def.size[1] / 2) * s, (def.size[2] / 2) * s]} {...common} />;
  }
  if (o.type === "shape") {
    if (o.shape === "sphere") return <BallCollider args={[(Math.max(...o.size) / 2) * s]} {...common} />;
    return <CuboidCollider args={[(o.size[0] / 2) * s, (o.size[1] / 2) * s, (o.size[2] / 2) * s]} {...common} />;
  }
  if (o.type === "primitive") {
    if (o.shape === "sphere") return <BallCollider args={[(Math.max(...o.size) / 2) * s]} {...common} />;
    return <CuboidCollider args={[(o.size[0] / 2) * s, (o.size[1] / 2) * s, (o.size[2] / 2) * s]} {...common} />;
  }
  return null;
}

function Model({ o, animate }: { o: SceneObject; animate: boolean }) {
  switch (o.type) {
    case "asset":
      return <AssetModel asset={o.asset} color={o.color} />;
    case "primitive":
      return <PrimitiveModel shape={o.shape} size={o.size} color={o.color ?? "#a5b4fc"} opacity={o.opacity} glow={o.glow} />;
    case "molecule":
      return <MoleculeModel id={o.id} molecule={o.molecule} />;
    case "atom":
      return <AtomModel element={o.element} />;
    case "shape":
      return <ShapeModel o={o} animate={animate} />;
  }
}

function onOver(e: ThreeEvent<PointerEvent>, dynamic: boolean) {
  e.stopPropagation();
  document.body.style.cursor = dynamic ? "grab" : "pointer";
}
const onOut = () => (document.body.style.cursor = "");

function PhysObject({ o }: { o: SceneObject }) {
  const group = useRef<Group>(null);
  const swimTime = useRef(0);
  const swimPhase = useMemo(() => Array.from(o.id).reduce((n, c) => n + c.charCodeAt(0), 0) * .37, [o.id]);
  const animate = useMotion();
  const rot = useMemo(() => o.rotation.map((d) => d * DEG) as Vec3, [o.rotation]);
  // Lesson spawns grow in; world furniture and remounts just appear.
  const [pop] = useState(() => takeFresh(o.id) && animate);

  useEffect(() => {
    if (group.current) nodes.set(o.id, group.current);
    return () => {
      nodes.delete(o.id);
    };
  }, [o.id, o.version, o.physics]);

  // Non-physics objects glide to their commanded transform.
  useFrame((_, dt) => {
    const g = group.current;
    if (!g || o.physics !== "none") return;
    if (o.type === "asset" && isFish(o.asset) && animate) {
      const s = useSim.getState();
      if (!s.paused) swimTime.current += Math.min(dt, .05);
      const pose = fishPose(o.position, swimTime.current, swimPhase, o.scale, WORLDS[s.world].bounds, s.world === "ocean");
      g.position.set(...pose.position);
      const turn = MathUtils.euclideanModulo(pose.yaw + rot[1] - g.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
      g.rotation.set(rot[0], MathUtils.damp(g.rotation.y, g.rotation.y + turn, 4, dt), rot[2]);
      return;
    }
    g.position.x = MathUtils.damp(g.position.x, o.position[0], 6, dt);
    g.position.y = MathUtils.damp(g.position.y, o.position[1], 6, dt);
    g.position.z = MathUtils.damp(g.position.z, o.position[2], 6, dt);
    g.rotation.set(MathUtils.damp(g.rotation.x, rot[0], 6, dt), MathUtils.damp(g.rotation.y, rot[1], 6, dt), MathUtils.damp(g.rotation.z, rot[2], 6, dt));
  });

  const select = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    useSim.getState().set({ selectedId: o.id });
    if (!beginMapGrab(e, o)) beginGrab(e, o);
  };

  if (!o.visible) return null;
  const model = (
    <group scale={o.scale} onPointerDown={select} onPointerOver={(e) => onOver(e, o.physics === "dynamic" || playMovable(o) || useBuilder.getState().editing)} onPointerOut={onOut}>
      <Appear on={pop}>
        <Model o={o} animate={animate} />
      </Appear>
    </group>
  );

  if (o.physics === "none") {
    return (
      <group ref={group} position={o.position} rotation={rot}>
        {model}
      </group>
    );
  }
  return (
    <RigidBody
      key={o.version}
      ref={(b) => {
        // React detaches the old body before attaching a remounted one.
        if (b) bodies.set(o.id, b);
        else bodies.delete(o.id);
      }}
      type={o.physics === "dynamic" ? "dynamic" : "fixed"}
      position={o.position}
      rotation={rot}
      colliders={false}
      linearDamping={o.drag}
      angularDamping={0.4 + o.drag * 0.2}
      ccd={o.physics === "dynamic"}
      canSleep
    >
      <group ref={group}>{model}</group>
      <Colliders o={o} />
    </RigidBody>
  );
}

/** Puts objects that fell out of the world back where they started. */
function Watchdog() {
  const acc = useRef(0);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 0.5) return;
    acc.current = 0;
    const objs = useSim.getState().objects;
    for (const [id, b] of liveBodies()) {
      if (!b.isDynamic()) continue;
      const t = b.translation();
      if (t.y < -8 || Math.abs(t.x) > 150 || Math.abs(t.z) > 150) {
        const o = objs[id];
        if (!o) continue;
        b.setTranslation({ x: o.position[0], y: o.position[1] + 0.3, z: o.position[2] }, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
  });
  return null;
}

function Ring({ id, color, animate }: { id: string; color: string; animate: boolean }) {
  const g = useRef<Group>(null);
  const radius = useSim((s) => (s.objects[id] ? objectRadius(s.objects[id]) : 0.45));
  useFrame(({ clock }) => {
    const p = livePosition(id);
    if (!g.current || !p) return;
    g.current.position.set(p[0], p[1], p[2]);
    const k = animate ? 1 + Math.sin(clock.elapsedTime * 4) * 0.06 : 1;
    g.current.scale.setScalar(k);
    g.current.rotation.y = animate ? clock.elapsedTime * 0.8 : 0;
  });
  const r = Math.max(0.18, radius + 0.08);
  return (
    <group ref={g}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r, r + 0.035, 48, 1, 0, Math.PI * 1.7]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} depthTest={false} />
      </mesh>
    </group>
  );
}

export function SceneObjects({ animate }: { animate: boolean }) {
  const ids = useSim(useShallow((s) => Object.keys(s.objects)));
  const selectedId = useSim((s) => s.selectedId);
  const highlighted = useSim((s) => s.highlighted);
  return (
    <>
      {ids.map((id) => (
        <ObjectById key={id} id={id} />
      ))}
      <DragController />
      <MapDragController />
      <Watchdog />
      {selectedId && <Ring key={`sel-${selectedId}`} id={selectedId} color="#ffffff" animate={animate} />}
      {highlighted
        .filter((h) => h !== selectedId)
        .map((h) => (
          <Ring key={`hl-${h}`} id={h} color="#facc15" animate={animate} />
        ))}
    </>
  );
}

function ObjectById({ id }: { id: string }) {
  const o = useSim((s) => s.objects[id]);
  const hideCampus = useSim(s => s.world === "court" && isPlanetary(s.environment?.preset));
  if (!o) return null;
  // Keep authored objects in the scene/save, but unmount Earth-only template furniture.
  if (hideCampus && o.type === "asset" && ["bench", "covered_stand", "tree", "flowering_bush"].includes(o.asset)) return null;
  return <PhysObject o={o} />;
}
