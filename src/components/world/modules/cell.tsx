"use client";

import { RoundedBox } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, CatmullRomCurve3, DoubleSide, LatheGeometry, TubeGeometry, Vector2, Vector3, type Matrix4, type InstancedMesh } from "three";
import { Html } from "@/components/world/html";
import { pickCellPart, useSim } from "@/lib/store";
import type { ThreeEvent } from "@react-three/fiber";
import { cellLayout, type Shape } from "@/lib/world/cell-layout";
import { CELL_NAMES, CELL_PARTS, CELL_SCALE, CELL_SUMMARY, ORGANELLES, type OrganelleId } from "@/lib/engine/biology";
import { Mat } from "../assets";

// The model is built in micrometres from CELL_SCALE, then scaled so its longest
// side is FIT metres on the lab pedestal (top at y ≈ 0.8). Everything repeated is
// one instanced mesh or one point cloud, and nothing runs per frame.
const TOP = 0.8;
const FIT = 3;
/** Tallest a model may stand above the pedestal (m). */
const FIT_HEIGHT = 2.4;
function Instances({ matrices, children, part, shell = false }: { matrices: Matrix4[]; children: React.ReactNode; part?: OrganelleId; shell?: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    matrices.forEach((x, i) => m.setMatrixAt(i, x));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [matrices]);
  if (!matrices.length) return null;
  return <instancedMesh ref={ref} args={[undefined, undefined, matrices.length]} userData={{ part, shell }}>{children}</instancedMesh>;
}

// Focus: the picked part glows; everything else fades to a ghost so it can be seen clearly.
const GHOST = 0.1;

