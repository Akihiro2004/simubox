"use client";

// The landing page's live 3D diorama: the studio's own Simu on a warm wooden
// table. Scrolling flies the camera between chapters (native progress via
// `view.p`), and each chapter's demo morphs in as the last one shrinks away.

import { ContactShadows, Line, PerformanceMonitor, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Color, MathUtils, Mesh, NeutralToneMapping, PCFShadowMap, Quaternion, Vector3, type Group, type Object3D } from "three";
import { ELEMENT_COLORS, ELEMENT_RADII, MOLECULES, type MoleculeId } from "@/lib/engine/chemistry";
import type { Character } from "@/lib/world/scene";
import { landingView as view } from "./landing-view";
import { Mat } from "./world/assets";
import { Robot, type Parts } from "./world/characters";
import { LandingWorkshop } from "./LandingWorkshop";

export type StageMode = "projectile" | "gravity" | "molecule";
export interface StageProps {
  mode: StageMode;
  angleDeg: number;
  speed: number;
  g: number;
  molId: MoleculeId;
  motion: boolean;
}

const damp = MathUtils.damp;
const M = 0.3; // scene units per metre for the throw
const START = new Vector3(-2.5, 0.17, 0.4);
/** Where Simu stands to present each demo. */
const SPOT: Record<StageMode, [number, number]> = { projectile: [-3.15, -0.35], gravity: [-2.3, -0.7], molecule: [-1.5, -0.7] };
const v = new Vector3();
const w = new Vector3();
const SIMU: Character = { id: "simu", kind: "robot", name: "Simu", color: "#4fd1e8", position: [0, 0, 0], animation: "idle", animNonce: 0 };

/** Camera per chapter: azimuth°, elevation°, distance, look-at [x, y]. */
const SHOTS = [
  [-20, 32, 17, 0, 0.95], // hero: the whole miniature workshop
  [-8, 24, 14.5, -2.4, 1.0], // throw: room for the full arc and the card
  [28, 18, 13, -1.3, 1.3], // gravity
  [-28, 14, 11, -1.1, 1.3], // molecules: close-up
  [190, 38, 21, 0, 3.6], // worlds: swing round the back, table sinks under the ring
] as const;

export default function LandingStage(props: StageProps) {
  const [economy, setEconomy] = useState(() => {
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    return window.innerWidth < 768 || navigator.hardwareConcurrency <= 4 || (memory !== undefined && memory <= 4);
  });
  return (
    <StageBoundary>
    <Canvas
      shadows={economy ? false : { type: PCFShadowMap }}
      frameloop="demand"
      dpr={economy ? 1 : 1.5}
      gl={{ antialias: true, alpha: true, powerPreference: "default" }}
      camera={{ position: [0, 6, 12], fov: 30, near: 0.1, far: 200 }}
      onCreated={({ gl }) => (gl.toneMapping = NeutralToneMapping)}
      fallback={<StageFallback />}
      aria-hidden
    >
      <RenderLoop {...props} economy={economy} />
      {!economy && props.motion && <PerformanceMonitor bounds={() => [42, 58]} onDecline={() => setEconomy(true)} />}
      <hemisphereLight args={["#f6f8ff", "#b9a78b", 0.9]} />
      <ambientLight intensity={0.2} />
      <directionalLight position={[6, 12, 7]} intensity={2.6} color="#fff0d8" castShadow={!economy} shadow-intensity={0.45} shadow-mapSize={[1024, 1024]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-bias={-0.0004} shadow-normalBias={0.03} />
      <directionalLight position={[-8, 5, -3]} intensity={0.55} color="#d5e5ed" />
      <Scene {...props} />
    </Canvas>
    </StageBoundary>
  );
}

class StageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <StageFallback /> : this.props.children; }
}

