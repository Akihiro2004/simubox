"use client";

import { Html, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState, type RefObject } from "react";
import { MathUtils, Vector3, type Group } from "three";
import { useSim } from "@/lib/store";
import { nodes } from "@/lib/world/runtime";
import type { Character } from "@/lib/world/scene";
import { skipSpeech } from "@/lib/player";
import { RevealText } from "../ui/kit";
import { Mat } from "./assets";

type Part = "root" | "body" | "head" | "armL" | "armR" | "legL" | "legR" | "eyes";
export type Parts = Record<Part, Group | null>;
type PartsRef = RefObject<Parts>;

/** Callback ref that files a group under `k` (refs are only touched on commit). */
const bind = (partsRef: PartsRef, k: Part) => (g: Group | null) => {
  partsRef.current[k] = g;
};

const damp = MathUtils.damp;

/** Procedural gestures shared by robot and people. Writes only to refs. */
function useCharacterMotion(c: Character, partsRef: PartsRef, opts: { hover: boolean; animate: boolean }) {
  const start = useRef(0);
  const nonce = useRef(c.animNonce);
  const facing = useRef(0);

  useFrame(({ clock, camera }, dt) => {
    const now = clock.elapsedTime;
    if (nonce.current !== c.animNonce) {
      nonce.current = c.animNonce;
      start.current = now;
    }
    const { root, body, head, armL: aL, armR: aR, legL, legR, eyes } = partsRef.current;
    if (!root || !body || !head || !aL || !aR) return;
    const t = now - start.current;
    const a = opts.animate;

    // Walk toward the target position.
    const [tx, , tz] = c.position;
    const dx = tx - root.position.x, dz = tz - root.position.z;
    const dist = Math.hypot(dx, dz);
    const walking = dist > 0.03;
    if (walking) {
      const step = Math.min(dist, 1.6 * dt);
      root.position.x += (dx / dist) * step;
      root.position.z += (dz / dist) * step;
    }
    root.position.y = damp(root.position.y, c.position[1], 6, dt);

    // Face the camera when idle, the path when walking.
    const want = walking ? Math.atan2(dx, dz) : Math.atan2(camera.position.x - root.position.x, camera.position.z - root.position.z);
    let diff = want - facing.current;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    facing.current += diff * Math.min(1, dt * 5);
    root.rotation.y = facing.current;

    // Targets for this frame.
    let y = 0, armLz = -0.12, armRz = 0.12, armLx = 0, armRx = 0, headX = 0, headZ = 0, spin = 0, lean = 0, eye = 1;
    if (a) {
      y = opts.hover ? Math.sin(now * 2.2) * 0.04 + 0.04 : Math.abs(Math.sin(now * 1.6)) * 0.008;
      armLz += Math.sin(now * 1.7) * 0.05;
      armRz -= Math.sin(now * 1.7) * 0.05;
    }
    switch (c.animation) {
      case "wave":
        if (t < 2) {
          armRz = 2.5 + Math.sin(t * 11) * 0.35;
          headZ = -0.1;
        }
        break;
      case "talk":
        headX = Math.sin(now * 7) * 0.06;
        armLx = Math.sin(now * 2.6) * 0.35 - 0.2;
        armRx = Math.sin(now * 2.6 + 1.5) * 0.35 - 0.2;
        break;
      case "point":
        if (t < 2.5) {
          armRx = -1.45;
          armRz = 0.25;
          headZ = -0.08;
        }
        break;
      case "think":
        if (t < 3) {
          armRx = -2.1;
          armRz = -0.5;
          headZ = 0.22;
          headX = -0.1;
        }
        break;
      case "jump":
        if (t < 1.2) y += Math.max(0, Math.sin((t % 0.6) * (Math.PI / 0.6))) * 0.35;
        break;
      case "celebrate":
        if (t < 1.8) {
          armLz = -2.6 + Math.sin(t * 12) * 0.2;
          armRz = 2.6 - Math.sin(t * 12) * 0.2;
          y += Math.max(0, Math.sin((t % 0.6) * (Math.PI / 0.6))) * 0.25;
          spin = Math.min(1, t / 0.9) * Math.PI * 2;
        }
        break;
      case "surprised":
        if (t < 1.8) {
          armLz = -1.2;
          armRz = 1.2;
          lean = -0.15;
          eye = 1.45;
        }
        break;
    }
    if (walking && !opts.hover) {
      const sw = Math.sin(now * 10) * 0.5;
      armLx = sw;
      armRx = -sw;
      if (legL && legR) {
        legL.rotation.x = -sw;
        legR.rotation.x = sw;
      }
    } else if (legL && legR) {
      legL.rotation.x = damp(legL.rotation.x, 0, 8, dt);
      legR.rotation.x = damp(legR.rotation.x, 0, 8, dt);
    }
    if (walking && opts.hover) lean = 0.15;

    const k = a ? 10 : 30;
    body.position.y = damp(body.position.y, y, 12, dt);
    body.rotation.y = spin;
    body.rotation.x = damp(body.rotation.x, lean, k, dt);
    head.rotation.x = damp(head.rotation.x, headX, k, dt);
    head.rotation.z = damp(head.rotation.z, headZ, k, dt);
    aL.rotation.z = damp(aL.rotation.z, armLz, k, dt);
    aR.rotation.z = damp(aR.rotation.z, armRz, k, dt);
    aL.rotation.x = damp(aL.rotation.x, armLx, k, dt);
    aR.rotation.x = damp(aR.rotation.x, armRx, k, dt);
    if (eyes) {
      // Blink every few seconds.
      const blink = a && now % 3.7 < 0.12 ? 0.1 : 1;
      eyes.scale.y = damp(eyes.scale.y, blink * eye, 30, dt);
      eyes.scale.x = damp(eyes.scale.x, eye, 12, dt);
    }
  });
}


