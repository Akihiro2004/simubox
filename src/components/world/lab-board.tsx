"use client";

import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import type { Vec3 } from "@/lib/world/catalog";

type BoardLine = { text: string; color?: string; size?: number };

/** Real scene text, with no extra React roots or per-frame DOM layout. */
export function LabBoard({ lines, position, width, height, background = "#355960" }: {
  lines: BoardLine[]; position: Vec3; width: number; height: number; background?: string;
}) {
  // Callers often construct the lines inline. Rebuild a GPU texture only when
  // its actual contents change, rather than on unrelated world/UI updates.
  const content = JSON.stringify(lines);
  const texture = useMemo(() => {
    const boardLines: BoardLine[] = JSON.parse(content);
    const canvas = document.createElement("canvas");
    canvas.width = 1536; canvas.height = Math.round(1536 * height / width);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const layout = (scale: number, paint: boolean) => {
      let y = 30;
      for (const line of boardLines) {
        const size = (line.size ?? 30) * scale;
        ctx.font = `700 ${size}px system-ui, sans-serif`;
        ctx.fillStyle = line.color ?? "#e3eee8";
        let row = "";
        for (const word of line.text.split(" ")) {
          const next = row ? `${row} ${word}` : word;
          if (row && ctx.measureText(next).width > canvas.width - 88) { if (paint) ctx.fillText(row, 44, y + size); y += size * 1.25; row = word; }
          else row = next;
        }
        if (paint) ctx.fillText(row, 44, y + size);
        y += size * 1.35 + 10;
      }
      return y;
    };
    let scale = 1;
    for (let i = 0; i < 16 && layout(scale, false) > canvas.height - 15; i++) scale *= .9;
    layout(scale, true);
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace;
    return map;
  }, [content, width, height, background]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={position}><planeGeometry args={[width, height]} /><meshBasicMaterial map={texture} toneMapped={false} /></mesh>;
}
