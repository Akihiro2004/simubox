import { ASSETS, type AssetId, type AnimationName, type CharacterKind, type PrimitiveShape, type Vec3, type WorldId } from "./catalog";
import { getMolecule, type MoleculeId } from "../engine/chemistry";
import type { ShapeKind } from "../engine/geometry";
import { PARK_LAYOUT } from "./park-layout";
import type { MaterialId } from "../engine/physics2";

interface ObjectBase {
  id: string;
  /** Authored by the learner; survives saves and is visible in AI context. */
  learnerPlaced?: boolean;
  position: Vec3;
  /** Degrees around x, y, z. */
  rotation: Vec3;
  scale: number;
  physics: "dynamic" | "static" | "none";
  label?: string;
  color?: string;
  massKg: number;
  bounciness: number;
  drag: number;
  visible: boolean;
  /** Bumped when position is set from outside so physics bodies re-seat. */
  version: number;
}

export type SceneObject =
  | (ObjectBase & { type: "asset"; asset: AssetId })
  | (ObjectBase & { type: "primitive"; shape: PrimitiveShape; size: Vec3; opacity: number; glow: boolean })
  | (ObjectBase & { type: "molecule"; molecule: MoleculeId })
  | (ObjectBase & { type: "atom"; element: string })
  | (ObjectBase & {
      type: "shape";
      shape: ShapeKind;
      /** Target size; the renderer eases toward it over morphMs. */
      size: Vec3;
      sides?: number;
      points?: [number, number][];
      path?: Vec3[];
      opacity: number;
      glow: boolean;
      wireframe: boolean;
      material?: MaterialId;
      morphMs: number;
    });

export interface Character {
  id: string;
  kind: CharacterKind;
  name: string;
  color?: string;
  position: Vec3;
  animation: AnimationName;
  /** Bumped to replay the same animation. */
  animNonce: number;
}

export function assetObject(id: string, asset: AssetId, position: Vec3, extra: Partial<ObjectBase> = {}): SceneObject {
  const def = ASSETS[asset];
  return {
    id,
    type: "asset",
    asset,
    position,
    rotation: [0, 0, 0],
    scale: 1,
    physics: def.defaultPhysics,
    massKg: def.massKg,
    bounciness: def.bounciness ?? 0.3,
    drag: def.drag ?? 0.05,
    visible: true,
    version: 0,
    ...extra,
  };
}

export function objectKind(o: SceneObject): string {
  switch (o.type) {
    case "asset":
      return o.asset;
    case "primitive":
      return o.shape;
    case "molecule":
      return `molecule:${o.molecule}`;
    case "atom":
      return `atom:${o.element}`;
    case "shape":
      return `shape:${o.shape}`;
  }
}

export function objectName(o: SceneObject): string {
  if (o.label) return o.label;
  if (o.type === "asset") return ASSETS[o.asset].name;
  if (o.type === "molecule") return getMolecule(o.molecule)?.name ?? o.molecule;
  if (o.type === "atom") return `${o.element} atom`;
  return o.shape;
}

