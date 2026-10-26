// Builds the Anatomy Lab body from BodyParts3D (DBCLS) meshes.
//
//   node scripts/build-anatomy.mjs <dir>
//
// <dir> holds the unzipped archives from
// https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/ :
//   raw/partof_BP3D_4.0_obj_99/*.obj, raw/isa_BP3D_4.0_obj_99/*.obj,
//   partof_element_parts.txt, isa_element_parts.txt
// Writes public/anatomy/body.bin (int16 positions + uint16 indices per
// structure) and src/lib/world/anatomy.generated.json (names, systems,
// offsets, bounds). Run once; both outputs are committed, so builds and
// deploys never download anything.
//
// Licence: BodyParts3D, © The Database Center for Life Science, licensed under
// CC Attribution 4.0 International (the 2011 mesh files say CC BY-SA 2.1 Japan).
// The derived mesh file carries the same terms; see /credits.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { MeshoptSimplifier } from "meshoptimizer";
import { MeshBasicMaterial } from "three";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node scripts/build-anatomy.mjs <BodyParts3D dir>");

// Each structure claims element meshes by concept name (regex) in one tree.
// The first structure to claim a mesh keeps it, so broad "rest of" groups go last.
// tris: triangle budget after simplification.
const S = (id, name, system, tree, match, tris, color, opts = {}) => ({ id, name, system, tree, match, tris, color, ...opts });
const STRUCTURES = [
  S("skin", "Skin", "skin", "partof", /^skin$/, 26000, "#e8b99c"),

  S("heart", "Heart", "cardiovascular", "partof", /^heart$/, 9000, "#c8393f"),
  S("aorta", "Aorta", "cardiovascular", "partof", /^aorta$/, 2500, "#d9473d"),

  S("trachea", "Trachea and bronchi", "respiratory", "partof", /^(trachea|tracheobronchial tree)$/, 4000, "#e9d4c2"),
  S("pulmonary_vessels", "Pulmonary blood vessels", "cardiovascular", "partof", /^pulmonary vascular system$/, 5000, "#6f6fd8"),
  S("lung_right", "Right lung", "respiratory", "envelope", null, 5000, "#e7a2a4"),
  S("lung_left", "Left lung", "respiratory", "envelope", null, 4500, "#e7a2a4"),
  S("diaphragm", "Diaphragm", "respiratory", "partof", /^diaphragm$/, 3000, "#b5574e"),

  S("brain", "Cerebrum", "nervous", "partof", /^(left|right) cerebral hemisphere$/, 12000, "#e3b8b0"),
  S("cerebellum", "Cerebellum", "nervous", "partof", /^cerebellum$/, 3500, "#d8a39a"),
  S("brainstem", "Brainstem", "nervous", "partof", /^brainstem$/, 1800, "#cf978d"),
  S("spinal_cord", "Spinal cord", "nervous", "partof", /^spinal cord$/, 1500, "#f0dc9a"),
  S("cranial_nerves", "Cranial nerves", "nervous", "isa", /^(cranial nerve|nerve)$/, 1500, "#f2d76b"),
  S("eyes", "Eyes", "nervous", "partof", /^(left|right) eyeball$/, 1800, "#f4f1ea"),

  S("esophagus", "Oesophagus", "digestive", "partof", /^esophagus$/, 1200, "#d98a7a"),
  S("stomach", "Stomach", "digestive", "partof", /^stomach$/, 2000, "#e09a83"),
  S("liver", "Liver", "digestive", "partof", /^liver$/, 5000, "#8f3b30"),
  S("gallbladder", "Gallbladder", "digestive", "partof", /^gallbladder$/, 600, "#6f9a4a"),
  S("pancreas", "Pancreas", "digestive", "partof", /^pancreas$/, 1500, "#e8c17c"),
  S("small_intestine", "Small intestine", "digestive", "partof", /^small intestine$/, 6000, "#e7a98c"),
  S("rectum", "Rectum", "digestive", "partof", /^rectum$/, 600, "#c07e63"),
  S("large_intestine", "Large intestine", "digestive", "partof", /^large intestine$/, 4500, "#c98a6b"),

  S("kidney_right", "Right kidney", "urinary", "partof", /^right kidney$/, 1200, "#9b4a3c"),
  S("kidney_left", "Left kidney", "urinary", "partof", /^left kidney$/, 1200, "#9b4a3c"),
  S("ureters", "Ureters", "urinary", "partof", /^(left|right) ureter$/, 600, "#d9c27c"),
  S("bladder", "Urinary bladder", "urinary", "partof", /^urinary bladder$/, 1000, "#e3c36a"),

  S("adrenals", "Adrenal glands", "endocrine", "partof", /^(left|right) adrenal gland$/, 600, "#d99a3a"),

  S("veins", "Veins", "cardiovascular", "partof", /^(systemic venous system|portal venous system)$/, 9000, "#3f63c6"),
  S("arteries", "Arteries", "cardiovascular", "partof", /^systemic arterial system$/, 14000, "#d9473d"),

  S("skull", "Skull", "skeletal", "partof", /^skull$/, 9000, "#efe6d2"),
  S("spine", "Spine (vertebral column)", "skeletal", "partof", /^(vertebral column|sacrum|coccyx)$/, 7000, "#ece2cc"),
  S("ribcage", "Rib cage", "skeletal", "partof", /^rib cage$/, 7000, "#efe5cf"),
  S("shoulder_bones", "Collarbones and shoulder blades", "skeletal", "partof", /^skeleton of (left|right) pectoral girdle$/, 3000, "#ece2cc"),
  S("arm_bones", "Arm bones (humerus, radius, ulna)", "skeletal", "isa", /^(left|right) (humerus|radius|ulna)$/, 3000, "#efe5cf"),
  S("hand_bones", "Hand bones", "skeletal", "partof", /^skeleton of (left|right) hand proper$/, 3500, "#ece2cc"),
  S("pelvis", "Pelvis (hip bones)", "skeletal", "partof", /^bony pelvis$/, 4000, "#efe5cf"),
  S("femur", "Thigh bones (femur)", "skeletal", "isa", /^(left|right) femur$/, 2000, "#ece2cc"),
  S("leg_bones", "Lower leg bones (tibia, fibula, kneecap)", "skeletal", "isa", /^(left|right) (tibia|fibula|patella)$/, 2400, "#efe5cf"),
  S("foot_bones", "Foot bones", "skeletal", "isa", /^skeleton of (left|right) foot$|^(left|right) (talus|calcaneus|navicular bone|cuboid bone)$|metatarsal|phalanx of (left|right) (big|second|third|fourth|little) toe|cuneiform/, 3500, "#ece2cc"),
  S("other_bones", "Other bones", "skeletal", "partof", /^skeletal system$/, 2500, "#ece2cc", { hidden: true }),

  S("biceps", "Biceps (biceps brachii)", "muscular", "isa", /biceps brachii$/, 1500, "#b6453f"),
  S("triceps", "Triceps (triceps brachii)", "muscular", "isa", /triceps brachii$/, 1800, "#b14a43"),
  S("deltoid", "Deltoid", "muscular", "isa", /deltoid$/, 1800, "#b9483f"),
  S("pectoralis", "Chest (pectoralis major)", "muscular", "isa", /pectoralis major$/, 2000, "#bd4b42"),
  S("trapezius", "Trapezius", "muscular", "isa", /trapezius$/, 1800, "#b3443e"),
  S("abdominals", "Abdominal muscles", "muscular", "isa", /rectus abdominis$|external oblique$|internal oblique$|transversus abdominis$/, 2600, "#c0544a"),
  S("gluteus", "Buttock muscles (gluteus)", "muscular", "isa", /gluteus (maximus|medius|minimus)$/, 2400, "#b0463f"),
  S("quadriceps", "Quadriceps (front thigh)", "muscular", "isa", /rectus femoris$|vastus (lateralis|medialis|intermedius)$/, 3600, "#bb4a41"),
  S("hamstrings", "Hamstrings (back thigh)", "muscular", "isa", /biceps femoris$|semitendinosus$|semimembranosus$/, 2400, "#ad433d"),
  S("calf", "Calf muscles (gastrocnemius, soleus)", "muscular", "isa", /gastrocnemius$|soleus$/, 2400, "#b84a42"),
  S("other_muscles", "Other muscles", "muscular", "isa", /^muscle organ$/, 26000, "#b7473f", { hidden: true }),
];

