import "server-only";
import { PERIODIC_ELEMENTS } from "../periodic-table";
import type { Molecule } from "../engine/chemistry";

// PubChem (NIH) holds ~119 million compounds. Its 3D records are force-field
// conformers (MMFF94s), so any compound with one can be shown with real bond
// lengths and angles. https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest

const BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound";
/** Ball-and-stick models beyond this stop being readable (and get heavy on phones). */
export const MAX_ATOMS = 180;

export class CompoundError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

interface Record3d {
  id: { id: { cid: number } };
  atoms: { aid: number[]; element: number[] };
  bonds?: { aid1: number[]; aid2: number[]; order: number[] };
  coords: { aid: number[]; conformers: { x: number[]; y: number[]; z: number[] }[] }[];
}

/** PubChem's 3D record → our molecule (centred, Å). Exported for tests. */
export function parseRecord(rec: Record3d, props: { Title?: string; MolecularFormula?: string; MolecularWeight?: string }): Molecule {
  const { aid, element } = rec.atoms;
  if (aid.length > MAX_ATOMS) throw new CompoundError(`That molecule has ${aid.length} atoms, too many to show as a ball-and-stick model.`, 422);
  const c = rec.coords[0];
  const conf = c.conformers[0];
  const index = new Map(c.aid.map((a, i) => [a, i]));
  const pts = aid.map((a) => {
    const i = index.get(a)!;
    return [conf.x[i], conf.y[i], conf.z[i] ?? 0];
  });
  const mid = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length);
  const atomIndex = new Map(aid.map((a, i) => [a, i]));
  const b = rec.bonds ?? { aid1: [], aid2: [], order: [] };
  return {
    id: `cid:${rec.id.id.cid}`,
    cid: rec.id.id.cid,
    name: props.Title ?? `Compound ${rec.id.id.cid}`,
    formula: (props.MolecularFormula ?? "").replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[+d]),
    molarMass: props.MolecularWeight ? Number(props.MolecularWeight) : undefined,
    shape: "",
    atoms: element.map((z, i) => ({ el: PERIODIC_ELEMENTS[z - 1]?.symbol ?? "X", pos: pts[i].map((v, k) => Math.round((v - mid[k]) * 1000) / 1000) as [number, number, number] })),
    // PubChem marks aromatic bonds with order 8 (and dative ones with 5); draw them as single.
    bonds: b.aid1.map((a1, i) => ({ a: atomIndex.get(a1)!, b: atomIndex.get(b.aid2[i])!, order: ([1, 2, 3].includes(b.order[i]) ? b.order[i] : 1) as 1 | 2 | 3 })),
    lonePairs: [],
    angles: [],
    facts: [],
    source: "PubChem 3D conformer (MMFF94s)",
  };
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal, headers: { accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new CompoundError("PubChem is not answering right now.", 502);
  return res.json();
}

/** Look a compound up by name (or CID) and return its 3D model. */
export async function fetchCompound(q: { name?: string; cid?: number }, signal?: AbortSignal): Promise<Molecule> {
  let cid = q.cid;
  if (!cid) {
    const ids = (await getJson(`${BASE}/name/${encodeURIComponent(q.name ?? "")}/cids/JSON`, signal)) as { IdentifierList?: { CID?: number[] } } | null;
    cid = ids?.IdentifierList?.CID?.[0];
    if (!cid) throw new CompoundError(`PubChem has no compound called "${q.name}".`, 404);
  }
  const [rec, props] = await Promise.all([
    getJson(`${BASE}/cid/${cid}/record/JSON?record_type=3d`, signal) as Promise<{ PC_Compounds?: Record3d[] } | null>,
    getJson(`${BASE}/cid/${cid}/property/Title,MolecularFormula,MolecularWeight/JSON`, signal) as Promise<{ PropertyTable?: { Properties?: { Title?: string; MolecularFormula?: string; MolecularWeight?: string }[] } } | null>,
  ]);
  const r = rec?.PC_Compounds?.[0];
  const p = props?.PropertyTable?.Properties?.[0] ?? {};
  // No 3D record: ionic solids, mixtures and very large or flexible molecules.
  if (!r) throw new CompoundError(`PubChem has no 3D structure for ${p.Title ?? "that compound"} (ionic solids, mixtures and very large molecules don't have one).`, 422);
  return parseRecord(r, p);
}
