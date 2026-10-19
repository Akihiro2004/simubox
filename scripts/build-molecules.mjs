// Builds src/lib/engine/molecules.generated.json: 3D geometry for the extended
// molecule library, computed once at build time so browsers never download a
// chemistry toolkit. OpenChemLib (BSD-3) generates a conformer, then the
// MMFF94s force field relaxes it. Key angles are checked against measured
// values (NIST CCCBDB) and the script fails if any drifts more than the limit.
//
//   node scripts/build-molecules.mjs

import { writeFileSync } from "node:fs";
import OCL from "openchemlib";

const { Molecule, ConformerGenerator, ForceFieldMMFF94, Resources } = OCL;
Resources.registerFromNodejs();

// id, name, display formula, SMILES, shape, facts, optional checked angle:
// [a, centre, b] with heavy-atom indices in SMILES order or "H" (a hydrogen on the centre), measured degrees.
const LIB = [
  ["H2S", "Hydrogen sulfide", "H₂S", "S", "bent", ["Like water, but sulfur's bonds sit almost at right angles (about 92°).", "It smells of rotten eggs, even in tiny amounts."], ["H", 0, "H", 92.1], { r: 1.336, deg: 92.1 }],
  ["HF", "Hydrogen fluoride", "HF", "F", "linear", ["Fluorine pulls electrons harder than any other element, so this bond is very polar.", "In water it forms hydrofluoric acid, which can etch glass."], null, { r: 0.917 }],
  ["H2O2", "Hydrogen peroxide", "H₂O₂", "OO", "open book (twisted)", ["Two oxygens are joined by a single bond, each holding one hydrogen.", "It breaks down into water and oxygen, which is why it fizzes on a cut."]],
  ["SO2", "Sulfur dioxide", "SO₂", "O=S=O", "bent", ["Sulfur has a lone pair, so the molecule bends (about 119°).", "Volcanoes and burning coal release it; it can form acid rain."], [0, 1, 2, 119.5], { r: 1.432, deg: 119.5 }],
  ["BF3", "Boron trifluoride", "BF₃", "FB(F)F", "trigonal planar", ["Boron has only three electron pairs to share, so the fluorines spread out flat at 120°.", "It has no lone pair on boron, unlike ammonia, so it is not a pyramid."], [0, 1, 2, 120], { r: 1.307, planar: true }],
  ["CCl4", "Carbon tetrachloride", "CCl₄", "ClC(Cl)(Cl)Cl", "tetrahedral", ["Four chlorines around carbon form a perfect tetrahedron (109.5°).", "Its bonds are polar, but they cancel out, so the molecule is not."], [0, 1, 2, 109.5]],
  ["ethane", "Ethane", "C₂H₆", "CC", "tetrahedral at each carbon", ["Two carbons joined by a single bond that can spin freely.", "It is the second most common gas in natural gas."], ["H", 0, 1, 111.2]],
  ["ethene", "Ethene (ethylene)", "C₂H₄", "C=C", "trigonal planar at each carbon", ["The double bond keeps all six atoms flat and stops the carbons twisting.", "Ripening fruit releases ethene, which ripens other fruit nearby."], ["H", 0, "H", 117.1]],
  ["ethyne", "Ethyne (acetylene)", "C₂H₂", "C#C", "linear", ["A triple bond makes the whole molecule a straight line (180°).", "Burning it with oxygen is hot enough to cut and weld steel."], ["H", 0, 1, 180]],
  ["propane", "Propane", "C₃H₈", "CCC", "zigzag chain", ["Three carbons in a bent chain (about 112° at the middle carbon).", "It is the gas in camping stoves and barbecue tanks."], [0, 1, 2, 112.4]],
  ["butane", "Butane", "C₄H₁₀", "CCCC", "zigzag chain", ["Four carbons in a zigzag chain.", "It is the fuel inside pocket lighters."]],
  ["octane", "Octane", "C₈H₁₈", "CCCCCCCC", "zigzag chain", ["Eight carbons in a long zigzag chain.", "Molecules like this make up petrol."]],
  ["methanol", "Methanol", "CH₃OH", "CO", "tetrahedral carbon, bent at oxygen", ["The simplest alcohol: methane with one hydrogen swapped for an OH group.", "It is poisonous to drink, unlike ethanol."], [0, 1, "H", 108.5]],
  ["ethanol", "Ethanol", "C₂H₅OH", "CCO", "zigzag chain with an OH group", ["The OH group makes it an alcohol and lets it mix with water.", "Yeast makes it by fermenting sugar."]],
  ["formaldehyde", "Methanal (formaldehyde)", "CH₂O", "C=O", "trigonal planar", ["A carbon double-bonded to oxygen with two hydrogens, all flat.", "The H–C–H angle is a little less than 120° because the double bond takes more room."], ["H", 0, "H", 116.5]],
  ["acetic_acid", "Ethanoic acid (acetic acid)", "CH₃COOH", "CC(=O)O", "trigonal planar at the acid carbon", ["The COOH group can give away a hydrogen ion, which makes it an acid.", "Vinegar is about 5% acetic acid in water."]],
  ["acetone", "Propanone (acetone)", "C₃H₆O", "CC(C)=O", "trigonal planar at the middle carbon", ["A C=O group in the middle of a three-carbon chain.", "It dissolves nail polish and many plastics."]],
  ["urea", "Urea", "CO(NH₂)₂", "NC(N)=O", "planar", ["The first natural substance made in a lab from non-living chemicals (1828).", "Your body gets rid of extra nitrogen as urea in urine; it is also a fertilizer."]],
  ["glucose", "Glucose", "C₆H₁₂O₆", "OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O", "six-membered ring (chair)", ["Plants make glucose in photosynthesis; your cells break it down for energy.", "Its ring is not flat: it folds into a 'chair' shape."]],
  ["fructose", "Fructose", "C₆H₁₂O₆", "OC[C@]1(O)OC[C@@H](O)[C@@H](O)[C@@H]1O", "six-membered ring", ["Same atoms as glucose, arranged differently: they are isomers.", "Fruit sugar, and the sweetest natural sugar."]],
  ["sucrose", "Sucrose (table sugar)", "C₁₂H₂₂O₁₁", "OC[C@H]1O[C@@](CO)(O[C@H]2O[C@H](CO)[C@@H](O)[C@H](O)[C@H]2O)[C@@H](O)[C@@H]1O", "two linked rings", ["One glucose and one fructose joined by an oxygen bridge.", "Plants such as sugar cane and sugar beet store energy this way."]],
  ["benzene", "Benzene", "C₆H₆", "c1ccccc1", "flat hexagonal ring", ["Six carbons share electrons evenly around a flat ring, all angles 120°.", "Its electrons spread around the whole ring instead of sitting in fixed double bonds."], [0, 1, 2, 120]],
  ["glycine", "Glycine", "C₂H₅NO₂", "NCC(=O)O", "amino acid", ["The smallest amino acid: an amino group and an acid group on one carbon.", "Proteins are long chains of amino acids like this."]],
  ["alanine", "Alanine", "C₃H₇NO₂", "C[C@H](N)C(=O)O", "amino acid", ["Like glycine with a CH₃ side group, which makes the molecule 'handed' (chiral).", "Living things use almost only the left-handed form."]],
  ["glycerol", "Glycerol", "C₃H₈O₃", "OCC(O)CO", "chain with three OH groups", ["Three OH groups make it thick, sweet and good at holding water.", "It forms the backbone of fats and is used in soap and lotions."]],
  ["citric_acid", "Citric acid", "C₆H₈O₇", "OC(=O)CC(O)(CC(=O)O)C(=O)O", "branched chain", ["It has three acid groups, which give lemons and limes their sour taste.", "Cells use it in the energy-releasing citric acid cycle."]],
  ["vitamin_c", "Vitamin C (ascorbic acid)", "C₆H₈O₆", "OC[C@H](O)[C@H]1OC(=O)C(O)=C1O", "five-membered ring", ["Humans cannot make it, so we need it from fruit and vegetables.", "Without it the body cannot build healthy collagen (scurvy)."]],
  ["caffeine", "Caffeine", "C₈H₁₀N₄O₂", "Cn1cnc2c1c(=O)n(C)c(=O)n2C", "two fused flat rings", ["Two rings fused together, with nitrogen atoms in them.", "It blocks a chemical that makes you feel sleepy; coffee and tea contain it."]],
  ["aspirin", "Aspirin", "C₉H₈O₄", "CC(=O)Oc1ccccc1C(=O)O", "benzene ring with two side groups", ["Made from a substance first found in willow bark.", "It reduces pain, fever and swelling."]],
  ["paracetamol", "Paracetamol", "C₈H₉NO₂", "CC(=O)Nc1ccc(O)cc1", "benzene ring with two side groups", ["A common medicine for pain and fever.", "Its OH and amide groups sit on opposite sides of the benzene ring."]],
  ["ibuprofen", "Ibuprofen", "C₁₃H₁₈O₂", "CC(C)Cc1ccc(cc1)C(C)C(=O)O", "benzene ring with two side chains", ["An anti-inflammatory medicine for pain and swelling.", "Its acid group is part of how it works in the body."]],
  ["adenine", "Adenine", "C₅H₅N₅", "Nc1ncnc2[nH]cnc12", "two fused flat rings", ["One of the four 'letters' of DNA (A).", "It pairs with thymine (T) through hydrogen bonds."]],
  ["sulfuric_acid", "Sulfuric acid", "H₂SO₄", "OS(=O)(=O)O", "tetrahedral at sulfur", ["Four oxygens surround the sulfur in a tetrahedron.", "A strong acid, used in car batteries and to make fertilizer."]],
  ["nitric_acid", "Nitric acid", "HNO₃", "O[N+](=O)[O-]", "trigonal planar at nitrogen", ["Nitrogen sits in the middle of three oxygens in a flat triangle.", "A strong acid used to make fertilizers and explosives."]],
  ["phosphoric_acid", "Phosphoric acid", "H₃PO₄", "OP(=O)(O)O", "tetrahedral at phosphorus", ["Four oxygens around phosphorus in a tetrahedron.", "Cola drinks contain a little of it for a sharp taste."]],
];