function readMapping(file) {
  const rows = [];
  for (const line of readFileSync(path.join(dir, file), "utf8").split(/\r?\n/).slice(1)) {
    const [id, name, element] = line.split("\t");
    if (element) rows.push({ id, name: name.trim(), element: element.trim() });
  }
  return rows;
}
const mapping = { partof: readMapping("partof_element_parts.txt"), isa: readMapping("isa_element_parts.txt") };
const objDirs = { partof: path.join(dir, "raw", "partof_BP3D_4.0_obj_99"), isa: path.join(dir, "raw", "isa_BP3D_4.0_obj_99") };

/** Element mesh file path; "FJxxxxM" is the mirror image of "FJxxxx" (left from right). */
function objFile(element) {
  for (const d of [objDirs.isa, objDirs.partof]) {
    const f = path.join(d, `${element}.obj`);
    if (existsSync(f)) return { file: f, mirror: false };
  }
  if (element.endsWith("M")) {
    for (const d of [objDirs.isa, objDirs.partof]) {
      const f = path.join(d, `${element.slice(0, -1)}.obj`);
      if (existsSync(f)) return { file: f, mirror: true };
    }
  }
  return null;
}

function parseObj(file, mirror) {
  const v = [], idx = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.startsWith("v ")) {
      const [, x, y, z] = line.trim().split(/\s+/).map(Number);
      v.push(mirror ? -x : x, y, z);
    } else if (line.startsWith("f ")) {
      const f = line.trim().split(/\s+/).slice(1).map(t => Number(t.split("/")[0]) - 1);
      for (let k = 1; k + 1 < f.length; k++) idx.push(f[0], mirror ? f[k + 1] : f[k], mirror ? f[k] : f[k + 1]);
    }
  }
  return { v, idx };
}

