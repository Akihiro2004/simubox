import { CompoundError, fetchCompound } from "@/lib/server/pubchem";
import { clientIp, rateLimit } from "@/lib/server/guard";
import { COMPOUND_NAME } from "@/lib/engine/chemistry";

// Stateless lookup: ?name=caffeine or ?cid=2519 → a small JSON 3D model.
// Results never change, so browsers and CDNs may cache them for a long time.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name")?.trim();
  const cid = Number(url.searchParams.get("cid"));
  if (!(name && COMPOUND_NAME.test(name)) && !(Number.isInteger(cid) && cid > 0 && cid < 1e10)) return Response.json({ error: "Give a compound name or a PubChem CID." }, { status: 400 });
  // PubChem asks for at most 5 requests a second; keep each visitor well under that.
  if (!rateLimit(`chem:${clientIp(req)}`, 20, 10)) return Response.json({ error: "Too many lookups. Try again in a minute." }, { status: 429 });
  try {
    const molecule = await fetchCompound(name ? { name } : { cid }, req.signal);
    return Response.json(molecule, { headers: { "cache-control": "public, max-age=86400, s-maxage=604800" } });
  } catch (e) {
    if (e instanceof CompoundError) return Response.json({ error: e.message }, { status: e.status, headers: e.status === 404 || e.status === 422 ? { "cache-control": "public, max-age=3600" } : {} });
    return Response.json({ error: "Couldn't reach PubChem." }, { status: 502 });
  }
}