/** Pause hidden tabs; reduced motion only renders briefly after input or scroll. */
function RenderLoop({ motion, economy, mode, angleDeg, speed, g, molId }: StageProps & { economy: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let frame = 0, last = 0, until = 0;
    const tick = (now: number) => {
      if (document.hidden) return;
      if (now - last >= 1000 / (economy ? 30 : 60) - 1) {
        invalidate();
        last = now;
      }
      if (motion || now < until) frame = requestAnimationFrame(tick);
    };
    const wake = () => {
      cancelAnimationFrame(frame);
      until = performance.now() + 240;
      if (!document.hidden) frame = requestAnimationFrame(tick);
    };
    wake();
    window.addEventListener("scroll", wake, true);
    window.addEventListener("resize", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", wake, true);
      window.removeEventListener("resize", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [invalidate, motion, economy, mode, angleDeg, speed, g, molId]);
  return null;
}

function StageFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pt-[18vh]">
      <svg viewBox="0 0 800 420" className="w-full max-w-[1000px]" aria-hidden>
        <path d="M55 215 580 125 755 260 220 370Z" fill="#ba9473" />
        <path d="M55 200 580 110 755 245 220 355Z" fill="#efe2cc" />
        <path d="M140 210 550 140 675 240 250 315Z" fill="#dceae3" />
        <path d="M280 250Q370 65 510 250" fill="none" stroke="#d4a351" strokeWidth="4" strokeDasharray="10 8" />
        <circle cx="420" cy="160" r="17" fill="#e58b6e" />
        <ellipse cx="510" cy="250" rx="25" ry="10" fill="none" stroke="#397e79" strokeWidth="4" />
        <image href="/branding/simubox-mark.webp" x="110" y="125" width="110" height="110" />
      </svg>
    </div>
  );
}