await MeshoptSimplifier.ready;
const claimed = new Map();
const meshes = [];
let missing = 0;
for (const s of STRUCTURES) {
  if (s.tree === "envelope") continue;
  const elements = [...new Set(mapping[s.tree].filter(r => s.match.test(r.name)).map(r => r.element))];
  const taken = elements.filter(e => claimed.has(e));
  if (taken.length && !s.hidden) console.warn(`  ${s.id}: ${taken.length} meshes already in ${[...new Set(taken.map(e => claimed.get(e)))].join(", ")}`);
  const v = [], idx = [];
  for (const e of elements.filter(e => !claimed.has(e))) {
    const src = objFile(e);
    if (!src) { missing++; continue; }
    claimed.set(e, s.id);
    const m = parseObj(src.file, src.mirror), base = v.length / 3;
    for (const x of m.v) v.push(x);
    for (const i of m.idx) idx.push(i + base);
  }
  if (!idx.length) { console.warn(`! ${s.id}: no meshes`); continue; }
  meshes.push({ s, v, idx, elements: elements.length });
}

// BodyParts3D is in millimetres, Z up, the body facing -Y. The app wants
// metres, Y up, facing +Z, feet on the floor, centred on X/Z.
let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (const m of meshes) for (let i = 0; i < m.v.length; i += 3) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], m.v[i + a]); max[a] = Math.max(max[a], m.v[i + a]); }
const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2;
const toApp = (x, y, z) => [(x - cx) / 1000, (z - min[2]) / 1000, -(y - cy) / 1000];
const height = (max[2] - min[2]) / 1000;

const half = [((max[0] - min[0]) / 2000) * 1.01, (height / 2) * 1.01, ((max[1] - min[1]) / 2000) * 1.01];
const center = [0, height / 2, 0];
const q = (value, a) => Math.max(-32767, Math.min(32767, Math.round(((value - center[a]) / half[a]) * 32767)));

