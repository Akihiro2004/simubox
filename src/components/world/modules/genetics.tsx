"use client";

import { RoundedBox } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { CanvasTexture, Color, Object3D, SRGBColorSpace, type InstancedMesh } from "three";
import { Html } from "@/components/world/html";
import { useSim } from "@/lib/store";
import { chiSquare, phenotype, punnett, ratio, sampleOffspring, type Punnett } from "@/lib/engine/genetics";

// A Punnett square built as an object: a framed board on an easel behind the lab
// pedestal, one raised tile per offspring with a pea on it showing how that
// offspring looks, and the parents' gametes as tokens along the edges. The grown
// crop lies on the pedestal top (y ≈ 0.8).
const TOP = 0.8;
const YELLOW = new Color("#facc15"), GREEN = new Color("#65a30d");
/** Wrinkled seeds look duller than smooth ones. */
const DULL = 0.72;
/** χ² critical values at p = 0.05 for 1, 2 and 3 degrees of freedom. */
const CHI_05 = [3.84, 5.99, 7.81];
const CELL = 0.34, GAP = 0.03, TITLE = 0.3, MARGIN = 0.16;
const BOARD_Z = -0.75, BOARD_BOTTOM = 1.45;
const WOOD = "#9a6b3f", PANEL = "#2f5157";

const peaColor = (ph: string) => {
  const c = (ph.includes("green") ? GREEN : YELLOW).clone();
  return ph.includes("wrinkled") ? c.multiplyScalar(DULL) : c;
};
const tileColor = (ph: string) => (ph.includes("green") ? "#d9f99d" : "#fef3c7");