function Scene({ mode, angleDeg, speed, g, molId, motion }: StageProps) {
  const compact = useThree((s) => s.size.width < 640);
  const look = useRef(new Vector3(0, 2.3, 0));
  const groups = useRef<Record<StageMode, Group | null>>({ projectile: null, gravity: null, molecule: null });
  const simu = useRef<Group>(null);
  const parts = useRef<Parts>({ root: null, body: null, head: null, armL: null, armR: null, legL: null, legR: null, eyes: null });
  const throwAnchor = useRef<Object3D>(null);
  const gravityAnchor = useRef<Object3D>(null);
  const moleculeAnchor = useRef<Object3D>(null);
  const want = useMemo(() => new Vector3(), []);
  const lookWant = useMemo(() => new Vector3(), []);

  useFrame(({ camera, size, clock }, dt) => {
    // Blend the two nearest shots by scroll position.
    const f = MathUtils.clamp(view.p, 0, 1) * (SHOTS.length - 1);
    const i = Math.min(Math.floor(f), SHOTS.length - 2);
    const k = MathUtils.smootherstep(f - i, 0, 1);
    const [a, b] = [SHOTS[i], SHOTS[i + 1]];
    const mix = (n: number) => a[n] + (b[n] - a[n]) * k;
    const phone = size.width < 640 || (size.width < 1024 && size.height > size.width);
    const az = MathUtils.degToRad(mix(0) + (motion ? Math.sin(clock.elapsedTime * 0.2) * 3 : 0));
    const el = MathUtils.degToRad(mix(1) + (phone ? 9 * (1 - Math.min(f, 1)) : 0));
    const spread = mode === "projectile" ? Math.max(0, speed - 9) * 0.35 * Math.min(f, 1) : 0;
    const dist = (mix(2) + spread) * Math.max(1, 1.12 * size.height / size.width);
    // Desktop cards sit left, so the scene slides right; on phones they sit below, so it rises.
    const tx = phone ? 0 : mix(3);
    const ty = mix(4);
    // Phones: the card covers the bottom half, so slide the picture up above it.
    const dropFactor = size.width >= 640 ? 0.12 : size.width < 360 ? 0.1 : 0;
    const heroDrop = phone ? size.height * dropFactor * (1 - MathUtils.smoothstep(f, 0, 0.5)) : 0;
    const lift = (phone ? size.height * 0.3 * MathUtils.smoothstep(f, 0.2, 0.9) : 0) - heroDrop;
    if (lift) camera.setViewOffset(size.width, size.height, 0, lift, size.width, size.height);
    else if (camera.view?.enabled) camera.clearViewOffset();
    want.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
    lookWant.set(tx, ty, 0);
    const l = motion ? 4 : 1000;
    look.current.set(damp(look.current.x, lookWant.x, l, dt), damp(look.current.y, lookWant.y, l, dt), 0);
    want.add(look.current);
    camera.position.set(damp(camera.position.x, want.x, l, dt), damp(camera.position.y, want.y, l, dt), damp(camera.position.z, want.z, l, dt));
    camera.lookAt(look.current);

    // Morph: the active demo grows in with a twist, the others shrink away.
    for (const key of ["projectile", "gravity", "molecule"] as const) {
      const grp = groups.current[key];
      if (!grp) continue;
      const s = damp(grp.scale.x, mode === key ? 1 : 0, motion ? 7 : 1000, dt);
      grp.scale.setScalar(Math.max(0.0001, s));
      grp.rotation.y = (1 - s) * 1.6;
      grp.visible = s > 0.01;
    }

    const anchor = (mode === "projectile" ? throwAnchor : mode === "gravity" ? gravityAnchor : moleculeAnchor).current;

    // Simu floats over to each demo, then turns halfway between it and you.
    if (simu.current) {
      const t = clock.elapsedTime;
      const sp = simu.current.position;
      const [sx, sz] = SPOT[mode];
      const wl = motion ? 2.2 : 1000;
      sp.set(damp(sp.x, sx, wl, dt), motion ? 0.2 + Math.sin(t * 2) * 0.045 : 0.2, damp(sp.z, sz, wl, dt));
      if (anchor) {
        anchor.getWorldPosition(v).sub(sp).setY(0).normalize();
        w.copy(camera.position).sub(sp).setY(0).normalize();
        v.add(w);
        simu.current.rotation.y = damp(simu.current.rotation.y, Math.atan2(v.x, v.z), 3, dt);
      }
      const head = parts.current.head;
      if (head && motion) head.rotation.z = Math.sin(t * 0.9) * 0.08;
      const arm = parts.current.armR;
      if (arm) arm.rotation.z = damp(arm.rotation.z, mode === "projectile" && motion ? 0.6 + Math.sin(t * 3) * 0.25 : 0.15, 4, dt);
    }

    // The leader line: from the visible card's edge to its demo on screen.
    const { leader, dot } = view;
    if (!leader || !dot) return;
    // One glass card morphs between chapters; it points at this demo only in its own chapter.
    const card = view.chapter === mode ? document.querySelector<HTMLElement>(".landing-card") : null;
    const op = card ? (card.style.opacity === "" ? 1 : Number(card.style.opacity)) : 0;
    const vis = card && anchor && op > 0.02 ? op * Math.min(1, groups.current[mode]?.scale.x ?? 0) : 0;
    leader.style.opacity = dot.style.opacity = String(vis);
    if (!vis || !card || !anchor) return;
    anchor.getWorldPosition(v).project(camera);
    const ex = ((v.x + 1) / 2) * size.width;
    const ey = ((1 - v.y) / 2) * size.height;
    const r = card.getBoundingClientRect();
    const sx = phone ? r.left + r.width / 2 : r.right;
    const sy = phone ? r.top : r.top + Math.min(64, r.height / 3);
    const [cx, cy] = phone ? [sx, (sy + ey) / 2] : [(sx + ex) / 2, sy];
    leader.setAttribute("d", `M${sx} ${sy} Q${cx} ${cy} ${ex} ${ey}`);
    dot.setAttribute("cx", String(ex));
    dot.setAttribute("cy", String(ey));
  });

  return (
    <>
      <Table />
      <LandingWorkshop />
      <group ref={simu} position={[-3.1, 0.2, -0.35]} scale={compact ? 1.3 : 1.05}>
        <Robot c={SIMU} partsRef={parts} />
      </group>
      <group ref={(g) => void (groups.current.projectile = g)}>
        <Throw angleDeg={angleDeg} speed={speed} motion={motion} active={mode === "projectile"} anchor={throwAnchor} />
      </group>
      <group ref={(g) => void (groups.current.gravity = g)} scale={0.0001}>
        <Gravity g={g} motion={motion} active={mode === "gravity"} anchor={gravityAnchor} />
      </group>
      <group ref={(g) => void (groups.current.molecule = g)} position={[0.6, 1.4, 0]} scale={0.0001}>
        <mesh position={[0, -1.35, 0]} receiveShadow>
          <cylinderGeometry args={[1.15, 1.22, 0.08, 48]} />
          <Mat c="#397e79" />
        </mesh>
        <mesh position={[0, -1.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.98, 1.015, 48]} />
          <meshBasicMaterial color="#d8ae62" />
        </mesh>
        <object3D ref={moleculeAnchor} />
        <Molecule id={molId} motion={motion} active={mode === "molecule"} />
      </group>
    </>
  );
}

function Table() {
  return (
    <group>
      <RoundedBox args={[9, 0.36, 5]} radius={0.12} smoothness={2} position={[0, -0.18, 0]} receiveShadow castShadow>
        <Mat c="#f4e7d2" r={0.75} />
      </RoundedBox>
      <RoundedBox args={[8.82, 0.16, 4.82]} radius={0.06} smoothness={2} position={[0, -0.42, 0]} castShadow>
        <Mat c="#b38d68" r={0.7} />
      </RoundedBox>
      <ContactShadows position={[0, -0.53, 0]} scale={[14, 9]} opacity={0.3} blur={2.6} far={1.2} frames={1} resolution={256} color="#3b2a1a" />
    </group>
  );
}

