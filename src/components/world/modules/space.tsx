"use client";

import { Html, Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Vector3, type Group, type Mesh } from "three";
import { useSim } from "@/lib/store";
import { orbitClock, type Modules } from "@/lib/modules";
import { PLANETS, displayDistance, displayRadius, moonIllumination, moonPhaseName, orbitAngle, seasonNorth, subsolarLatitude, MOON, type PlanetId } from "@/lib/engine/astro";
import { getEarthTexture, useSunLitMaterial } from "./earth";

const Y = 1.4; // orbit plane height above the deck
const SUN: [number, number, number] = [0, Y, 0];

function circle(r: number, y: number, n = 128): Vector3[] {
  return Array.from({ length: n + 1 }, (_, i) => new Vector3(Math.cos((i / n) * Math.PI * 2) * r, y, Math.sin((i / n) * Math.PI * 2) * r));
}

function Sun({ at = SUN, r = 0.8 }: { at?: [number, number, number]; r?: number }) {
  return (
    <group position={at}>
      <mesh>
        <sphereGeometry args={[r, 40, 28]} />
        <meshBasicMaterial color="#ffd36b" />
      </mesh>
      <mesh>
        <sphereGeometry args={[r * 1.35, 32, 20]} />
        <meshBasicMaterial color="#ffb547" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[r * 1.8, 32, 20]} />
        <meshBasicMaterial color="#ffb547" transparent opacity={0.08} depthWrite={false} />
      </mesh>
    </group>
  );
}

function PlanetBody({ id, radius, sun, tiltDeg, children }: { id: PlanetId; radius: number; sun: [number, number, number]; tiltDeg: number; children?: React.ReactNode }) {
  const p = PLANETS[id];
  const material = useSunLitMaterial(p.color, sun, id === "earth" ? getEarthTexture() : null);
  return (
    <group rotation={[0, 0, (tiltDeg * Math.PI) / 180]}>
      <mesh material={material}>
        <sphereGeometry args={[radius, 36, 24]} />
      </mesh>
      {p.rings && (
        <mesh rotation={[-Math.PI / 2 + 0.05, 0, 0]}>
          <ringGeometry args={id === "saturn" ? [radius * 1.35, radius * 2.1, 64] : [radius * 1.6, radius * 1.75, 64]} />
          <meshBasicMaterial color="#e8dcb8" transparent opacity={id === "saturn" ? 0.55 : 0.18} side={2} depthWrite={false} />
        </mesh>
      )}
      {children}
    </group>
  );
}