export function CellModule() {
  const c = useSim((s) => s.modules.cell);
  const kind = c?.kind ?? "animal";
  const L = useMemo(() => cellLayout(kind), [kind]);
  const s = Math.min(FIT / L.span, FIT_HEIGHT / CELL_SCALE[kind].size[1]);
  // Sit just above the pedestal, whatever the cell's height.
  const half = (CELL_SCALE[kind].size[1] * s) / 2;
  // Frame each cell type when it appears: the model knows its own size and height on the pedestal.
  const frame = useRef<string | null>(null);
  useEffect(() => {
    if (!c || frame.current === kind) return;
    frame.current = kind;
    useSim.getState().focus({ target: [0, TOP + 0.1 + half, 0], distance: 1.2 + 1.35 * Math.max(L.span * s, half * 2) });
  }, [c, kind, half, L.span, s]);
  const ribo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(L.ribo, 3));
    return g;
  }, [L]);
  const tubes = useMemo(() => ({ dna: L.nucleoid ? new CatmullRomCurve3(L.nucleoid) : null, flag: L.flagella.map((p) => new CatmullRomCurve3(p)) }), [L]);
  // Tubes and lathes for the specialised cells are built once per cell type.
  const built = useMemo(() => (L.shapes ?? []).map((sh) => (sh.kind === "tube" ? new TubeGeometry(new CatmullRomCurve3(sh.pts.map((p) => new Vector3(...p))), sh.pts.length * 8, sh.r, 6) : sh.kind === "lathe" ? new LatheGeometry(sh.profile.map(([x, y]) => new Vector2(x, y)), 48) : null)), [L]);
  useEffect(() => () => built.forEach((g) => g?.dispose()), [built]);
  const pointsGeo = useMemo(() => (L.shapes ?? []).map((sh) => { if (sh.kind !== "points") return null; const g = new BufferGeometry(); g.setAttribute("position", new BufferAttribute(sh.pts, 3)); return g; }), [L]);
  if (!c) return null;
  const parts = new Set(CELL_PARTS[kind]);
  const lit = (id: OrganelleId) => c.highlight === id;
  const ghost = (id: OrganelleId) => !!c.highlight && c.highlight !== id;
  const look = (id: OrganelleId, o = 1) => ({ c: col(id), o: ghost(id) ? GHOST : o, ...(lit(id) ? { e: col(id), ei: 0.55 } : {}) });
  const col = (id: OrganelleId) => ORGANELLES[id].color;
  const S = CELL_SCALE[kind];
  const size = S.size as readonly number[];
  const shell = (id: OrganelleId, opacity: number) => ({ color: col(id), transparent: true, opacity: lit(id) ? Math.min(0.6, opacity * 2) : ghost(id) ? opacity * 0.3 : opacity, depthWrite: false, emissive: lit(id) ? col(id) : "#000000", emissiveIntensity: lit(id) ? 0.5 : 0 });
  const enlarged = "ribosomes" in S ? S.ribosomes.enlarged : 1;
  // Clicking the model picks the nearest solid part on the ray; see-through shells
  // (membranes, walls) only win when nothing solid was hit behind them.
  const tag = (part: OrganelleId, shell = false) => ({ userData: { part, shell } });
  const pickPart = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return; // that was an orbit drag, not a click
    const hits = e.intersections.map((h) => h.object.userData as { part?: OrganelleId; shell?: boolean }).filter((u) => u.part && parts.has(u.part));
    const hit = hits.find((u) => !u.shell) ?? hits[0];
    if (!hit?.part) return;
    e.stopPropagation();
    pickCellPart(c.highlight === hit.part ? null : hit.part);
  };
  const material = (sh: Shape) => (sh.kind !== "inst" && sh.kind !== "points" && sh.shell !== undefined ? <meshStandardMaterial {...shell(sh.id, sh.shell)} side={DoubleSide} /> : <Mat {...look(sh.id)} {...(sh.kind === "inst" && sh.color ? { c: sh.color } : {})} />);

  return (
    <group position={[0, TOP + 0.25 + half, 0]}>
      <group scale={s}>
        <group position={L.shift} onClick={pickPart} onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "")}>
          {/* Envelopes */}
          {kind === "animal" && parts.has("membrane") && (
            <mesh scale={[size[0] / 2, size[1] / 2, size[2] / 2]} {...tag("membrane", true)}>
              <sphereGeometry args={[1, 40, 28]} />
              <meshStandardMaterial {...shell("membrane", 0.24)} roughness={0.3} />
            </mesh>
          )}
          {kind === "plant" && (
            <>
              <mesh {...tag("wall", true)}>
                <boxGeometry args={[size[0] + 1, size[1] + 1, size[2] + 1]} />
                <meshStandardMaterial {...shell("wall", 0.2)} />
              </mesh>
              <mesh {...tag("membrane", true)}>
                <boxGeometry args={[size[0] - 0.2, size[1] - 0.2, size[2] - 0.2]} />
                <meshStandardMaterial {...shell("membrane", 0.1)} />
              </mesh>
              <RoundedBox args={[size[0] - 4, size[1] - 4, size[2] - 4]} radius={3} smoothness={3} {...tag("vacuole", true)}>
                <meshStandardMaterial {...shell("vacuole", 0.28)} />
              </RoundedBox>
            </>
          )}
          {kind === "bacteria" && (
            <>
              {(["capsule", "wall", "membrane"] as const).map((id, i) => (
                <mesh key={id} rotation={[0, 0, Math.PI / 2]} {...tag(id, true)}>
                  <capsuleGeometry args={[size[1] / 2 + [0.12, 0.02, 0][i], size[0] - size[1], 12, 28]} />
                  <meshStandardMaterial {...shell(id, [0.1, 0.22, 0.12][i])} />
                </mesh>
              ))}
            </>
          )}
          {/* Nucleus with its nucleolus, wrapped in rough ER sheets */}
          {L.nucleus && (
            <group position={L.nucleus.at}>
              <mesh {...tag("nucleus")}>
                <sphereGeometry args={[L.nucleus.r, 32, 24]} />
                <Mat {...look("nucleus", 0.85)} />
              </mesh>
              <mesh position={[L.nucleus.r * 0.2, L.nucleus.r * 0.15, L.nucleus.r * 0.25]} {...tag("nucleus")}>
                <sphereGeometry args={[L.nucleus.r * 0.3, 20, 14]} />
                <Mat c="#5b4bb5" o={ghost("nucleus") ? GHOST : 1} />
              </mesh>
            </group>
          )}
          {L.er && parts.has("er") && L.er.radii.map((r, i) => (
            <mesh key={i} position={L.er!.at} rotation={[0, i * 0.7, 0]} {...tag("er", true)}>
              <sphereGeometry args={[r, 28, 16, 0, Math.PI * 1.25, 0.5, 2.1]} />
              <meshStandardMaterial {...shell("er", 0.4)} side={DoubleSide} />
            </mesh>
          ))}
          {L.golgi.map((g, k) => (
            <group key={k} position={g.at} rotation={[0, k, 0.3 * k]}>
              {[0, 1, 2, 3, 4].map((i) => (
                <mesh key={i} position={[0, i * g.r * 0.16, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1 - i * 0.1, 1, 1]} {...tag("golgi")}>
                  <torusGeometry args={[g.r, g.r * 0.07, 6, 20, Math.PI]} />
                  <Mat {...look("golgi")} />
                </mesh>
              ))}
            </group>
          ))}
          {/* Repeated parts: one draw each */}
          <Instances matrices={L.mito} part="mitochondria">
            <capsuleGeometry args={kind === "plant" ? [0.3, 0.9, 2, 6] : [0.25, 1.5, 2, 6]} />
            <Mat {...look("mitochondria")} />
          </Instances>
          <Instances matrices={L.chloro} part="chloroplasts">
            <sphereGeometry args={[1, 12, 8]} />
            <Mat {...look("chloroplasts")} />
          </Instances>
          <Instances matrices={L.lyso} part="lysosomes">
            <sphereGeometry args={[0.35, 8, 6]} />
            <Mat {...look("lysosomes")} />
          </Instances>
          <Instances matrices={L.vac} part="vacuole">
            <sphereGeometry args={[0.7, 14, 10]} />
            <meshStandardMaterial {...shell("vacuole", 0.55)} />
          </Instances>
          {parts.has("ribosomes") && (
            <points geometry={ribo}>
              <pointsMaterial color={lit("ribosomes") ? "#0f172a" : col("ribosomes")} size={(kind === "bacteria" ? 0.02 : 0.025) * enlarged * s * (lit("ribosomes") ? 1.6 : 1)} sizeAttenuation transparent opacity={ghost("ribosomes") ? 0.15 : 1} depthWrite={!ghost("ribosomes")} />
            </points>
          )}
          {tubes.dna && (
            <mesh {...tag("nucleoid")}>
              <tubeGeometry args={[tubes.dna, 500, 0.012, 4, false]} />
              <Mat {...look("nucleoid")} />
            </mesh>
          )}
          {tubes.flag.map((curve, i) => (
            <mesh key={i} {...tag("flagellum")}>
              <tubeGeometry args={[curve, 160, 0.025, 4, false]} />
              <Mat {...look("flagellum")} />
            </mesh>
          ))}
          {L.shapes?.map((sh, i) => {
            const rot = "rot" in sh ? sh.rot : undefined;
            const t = tag(sh.id, sh.kind !== "inst" && sh.kind !== "points" && sh.shell !== undefined);
            switch (sh.kind) {
              case "ellipsoid": return <mesh key={i} {...t} position={sh.at} rotation={rot} scale={sh.r}><sphereGeometry args={[1, 32, 20]} />{material(sh)}</mesh>;
              case "capsule": return <mesh key={i} {...t} position={sh.at} rotation={rot}><capsuleGeometry args={[sh.r, sh.len, 8, 20]} />{material(sh)}</mesh>;
              case "cylinder": return <mesh key={i} {...t} position={sh.at} rotation={rot}><cylinderGeometry args={[sh.r, sh.r, sh.len, 24, 1, true]} />{material(sh)}</mesh>;
              case "box": return <mesh key={i} {...t} position={sh.at} rotation={rot}><boxGeometry args={sh.size} />{material(sh)}</mesh>;
              case "torus": return <mesh key={i} {...t} position={sh.at} rotation={rot} scale={sh.scale}><torusGeometry args={[sh.R, sh.r, 16, 48, sh.arc]} />{material(sh)}</mesh>;
              case "tube": return <mesh key={i} {...t} geometry={built[i]!}>{material(sh)}</mesh>;
              case "lathe": return <mesh key={i} {...t} geometry={built[i]!} position={sh.at} rotation={rot} scale={sh.scale ?? 1}>{material(sh)}</mesh>;
              case "inst": return (
                <Instances key={i} matrices={sh.matrices} part={sh.id}>
                  {sh.geo === "sphere" ? <sphereGeometry args={sh.args as [number, number, number]} /> : sh.geo === "capsule" ? <capsuleGeometry args={sh.args as [number, number, number, number]} /> : <cylinderGeometry args={sh.args as [number, number, number, number]} />}
                  {material(sh)}
                </Instances>
              );
              case "points": return <points key={i} geometry={pointsGeo[i]!}><pointsMaterial color={col(sh.id)} size={sh.size * s} sizeAttenuation transparent opacity={ghost(sh.id) ? 0.15 : 0.9} depthWrite={false} /></points>;
            }
          })}
          {/* Labels sit on the parts they name (the model doesn't spin, so they stay attached). */}
          {[...parts].filter((id) => L.labels[id]).map((id) => (
            <Html key={id} position={L.labels[id]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
              <div className={`tag tag-dot flex items-center gap-1.5 px-2.5 py-0.5 text-[12px] transition-opacity ${lit(id) ? "tag-fact" : ""}`} style={{ ["--dot" as string]: col(id), opacity: ghost(id) ? 0.3 : 1 }}>
                {ORGANELLES[id].name}
              </div>
            </Html>
          ))}
        </group>
        {/* Scale bar */}
        <group position={[0, L.barY, size[2] / 2]}>
          <mesh>
            <boxGeometry args={[S.bar, 0.06 * L.span / 22, 0.06 * L.span / 22]} />
            <meshBasicMaterial color="#0f172a" />
          </mesh>
          <Html position={[0, 0, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
            <div className="tag translate-y-4 px-2 py-0.5 text-[11px] font-bold">{S.bar} µm</div>
          </Html>
        </group>
      </group>
      {/* Pinned to the pedestal front (world y = TOP - 0.45), below every model. */}
      <Html position={[0, -half - 0.7, 0.9]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <div className="tag flex max-w-[320px] flex-col items-center rounded-[16px] px-3.5 py-1.5 text-center leading-tight !whitespace-normal">
          <span className="text-[15px] font-extrabold">{CELL_NAMES[kind]}</span>
          <span className="text-[12px] font-semibold text-ink-3">{CELL_SUMMARY[kind]}</span>
          <span className="text-[11px] font-semibold text-ink-3">{S.note}</span>
        </div>
      </Html>
    </group>
  );
}