// BodyParts3D has no lung tissue surface, only the airway tree and vessels
// inside each lung. Reconstruct each lung as the smooth volume around that
// side's real bronchi and pulmonary vessels, resting on the real diaphragm
// and carved around the real heart (which gives the left lung its notch).
const appOf = (id) => {
  const m = meshes.find(x => x.s.id === id);
  if (!m) return new Float32Array(0);
  const a = new Float32Array(m.v.length);
  for (let i = 0; i < m.v.length; i += 3) a.set(toApp(m.v[i], m.v[i + 1], m.v[i + 2]), i);
  return a;
};
function lungEnvelope(side) {
  const tree = [appOf("trachea"), appOf("pulmonary_vessels")], heart = appOf("heart"), dia = appOf("diaphragm");
  const pts = [];
  for (const a of tree) for (let i = 0; i < a.length; i += 3) if (a[i] * side > 0.03) pts.push(a[i], a[i + 1], a[i + 2]);
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pts.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pts[i + k]); hi[k] = Math.max(hi[k], pts[i + k]); }
  const pad = 0.035;
  lo = lo.map(x => x - pad); hi = hi.map(x => x + pad);
  const res = 56, mc = new MarchingCubes(res, new MeshBasicMaterial(), false, false, 400000);
  const field = mc.field;
  field.fill(0);
  const cell = hi.map((h, k) => (h - lo[k]) / (res - 1));
  const splat = (x, y, z, r, w) => {
    const c = [x, y, z].map((p, k) => (p - lo[k]) / cell[k]), n = [0, 1, 2].map(k => Math.ceil(r / cell[k]));
    for (let k = Math.max(1, Math.floor(c[2]) - n[2]); k <= Math.min(res - 2, Math.ceil(c[2]) + n[2]); k++)
      for (let j = Math.max(1, Math.floor(c[1]) - n[1]); j <= Math.min(res - 2, Math.ceil(c[1]) + n[1]); j++)
        for (let i = Math.max(1, Math.floor(c[0]) - n[0]); i <= Math.min(res - 2, Math.ceil(c[0]) + n[0]); i++) {
          const d2 = ((i - c[0]) * cell[0]) ** 2 + ((j - c[1]) * cell[1]) ** 2 + ((k - c[2]) * cell[2]) ** 2;
          if (d2 < r * r) field[i + j * res + k * res * res] += w * (1 - d2 / (r * r)) ** 2;
        }
  };
  for (let i = 0; i < pts.length; i += 6) splat(pts[i], pts[i + 1], pts[i + 2], 0.028, 0.35);
  for (let i = 0; i < heart.length; i += 3) splat(heart[i], heart[i + 1], heart[i + 2], 0.018, -2);
  // Nothing below the diaphragm dome: its highest point over each column.
  const top = new Float32Array(res * res).fill(-Infinity);
  for (let i = 0; i < dia.length; i += 3) {
    const ci = Math.round((dia[i] - lo[0]) / cell[0]), ck = Math.round((dia[i + 2] - lo[2]) / cell[2]);
    for (let di = -2; di <= 2; di++) for (let dk = -2; dk <= 2; dk++) {
      const a = ci + di, b = ck + dk;
      if (a >= 0 && a < res && b >= 0 && b < res) top[a + b * res] = Math.max(top[a + b * res], dia[i + 1]);
    }
  }
  for (let k = 0; k < res; k++) for (let i = 0; i < res; i++) {
    const t = top[i + k * res];
    if (t === -Infinity) continue;
    for (let j = 0; j < res; j++) if (lo[1] + j * cell[1] < t + 0.004) field[i + j * res + k * res * res] = -1;
  }
  mc.isolation = 0.5;
  mc.update();
  const p = mc.geometry.attributes.position.array, out = new Float32Array(mc.count * 3);
  // MarchingCubes works in a [-1, 1] cube.
  for (let i = 0; i < mc.count * 3; i++) { const k = i % 3; out[i] = lo[k] + ((p[i] + 1) / 2) * (hi[k] - lo[k]); }
  return { app: out, idx: Array.from({ length: mc.count }, (_, i) => i) };
}
for (const [id, side] of [["lung_right", -1], ["lung_left", 1]]) {
  const env = lungEnvelope(side);
  meshes.push({ s: STRUCTURES.find(x => x.id === id), v: [], idx: env.idx, app: env.app, elements: 0, reconstructed: true });
}

