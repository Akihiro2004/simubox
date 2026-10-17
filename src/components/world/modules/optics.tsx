"use client";

// The Light Lab's optics table. Everything drawn here comes from the ray
// tracer in lib/engine/optics: the beams, where they bend or bounce, the
// angles, the spots on the screen and the images lenses and mirrors make.

import { Edges, Line, RoundedBox } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { AdditiveBlending, BufferGeometry, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, Shape, Vector3 } from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Html } from "@/components/world/html";
import { useSim } from "@/lib/store";
import { OPTICS_TABLE, opticsTrace } from "@/lib/modules";
import { TABLE, blockWidth, clipTableSegment, dirOf, frameOf, objectRays, outlineOf, signedFocal, sourceWavelength, turningHits, wavelengthColor, type OpticElement, type OpticsSetup, type V2 } from "@/lib/engine/optics";
import { opticsBeamBuffers } from "@/lib/world/optics-display";
import { Mat } from "../assets";
import { OpticsMixing } from "./optics-mixing";

const TOP = OPTICS_TABLE.center[1];
/** Height of the beams above the table top. */
const RAY_Y = 0.07;
const EL_H = 0.16;

const Tag = ({ children, tone }: { children: React.ReactNode; tone?: "fact" | "warning" }) => <div style={{ maxWidth: "min(360px,70vw)", whiteSpace: "normal" }} className={`tag flex items-center gap-1.5 px-2 py-0.5 text-center text-[11.5px] ${tone ? `tag-dot tag-${tone}` : ""}`}>{children}</div>;
const labelProjection = new Vector3();
const summaryPosition: NonNullable<Parameters<typeof Html>[0]["calculatePosition"]> = (object, camera, size) => {
  labelProjection.setFromMatrixPosition(object.matrixWorld).project(camera);
  const margin = Math.min(180, size.width * 0.35) + 8;
  return [Math.max(margin, Math.min(size.width - margin, (labelProjection.x * 0.5 + 0.5) * size.width)), (-labelProjection.y * 0.5 + 0.5) * size.height];
};
const at = (p: V2, y = RAY_Y): [number, number, number] => [p[0], y, p[1]];