/** Transparent overlay with the title, gamete letters and each tile's genotype. */
function drawLabels(p: Punnett, title: string, w: number, h: number, n: number): CanvasTexture {
  const PX = 1024, PY = Math.round((PX * h) / w), s = PX / w;
  const c = document.createElement("canvas");
  c.width = PX; c.height = PY;
  const g = c.getContext("2d")!;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#e3f2ec"; g.font = `700 ${Math.round(0.11 * s)}px system-ui, sans-serif`;
  g.fillText(title, PX / 2, (MARGIN * 0.6 + TITLE / 2) * s);
  const x0 = (w - (n + 1) * CELL) / 2, y0 = MARGIN + TITLE;
  const at = (col: number, row: number) => [(x0 + (col + 0.5) * CELL) * s, (y0 + (row + 0.5) * CELL) * s];
  g.fillStyle = "#3b2a12"; g.font = `800 ${Math.round(CELL * 0.36 * s)}px system-ui, sans-serif`;
  p.cols.forEach((gam, i) => { const [x, y] = at(i + 1, 0); g.fillText(gam, x, y); });
  p.rows.forEach((gam, i) => { const [x, y] = at(0, i + 1); g.fillText(gam, x, y); });
  g.fillStyle = "#1f2937";
  p.cells.forEach((row, r) => row.forEach((geno, k) => {
    const [x, y] = at(k + 1, r + 1);
    g.font = `800 ${Math.round(CELL * (geno.length > 2 ? 0.2 : 0.28) * s)}px system-ui, sans-serif`;
    g.fillText(geno, x - CELL * 0.08 * s, y - CELL * 0.12 * s);
  }));
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function PunnettBoard({ p, title }: { p: Punnett; title: string }) {
  const n = p.rows.length;
  const w = (n + 1) * CELL + 2 * MARGIN, h = (n + 1) * CELL + TITLE + 2 * MARGIN;
  const labels = useMemo(() => drawLabels(p, title, w, h, n), [p, title, w, h, n]);
  useEffect(() => () => labels.dispose(), [labels]);
  const x0 = -w / 2 + MARGIN, yTop = h / 2 - MARGIN - TITLE;
  const centre = (col: number, row: number): [number, number] => [x0 + (col + 0.5) * CELL, yTop - (row + 0.5) * CELL];
  const legH = BOARD_BOTTOM + 0.05;
  return (
    <group position={[0, BOARD_BOTTOM + h / 2, BOARD_Z]} rotation={[-0.08, 0, 0]}>
      {/* Wooden frame and dark panel */}
      <RoundedBox args={[w + 0.12, h + 0.12, 0.06]} radius={0.025} smoothness={3} position={[0, 0, -0.03]}>
        <meshStandardMaterial color={WOOD} roughness={0.7} />
      </RoundedBox>
      <mesh position={[0, 0, 0.002]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={PANEL} roughness={0.9} />
      </mesh>
      {/* Easel legs and a ledge */}
      {[-1, 1].map((k) => (
        <mesh key={k} position={[k * (w / 2 - 0.08), -h / 2 - legH / 2 + 0.1, -0.05]} rotation={[0.08, 0, k * -0.05]}>
          <boxGeometry args={[0.06, legH, 0.06]} />
          <meshStandardMaterial color={WOOD} roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, -h / 2 - 0.05, 0.06]}>
        <boxGeometry args={[w + 0.1, 0.04, 0.14]} />
        <meshStandardMaterial color={WOOD} roughness={0.7} />
      </mesh>
      {/* Gamete tokens from each parent */}
      {p.cols.map((_, i) => {
        const [x, y] = centre(i + 1, 0);
        return (
          <mesh key={`c${i}`} position={[x, y, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[CELL * 0.36, CELL * 0.36, 0.04, 32]} />
            <meshStandardMaterial color="#fde68a" roughness={0.5} />
          </mesh>
        );
      })}
      {p.rows.map((_, i) => {
        const [x, y] = centre(0, i + 1);
        return (
          <mesh key={`r${i}`} position={[x, y, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[CELL * 0.36, CELL * 0.36, 0.04, 32]} />
            <meshStandardMaterial color="#fde68a" roughness={0.5} />
          </mesh>
        );
      })}
      {/* One raised tile per offspring, with a pea showing how it looks */}
      {p.cells.map((row, r) => row.map((geno, k) => {
        const [x, y] = centre(k + 1, r + 1);
        const ph = phenotype(geno), wrinkled = ph.includes("wrinkled");
        return (
          <group key={`${r}-${k}`} position={[x, y, 0]}>
            <RoundedBox args={[CELL - GAP, CELL - GAP, 0.05]} radius={0.02} smoothness={2} position={[0, 0, 0.025]}>
              <meshStandardMaterial color={tileColor(ph)} roughness={0.6} />
            </RoundedBox>
            <mesh position={[CELL * 0.22, -CELL * 0.2, 0.08]} scale={wrinkled ? [1, 0.82, 0.6] : 1} rotation={[0, 0, wrinkled ? 0.5 : 0]}>
              <sphereGeometry args={[CELL * 0.14, 18, 12]} />
              <meshStandardMaterial color={peaColor(ph)} roughness={wrinkled ? 0.85 : 0.35} />
            </mesh>
          </group>
        );
      }))}
      <mesh position={[0, 0, 0.056]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={labels} transparent toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function GeneticsModule() {
  const g = useSim((s) => s.modules.genetics);
  const result = useMemo(() => {
    if (!g) return null;
    try {
      const p = punnett(g.parent1, g.parent2);
      // Grouped by look so the crop is easy to count.
      const kids = sampleOffspring(g.parent1, g.parent2, g.offspring, g.seed);
      const order = p.phenotypes.map((x) => x.phenotype);
      kids.sort((a, b) => order.indexOf(phenotype(a)) - order.indexOf(phenotype(b)));
      return { p, kids, error: null as string | null };
    } catch (e) {
      return { p: null, kids: [] as string[], error: e instanceof Error ? e.message : "Can't cross those" };
    }
  }, [g]);
  const kids = useMemo(() => result?.kids ?? [], [result]);
  const mesh = useRef<InstancedMesh>(null);

  // Peas in a square patch: yellow or green; wrinkled ones flattened, dimpled and duller.
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m || !kids.length) return;
    const side = Math.ceil(Math.sqrt(kids.length)), gap = Math.min(0.09, 1.3 / side), o = new Object3D();
    kids.forEach((k, i) => {
      const ph = phenotype(k);
      const wrinkled = ph.includes("wrinkled");
      o.position.set((i % side - (side - 1) / 2) * gap, TOP + gap * 0.4, (Math.floor(i / side) - (side - 1) / 2) * gap);
      o.scale.set(1, wrinkled ? 0.6 : 1, wrinkled ? 0.82 : 1);
      o.rotation.set(0, i * 1.7, wrinkled ? 0.4 : 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, peaColor(ph));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [kids]);

  if (!g || !result) return null;
  const { p, error } = result;
  const counts = p ? p.phenotypes.map((x) => `${kids.filter((k) => phenotype(k) === x.phenotype).length} ${x.phenotype}`).join(", ") : "";
  const df = p ? p.phenotypes.length - 1 : 0;
  const fits = p && kids.length && df > 0 ? chiSquare(p, kids) < CHI_05[df - 1] : true;
  return (
    <group>
      {p && <PunnettBoard p={p} title={`${g.parent1} × ${g.parent2}`} />}
      {kids.length > 0 && (
        <instancedMesh key={kids.length} ref={mesh} args={[undefined, undefined, kids.length]}>
          <sphereGeometry args={[Math.min(0.04, 0.55 / Math.ceil(Math.sqrt(kids.length))), 10, 8]} />
          <meshStandardMaterial roughness={0.5} />
        </instancedMesh>
      )}
      <Html position={[-1.45, TOP + 0.35, 0.35]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <div className="tag flex max-w-[360px] flex-col items-center gap-0.5 px-3.5 py-2 text-center leading-tight !whitespace-normal" role="status">
          {p ? (
            <>
              <span className="text-[14px] font-extrabold">{kids.length} peas grown: {counts}</span>
              <span className="text-[12px] font-semibold text-ink-2">
                Traits {ratio(p.phenotypes.map((x) => x.count))}: {p.phenotypes.map((x) => x.phenotype).join(" : ")}
              </span>
              <span className="text-[12px] font-semibold text-ink-3">
                Genotypes {ratio(p.genotypes.map((x) => x.count))}: {p.genotypes.map((x) => x.genotype).join(" : ")}
              </span>
              <span className="text-[11px] font-semibold text-ink-3">
                Chance makes real counts wobble around the ratio{df > 0 ? (fits ? "; this crop fits it." : "; this crop is an unusually big wobble.") : "."} Mendel counted 5,474 round : 1,850 wrinkled.
              </span>
            </>
          ) : (
            <span className="text-[13px] font-bold">{error}</span>
          )}
        </div>
      </Html>
    </group>
  );
}