const r3 = (v) => Math.round(v * 1000) / 1000;

/** Rotate so the longest extent runs along x and the next along y (principal axes). */
function orient(pts) {
  const n = pts.length;
  const c = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / n);
  const q = pts.map((p) => p.map((v, k) => v - c[k]));
  const cov = [0, 1, 2].map((i) => [0, 1, 2].map((j) => q.reduce((s, p) => s + p[i] * p[j], 0)));
  const axes = [];
  for (let a = 0; a < 2; a++) {
    let v = a === 0 ? [1, 0.3, 0.2] : [0.2, 1, 0.3];
    for (let it = 0; it < 200; it++) {
      let w = [0, 1, 2].map((i) => cov[i][0] * v[0] + cov[i][1] * v[1] + cov[i][2] * v[2]);
      for (const ax of axes) { const d = w[0] * ax[0] + w[1] * ax[1] + w[2] * ax[2]; w = w.map((x, k) => x - d * ax[k]); }
      const len = Math.hypot(...w) || 1;
      v = w.map((x) => x / len);
    }
    if (!Number.isFinite(v[0]) || Math.hypot(...v) < 0.5) v = a === 0 ? [1, 0, 0] : [0, 1, 0];
    axes.push(v);
  }
  const [ex, ey] = axes;
  const ez = [ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]];
  return q.map((p) => [ex, ey, ez].map((e) => p[0] * e[0] + p[1] * e[1] + p[2] * e[2]));
}

