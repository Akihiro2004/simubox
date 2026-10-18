"use client";

import { Line, RoundedBox } from "@react-three/drei";
import { Html } from "@/components/world/html";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Object3D, type Group, type InstancedMesh } from "three";
import { useSim, projectileResult } from "@/lib/store";
import { fmt, positionAt, samplePath, velocityAt } from "@/lib/engine/projectile";
import { ASSETS } from "@/lib/world/catalog";
import { emit } from "@/lib/world/runtime";
import { AssetModel, Mat } from "./assets";

const DOTS = 72;
const ZERO_G_SECONDS = 3;

function Arrow({ arrowRef, color }: { arrowRef: React.RefObject<Group | null>; color: string }) {
  // Unit arrow along +y; scaled/rotated per frame by the parent.
  return (
    <group ref={arrowRef} visible={false}>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 1, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.05, 0]}>
        <coneGeometry args={[0.09, 0.2, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

export function ProjectileStage({ animate }: { animate: boolean }) {
  const p = useSim((s) => s.projectile);
  const timeScale = useSim((s) => s.timeScale);
  const paused = useSim((s) => s.paused);
  const r = useMemo(() => projectileResult(p), [p]);
  const ball = useRef<Group>(null);
  const dots = useRef<InstancedMesh>(null);
  const vx = useRef<Group>(null);
  const vy = useRef<Group>(null);
  const t = useRef(0);
  const phase = p?.status ?? "idle";
  // Which launch has passed its highest point (so the label resets per launch).
  const [apexFor, setApexFor] = useState(-1);
  const apex = apexFor === p?.launchNonce;

  const radius = p ? ASSETS[p.ball].size[0] / 2 : 0.12;
  const visualScale = r && Number.isFinite(r.range) ? Math.max(1, Math.min(8, r.range / 25)) : 1;
  const lift = radius * visualScale;
  const input = useMemo(() => (p ? { speed: p.speed, angleDeg: p.angleDeg, gravity: p.gravity, height: p.height } : null), [p]);
  const path = useMemo(() => (input && r ? samplePath(input, r, DOTS - 1, ZERO_G_SECONDS) : []), [input, r]);

  // New launch: reset clock, lay out the trail, frame the shot.
  useEffect(() => {
    if (!p || !r || p.launchNonce === 0) return;
    t.current = 0;
    const m = dots.current;
    if (m) {
      const o = new Object3D();
      path.forEach(([x, y], i) => {
        o.position.set(x, y + lift, 0);
        o.scale.setScalar(visualScale);
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
      m.count = 0;
    }
    // Fit the actual flight and guide through the viewport-aware camera fitter.
    // A distance based only on range clipped both ends, especially on phones.
    useSim.getState().focus({ points: [
      [-2.2, 0, 2.2], [-1.5, 2.4, 2.2],
      ...path.map(([x, y]) => [x, y + lift + .6 * visualScale, 0] as [number, number, number]),
    ] });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on launch
  }, [p?.launchNonce]);

  useFrame((_, dt) => {
    if (!p || !r || !input || !ball.current) return;
    const g = ball.current;
    if (phase !== "flying") {
      const [x, y] = phase !== "landed" ? [0, p.height] : r.lands ? positionAt(input, r, r.flightTime) : path[path.length - 1];
      g.position.set(x, y + lift, 0);
      if (vx.current) vx.current.visible = false;
      if (vy.current) vy.current.visible = false;
      return;
    }
    if (paused) return;
    t.current += Math.min(dt, 0.05) * timeScale;
    const T = Number.isFinite(r.flightTime) ? r.flightTime : ZERO_G_SECONDS;
    const tt = Math.min(t.current, T);
    const [x, y] = positionAt(input, r, tt);
    g.position.set(x, y + lift, 0);
    if (animate) g.rotation.z -= dt * 6;
    if (dots.current) dots.current.count = Math.min(DOTS, Math.ceil((tt / T) * (DOTS - 1)) + 1);

    // Velocity components: blue sideways (constant), red up/down (changes).
    const [vxv, vyv] = velocityAt(input, r, tt);
    const k = 0.18 * visualScale;
    if (vx.current) {
      vx.current.visible = Math.abs(vxv) > 0.05;
      vx.current.position.set(x, y + lift, 0);
      vx.current.rotation.set(0, 0, -Math.PI / 2);
      vx.current.scale.set(visualScale, Math.abs(vxv) * k, visualScale);
    }
    if (vy.current) {
      vy.current.visible = Math.abs(vyv) > 0.05;
      vy.current.position.set(x, y + lift, 0);
      vy.current.rotation.set(vyv >= 0 ? 0 : Math.PI, 0, 0);
      vy.current.scale.set(visualScale, Math.abs(vyv) * k, visualScale);
    }
    if (!apex && Number.isFinite(r.timeToApex) && tt >= r.timeToApex && r.vy > 0) setApexFor(p.launchNonce);
    if (t.current >= T && useSim.getState().projectile?.status === "flying") {
      useSim.getState().setProjectile({ status: "landed" });
      emit("projectile_landed");
    }
  });

  // Same root and keyed labels as below, so the labels survive the projectile going away.
  if (!p || !r || !input)
    return (
      <group>
        <Label key="apex" show={false} at={[0, 0, 0]} />
        <Label key="land" show={false} at={[0, 0, 0]} />
        <Label key="drift" show={false} at={[0, 0, 0]} />
      </group>
    );
  const h = p.height;
  const theta = (p.angleDeg * Math.PI) / 180;
  const landed = phase === "landed";
  const apexPos = positionAt(input, r, r.timeToApex);

  return (
    <group>
      {/* launcher: tower for raised launches, base and angled barrel */}
      <group position={[0, 0, 0]}>
        {h > 0 && (
          <RoundedBox args={[0.9, h, 0.9]} radius={0.06} position={[0, h / 2, 0]} castShadow receiveShadow>
            <Mat c="#cbd5e1" />
          </RoundedBox>
        )}
        <mesh position={[0, h + 0.08, 0]} castShadow>
          <cylinderGeometry args={[0.42, 0.48, 0.16, 28]} />
          <Mat c="#6d5dfc" r={0.4} />
        </mesh>
        <group position={[0, h + 0.18, 0]} rotation={[0, 0, theta - Math.PI / 2]}>
          <mesh position={[0, 0.32, 0]} castShadow>
            <cylinderGeometry args={[0.13, 0.16, 0.64, 20]} />
            <Mat c="#a5b4fc" r={0.35} />
          </mesh>
          <mesh position={[0, 0.64, 0]}>
            <torusGeometry args={[0.13, 0.03, 8, 20]} />
            <Mat c="#f8fafc" />
          </mesh>
        </group>
      </group>

      <group ref={ball} scale={visualScale}>
        <AssetModel asset={p.ball} />
      </group>
      <Arrow arrowRef={vx} color="#38bdf8" />
      <Arrow arrowRef={vy} color="#f43f5e" />

      <instancedMesh ref={dots} args={[undefined, undefined, DOTS]} frustumCulled={false}>
        <sphereGeometry args={[0.035, 8, 6]} />
        <meshBasicMaterial color="#fde68a" />
      </instancedMesh>

      {apex && r.vy > 0 && Number.isFinite(r.maxHeight) && (
        <Line points={[[apexPos[0], 0.02, 0], [apexPos[0], apexPos[1] + lift, 0]]} color="#c4b5fd" lineWidth={1.5} dashed dashSize={0.15} gapSize={0.1} />
      )}
      {landed && r.lands && (
        <>
          <mesh position={[r.range, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.28 * visualScale, 0.36 * visualScale, 40]} />
            <meshBasicMaterial color="#facc15" />
          </mesh>
          <Line points={[[0, 0.03, 0.9 * visualScale], [r.range, 0.03, 0.9 * visualScale]]} color="#facc15" lineWidth={2} />
        </>
      )}
      {/* Labels stay mounted and just hide: each drei Html owns a React root, and
          unmounting one while the scene re-renders throws "synchronously unmount a root". */}
      <Label key="apex" show={apex && r.vy > 0 && Number.isFinite(r.maxHeight)} at={[apexPos[0], apexPos[1] + lift + 0.45 * visualScale, 0]}>
        <div className="tag flex items-center gap-1.5 px-3 py-1">Highest point {fmt(r.maxHeight, "m")}</div>
      </Label>
      <Label key="land" show={landed && r.lands} at={[r.range / 2, 0.05, 0.9 * visualScale]}>
        <div className="tag flex items-center gap-1.5 px-3 py-1 tag-dot tag-fact">
          Lands at {fmt(r.range, "m")} after {fmt(r.flightTime, "s")}
        </div>
      </Label>
      <Label key="drift" show={landed && !r.lands} at={[path.at(-1)?.[0] ?? 0, (path.at(-1)?.[1] ?? 0) + 0.8, 0]}>
        <div className="tag flex items-center gap-1.5 px-3 py-1 tag-dot tag-warning">No gravity, so it never comes down</div>
      </Label>
    </group>
  );
}

function Label({ show, at, children }: { show: boolean; at: [number, number, number]; children?: React.ReactNode }) {
  const pos = at.map((v) => (Number.isFinite(v) ? v : 0)) as [number, number, number];
  return (
    <Html position={pos} center zIndexRange={[20, 0]} style={{ pointerEvents: "none", display: show ? undefined : "none" }}>
      {children}
    </Html>
  );
}
