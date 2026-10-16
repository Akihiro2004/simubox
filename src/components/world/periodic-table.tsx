"use client";

import { RoundedBox } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import { useSim } from "@/lib/store";
import { execNow } from "@/lib/player";
import { EMPTY_TABLE, PERIODIC_ELEMENTS, TABLE_SIZE, elementPoint, tableSelection, type PeriodicTableState } from "@/lib/periodic-table";

const COLORS = { s: "#f3c9a6", p: "#b4dbce", d: "#c1d6ed", f: "#d8c7e6" };

function paintTable(ctx: CanvasRenderingContext2D, state: PeriodicTableState) {
  const s = TABLE_SIZE;
  const selected = tableSelection(state);
  const text = (value: string, x: number, y: number, size: number, color = "#203d46", weight = 400, max?: number) => {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    ctx.fillText(value, x, y, max);
  };
  ctx.fillStyle = "#fbfaf5";
  ctx.fillRect(0, 0, s.width, s.height);
  ctx.fillStyle = "#143b40";
  ctx.fillRect(0, 0, s.width, 12);
  text("THE PERIODIC TABLE", 72, 92, 60, "#143b40", 700);
  text("118 ELEMENTS  /  AN ATLAS OF MATTER", 76, 137, 23, "#657879", 600);
  text(state.caption || "Select an element · Ask Simu to explain a pattern", 76, 183, 27, "#326b69", 500, 2200);
  ctx.textAlign = "center";
  for (let g = 1; g <= 18; g++) text(String(g), s.left + (g - 1) * s.step + s.cell / 2, 218, 22, "#5d7475", 600);
  for (let p = 1; p <= 7; p++) text(String(p), 38, s.top + (p - 1) * s.step + 64, 22, "#5d7475", 600);
  for (const e of PERIODIC_ELEMENTS) {
    const [u, v] = elementPoint(e.number);
    const x = u * s.width - s.cell / 2, y = v * s.height - s.cell / 2;
    const block = e.series ? "f" : e.group! <= 2 || e.number === 2 ? "s" : e.group! >= 13 ? "p" : "d";
    ctx.globalAlpha = selected.size && !selected.has(e.number) ? .38 : 1;
    ctx.fillStyle = COLORS[block];
    ctx.beginPath();
    ctx.roundRect(x, y, s.cell, s.cell, 7);
    ctx.fill();
    text(String(e.number), x + 17, y + 23, 19, "#39545a", 500);
    text(e.symbol, x + s.cell / 2, y + 64, 42, "#173a43", 700);
    text(e.name, x + s.cell / 2, y + 86, 14, "#294f56", 500, 110);
    text(e.weight, x + s.cell / 2, y + 108, 16, "#39545a", 400);
    if (selected.has(e.number)) {
      ctx.strokeStyle = "#c05a29";
      ctx.lineWidth = 5;
      ctx.strokeRect(x + 2, y + 2, s.cell - 4, s.cell - 4);
    }
    ctx.globalAlpha = 1;
  }
  for (const [row, label, range] of [[5, "Lanthanoids", "57–71"], [6, "Actinoids", "89–103"]] as const) {
    const x = s.left + s.step * 2 + s.cell / 2, y = s.top + s.step * row;
    text(range, x, y + 55, 24, "#715c87", 600);
    text("↓", x, y + 92, 28, "#715c87");
    ctx.textAlign = "right";
    text(label, s.left + s.step * 3 - 28, s.top + s.step * (row + 2) + 115, 23, "#715c87", 600);
    ctx.textAlign = "center";
  }
  // The central gap is a quiet teaching area; ink can be placed here by the AI.
  ctx.textAlign = "left";
  for (const [i, [block, color]] of Object.entries(COLORS).entries()) {
    const x = 440 + i * 245;
    ctx.fillStyle = color;
    ctx.fillRect(x, 557, 25, 25);
    text(`${block.toUpperCase()} REGION`, x + 37, 577, 21, "#50696a", 600);
  }
  text("Each tile: atomic number · symbol · name · abridged atomic weight", 440, 525, 20, "#748583");
  text("IUPAC · 4 MAY 2022     |     [n] = isotope mass number; weights shown without uncertainties", 72, 1480, 18, "#657879");

  const anchor = (at: number | [number, number]) => {
    const [x, y] = typeof at === "number" ? elementPoint(at) : at;
    return [x * s.width, y * s.height] as const;
  };
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const mark of state.marks) {
    ctx.strokeStyle = ctx.fillStyle = mark.color ?? "#bf432f";
    ctx.lineWidth = 7;
    ctx.beginPath();
    if (mark.kind === "arrow") {
      const [x, y] = anchor(mark.from), [tx, ty] = anchor(mark.to);
      const a = Math.atan2(ty - y, tx - x);
      ctx.moveTo(x, y); ctx.lineTo(tx, ty);
      ctx.moveTo(tx - 24 * Math.cos(a - .45), ty - 24 * Math.sin(a - .45));
      ctx.lineTo(tx, ty);
      ctx.lineTo(tx - 24 * Math.cos(a + .45), ty - 24 * Math.sin(a + .45));
    } else if (mark.kind === "circle") {
      const [x, y] = anchor(mark.at);
      const r = mark.radius ? mark.radius * s.width : 66;
      ctx.ellipse(x, y, r, mark.radius ? r : 60, 0, 0, Math.PI * 2);
    } else if (mark.kind === "line") {
      mark.points.forEach((p, i) => { const [x, y] = anchor(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    } else {
      const [x, y] = anchor(mark.at);
      // White backing makes writing legible even over a colored element.
      ctx.font = "600 32px Arial, sans-serif";
      const width = Math.min(ctx.measureText(mark.text).width, s.width - x - 12);
      ctx.fillStyle = "#fbfaf5ee";
      ctx.fillRect(x - 5, y - 33, width + 10, 43);
      text(mark.text, x, y, 32, mark.color ?? "#bf432f", 600, Math.max(1, width));
    }
    ctx.stroke();
  }
}

export function PeriodicTable({ x }: { x: number }) {
  const state = useSim((s) => s.modules.periodicTable) ?? EMPTY_TABLE;
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = TABLE_SIZE.width; canvas.height = TABLE_SIZE.height;
    paintTable(canvas.getContext("2d")!, state);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [state]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group position={[x, 2.2, .15]}>
      <RoundedBox args={[3.54, 2.24, .07]} radius={.035}>
        <meshStandardMaterial color="#345c5b" roughness={.5} metalness={.25} />
      </RoundedBox>
      <mesh position={[0, 0, .04]} onClick={(e) => {
        e.stopPropagation();
        if (!e.uv) { execNow({ op: "show_periodic_table" }); return; }
        const u = e.uv.x, v = 1 - e.uv.y;
        const hit = PERIODIC_ELEMENTS.find((el) => {
          const [x, y] = elementPoint(el.number);
          return Math.abs(u - x) < TABLE_SIZE.cell / TABLE_SIZE.width / 2 && Math.abs(v - y) < TABLE_SIZE.cell / TABLE_SIZE.height / 2;
        });
        if (hit) {
          const family = hit.group ? `Group ${hit.group}` : hit.series;
          execNow({ op: "show_periodic_table", elements: [hit.number], groups: [], periods: [], caption: `${hit.number} · ${hit.name} (${hit.symbol}) · Period ${hit.period} · ${family}` });
        } else execNow({ op: "show_periodic_table" });
      }}>
        <planeGeometry args={[3.44, 2.15]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}
