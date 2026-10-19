import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { cellLayout } from "@/lib/world/cell-layout";
import { CELL_SCALE } from "@/lib/engine/biology";

const pos = (m: { elements: number[] }) => new Vector3(m.elements[12], m.elements[13], m.elements[14]);

describe("cell models (real proportions)", () => {
  it("animal: every mitochondrion is inside the membrane and outside the nucleus", () => {
    const L = cellLayout("animal");
    const [a, b, c] = CELL_SCALE.animal.size.map((x) => x / 2);
    expect(L.mito.length).toBeGreaterThan(CELL_SCALE.animal.mitochondria.shown * 0.9);
    for (const m of L.mito) {
      const p = pos(m);
      expect((p.x / a) ** 2 + (p.y / b) ** 2 + (p.z / c) ** 2).toBeLessThan(1);
      expect(p.distanceTo(new Vector3(...L.nucleus!.at))).toBeGreaterThan(L.nucleus!.r);
    }
    // The nucleus is a real share of the cell: 8 µm in a ~20 µm cell.
    expect(L.nucleus!.r * 2 / CELL_SCALE.animal.size[0]).toBeGreaterThan(0.3);
  });

  it("plant: chloroplasts line the walls (inside the cell, outside the central vacuole) without overlapping", () => {
    const L = cellLayout("plant");
    const h = CELL_SCALE.plant.size.map((x) => x / 2);
    expect(L.chloro.length).toBeGreaterThanOrEqual(50);
    const ps = L.chloro.map(pos);
    for (const p of ps) {
      expect(Math.abs(p.x) < h[0] && Math.abs(p.y) < h[1] && Math.abs(p.z) < h[2]).toBe(true);
      // Within 3 µm of a wall: in the thin cytoplasm layer around the vacuole.
      expect(Math.min(h[0] - Math.abs(p.x), h[1] - Math.abs(p.y), h[2] - Math.abs(p.z))).toBeLessThan(3);
    }
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) expect(ps[i].distanceTo(ps[j])).toBeGreaterThan(5);
  });

  it("bacterium: ribosomes stay inside the 2 µm rod and flagella are about 6 µm long", () => {
    const L = cellLayout("bacteria");
    const [len, dia] = CELL_SCALE.bacteria.size;
    for (let i = 0; i < L.ribo.length; i += 3) {
      const x = Math.max(Math.abs(L.ribo[i]) - (len - dia) / 2, 0);
      expect(x * x + L.ribo[i + 1] ** 2 + L.ribo[i + 2] ** 2).toBeLessThan((dia / 2) ** 2);
    }
    for (const f of L.flagella) expect(Math.abs(f[f.length - 1].x - f[0].x)).toBeCloseTo(CELL_SCALE.bacteria.flagellum, 0);
  });

  it("layouts are deterministic", () => {
    expect(cellLayout("plant").chloro.map((m) => m.elements[12])).toEqual(cellLayout("plant").chloro.map((m) => m.elements[12]));
  });
});

describe("every cell type", () => {
  it("builds, and every listed part is drawn and labelled", async () => {
    const { CELL_KINDS, CELL_PARTS } = await import("@/lib/engine/biology");
    for (const kind of CELL_KINDS) {
      const L = cellLayout(kind);
      expect(L.span, kind).toBeGreaterThan(0);
      if (!L.shapes) continue; // the three typical cells draw their parts directly (tested above)
      const drawn = new Set(L.shapes.map((s) => s.id));
      if (L.golgi.length) drawn.add("golgi");
      for (const part of CELL_PARTS[kind]) {
        expect(drawn.has(part), `${kind} draws ${part}`).toBe(true);
        expect(L.labels[part], `${kind} labels ${part}`).toBeDefined();
      }
    }
  });

  it("red blood cell follows the measured biconcave shape: 0.81 µm in the middle, ~2.6 µm at the rim, 7.82 µm across", () => {
    const rbc = cellLayout("red_blood_cell").shapes!.find((s) => s.kind === "lathe")!;
    if (rbc.kind !== "lathe") throw new Error();
    const top = rbc.profile.slice(0, 33);
    expect(top[0][1] * 2).toBeCloseTo(0.81, 2);
    expect(Math.max(...top.map(([, h]) => h * 2))).toBeCloseTo(2.58, 1);
    expect(top[32][0] * 2).toBeCloseTo(7.82, 2);
  });
});