/** Named scene assets, including furniture: AI commands and saves share this layout. */
export function initialObjects(world: WorldId): SceneObject[] {
  switch (world) {
    case "bedroom":
      return [
        assetObject("bed", "bed", [1.5, .55, -2.8]),
        assetObject("desk", "desk", [-2.9, .38, 0]),
        assetObject("chair", "chair", [-1.95, .5, .3]),
        assetObject("bookcase", "bookcase", [-2.85, .9, -3.68]),
        // Beside the headboard, against the back wall, like a real bedside table.
        assetObject("bedside_cabinet", "nightstand", [3.05, .33, -3.4]),
        assetObject("bedside_lamp", "desk_lamp", [3.05, .84, -3.4], { color: "#bd9361" }),
        assetObject("shelf_rocket", "rocket_toy", [-2.8, 2.05, -3.65], { color: "#f1e4ce" }),
        assetObject("shelf_plant", "plant", [-3.23, 2.045, -3.65], { scale: .7, color: "#7e9563" }),
        assetObject("toy_basket", "storage_box", [-3, .215, 2.3]),
        assetObject("reading_stool", "stool", [-2.1, .3, 2.2]),
        // On the other side of the headboard, between the bed and the bookcase.
        assetObject("bedside_plant", "plant", [.05, .525, -3.4], { scale: 1.5 }),
        assetObject("door_plant", "plant", [-3.5, .42, 3.4], { scale: 1.2 }),
        assetObject("desk_globe", "planet", [-3.15, 1.04, .65], { scale: .6 }),
        assetObject("reading_lamp", "desk_lamp", [-3.1, 1.01, -.65]),
        assetObject("red_ball", "ball_red", [0.6, 0.15, 1.2]),
        assetObject("blue_ball", "ball_blue", [-1.2, 0.15, 1.8]),
        assetObject("book_1", "book", [-2.6, 0.85, -0.6], { color: "#6366f1" }),
        assetObject("book_2", "book", [-2.6, 0.9, -0.3], { color: "#f59e0b", rotation: [0, 25, 0] }),
        assetObject("box", "box", [3.1, 0.2, 0.6]),
        assetObject("block_1", "toy_block", [0.1, 0.07, 2.4], { color: "#facc15" }),
        assetObject("block_2", "toy_block", [0.1, 0.21, 2.4], { color: "#34d399" }),
        assetObject("block_3", "toy_block", [0.1, 0.35, 2.4], { color: "#60a5fa" }),
        assetObject("pillow", "pillow", [1.5, 0.7, -3.4]),
        assetObject("mug", "mug", [-2.5, 0.84, 0.3]),
        assetObject("toy_car", "toy_car", [-0.6, 0.07, 0.4], { rotation: [0, 35, 0] }),
      ];
    case "court":
      return [assetObject("cone_1", "cone", [-1.2, 0.23, -3]), assetObject("cone_2", "cone", [-1.8, 0.23, -3]),
        ...[17, 25, 40].map((x, i) => assetObject(`court_bench_${i + 1}`, "bench", [x, .5, -6.6])),
        assetObject("spectator_stand", "covered_stand", [7, 1.5, -5.7]),
        assetObject("far_stand", "covered_stand", [33, 1.5, -5.7]),
        assetObject("ball_rack", "ball_rack", [-2.4, .6, -5.1]),
        assetObject("practice_ball", "basketball", [1.3, .12, -3.5]),
        assetObject("training_ball", "soccer_ball", [2, .11, -3.5]),
      ];
    case "park":
      return [
        assetObject("park_bench", "bench", [2.8, .5, -4.4]),
        ...PARK_LAYOUT.trees.map(([x, z], i) => assetObject(`tree_${i + 1}`, "tree", [x, 1.3, z], { color: ["#779358", "#68864f", "#91a968"][i] })),
        ...[-2, .8].map((x, i) => assetObject(`garden_fence_${i + 1}`, "garden_fence", [x, .45, -5.2])),
        assetObject("garden_arbor", "garden_arbor", [2.8, 1.4, -4.4]),
        ...PARK_LAYOUT.shrubs.map(([x, z], i) => assetObject(`shrub_${i + 1}`, "flowering_bush", [x, .425, z], { color: ["#d3a2a2", "#e3d1a2", "#b4a2c0"][i % 3], rotation: [0, i * 31, 0] })),
        ...PARK_LAYOUT.ferns.map(([x, z], i) => assetObject(`fern_${i + 1}`, "fern", [x, .35, z], { rotation: [0, i * 43, 0] })),
        ...PARK_LAYOUT.rocks.map(([x, z], i) => assetObject(`rock_${i + 1}`, "rock", [x, .2, z])),
        assetObject("apple", "apple", [1.2, 0.05, -0.6]),
        assetObject("soccer_ball", "soccer_ball", [.3, 0.11, .2]),
        assetObject("flower_1", "flower", [2.5, .225, 0.8]),
        assetObject("flower_2", "flower", [2.9, .225, 1.3], { color: "#facc15" }),
      ];
    case "lab":
      return [
        assetObject("display_pedestal", "pedestal", [0, .4, 0]),
        assetObject("lab_cabinet", "cabinet", [.4, .46, -3.5]),
        assetObject("lab_beaker", "beaker", [-1.4, 1.02, -3.5]),
        assetObject("lab_flask", "flask", [-1, 1.05, -3.4]),
        assetObject("green_beaker", "beaker", [1.6, 1.02, -3.5], { color: "#a3e635" }),
        assetObject("pink_flask", "flask", [2.1, 1.05, -3.6], { color: "#fb7185" }),
        assetObject("lab_plant", "plant", [3.3, .49, -3.3], { scale: 1.4 }),
        assetObject("instrument_trolley", "instrument_cart", [-3.1, .44, -2.1]),
        assetObject("trolley_flask", "flask", [-3.1, .82, -2.1], { color: "#dca86c" }),
        assetObject("lab_stool", "stool", [-2.3, .3, -3.1], { color: "#708f89" }),
      ];
    case "stage":
    case "mechanics":
    case "math_studio":
    case "anatomy":
    case "space":
    case "math":
    case "globe":
    case "optics":
      return [];
    case "workshop":
      return [
        assetObject("maker_workbench", "workbench", [.2, .49, -3.45]),
        assetObject("maker_stool", "stool", [-1.3, .3, -2.3]),
        assetObject("bench_lamp", "desk_lamp", [-1.8, 1.23, -3.45]),
        assetObject("tool_storage", "storage_box", [1.65, 1.195, -3.45], { color: "#c48f54" }),
        assetObject("workshop_trolley", "instrument_cart", [-3.2, .44, -2.7], { color: "#b59d75" }),
      ];
    case "ocean":
      // Floaters and sinkers resting on the dock and the water.
      return [
        assetObject("crate", "crate", [-1.2, 2.9, -0.8]),
        assetObject("beach_ball", "ball_red", [0.8, 2.85, 1.2]),
        assetObject("apple", "apple", [-0.2, 2.7, 0.9]),
        assetObject("ice_cube", "ice_cube", [1.4, 2.7, -1.2]),
        assetObject("bowling_ball", "bowling_ball", [-2.2, 0.12, 1.6]),
        assetObject("reef_arch", "reef_arch", [0, .6, -2.5]),
        ...[[-2.6, 1.2, 1.6], [2.3, 1.9, -1.9], [-1.3, .75, 2.4], [2.1, .9, .1], [-1.6, 1.9, -.2], [.4, 1.45, -2.2]].map((p, i) =>
          assetObject(`fish_${i + 1}`, i % 2 ? "silver_fish" : "reef_fish", p as Vec3, { scale: 1.1 + i % 3 * .15, color: ["#dc9c35", "#689eae", "#c9856f", "#b4c7ac", "#c9ae5c", "#77a4b4"][i] })),
        ...[[-2.4, -2.1], [2.35, -2.5], [-2.6, 2], [1.3, -2.7], [-1.4, -2.8], [2.7, 1.3], [-.3, 2.8]].map(([x, z], i) =>
          assetObject(`coral_${i + 1}`, "sea_fan", [x, .45, z], { scale: .75 + i % 3 * .2, color: ["#cc958c", "#c5ae75", "#ae8c9e"][i % 3] })),
        ...[[-2.9, -.7], [2.8, -2.5], [-1, -2.9]].map(([x, z], i) => assetObject(`kelp_${i + 1}`, "kelp", [x, .75, z], { rotation: [0, i * 47, 0] })),
        ...[[-2.5, 2.6], [2.5, .7], [-.9, -2.8]].map(([x, z], i) => assetObject(`anemone_${i + 1}`, "anemone", [x, .275, z], { scale: 1.1, color: ["#c3a4b7", "#d2b184", "#d19f8f"][i] })),
      ];
  }
}
