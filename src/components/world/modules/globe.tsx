"use client";

import { Html, Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Vector3, type Group } from "three";
import { useSim } from "@/lib/store";
import { PLACES, distanceKm, latLonToVec3 } from "@/lib/engine/geo";
import type { Mark, Modules } from "@/lib/modules";
import { getEarthTexture } from "./earth";
import { Mat } from "../assets";

const R = 2;
const CENTER: [number, number, number] = [0, 2.75, 0];
const TILT = (23.44 * Math.PI) / 180;
const MAP_W = 7.2, MAP_H = 3.6;

function resolve(id: string, marks: Mark[]): { lat: number; lon: number; label: string } | null {
  const m = marks.find((k) => k.id === id);
  if (m) return m;
  const p = PLACES.find((q) => q.id === id);
  return p ? { lat: p.lat, lon: p.lon, label: p.name } : null;
}

/** Great-circle arc between two places, lifted a little off the surface. */
function arc(a: { lat: number; lon: number }, b: { lat: number; lon: number }, r: number): Vector3[] {
  const va = new Vector3(...latLonToVec3(a.lat, a.lon, 1));
  const vb = new Vector3(...latLonToVec3(b.lat, b.lon, 1));
  const angle = va.angleTo(vb);
  const pts: Vector3[] = [];
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    // Spherical interpolation, then a gentle bump so the line clears the globe.
    const s = Math.sin(angle) || 1;
    const p = va.clone().multiplyScalar(Math.sin((1 - t) * angle) / s).add(vb.clone().multiplyScalar(Math.sin(t * angle) / s));
    pts.push(p.normalize().multiplyScalar(r * (1.01 + 0.12 * Math.sin(Math.PI * t) * Math.min(1, angle))));
  }
  return pts;
}

function Pin({ at, label, color, onMap }: { at: [number, number, number]; label: string; color: string; onMap?: boolean }) {
  const n = new Vector3(...at).normalize();
  const head: [number, number, number] = onMap ? [at[0], at[1], at[2] + 0.12] : (n.clone().multiplyScalar(R + 0.14).toArray() as [number, number, number]);
  return (
    <group>
      <Line points={[new Vector3(...at), new Vector3(...head)]} color="#1c1e22" lineWidth={1.5} />
      <mesh position={head}>
        <sphereGeometry args={[0.055, 16, 12]} />
        <meshStandardMaterial color={color} roughness={0.3} />
      </mesh>
      <Html position={head} center zIndexRange={[20, 5]} style={{ pointerEvents: "none" }}>
        <div className="tag tag-dot ml-14 flex items-center gap-1.5 px-3 py-1" style={{ ["--dot" as string]: color }}>
          {label}
        </div>
      </Html>
    </group>
  );
}

function Globe({ g, animate }: { g: NonNullable<Modules["globe"]>; animate: boolean }) {
  const spinner = useRef<Group>(null);
  const tex = getEarthTexture();
  const focus = g.focus ? resolve(g.focus, g.marks) : null;
  useFrame((_, dt) => {
    const s = spinner.current;
    if (!s) return;
    if (g.spin && animate) s.rotation.y += dt * 0.12;
    else if (focus) {
      // Turn the focused place toward the default camera (azimuth 45°).
      const want = -Math.PI / 4 - (focus.lon * Math.PI) / 180;
      let d = want - s.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      s.rotation.y += d * Math.min(1, dt * (animate ? 3 : 60));
    }
  });
  const routes = useMemo(
    () =>
      g.routes
        .map((r) => {
          const a = resolve(r.from, g.marks), b = resolve(r.to, g.marks);
          if (!a || !b) return null;
          const pts = arc(a, b, R);
          return { id: r.id, pts, mid: pts[32], km: distanceKm(a, b), label: `${a.label} to ${b.label}` };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null),
    [g.routes, g.marks],
  );
  return (
    <group position={CENTER}>
      {/* Stand: base, column and a meridian half-ring, tilted like a classroom globe. */}
      <mesh position={[0, -2.6, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.9, 1.05, 0.2, 40]} />
        <Mat c="#8a6040" />
      </mesh>
      <mesh position={[0, -2.35, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.12, 0.5, 16]} />
        <Mat c="#b59a64" m={0.5} r={0.35} />
      </mesh>
      <group rotation={[0, 0, TILT]}>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[R + 0.12, 0.03, 10, 80, Math.PI]} />
          <Mat c="#b59a64" m={0.6} r={0.3} />
        </mesh>
        <group ref={spinner}>
          <mesh castShadow>
            <sphereGeometry args={[R, 72, 48]} />
            <meshStandardMaterial map={tex} roughness={0.75} />
          </mesh>
          {g.marks.map((m) => (
            <Pin key={m.id} at={latLonToVec3(m.lat, m.lon, R)} label={m.label} color={m.color} />
          ))}
          {routes.map((r) => (
            <group key={r.id}>
              <Line points={r.pts} color="#e5484d" lineWidth={2.5} />
              <Html position={r.mid} center zIndexRange={[20, 5]} style={{ pointerEvents: "none" }}>
                <div className="tag tag-dot tag-warning flex items-center gap-1.5 px-3 py-1">{Math.round(r.km).toLocaleString("en-US")} km</div>
              </Html>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}

function FlatMap({ g }: { g: NonNullable<Modules["globe"]> }) {
  const tex = getEarthTexture();
  const toXY = (lat: number, lon: number): [number, number, number] => [(lon / 180) * (MAP_W / 2), (lat / 90) * (MAP_H / 2), 0.03];
  return (
    // Stands on the floor and faces the default camera.
    <group position={[0, 0.35 + MAP_H / 2, 0]} rotation={[0, Math.PI / 4, 0]}>
      <mesh position={[0, 0, -0.06]} castShadow receiveShadow>
        <boxGeometry args={[MAP_W + 0.2, MAP_H + 0.2, 0.08]} />
        <Mat c="#8a6040" />
      </mesh>
      <mesh>
        <planeGeometry args={[MAP_W, MAP_H]} />
        <meshStandardMaterial map={tex} roughness={0.8} />
      </mesh>
      {[-0.35, 0.35].map((x) => (
        <mesh key={x} position={[x * MAP_W, -MAP_H / 2 - 0.2, -0.25]} rotation={[0.35, 0, 0]} castShadow>
          <boxGeometry args={[0.08, 0.9, 0.08]} />
          <Mat c="#5f6670" />
        </mesh>
      ))}
      {g.marks.map((m) => (
        <Pin key={m.id} at={toXY(m.lat, m.lon)} label={m.label} color={m.color} onMap />
      ))}
      {g.routes.map((r) => {
        const a = resolve(r.from, g.marks), b = resolve(r.to, g.marks);
        if (!a || !b) return null;
        const pa = toXY(a.lat, a.lon), pb = toXY(b.lat, b.lon);
        return (
          <group key={r.id}>
            <Line points={[pa, pb]} color="#e5484d" lineWidth={2.5} />
            <Html position={[(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2 + 0.15, 0.05]} center zIndexRange={[20, 5]} style={{ pointerEvents: "none" }}>
              <div className="tag tag-dot tag-warning flex items-center gap-1.5 px-3 py-1">{Math.round(distanceKm(a, b)).toLocaleString("en-US")} km</div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

export function GlobeModule({ animate }: { animate: boolean }) {
  const g = useSim((s) => s.modules.globe);
  if (!g) return null;
  return g.view === "map" ? <FlatMap g={g} /> : <Globe g={g} animate={animate} />;
}

