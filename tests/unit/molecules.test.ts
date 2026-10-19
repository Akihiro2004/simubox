import { describe, expect, it } from "vitest";
import { MOLECULES, MOLECULE_IDS, bondLength, measureAngle, molarMass } from "@/lib/engine/chemistry";
import { parseRecord } from "@/lib/server/pubchem";

describe("molecule library", () => {
  it("every bond has a real covalent length (0.7–2.2 Å) and atoms never overlap", () => {
    for (const id of MOLECULE_IDS) {
      const m = MOLECULES[id];
      for (const b of m.bonds) {
        const r = bondLength(m, b);
        expect(r, `${id} bond ${b.a}-${b.b}`).toBeGreaterThan(0.7);
        expect(r, `${id} bond ${b.a}-${b.b}`).toBeLessThan(2.2);
      }
      for (let i = 0; i < m.atoms.length; i++) for (let j = i + 1; j < m.atoms.length; j++) {
        const [a, c] = [m.atoms[i].pos, m.atoms[j].pos];
        expect(Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]), `${id} atoms ${i},${j}`).toBeGreaterThan(0.6);
      }
    }
  });

  it("annotated angles match the drawn geometry", () => {
    for (const id of MOLECULE_IDS) for (const a of MOLECULES[id].angles) expect(Math.abs(measureAngle(MOLECULES[id], a.atoms) - a.deg), id).toBeLessThan(3);
  });

  it("molar masses follow standard atomic weights", () => {
    expect(molarMass(MOLECULES.H2O)).toBeCloseTo(18.02, 1);
    expect(molarMass(MOLECULES.glucose)).toBeCloseTo(180.16, 1);
    expect(molarMass(MOLECULES.caffeine)).toBeCloseTo(194.19, 1);
  });

  it("benzene is flat and all six C–C bonds are equal", () => {
    const m = MOLECULES.benzene;
    const cc = m.bonds.filter((b) => m.atoms[b.a].el === "C" && m.atoms[b.b].el === "C").map((b) => bondLength(m, b));
    expect(cc).toHaveLength(6);
    for (const r of cc) expect(Math.abs(r - 1.39)).toBeLessThan(0.02);
  });
});

describe("PubChem 3D records", () => {
  it("parses atoms, bonds and coordinates (water, CID 962)", () => {
    const m = parseRecord(
      { id: { id: { cid: 962 } }, atoms: { aid: [1, 2, 3], element: [8, 1, 1] }, bonds: { aid1: [1, 1], aid2: [2, 3], order: [1, 1] }, coords: [{ aid: [1, 2, 3], conformers: [{ x: [0, 0.2774, 0.6068], y: [0, 0.8929, -0.2383], z: [0, 0.2544, -0.7169] }] }] },
      { Title: "Water", MolecularFormula: "H2O", MolecularWeight: "18.015" },
    );
    expect(m.id).toBe("cid:962");
    expect(m.formula).toBe("H₂O");
    expect(m.atoms.map((a) => a.el)).toEqual(["O", "H", "H"]);
    expect(measureAngle(m, [1, 0, 2])).toBeGreaterThan(100);
    expect(bondLength(m, m.bonds[0])).toBeCloseTo(0.97, 1);
  });
});
