import type { AssetDef, Vec3 } from "./catalog";

const plant = (id: string, name: string, size: Vec3, color: string, tags: string[]): AssetDef => ({ id, name, size, color, tags, collider: "cuboid", massKg: .2, defaultPhysics: "none" });
export const NATURE_ASSETS = {
  reef_fish: plant("reef_fish", "Reef fish", [.74, .4, .22], "#e6ae56", ["fish", "ocean", "marine life"]),
  silver_fish: plant("silver_fish", "Silver fish", [.74, .4, .22], "#83b8c0", ["fish", "ocean", "marine life"]),
  sea_fan: plant("sea_fan", "Sea fan coral", [.8, .9, .6], "#d08b82", ["coral", "ocean", "habitat"]),
  anemone: plant("anemone", "Sea anemone", [.7, .55, .7], "#c3a4b7", ["anemone", "ocean", "habitat"]),
  kelp: plant("kelp", "Kelp cluster", [.8, 1.5, .7], "#6b9c7a", ["kelp", "ocean", "habitat"]),
  fern: plant("fern", "Garden fern", [.9, .7, .9], "#6c8c55", ["plant", "garden", "biology"]),
  flowering_bush: plant("flowering_bush", "Flowering shrub", [1.3, .85, 1.1], "#d3a2a2", ["flower", "garden", "pollination"]),
};
export type NatureId = keyof typeof NATURE_ASSETS;
export function isNature(id: string): id is NatureId { return Object.hasOwn(NATURE_ASSETS, id); }
export const isFish = (id: string) => id === "reef_fish" || id === "silver_fish";

/** A visual swim cycle around an editable home position, inside the water. */
export function fishPose(home: Vec3, time: number, phase: number, scale: number, bounds: { min: Vec3; max: Vec3 }, ocean: boolean): { position: Vec3; yaw: number } {
  const t = time * .42 + phase;
  const margin = .4 * scale;
  const clamp = (n: number, low: number, high: number) => Math.min(Math.max(n, low), high);
  return {
    position: [
      clamp(home[0] + Math.cos(t) * .65, bounds.min[0] + margin, bounds.max[0] - margin),
      clamp(home[1] + Math.sin(t * 2) * .07, ocean ? .2 * scale : bounds.min[1] + margin, ocean ? 2.6 - .2 * scale : bounds.max[1] - margin),
      clamp(home[2] + Math.sin(t) * .35, bounds.min[2] + margin, bounds.max[2] - margin),
    ],
    yaw: Math.atan2(-.35 * Math.cos(t), -.65 * Math.sin(t)),
  };
}