function SolarSystem({ o, paused }: { o: NonNullable<Modules["orbits"]>; paused: boolean }) {
  const groups = useRef<Record<string, Group | null>>({});
  const select = useSim((s) => s.set);
  useFrame((_, dt) => {
    if (!paused) orbitClock.day += Math.min(dt, 0.05) * o.daysPerSecond;
    for (const id of o.planets) {
      const g = groups.current[id];
      if (!g) continue;
      const p = PLANETS[id];
      // Spread the start positions so planets don't all line up.
      const a = orbitAngle(p.periodDays, orbitClock.day) + Object.keys(PLANETS).indexOf(id) * 1.7;
      const r = displayDistance(p.distanceAU);
      g.position.set(Math.cos(a) * r, Y, -Math.sin(a) * r);
    }
  });
  return (
    <>
      <Sun />
      {o.planets.map((id) => {
        const p = PLANETS[id];
        const r = displayDistance(p.distanceAU);
        const focused = o.focus === id;
        return (
          <group key={id}>
            <Line points={circle(r, Y)} color={focused ? "#ffc531" : "#9fb3d9"} lineWidth={focused ? 2 : 1} transparent opacity={focused ? 1 : 0.45} />
            <group ref={(g) => void (groups.current[id] = g)} onClick={(e) => (e.stopPropagation(), select({ selectedId: null }))}>
              <PlanetBody id={id} radius={displayRadius(p.radiusKm)} sun={SUN} tiltDeg={p.tiltDeg} />
              {o.labels && (
                <Html position={[0, displayRadius(p.radiusKm) + 0.35, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
                  <div className={`tag flex items-center gap-1.5 px-3 py-1 ${focused ? "tag-dot tag-fact" : ""}`}>{p.name}</div>
                </Html>
              )}
            </group>
          </group>
        );
      })}
      <Html position={[0, 0.05, displayDistance(32) + 0.6]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
        <div className="ground-label whitespace-nowrap">Distances and sizes are squeezed to fit. Orbit times are real.</div>
      </Html>
    </>
  );
}

const EM_SUN: [number, number, number] = [-40, Y, 0];

function EarthMoon({ o, paused }: { o: NonNullable<Modules["orbits"]>; paused: boolean }) {
  const moon = useRef<Group>(null);
  const earth = useRef<Mesh>(null);
  const label = useRef<HTMLDivElement>(null);
  const moonMat = useSunLitMaterial("#d6d6d6", EM_SUN, null, 0.05);
  const earthMat = useSunLitMaterial("#4b8bd6", EM_SUN, getEarthTexture(), 0.18);
  useFrame((_, dt) => {
    if (!paused) orbitClock.day += Math.min(dt, 0.05) * o.daysPerSecond;
    // New moon (day 0) = Moon between Earth and Sun (toward -x).
    const a = Math.PI + (2 * Math.PI * (orbitClock.day % MOON.synodicDays)) / MOON.synodicDays;
    moon.current?.position.set(Math.cos(a) * 3.4, Y, -Math.sin(a) * 3.4);
    if (earth.current) earth.current.rotation.y += Math.min(dt, 0.05) * o.daysPerSecond * Math.PI * 2;
    if (label.current) {
      const d = orbitClock.day % MOON.synodicDays;
      label.current.textContent = `${moonPhaseName(d)}: ${Math.round(moonIllumination(d) * 100)}% lit`;
    }
  });
  return (
    <>
      <Line points={circle(3.4, Y)} color="#9fb3d9" lineWidth={1} transparent opacity={0.45} />
      <mesh ref={earth} position={[0, Y, 0]} material={earthMat}>
        <sphereGeometry args={[1, 48, 32]} />
      </mesh>
      <group ref={moon}>
        <mesh material={moonMat}>
          <sphereGeometry args={[0.32, 32, 24]} />
        </mesh>
        <Html position={[0, 0.65, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
          <div ref={label} className="tag flex items-center gap-1.5 px-3 py-1 tag-dot tag-fact">Moon</div>
        </Html>
      </group>
      {/* Sunlight comes from the left. */}
      <Line points={[new Vector3(-9, Y, 0), new Vector3(-5.5, Y, 0)]} color="#ffc531" lineWidth={2} />
      <Html position={[-7.3, Y + 0.45, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <div className="tag px-3 py-1">Sunlight</div>
      </Html>
      <Sun at={[-11, Y, 0]} r={1} />
    </>
  );
}

const TILT = (23.44 * Math.PI) / 180;

function Seasons({ o, paused }: { o: NonNullable<Modules["orbits"]>; paused: boolean }) {
  const earth = useRef<Group>(null);
  const spin = useRef<Mesh>(null);
  const label = useRef<HTMLDivElement>(null);
  const mat = useSunLitMaterial("#4b8bd6", SUN, getEarthTexture(), 0.16);
  const R = 5;
  useFrame((_, dt) => {
    if (!paused) orbitClock.day += Math.min(dt, 0.05) * o.daysPerSecond;
    // θ = 0 at the March equinox; June solstice puts Earth at -z, north pole tilted toward the Sun.
    const th = (2 * Math.PI * (orbitClock.day - 80)) / 365.25;
    earth.current?.position.set(Math.cos(th) * R, Y, -Math.sin(th) * R);
    if (spin.current) spin.current.rotation.y += Math.min(dt, 0.05) * 3;
    if (label.current) {
      const d = Math.floor(orbitClock.day % 365);
      label.current.textContent = `Day ${d + 1}: ${seasonNorth(d)} in the north, Sun overhead at ${subsolarLatitude(d).toFixed(1)}°`;
    }
  });
  const axis = useMemo(() => [new Vector3(0, -1.6, 0), new Vector3(0, 1.6, 0)], []);
  return (
    <>
      <Sun />
      <Line points={circle(R, Y)} color="#9fb3d9" lineWidth={1} transparent opacity={0.45} />
      <group ref={earth}>
        {/* The axis keeps pointing the same way in space all year. */}
        <group rotation={[TILT, 0, 0]}>
          <mesh ref={spin} material={mat}>
            <sphereGeometry args={[0.9, 48, 32]} />
          </mesh>
          <Line points={axis} color="#1c1e22" lineWidth={2} />
        </group>
        <Html position={[0, 1.9, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
          <div ref={label} className="tag flex max-w-[260px] items-center gap-1.5 px-3 py-1 !whitespace-normal tag-dot tag-fact">Earth</div>
        </Html>
      </group>
    </>
  );
}

export function SpaceModule() {
  const o = useSim((s) => s.modules.orbits);
  const paused = useSim((s) => s.paused);
  if (!o) return null;
  if (o.mode === "earth_moon") return <EarthMoon key="em" o={o} paused={paused} />;
  if (o.mode === "seasons") return <Seasons key="se" o={o} paused={paused} />;
  return <SolarSystem key="ss" o={o} paused={paused} />;
}