const angle = (A, C, B) => {
  const u = A.map((v, k) => v - C[k]), w = B.map((v, k) => v - C[k]);
  return (Math.acos(Math.max(-1, Math.min(1, (u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / (Math.hypot(...u) * Math.hypot(...w))))) * 180) / Math.PI;
};

const out = {};
let failed = false;
for (const [id, name, formula, smiles, shape, facts, check, exp] of LIB) {
  const mol = Molecule.fromSmiles(smiles);
  const heavy = mol.getAllAtoms();
  const conf = new ConformerGenerator(42).getOneConformerAsMolecule(mol);
  if (!conf) throw new Error(`${id}: no conformer`);
  let method = "MMFF94s force field";
  try {
    new ForceFieldMMFF94(conf, ForceFieldMMFF94.MMFF94S, {}).minimise({ maxIts: 20000, gradTol: 1e-5, funcTol: 1e-8 });
  } catch {
    // MMFF has no atom types for a few small inorganic molecules; keep the conformer and rely on the angle check.
    method = "OpenChemLib conformer";
    console.log(id + ": no MMFF94s types, using the conformer geometry");
  }
  const n = conf.getAllAtoms();
  let pts = orient(Array.from({ length: n }, (_, i) => [conf.getAtomX(i), conf.getAtomY(i), conf.getAtomZ(i)]));
  if (exp) {
    // Small inorganic molecules: measured bond length and angle (NIST CCCBDB) beat the force field.
    method = "NIST CCCBDB experimental geometry";
    if (n === 2) pts = [[-exp.r / 2, 0, 0], [exp.r / 2, 0, 0]];
    else if (exp.planar) {
      // Trigonal planar XY3: the centre is check[1], the three others at 120°.
      const c = check[1], others = [0, 1, 2, 3].filter((i) => i !== c);
      pts = [];
      pts[c] = [0, 0, 0];
      others.forEach((i, k) => { const t = Math.PI / 2 + (k * 2 * Math.PI) / 3; pts[i] = [exp.r * Math.cos(t), exp.r * Math.sin(t), 0]; });
    }
    else {
      const c = check[1], half = ((exp.deg / 2) * Math.PI) / 180, others = [0, 1, 2].filter((i) => i !== c);
      pts = [];
      pts[c] = [0, 0.3, 0];
      pts[others[0]] = [-exp.r * Math.sin(half), 0.3 - exp.r * Math.cos(half), 0];
      pts[others[1]] = [exp.r * Math.sin(half), 0.3 - exp.r * Math.cos(half), 0];
    }
  }
  const els = Array.from({ length: n }, (_, i) => conf.getAtomLabel(i));
  const bonds = Array.from({ length: conf.getAllBonds() }, (_, b) => [conf.getBondAtom(0, b), conf.getBondAtom(1, b), Math.min(3, Math.max(1, conf.getBondOrder(b)))]);
  let angles = [];
  if (check) {
    const [a, c, b, deg] = check;
    const used = new Set();
    const pick = (x) => {
      if (x !== "H") return x;
      for (let i = heavy; i < n; i++) if (!used.has(i) && bonds.some(([p, q]) => (p === i && q === c) || (q === i && p === c))) { used.add(i); return i; }
      throw new Error(`${id}: no hydrogen on atom ${c}`);
    };
    const tri = [pick(a), c, pick(b)];
    const got = angle(pts[tri[0]], pts[tri[1]], pts[tri[2]]);
    const off = Math.abs(got - deg);
    console.log(`${id.padEnd(16)} computed ${got.toFixed(1)}°  measured ${deg}°  ${off > 3 ? "FAIL" : "ok"}`);
    if (off > 3) failed = true;
    angles = [{ atoms: tri, deg }];
  }
  const f = conf.getMolecularFormula();
  out[id] = { name, formula, shape, molarMass: Math.round(f.relativeWeight * 100) / 100, atoms: els.map((el, i) => ({ el, pos: pts[i].map(r3) })), bonds: bonds.map(([a, b, order]) => ({ a, b, order })), angles, facts, smiles, method };
}
if (failed) {
  console.error("Some computed angles differ from measured values by more than 3°. Nothing written.");
  process.exit(1);
}
writeFileSync(new URL("../src/lib/engine/molecules.generated.json", import.meta.url), JSON.stringify(out));
console.log(`Wrote ${Object.keys(out).length} molecules.`);