function Throw({ angleDeg, speed, motion, active, anchor }: { angleDeg: number; speed: number; motion: boolean; active: boolean; anchor: RefObject<Object3D | null> }) {
  const ball = useRef<Group>(null);
  const t0 = useRef(0);
  const th = (angleDeg * Math.PI) / 180;
  const vx = speed * Math.cos(th);
  const vy = speed * Math.sin(th);
  const flight = (2 * vy) / 9.81;
  const at = (t: number) => new Vector3(START.x + vx * t * M, START.y + (vy * t - 4.905 * t * t) * M, START.z);
  const path = useMemo(() => Array.from({ length: 41 }, (_, i) => at((flight * i) / 40)), [angleDeg, speed]); // eslint-disable-line react-hooks/exhaustive-deps
  const land = path[40];
  const peak = at(flight / 2);

  useFrame(({ clock }) => {
    if (!ball.current || !active) return;
    if (!t0.current) t0.current = clock.elapsedTime;
    // Fly, rest a moment on the target, throw again.
    const t = motion ? ((clock.elapsedTime - t0.current) % (flight + 0.9)) : flight / 2;
    const time = Math.min(t, flight);
    ball.current.position.set(START.x + vx * time * M, START.y + (vy * time - 4.905 * time * time) * M, START.z);
    ball.current.rotation.z = -t * 6;
  });

  return (
    <>
      <group position={[START.x, 0, START.z]}>
        <mesh position={[0, 0.055, 0]} receiveShadow>
          <cylinderGeometry args={[0.32, 0.37, 0.1, 24]} />
          <Mat c="#397e79" />
        </mesh>
        <mesh position={[0, 0.11, 0]} rotation={[0, 0, th - Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.12, 0.14, 0.35, 20]} />
          <Mat c="#d8ae62" m={0.25} />
        </mesh>
      </group>
      <Line points={path} color="#c68c37" lineWidth={2} dashed dashSize={0.12} gapSize={0.09} />
      <mesh ref={anchor} position={peak}>
        <sphereGeometry args={[0.09, 16, 12]} />
        <meshBasicMaterial color="#2f80ed" />
      </mesh>
      <mesh position={[land.x, 0.024, land.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.25, 0.29, 40]} />
        <meshBasicMaterial color="#397e79" />
      </mesh>
      <mesh position={[land.x, 0.025, land.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.38, 0.395, 40]} />
        <meshBasicMaterial color="#729d91" />
      </mesh>
      <group ref={ball}>
        <mesh castShadow>
          <sphereGeometry args={[0.17, 24, 16]} />
          <Mat c="#f97316" r={0.6} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.17, 0.012, 6, 32]} />
          <meshBasicMaterial color="#9a3412" />
        </mesh>
      </group>
    </>
  );
}

const PROPS = [
  { x: -0.9, z: 0.3, h: 0.28, spin: 1 },
  { x: 0.5, z: -0.2, h: 0.2, spin: -0.7 },
  { x: 1.9, z: 0.4, h: 0.3, spin: 0.8 },
];

