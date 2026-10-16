"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Quaternion, Vector3, type Group } from "three";
import { useSim, type Annotation, type InfoCard, type VectorDef } from "@/lib/store";
import { InfoCardView } from "../ui/infocard";
import { livePosition } from "@/lib/world/runtime";

const UP = new Vector3(0, 1, 0);

/** Group that follows an object's live position (physics or animated). */
function useFollow(target: string | undefined, fixed: [number, number, number] | undefined, lift: number) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    const p = target ? livePosition(target) : null;
    const base = p ?? fixed;
    if (base) ref.current.position.set(base[0], base[1] + lift, base[2]);
  });
  return ref;
}

function AnnotationView({ a }: { a: Annotation }) {
  const objects = useSim((s) => s.objects);
  const lift = a.target ? (objects[a.target]?.type === "molecule" ? 1.5 : a.target in objects ? 0.55 : 1.9) : 0;
  const ref = useFollow(a.target, a.position, lift);
  return (
    <group ref={ref} position={a.position ?? [0, -100, 0]}>
      <Html center zIndexRange={[25, 5]} style={{ pointerEvents: "none" }}>
        <div className={`tag flex items-center gap-1.5 px-3 py-1 tag-dot tag-${a.tone} pop max-w-[240px] !whitespace-normal`}>{a.text}</div>
      </Html>
    </group>
  );
}

function VectorView({ v }: { v: VectorDef }) {
  const ref = useFollow(v.target, v.origin, 0);
  const { len, quat } = useMemo(() => {
    const d = new Vector3(...v.vector);
    const len = Math.max(0.05, d.length());
    return { len, quat: new Quaternion().setFromUnitVectors(UP, d.normalize()) };
  }, [v.vector]);
  return (
    <group ref={ref} position={v.origin ?? [0, -100, 0]}>
      <group quaternion={quat}>
        <mesh position={[0, len / 2, 0]}>
          <cylinderGeometry args={[0.03, 0.03, len, 10]} />
          <meshBasicMaterial color={v.color} depthTest={false} transparent opacity={0.95} />
        </mesh>
        <mesh position={[0, len + 0.09, 0]}>
          <coneGeometry args={[0.09, 0.18, 14]} />
          <meshBasicMaterial color={v.color} depthTest={false} transparent opacity={0.95} />
        </mesh>
        {v.label && (
          <Html position={[0, len + 0.35, 0]} center zIndexRange={[25, 5]} style={{ pointerEvents: "none" }}>
            <div className="tag flex items-center gap-1.5 px-3 py-1 tag-dot" style={{ ["--dot" as string]: v.color }}>
              {v.label}
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}

/** Info card floating next to an object or character in the world. */
function ObjectCard({ card }: { card: InfoCard }) {
  const objects = useSim((s) => s.objects);
  const lift = card.target && card.target in objects ? 0.8 : 2.1;
  const ref = useFollow(card.target, undefined, lift);
  return (
    <group ref={ref} position={[0, -100, 0]}>
      <Html center zIndexRange={[35, 25]} style={{ pointerEvents: "auto" }}>
        <div className="-translate-y-1/2">
          <InfoCardView card={card} compact />
        </div>
      </Html>
    </group>
  );
}

export function Overlays() {
  const annotations = useSim((s) => s.annotations);
  const vectors = useSim((s) => s.vectors);
  const cards = useSim((s) => s.cards);
  return (
    <>
      {cards
        .filter((c) => c.placement === "object" && c.target)
        .map((c) => (
          <ObjectCard key={c.id} card={c} />
        ))}
      {annotations.map((a) => (
        <AnnotationView key={a.id} a={a} />
      ))}
      {vectors.map((v) => (
        <VectorView key={v.id} v={v} />
      ))}
    </>
  );
}