export function Robot({ c, partsRef }: { c: Character; partsRef: PartsRef }) {
  const accent = c.color ?? "#38bdf8";
  return (
    <group ref={bind(partsRef, "body")}>
      <mesh position={[0, 0.42, 0]} scale={[0.32, 0.34, 0.29]} castShadow>
        <sphereGeometry args={[1, 32, 24]} />
        <Mat c="#f5f7ff" r={0.35} />
      </mesh>
      <RoundedBox args={[0.13, 0.13, 0.04]} radius={0.03} position={[0, 0.45, 0.28]}>
        <Mat c={accent} e={accent} ei={0.5} />
      </RoundedBox>
      <mesh position={[0, 0.08, 0]}>
        <coneGeometry args={[0.1, 0.12, 16]} />
        <Mat c="#bae6fd" e={accent} ei={1.2} o={0.8} />
      </mesh>
      <group ref={bind(partsRef, "head")} position={[0, 0.9, 0]}>
        <RoundedBox args={[0.64, 0.5, 0.52]} radius={0.19} smoothness={5} castShadow>
          <Mat c="#f8faff" r={0.3} />
        </RoundedBox>
        <RoundedBox args={[0.52, 0.32, 0.06]} radius={0.12} position={[0, 0.0, 0.24]}>
          <Mat c="#0b1233" r={0.2} />
        </RoundedBox>
        <group ref={bind(partsRef, "eyes")} position={[0, 0.02, 0.28]}>
          {[-0.11, 0.11].map((x) => (
            <mesh key={x} position={[x, 0, 0]} scale={[0.05, 0.07, 0.02]}>
              <sphereGeometry args={[1, 16, 12]} />
              <meshBasicMaterial color="#67e8f9" />
            </mesh>
          ))}
        </group>
        <mesh position={[0, -0.08, 0.28]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.05, 0.012, 6, 16, Math.PI]} />
          <meshBasicMaterial color="#67e8f9" />
        </mesh>
        {[-0.33, 0.33].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.09, 0.09, 0.06, 20]} />
            <Mat c={accent} r={0.4} />
          </mesh>
        ))}
        <mesh position={[0, 0.32, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.16, 6]} />
          <Mat c="#cbd5e1" />
        </mesh>
        <mesh position={[0, 0.42, 0]}>
          <sphereGeometry args={[0.045, 12, 10]} />
          <Mat c={accent} e={accent} ei={1.5} />
        </mesh>
      </group>
      {([["armL", -0.34], ["armR", 0.34]] as const).map(([k, x]) => (
        <group key={k} ref={bind(partsRef, k)} position={[x, 0.55, 0]}>
          <mesh position={[0, -0.16, 0]} scale={[0.075, 0.17, 0.075]} castShadow>
            <sphereGeometry args={[1, 14, 10]} />
            <Mat c="#f5f7ff" r={0.35} />
          </mesh>
          <mesh position={[0, -0.33, 0]}>
            <sphereGeometry args={[0.06, 12, 10]} />
            <Mat c={accent} r={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const SKIN = ["#f2c7a5", "#d9a273", "#a86b45", "#f6d3b8", "#8d5a3b"];
const HAIR = ["#3b2416", "#111827", "#7c4a1e", "#f5d0a1", "#6b7280"];
const SHIRT: Record<string, string> = { kid: "#f59e0b", teacher: "#6366f1", scientist: "#f8fafc", astronaut: "#f1f5f9" };
const hash = (s: string) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);

function Person({ c, partsRef }: { c: Character; partsRef: PartsRef }) {
  const h = hash(c.id);
  const skin = SKIN[h % SKIN.length];
  const hair = c.kind === "teacher" ? HAIR[(h >> 3) % HAIR.length] : HAIR[(h >> 2) % 3];
  const shirt = c.color ?? SHIRT[c.kind] ?? "#22c55e";
  const pants = c.kind === "astronaut" ? "#e2e8f0" : c.kind === "kid" ? "#1d4ed8" : "#334155";
  const s = c.kind === "kid" ? 0.78 : 1;
  return (
    <group ref={bind(partsRef, "body")} scale={s}>
      {([["legL", -0.1], ["legR", 0.1]] as const).map(([k, x]) => (
        <group key={k} ref={bind(partsRef, k)} position={[x, 0.48, 0]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <cylinderGeometry args={[0.075, 0.07, 0.44, 10]} />
            <Mat c={pants} />
          </mesh>
          <RoundedBox args={[0.13, 0.08, 0.2]} radius={0.03} position={[0, -0.44, 0.03]} castShadow>
            <Mat c="#1f2937" />
          </RoundedBox>
        </group>
      ))}
      <RoundedBox args={[0.44, c.kind === "scientist" ? 0.66 : 0.52, 0.28]} radius={0.1} position={[0, c.kind === "scientist" ? 0.68 : 0.74, 0]} castShadow>
        <Mat c={shirt} r={0.8} />
      </RoundedBox>
      {c.kind === "astronaut" && (
        <RoundedBox args={[0.34, 0.42, 0.14]} radius={0.05} position={[0, 0.78, -0.2]} castShadow>
          <Mat c="#cbd5e1" />
        </RoundedBox>
      )}
      <group ref={bind(partsRef, "head")} position={[0, 1.22, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.2, 24, 18]} />
          <Mat c={skin} r={0.7} />
        </mesh>
        {c.kind !== "astronaut" && (
          <mesh position={[0, 0.06, -0.02]} scale={[1.05, 0.78, 1.05]}>
            <sphereGeometry args={[0.205, 20, 14, 0, Math.PI * 2, 0, Math.PI / 1.9]} />
            <Mat c={hair} r={0.9} />
          </mesh>
        )}
        <group ref={bind(partsRef, "eyes")} position={[0, 0.01, 0.18]}>
          {[-0.07, 0.07].map((x) => (
            <mesh key={x} position={[x, 0, 0]} scale={[0.024, 0.032, 0.02]}>
              <sphereGeometry args={[1, 10, 8]} />
              <meshBasicMaterial color="#111827" />
            </mesh>
          ))}
        </group>
        {[-0.11, 0.11].map((x) => (
          <mesh key={x} position={[x, -0.05, 0.16]}>
            <circleGeometry args={[0.028, 12]} />
            <meshBasicMaterial color="#fb7185" transparent opacity={0.5} />
          </mesh>
        ))}
        <mesh position={[0, -0.07, 0.185]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.035, 0.008, 6, 14, Math.PI]} />
          <meshBasicMaterial color="#7f1d1d" />
        </mesh>
        {(c.kind === "teacher" || c.kind === "scientist") &&
          [-0.07, 0.07].map((x) => (
            <mesh key={x} position={[x, 0.01, 0.19]}>
              <torusGeometry args={[0.04, 0.007, 6, 18]} />
              <Mat c="#1e293b" />
            </mesh>
          ))}
        {c.kind === "astronaut" && (
          <mesh>
            <sphereGeometry args={[0.28, 24, 18]} />
            <Mat c="#e0f2fe" r={0.05} o={0.35} />
          </mesh>
        )}
      </group>
      {([["armL", -0.27], ["armR", 0.27]] as const).map(([k, x]) => (
        <group key={k} ref={bind(partsRef, k)} position={[x, 0.96, 0]}>
          <mesh position={[0, -0.2, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.055, 0.4, 10]} />
            <Mat c={shirt} r={0.8} />
          </mesh>
          <mesh position={[0, -0.42, 0]}>
            <sphereGeometry args={[0.055, 10, 8]} />
            <Mat c={c.kind === "astronaut" ? "#cbd5e1" : skin} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const anchor = new Vector3();
const EDGE = 12;

function SpeechBubble({ c, height }: { c: Character; height: number }) {
  const speech = useSim((s) => (s.speech?.speaker === c.id ? s.speech : null));
  const bubble = useRef<HTMLButtonElement>(null);
  if (!speech) return null;
  // Rendered in a layer above the lesson cards: the line being spoken must never hide behind them.
  const layer = document.getElementById("bubble-layer");
  return (
    <Html
      position={[0, height, 0]}
      portal={layer ? { current: layer } : undefined}
      zIndexRange={[40, 20]}
      style={{ pointerEvents: "auto" }}
      // Keep the whole bubble on screen; the tail slides to keep pointing at the speaker.
      calculatePosition={(obj, camera, size) => {
        anchor.setFromMatrixPosition(obj.matrixWorld).project(camera);
        const x = (anchor.x * 0.5 + 0.5) * size.width;
        const y = (-anchor.y * 0.5 + 0.5) * size.height;
        const el = bubble.current;
        if (!el) return [x, y];
        const half = el.offsetWidth / 2 + EDGE;
        const cx = half * 2 > size.width ? size.width / 2 : Math.min(Math.max(x, half), size.width - half);
        el.style.setProperty("--tail", `${x - cx}px`);
        return [cx, Math.max(y, el.offsetHeight + EDGE)];
      }}
    >
      <button ref={bubble} key={speech.key} type="button" className="speech-bubble relative block px-4 py-2.5" onClick={skipSpeech} aria-label={`${c.name} says: ${speech.text}. Click to skip.`}>
        {c.id !== "simu" && <span className="mb-0.5 block text-[12px] font-bold text-ink-3">{c.name}</span>}
        <RevealText text={speech.text} />
      </button>
    </Html>
  );
}

const near = new Vector3();

export function CharacterView({ c, animate }: { c: Character; animate: boolean }) {
  const partsRef = useRef<Parts>({ root: null, body: null, head: null, armL: null, armR: null, legL: null, legR: null, eyes: null });
  const selected = useSim((s) => s.selectedId === c.id);
  const robot = c.kind === "robot";
  useCharacterMotion(c, partsRef, { hover: robot, animate });

  useEffect(() => {
    const g = partsRef.current.root;
    if (g) nodes.set(c.id, g);
    return () => {
      nodes.delete(c.id);
    };
  }, [c.id]);

  // Only the first position is a prop; walking moves the group from useFrame.
  const [initial] = useState(c.position);
  // A character right in front of the camera would fill the screen: shrink it
  // out of the way (fully gone at 1.8 m, fully back from 3 m). Its bubble stays.
  const body = useRef<Group>(null);
  useFrame(({ camera }) => {
    const root = partsRef.current.root;
    if (!root || !body.current) return;
    const d = camera.position.distanceTo(root.getWorldPosition(near));
    body.current.scale.setScalar(Math.max(0.001, MathUtils.smoothstep(d, 1.8, 3)));
  });
  const height = robot ? 1.55 : c.kind === "kid" ? 1.35 : 1.7;
  return (
    <group
      ref={bind(partsRef, "root")}
      position={initial}
      onClick={(e) => {
        e.stopPropagation();
        useSim.getState().set({ selectedId: c.id });
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <group ref={body}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <circleGeometry args={[robot ? 0.3 : 0.28, 24]} />
          <meshBasicMaterial color="#0f172a" transparent opacity={0.18} depthWrite={false} />
        </mesh>
        {robot ? <Robot c={c} partsRef={partsRef} /> : <Person c={c} partsRef={partsRef} />}
      </group>
      <SpeechBubble c={c} height={height} />
      {selected && (
        <Html position={[0, -0.05, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <div className="tag flex items-center gap-1.5 px-3 py-1">{c.name}</div>
        </Html>
      )}
    </group>
  );
}