function Gravity({ g, motion, active, anchor }: { g: number; motion: boolean; active: boolean; anchor: RefObject<Object3D | null> }) {
  const refs = useRef<(Group | null)[]>([]);
  useFrame(({ clock }, dt) => {
    if (!active) return;
    const t = clock.elapsedTime;
    // Weaker gravity floats higher and settles slower; Jupiter squashes things flat.
    const lift = g === 0 ? 1.7 : g < 3 ? 0.9 : 0;
    refs.current.forEach((o, i) => {
      if (!o) return;
      const p = PROPS[i];
      const bob = motion && g < 3 ? Math.sin(t * (g === 0 ? 0.8 : 1.4) + i * 2) * (g === 0 ? 0.25 : 0.1) : 0;
      const l = motion ? 1.5 + g * 0.35 : 1000;
      o.position.y = damp(o.position.y, p.h + lift * (1 + i * 0.15) + bob, l, dt);
      const tumble = g === 0 && motion ? p.spin : 0;
      o.rotation.x = g === 0 ? o.rotation.x + tumble * dt * 0.6 : damp(o.rotation.x, 0, 4, dt);
      o.rotation.z = g === 0 ? o.rotation.z + tumble * dt * 0.4 : damp(o.rotation.z, 0, 4, dt);
      o.scale.y = damp(o.scale.y, g > 20 ? 0.82 : 1, 6, dt);
    });
  });
  return (
    <>
      {PROPS.map((p, i) => (
        <mesh key={i} position={[p.x, 0.024, p.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.48, 0.5, 32]} />
          <meshBasicMaterial color="#729d91" />
        </mesh>
      ))}
      <group ref={(o) => void (refs.current[0] = o)} position={[PROPS[0].x, PROPS[0].h, PROPS[0].z]}>
        <mesh castShadow>
          <sphereGeometry args={[0.28, 32, 24]} />
          <Mat c="#f97316" r={0.6} />
        </mesh>
      </group>
      <group ref={(o) => void (refs.current[1] = o)} position={[PROPS[1].x, PROPS[1].h, PROPS[1].z]}>
        <object3D ref={anchor} position={[0, 0.3, 0]} />
        <RoundedBox args={[0.8, 0.4, 0.5]} radius={0.06} castShadow>
          <Mat c="#6b8fe0" r={0.5} />
        </RoundedBox>
      </group>
      <group ref={(o) => void (refs.current[2] = o)} position={[PROPS[2].x, PROPS[2].h, PROPS[2].z]}>
        <mesh castShadow>
          <coneGeometry args={[0.3, 0.6, 32]} />
          <Mat c="#ffc531" r={0.5} />
        </mesh>
      </group>
    </>
  );
}

const MAX_ATOMS = 5;
const MAX_BONDS = 4;
const UP = new Vector3(0, 1, 0);
const tmp = new Vector3();
const q = new Quaternion();
const c = new Color();

function Molecule({ id, motion, active }: { id: MoleculeId; motion: boolean; active: boolean }) {
  const spin = useRef<Group>(null);
  const atoms = useRef<(Mesh | null)[]>([]);
  const bonds = useRef<(Mesh | null)[]>([]);
  useFrame((_, dt) => {
    if (!active) return;
    const m = MOLECULES[id];
    if (spin.current && motion) spin.current.rotation.y += dt * 0.5;
    const l = motion ? 6 : 1000;
    // Atoms glide to the new molecule's real geometry; spare atoms shrink away.
    atoms.current.forEach((a, i) => {
      if (!a) return;
      const at = m.atoms[i];
      const target = at ? ELEMENT_RADII[at.el] * 1.5 : 0;
      if (at) {
        a.position.set(damp(a.position.x, at.pos[0], l, dt), damp(a.position.y, at.pos[1], l, dt), damp(a.position.z, at.pos[2], l, dt));
        (a.material as unknown as { color: Color }).color.lerp(c.set(ELEMENT_COLORS[at.el] ?? "#cbd5e1"), Math.min(1, dt * l));
      }
      a.scale.setScalar(Math.max(0.0001, damp(a.scale.x, target, l, dt)));
    });
    bonds.current.forEach((b, i) => {
      if (!b) return;
      const bd = m.bonds[i];
      const A = bd && atoms.current[bd.a];
      const B = bd && atoms.current[bd.b];
      if (!A || !B) {
        b.scale.x = b.scale.z = damp(b.scale.x, 0.0001, l, dt);
        return;
      }
      tmp.subVectors(B.position, A.position);
      const len = tmp.length();
      b.position.copy(A.position).addScaledVector(tmp, 0.5);
      b.quaternion.copy(q.setFromUnitVectors(UP, tmp.normalize()));
      const w = bd.order > 1 ? 1.6 : 1;
      b.scale.set(damp(b.scale.x, w, l, dt), len, damp(b.scale.z, w, l, dt));
    });
  });
  return (
    <group ref={spin} scale={0.8}>
      {Array.from({ length: MAX_ATOMS }, (_, i) => (
        <mesh key={i} ref={(o) => void (atoms.current[i] = o)} scale={0.0001} castShadow>
          <sphereGeometry args={[1, 32, 24]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.35} />
        </mesh>
      ))}
      {Array.from({ length: MAX_BONDS }, (_, i) => (
        <mesh key={i} ref={(o) => void (bonds.current[i] = o)} scale={[0.0001, 1, 0.0001]}>
          <cylinderGeometry args={[0.07, 0.07, 1, 16]} />
          <meshStandardMaterial color="#d6cbbb" roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}
