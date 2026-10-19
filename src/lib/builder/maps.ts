import { z } from "zod";
import { ASSET_IDS, GUIDE_ID, LIMITS, PRIMITIVE_SHAPES, WORLD_IDS, WORLDS, type WorldId } from "../world/catalog";
import { MOLECULE_IDS, ELEMENT_SYMBOLS } from "../engine/chemistry";
import { SHAPE_KINDS } from "../engine/geometry";
import { MATERIAL_IDS } from "../engine/physics2";
import type { SceneObject } from "../world/scene";

const Vec = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const Color = z.string().regex(/^#[a-f0-9]{6}$/i);
const base = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/).refine(id => id !== GUIDE_ID),
  position: Vec, rotation: Vec, scale: z.number().min(.2).max(5),
  physics: z.enum(["dynamic", "static", "none"]), label: z.string().max(40).optional(), color: Color.optional(),
  massKg: z.number().min(.001).max(10000), bounciness: z.number().min(0).max(1.2), drag: z.number().min(0).max(20),
  visible: z.boolean(), version: z.number().int().nonnegative(), learnerPlaced: z.boolean().optional(),
});
const size = z.tuple([z.number().positive().max(60), z.number().positive().max(60), z.number().positive().max(60)]);
const appearance = { size, opacity: z.number().min(0).max(1), glow: z.boolean() };
export const MapObject = z.discriminatedUnion("type", [
  base.extend({ type: z.literal("asset"), asset: z.enum(ASSET_IDS) }),
  base.extend({ type: z.literal("primitive"), shape: z.enum(PRIMITIVE_SHAPES), ...appearance }),
  base.extend({ type: z.literal("molecule"), molecule: z.union([z.enum(MOLECULE_IDS), z.string().regex(/^cid:d{1,10}$/)]) }),
  base.extend({ type: z.literal("atom"), element: z.enum(ELEMENT_SYMBOLS) }),
  base.extend({ type: z.literal("shape"), shape: z.enum(SHAPE_KINDS), ...appearance, wireframe: z.boolean(), material: z.enum(MATERIAL_IDS).optional(), morphMs: z.number().min(0).max(60000), sides: z.number().int().min(3).max(100).optional(), points: z.array(z.tuple([z.number().finite(), z.number().finite()])).max(100).optional(), path: z.array(Vec).max(100).optional() }),
]);
export interface MapLayout { version: 1; world: WorldId; objects: Record<string, SceneObject> }
const Layout = z.object({ version: z.literal(1), world: z.enum(WORLD_IDS), objects: z.record(z.string(), MapObject) });
const KEY = "simubox-builder-maps-v1";

export function parseLayout(raw: unknown): MapLayout | null {
  const result = Layout.safeParse(raw);
  if (!result.success) return null;
  const map = result.data;
  const entries = Object.entries(map.objects);
  if (entries.length > LIMITS.maxObjects || entries.some(([id, o]) => id !== o.id || o.position.some((v, axis) => v < WORLDS[map.world].bounds.min[axis] || v > WORLDS[map.world].bounds.max[axis]))) return null;
  return map as MapLayout;
}

export function readMaps(): Partial<Record<WorldId, MapLayout>> {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (!raw || typeof raw !== "object") return {};
    const maps: Partial<Record<WorldId, MapLayout>> = {};
    for (const w of WORLD_IDS) {
      const map = parseLayout((raw as Record<string, unknown>)[w]);
      if (map?.world === w) maps[w] = map;
    }
    return maps;
  } catch { return {}; }
}

export function writeMap(map: MapLayout): boolean {
  if (!parseLayout(map)) return false;
  try { if (typeof localStorage === "undefined") return false; localStorage.setItem(KEY, JSON.stringify({ ...readMaps(), [map.world]: map })); return true; }
  catch { return false; }
}

export function mapSummaries() {
  return Object.values(readMaps()).map(map => ({ world: map.world, ids: Object.keys(map.objects) }));
}
