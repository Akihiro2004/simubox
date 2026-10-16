import { describe, expect, it } from "vitest";
import { ASSETS, LIMITS, WORLD_IDS, WORLDS } from "@/lib/world/catalog";
import { FURNITURE, FURNITURE_PARTS } from "@/lib/world/furnishings";
import { initialObjects } from "@/lib/world/scene";
import { validatePlan } from "@/lib/ssp/validate";
import { systemPrompt } from "@/lib/ai/prompt";

describe("editable map furnishings", () => {
  it.each(WORLD_IDS)("%s has unique, bounded scene assets and room for lesson spawns", world => {
    const objects = initialObjects(world);
    expect(new Set(objects.map(o => o.id)).size).toBe(objects.length);
    expect(objects.length).toBeLessThanOrEqual(LIMITS.maxObjects - 10);
    for (const o of objects) {
      for (let axis = 0; axis < 3; axis++) {
        expect(o.position[axis]).toBeGreaterThanOrEqual(WORLDS[world].bounds.min[axis]);
        expect(o.position[axis]).toBeLessThanOrEqual(WORLDS[world].bounds.max[axis]);
      }
    }
  });

  it("keeps compound render/collider parts inside their declared bounds", () => {
    for (const [id, parts] of Object.entries(FURNITURE_PARTS)) {
      const asset = ASSETS[id as keyof typeof FURNITURE];
      for (const p of parts) for (let axis = 0; axis < 3; axis++) {
        expect(Math.abs(p.position[axis]) + p.size[axis] / 2, `${id}, axis ${axis}`).toBeLessThanOrEqual(asset.size[axis] / 2 + .001);
      }
    }
  });

  it("exposes furniture to the AI catalog and accepts edits after a world reset", () => {
    for (const id of Object.keys(FURNITURE)) expect(systemPrompt()).toContain(`${id} (`);
    const result = validatePlan({
      schemaVersion: 1, scope: "in_scope", language: "en", title: "Rearrange room", subject: "physics",
      supportLevel: "visual", capability: "concept", reply: "Rearranged the room.", assumptions: [], limitations: [], followUps: [],
      steps: [{ title: "Arrange", commands: [
        { op: "load_world", world: "bedroom" },
        { op: "move_object", id: "desk", position: [-2, .38, 1] },
        { op: "rotate_object", id: "chair", rotation: [0, 90, 0] },
        { op: "set_object_property", id: "bed", property: "color", value: "#aa7777" },
        { op: "set_object_property", id: "bookcase", property: "scale", value: .8 },
        { op: "remove_object", id: "reading_lamp" },
        { op: "spawn_asset", id: "new_bench", asset: "bench", position: [0, .5, 2] },
      ] }],
    }, { world: "stage", objects: [], characters: [] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.issues).toEqual([]);
  });

  it("returns fresh defaults so reset never preserves edited transforms", () => {
    const first = initialObjects("bedroom");
    first.find(o => o.id === "bed")!.position[0] = -2;
    expect(initialObjects("bedroom").find(o => o.id === "bed")!.position).toEqual([1.5, .55, -2.8]);
  });
});