/** A flat outline (element frame: along axis, across face) pulled up into a solid. */
function useExtrusion(points: V2[], height: number) {
  const key = points.map((p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`).join(";");
  const geom = useMemo(() => {
    const s = new Shape();
    points.forEach(([u, v], i) => (i ? s.lineTo(u, -v) : s.moveTo(u, -v)));
    s.closePath();
    const g = new ExtrudeGeometry(s, { depth: height, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the outline's coordinates
  }, [key, height]);
  useEffect(() => () => geom.dispose(), [geom]);
  return geom;
}

/** Lens cross-section: bulging (converging) or waisted (diverging). */
function lensOutline(e: OpticElement): V2[] {
  const h = e.size / 2;
  const strength = Math.min(1, 0.9 / e.focalLength);
  const convex = e.kind === "convex_lens";
  const half = (v: number) => {
    const t = (v / h) ** 2;
    return convex ? 0.015 + (0.04 + 0.08 * strength) * (1 - t) : 0.018 + (0.05 + 0.06 * strength) * t;
  };
  const n = 18;
  const right: V2[] = Array.from({ length: n + 1 }, (_, i) => {
    const v = -h + (i / n) * e.size;
    return [half(v), v];
  });
  return [...right, ...right.map(([u, v]) => [-u, v] as V2).reverse()];
}

/** A curved mirror as a band: the reflective arc plus a backing behind it. */
function mirrorOutline(e: OpticElement): V2[] {
  const arc = outlineOf(e);
  return [...arc, ...arc.map(([u, v]) => [u - 0.045, v] as V2).reverse()];
}

function Glass({ e }: { e: OpticElement }) {
  const pts = e.kind === "convex_lens" || e.kind === "concave_lens" ? lensOutline(e) : outlineOf(e);
  const geom = useExtrusion(pts, EL_H);
  const tint = e.material === "water" ? "#8fd0f5" : e.material === "diamond" ? "#f2f7ff" : e.material === "acrylic" ? "#d8f0ff" : "#bdeee0";
  return (
    <mesh geometry={geom}>
      <meshStandardMaterial color={tint} transparent opacity={e.material === "diamond" ? 0.5 : 0.32} roughness={0.05} metalness={0.1} depthWrite={false} />
      <Edges color="#39939e" threshold={20} />
    </mesh>
  );
}

function CurvedMirror({ e }: { e: OpticElement }) {
  const geom = useExtrusion(mirrorOutline(e), EL_H + 0.02);
  return (
    <mesh geometry={geom} castShadow>
      <meshStandardMaterial color="#c5dce5" metalness={0.4} roughness={0.22} emissive="#b7d3da" emissiveIntensity={0.12} />
    </mesh>
  );
}

function Element({ e }: { e: OpticElement }) {
  const f = frameOf(e);
  const rotY = -(e.rotationDeg * Math.PI) / 180;
  const body = (() => {
    switch (e.kind) {
      case "plane_mirror":
        return (
          <>
            <mesh position={[0, (EL_H + 0.02) / 2, 0]} castShadow>
              <boxGeometry args={[0.03, EL_H + 0.02, e.size]} />
              <meshStandardMaterial color="#c5dce5" metalness={0.4} roughness={0.22} emissive="#b7d3da" emissiveIntensity={0.12} />
            </mesh>
            <mesh position={[0, 0.012, 0]}>
              <boxGeometry args={[0.12, 0.024, Math.min(0.3, e.size)]} />
              <Mat c="#2b3038" />
            </mesh>
          </>
        );
      case "concave_mirror":
      case "convex_mirror":
        return <CurvedMirror e={e} />;
      case "screen":
        return (
          <RoundedBox args={[0.035, 0.55, e.size]} radius={0.01} position={[0, 0.275, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#f7f8fa" roughness={0.95} />
          </RoundedBox>
        );
      case "blocker":
        return (
          <RoundedBox args={[0.03, 0.34, e.size]} radius={0.008} position={[0, 0.17, 0]} castShadow>
            <Mat c="#2b3038" r={0.9} />
          </RoundedBox>
        );
      default:
        return <Glass e={e} />;
    }
  })();
  const label = { plane_mirror: "plane mirror", concave_mirror: "concave mirror", convex_mirror: "convex mirror", convex_lens: "convex lens", concave_lens: "concave lens", glass_block: `${e.material} block`, prism: `${e.material} prism`, semicircle: `${e.material} semicircle`, screen: "screen", blocker: "card" }[e.kind];
  const reach = e.kind === "glass_block" ? blockWidth(e) / 2 : 0;
  return (
    <>
      <group position={[e.x, 0, e.z]} rotation={[0, rotY, 0]}>
        {body}
      </group>
      <Html position={[Math.max(-2.6, Math.min(2.6, f.c[0] + f.v[0] * (e.size / 2 + 0.2) - f.u[0] * reach)), 0.08, Math.max(-1.4, Math.min(1.4, f.c[1] + f.v[1] * (e.size / 2 + 0.2) - f.u[1] * reach))]} center zIndexRange={[12, 0]} style={{ pointerEvents: "none" }}>
        <div className="ground-label whitespace-nowrap !text-[#eff8f7] ![text-shadow:0_1px_3px_rgba(0,0,0,.8)]">{label}</div>
      </Html>
    </>
  );
}

function SourceModel({ o, p }: { o: OpticsSetup; p: V2 }) {
  const s = o.source;
  if (s.kind === "off") return null;
  const rotY = -(s.angleDeg * Math.PI) / 180;
  const glow = s.color === "white" && s.wavelengthNm == null ? "#ffffff" : wavelengthColor(sourceWavelength(s));
  const len = s.kind === "lamp" ? 0 : 0.36;
  return (
    <group position={[p[0], 0, p[1]]} rotation={[0, rotY, 0]}>
      {s.kind === "lamp" ? (
        <>
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.07, 0.09, 0.1, 16]} />
            <Mat c="#2b3038" />
          </mesh>
          <mesh position={[0, RAY_Y + 0.02, 0]}>
            <sphereGeometry args={[0.06, 16, 12]} />
            <meshBasicMaterial color={glow} toneMapped={false} />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[-len / 2, 0.013, 0]}><boxGeometry args={[len + 0.05, 0.025, s.kind === "ray_box" ? Math.min(2.4, s.spread) + 0.18 : 0.16]} /><Mat c="#d8c8a4" /></mesh>
          <RoundedBox args={[len, 0.11, s.kind === "ray_box" ? Math.min(2.4, s.spread) + 0.12 : 0.11]} radius={0.02} position={[-len / 2, RAY_Y, 0]} castShadow>
            <Mat c={s.kind === "ray_box" ? "#477c82" : "#325b65"} r={0.4} m={0.3} />
          </RoundedBox>
          <mesh position={[0.002, RAY_Y, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.022, 0.022, 0.01, 12]} />
            <meshBasicMaterial color={glow} toneMapped={false} />
          </mesh>
        </>
      )}
    </group>
  );
}

function Beams({ o }: { o: OpticsSetup }) {
  const tr = opticsTrace(o);
  const buffers = useMemo(() => opticsBeamBuffers(tr, o.reflections !== false), [tr, o.reflections]);
  const spectrum = o.source.color === "white" && o.source.wavelengthNm == null;
  const batch = useMemo(() => {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(buffers.positions);
    geometry.setColors(buffers.colors);
    const core = new LineMaterial({ vertexColors: true, linewidth: spectrum ? 0.9 : 2.2, transparent: true, opacity: 0.95, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
    const glow = new LineMaterial({ vertexColors: true, linewidth: spectrum ? 2.5 : 7, transparent: true, opacity: spectrum ? 0.07 : 0.15, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
    const arrows = new BufferGeometry();
    arrows.setAttribute("position", new Float32BufferAttribute(buffers.arrows, 3));
    arrows.setAttribute("color", new Float32BufferAttribute(buffers.arrowColors, 3));
    return { geometry, core, glow, arrows, coreLines: new LineSegments2(geometry, core), glowLines: new LineSegments2(geometry, glow) };
  }, [buffers, spectrum]);
  useEffect(() => () => { batch.geometry.dispose(); batch.core.dispose(); batch.glow.dispose(); batch.arrows.dispose(); }, [batch]);
  return (
    <>
      {buffers.positions.length > 0 && <><primitive object={batch.glowLines} /><primitive object={batch.coreLines} /></>}
      <mesh geometry={batch.arrows}><meshBasicMaterial vertexColors side={DoubleSide} toneMapped={false} /></mesh>
      {tr.spots.map((s, i) => (
        <mesh key={`s${i}`} position={at(s.point, RAY_Y)} rotation={[0, 0, 0]}>
          <sphereGeometry args={[0.035, 12, 10]} />
          <meshBasicMaterial color={s.color} transparent opacity={Math.min(1, 0.35 + s.intensity)} blending={AdditiveBlending} toneMapped={false} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

/** Dashed normals and the angles where the main beam meets a surface. */
function Angles({ o }: { o: OpticsSetup }) {
  const tr = opticsTrace(o);
  const shown = turningHits(tr.hits).filter((h) => h.kind !== "refract" || h.incidenceDeg >= 1).slice(0, 6);
  // One label per kind of event keeps a fibre's many bounces readable.
  const labelled = new Set<string>();
  return (
    <>
      {shown.map((h, i) => {
        const n = h.normal;
        const a: V2 = [h.point[0] + n[0] * 0.38, h.point[1] + n[1] * 0.38];
        const b: V2 = [h.point[0] - n[0] * 0.38, h.point[1] - n[1] * 0.38];
        const label = h.kind === "reflect" ? `i = ${h.incidenceDeg.toFixed(1)}° · r = ${h.outDeg!.toFixed(1)}°` : h.kind === "refract" ? `${h.incidenceDeg.toFixed(1)}° → ${h.outDeg!.toFixed(1)}°` : `total internal reflection at ${h.incidenceDeg.toFixed(1)}°`;
        const tag = !labelled.has(h.kind) && labelled.add(h.kind);
        return (
          <group key={i}>
            <Line points={[at(a, RAY_Y + 0.002), at(b, RAY_Y + 0.002)]} color="#e9eef5" lineWidth={1.2} dashed dashSize={0.04} gapSize={0.035} transparent opacity={0.75} />
            {tag && (
              <Html position={at([h.point[0] + n[0] * 0.5, h.point[1] + n[1] * 0.5], RAY_Y + 0.12)} center zIndexRange={[14, 0]} style={{ pointerEvents: "none" }}>
                <Tag tone={h.kind === "total_internal_reflection" ? "warning" : "fact"}>{label}</Tag>
              </Html>
            )}
          </group>
        );
      })}
    </>
  );
}

/** Focal points of lenses and curved mirrors. */
function FocalPoints({ o }: { o: OpticsSetup }) {
  return (
    <>
      {o.elements.map((e) => {
        const fs = signedFocal(e);
        if (fs === null) return null;
        const f = frameOf(e);
        const mirror = e.kind.endsWith("mirror");
        const spots: [V2, string][] = mirror
          ? [[[f.c[0] + f.u[0] * fs, f.c[1] + f.u[1] * fs], "F"]]
          : [[[f.c[0] + f.u[0] * fs, f.c[1] + f.u[1] * fs], "F"], [[f.c[0] - f.u[0] * fs, f.c[1] - f.u[1] * fs], "F"], [[f.c[0] + f.u[0] * 2 * fs, f.c[1] + f.u[1] * 2 * fs], "2F"], [[f.c[0] - f.u[0] * 2 * fs, f.c[1] - f.u[1] * 2 * fs], "2F"]];
        // The optical axis, faint.
        const axis = clipTableSegment([f.c[0] - f.u[0] * 10, f.c[1] - f.u[1] * 10], [f.c[0] + f.u[0] * 10, f.c[1] + f.u[1] * 10]);
        return (
          <group key={e.id}>
            {axis && <Line points={axis.map((p) => at(p, 0.01))} color="#91b4bc" lineWidth={1} dashed dashSize={0.08} gapSize={0.06} transparent opacity={0.6} />}
            {spots.filter(([p]) => Math.abs(p[0]) <= TABLE.x && Math.abs(p[1]) <= TABLE.z).map(([p, name], i) => (
              <group key={i}>
                <mesh position={at(p, 0.015)}>
                  <sphereGeometry args={[0.028, 12, 10]} />
                  <meshBasicMaterial color={name === "F" ? "#ffd60a" : "#9aa5b1"} toneMapped={false} />
                </mesh>
                <Html position={at(p, 0.14)} center zIndexRange={[13, 0]} style={{ pointerEvents: "none" }}>
                  <div className="ground-label !text-[#ffe680] ![text-shadow:0_1px_2px_rgba(0,0,0,.7)]">{name}</div>
                </Html>
              </group>
            ))}
          </group>
        );
      })}
    </>
  );
}

function Arrow({ base, tip, color, ghost }: { base: V2; tip: V2; color: string; ghost?: boolean }) {
  if (Math.abs(base[0]) > TABLE.x || Math.abs(base[1]) > TABLE.z || Math.abs(tip[0]) > TABLE.x || Math.abs(tip[1]) > TABLE.z) return null;
  const d: V2 = [tip[0] - base[0], tip[1] - base[1]];
  const len = Math.hypot(d[0], d[1]);
  if (len < 0.01) return null;
  const u: V2 = [d[0] / len, d[1] / len];
  const side: V2 = [-u[1], u[0]];
  const head = Math.min(0.08, len * 0.4);
  const neck: V2 = [tip[0] - u[0] * head, tip[1] - u[1] * head];
  const y = RAY_Y + 0.01;
  return (
    <group>
      <Line points={[at(base, y), at(neck, y)]} color={color} lineWidth={4} dashed={ghost} dashSize={0.05} gapSize={0.04} transparent opacity={ghost ? 0.7 : 1} toneMapped={false} />
      <Line points={[at([neck[0] + side[0] * head * 0.6, neck[1] + side[1] * head * 0.6], y), at(tip, y), at([neck[0] - side[0] * head * 0.6, neck[1] - side[1] * head * 0.6], y)]} color={color} lineWidth={4} transparent opacity={ghost ? 0.7 : 1} toneMapped={false} />
    </group>
  );
}

/** Object arrow, its image, and (for virtual images) the dashed lines the rays seem to come from. */
function ImageDiagram({ o }: { o: OpticsSetup }) {
  const d = objectRays(o);
  const tr = opticsTrace(o);
  if (!d) return null;
  const img = d.image;
  const bound = (p: V2): V2 => [Math.max(-2.55, Math.min(2.55, p[0])), Math.max(-1.4, Math.min(1.4, p[1]))];
  const labelPoint = bound(img?.base ?? d.base);
  return (
    <>
      <Arrow base={d.base} tip={d.tip} color="#ffb020" />
      <Html position={at(bound(d.base), RAY_Y - 0.03)} center zIndexRange={[13, 0]} style={{ pointerEvents: "none", transform: "translateY(14px)" }}>
        <div className="ground-label !text-[#ffcf70] ![text-shadow:0_1px_2px_rgba(0,0,0,.7)]">object</div>
      </Html>
      {img && (
        <>
          <Arrow base={img.base} tip={img.tip} color={img.real ? "#ff7a59" : "#ff9f85"} ghost={!img.real} />
          <Html position={at(labelPoint, RAY_Y - 0.03)} center zIndexRange={[13, 0]} style={{ pointerEvents: "none", transform: "translateY(14px)" }}>
            <div className="ground-label !text-[#ffb3a1] ![text-shadow:0_1px_2px_rgba(0,0,0,.7)]">{img.real ? "real image" : "virtual image"}</div>
          </Html>
          {!img.real &&
            tr.rays
              .filter((r) => r.diagram && r.points.length >= 2)
              .map((r, i) => {
                const segment = clipTableSegment(r.points[1], img.tip);
                return segment && <Line key={i} points={segment.map((p) => at(p, RAY_Y + 0.004))} color="#ffb020" lineWidth={1.4} dashed dashSize={0.05} gapSize={0.04} transparent opacity={0.65} />;
              })}
        </>
      )}
      <Html position={at(bound([(d.base[0] + (img?.base[0] ?? d.base[0])) / 2, -1.3]), RAY_Y)} calculatePosition={summaryPosition} center zIndexRange={[14, 0]} style={{ pointerEvents: "none" }}>
        <Tag tone="fact">
          {d.result.imageDistance === null ? "At F: outgoing rays are parallel" : `${o.elements.find((e) => e.id === o.object?.target)?.kind.includes("concave_mirror") || o.elements.find((e) => e.id === o.object?.target)?.kind === "convex_mirror" ? "Paraxial image ≈ " : "Image "}${Math.abs(d.result.imageDistance).toFixed(2)} m · ${Math.abs(d.result.magnification!).toFixed(2)}× · ${d.result.description}`}
        </Tag>
      </Html>
    </>
  );
}

export function OpticsModule() {
  const o = useSim((s) => s.modules.optics);
  if (!o) return null;
  const tr = opticsTrace(o);
  const beam = o.source.kind !== "off" ? dirOf(o.source.angleDeg) : null;
  return (
    <>
      <group position={[OPTICS_TABLE.center[0], TOP, OPTICS_TABLE.center[2]]}>
        {o.elements.map((e) => (
          <Element key={e.id} e={e} />
        ))}
        <SourceModel o={o} p={tr.source} />
        <Beams o={o} />
        {o.normals && <Angles o={o} />}
        <FocalPoints o={o} />
        <ImageDiagram o={o} />
        {beam && o.medium === "water" && (
          <Html position={[0, 0.6, -1.7]} center zIndexRange={[13, 0]} style={{ pointerEvents: "none" }}>
        <Tag>Immersed in water · ideal lens focal lengths stay as set</Tag>
          </Html>
        )}
      </group>
      {o.mixing && <OpticsMixing m={o.mixing} />}
    </>
  );
}