const positions = [], indices = [], structures = {};
for (const { s, v, idx, elements, app: given, reconstructed } of meshes) {
  const app = given ?? new Float32Array(v.length);
  if (!given) for (let i = 0; i < v.length; i += 3) app.set(toApp(v[i], v[i + 1], v[i + 2]), i);
  // Weld vertices shared by neighbouring element meshes (to 0.1 mm), so their
  // seams are not borders the simplifier has to keep.
  const weld = new Map(), remap = new Uint32Array(app.length / 3);
  for (let i = 0; i < remap.length; i++) {
    const key = `${Math.round(app[i * 3] * 1e4)},${Math.round(app[i * 3 + 1] * 1e4)},${Math.round(app[i * 3 + 2] * 1e4)}`;
    let j = weld.get(key);
    if (j === undefined) weld.set(key, (j = i));
    remap[i] = j;
  }
  // Simplify to the budget, loosening the error bound until it fits.
  const src = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) src[i] = remap[idx[i]];
  const target = Math.min(src.length, s.tris * 3);
  // Careful first; then allow collapses across seams (Permissive); topology-free (sloppy) only as a last resort.
  const goal = target - (target % 3), fits = (r) => r.length <= target * 1.15;
  let simplified = src;
  for (const [error, flags] of [[0.02, []], [0.08, []], [0.08, ["Permissive"]], [0.3, ["Permissive"]]]) {
    simplified = MeshoptSimplifier.simplify(src, app, 3, goal, error, flags)[0];
    if (fits(simplified)) break;
  }
  if (!fits(simplified)) simplified = MeshoptSimplifier.simplifySloppy(src, app, 3, null, goal, 0.02)[0];
  // Keep only the vertices the simplified mesh uses.
  const used = new Map(), local = [];
  const verts = [];
  for (const i of simplified) {
    let j = used.get(i);
    if (j === undefined) { j = used.size; used.set(i, j); verts.push(app[i * 3], app[i * 3 + 1], app[i * 3 + 2]); }
    local.push(j);
  }
  if (used.size > 65535) throw new Error(`${s.id}: ${used.size} vertices left, raise the simplification`);
  let bmin = [Infinity, Infinity, Infinity], bmax = [-Infinity, -Infinity, -Infinity], sum = [0, 0, 0];
  for (let i = 0; i < verts.length; i += 3) for (let a = 0; a < 3; a++) { bmin[a] = Math.min(bmin[a], verts[i + a]); bmax[a] = Math.max(bmax[a], verts[i + a]); sum[a] += verts[i + a]; }
  structures[s.id] = {
    name: s.name, system: s.system, color: s.color, ...(s.hidden ? { group: true } : {}),
    vertexOffset: positions.length / 3, vertexCount: used.size, indexOffset: indices.length, indexCount: local.length,
    center: sum.map(x => +(x / used.size).toFixed(4)), min: bmin.map(x => +x.toFixed(4)), max: bmax.map(x => +x.toFixed(4)),
    sourceTriangles: idx.length / 3, elements, ...(reconstructed ? { reconstructed: true } : {}),
  };
  for (let i = 0; i < verts.length; i++) positions.push(q(verts[i], i % 3));
  for (const i of local) indices.push(i);
  console.log(`${s.id.padEnd(18)} ${String(elements).padStart(4)} meshes  ${String(idx.length / 3).padStart(7)} → ${String(local.length / 3).padStart(6)} triangles`);
}

const pos = new Int16Array(positions), ind = new Uint16Array(indices);
const out = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(ind.buffer)]);
mkdirSync("public/anatomy", { recursive: true });
writeFileSync("public/anatomy/body.bin", out);
writeFileSync("src/lib/world/anatomy.generated.json", JSON.stringify({
  source: "BodyParts3D 4.0, © The Database Center for Life Science, CC BY 4.0 (mesh files: CC BY-SA 2.1 JP)",
  heightM: +height.toFixed(4), center, half, positionCount: pos.length, indexCount: ind.length, indexByteOffset: pos.byteLength, structures,
}, null, 1));
console.log(`\n${meshes.length} structures, ${ind.length / 3} triangles, ${(out.length / 1024 / 1024).toFixed(2)} MB, body height ${height.toFixed(3)} m, ${missing} meshes missing`);
