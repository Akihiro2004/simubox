import type { AssetDef, Vec3 } from "./catalog";

/** Local-space metres. The model and physical collider consume the same parts. */
export interface LearningPart {
  shape: "box" | "sphere" | "cylinder" | "cone";
  size: Vec3;
  position: Vec3;
  color: string;
  accent?: boolean;
  decorative?: boolean;
}
const box = (size: Vec3, position: Vec3, color: string, accent = false): LearningPart => ({ shape: "box", size, position, color, accent });
const round = (shape: LearningPart["shape"], size: Vec3, position: Vec3, color: string, accent = false): LearningPart => ({ shape, size, position, color, accent });
const wood = "#c99a68", cream = "#f1e7d6", teal = "#729e96", ink = "#465d67";

export const LEARNING_PARTS = {
  domino: [box([.28, .65, .1], [0, 0, 0], teal, true), box([.23, .012, .008], [0, 0, .052], cream), ...[-.14, .14].map(y => round("sphere", [.035, .035, .012], [0, y, .053], cream))],
  marble: [round("sphere", [.18, .18, .18], [0, 0, 0], "#86b8ca", true)],
  cork_block: [box([.4, .4, .4], [0, 0, 0], "#cfa36e", true)],
  steel_block: [box([.4, .4, .4], [0, 0, 0], "#8b9da9", true)],
  wooden_plank: [box([1.5, .1, .35], [0, 0, 0], wood, true)],
  bridge_arch: [box([.25, 1, .5], [-.675, -.1, 0], wood, true), box([.25, 1, .5], [.675, -.1, 0], wood, true), box([1.6, .2, .5], [0, .5, 0], cream)],
  building_brick: [box([.6, .22, .3], [0, -.03, 0], "#c98070", true), ...[-.2, 0, .2].map(x => round("cylinder", [.13, .06, .13], [x, .11, 0], "#e4b5a0"))],
  balance_weight: [box([.24, .24, .24], [0, -.04, 0], ink, true), box([.12, .08, .06], [0, .12, 0], "#d4ad68")],
  bowling_pin: [round("cylinder", [.18, .25, .18], [0, -.125, 0], cream, true), round("sphere", [.14, .14, .14], [0, .18, 0], cream, true), round("cylinder", [.075, .16, .075], [0, .055, 0], "#cc8774")],
  rubber_cube: [box([.3, .3, .3], [0, 0, 0], "#b3a0c9", true)],
  solar_panel: [box([.9, .06, .6], [0, .22, 0], ink), ...[-.3, 0, .3].flatMap(x => [-.15, .15].map(z => box([.27, .012, .26], [x, .256, z], "#769ab8", true))), box([.08, .45, .08], [0, -.025, 0], cream), box([.55, .05, .4], [0, -.225, 0], wood)],
  wind_turbine: [box([.5, .08, .5], [0, -.76, 0], cream), round("cylinder", [.08, 1.28, .08], [0, -.08, 0], teal, true), box([.16, .14, .2], [0, .56, 0], cream), box([.075, .4, .035], [0, .6, .13], wood), box([.72, .07, .035], [0, .43, .13], wood), round("sphere", [.13, .13, .13], [0, .47, .16], "#d8b56c")],
  microscope: [box([.48, .06, .34], [0, -.32, 0], teal, true), box([.07, .48, .08], [-.14, -.05, 0], ink), box([.36, .035, .26], [.02, -.04, 0], ink), box([.3, .06, .12], [-.025, .22, 0], teal, true), round("cylinder", [.1, .2, .1], [.1, .25, 0], cream), round("sphere", [.07, .07, .07], [-.185, .06, 0], "#d3ad67")],
  prism: [round("cone", [.42, .5, .42], [0, 0, 0], "#9cc7ce", true)],
  fossil: [box([.48, .12, .4], [0, -.02, 0], "#c6b298", true), ...[-.12, -.04, .04, .12].map(x => box([.04, .025, .22 - Math.abs(x) * .5], [x, .053, 0], cream)), box([.34, .03, .035], [0, .055, 0], cream)],
  cactus: [round("cylinder", [.32, .28, .32], [0, -.36, 0], "#cf9d7e"), round("cylinder", [.18, .65, .18], [0, .065, 0], teal, true), round("sphere", [.18, .18, .18], [0, .39, 0], teal, true), box([.26, .1, .1], [-.1, .05, 0], teal, true), round("cylinder", [.1, .23, .1], [-.23, .115, 0], teal, true)],
  rain_gauge: [round("cylinder", [.28, .04, .28], [0, -.35, 0], wood), round("cylinder", [.18, .68, .18], [0, .01, 0], "#a9cbd1", true), ...[-.2, -.1, 0, .1, .2].map(y => box([.07, .012, .012], [.035, y, .092], ink))],
  habitat_house: [box([.7, .46, .5], [0, -.07, 0], wood, true), box([.8, .08, .6], [0, .2, 0], teal), ...[-.21, 0, .21].map(x => round("cylinder", [.13, .13, .13], [x, -.03, .2], cream)), box([.04, .25, .04], [0, -.27, 0], ink)],
} satisfies Record<string, LearningPart[]>;

export type LearningAssetId = keyof typeof LEARNING_PARTS;
const def = (id: LearningAssetId, name: string, size: Vec3, massKg: number, defaultPhysics: AssetDef["defaultPhysics"], tags: string[], bounciness = .15): AssetDef => ({ id, name, size, massKg, defaultPhysics, tags, bounciness, collider: id === "marble" ? "ball" : "cuboid", color: LEARNING_PARTS[id].find(p => p.accent)?.color ?? wood });
export const LEARNING_ASSETS = {
  domino: def("domino", "Domino", [.28, .65, .12], .12, "dynamic", ["collisions", "energy", "chain reaction"]),
  marble: def("marble", "Glass marble", [.18, .18, .18], .04, "dynamic", ["rolling", "gravity"], .5),
  cork_block: def("cork_block", "Cork block", [.4, .4, .4], 15.36, "dynamic", ["density", "floating", "cork"]),
  steel_block: def("steel_block", "Steel block", [.4, .4, .4], 502.4, "dynamic", ["density", "sinking", "steel"]),
  wooden_plank: def("wooden_plank", "Bridge plank", [1.5, .1, .35], 1.5, "dynamic", ["building", "balance", "bridge"]),
  bridge_arch: def("bridge_arch", "Bridge support", [1.6, 1.2, .5], 20, "static", ["building", "bridge", "tunnel"]),
  building_brick: def("building_brick", "Stacking brick", [.6, .28, .3], .7, "dynamic", ["building", "balance", "stability"]),
  balance_weight: def("balance_weight", "One-kilogram weight", [.24, .32, .24], 1, "dynamic", ["mass", "forces", "balance"]),
  bowling_pin: def("bowling_pin", "Bowling pin", [.18, .5, .18], .25, "dynamic", ["collisions", "motion"]),
  rubber_cube: def("rubber_cube", "Bouncy cube", [.3, .3, .3], .25, "dynamic", ["bounce", "energy"], .85),
  solar_panel: def("solar_panel", "Solar panel model", [.9, .53, .6], 5, "static", ["energy", "illustration", "solar"]),
  wind_turbine: def("wind_turbine", "Wind turbine model", [.72, 1.6, .5], 8, "static", ["energy", "illustration", "wind"]),
  microscope: def("microscope", "Microscope model", [.48, .7, .34], 2, "static", ["biology", "illustration", "cells"]),
  prism: def("prism", "Light crystal model", [.42, .5, .42], .5, "static", ["light", "illustration", "optics"]),
  fossil: def("fossil", "Fossil slab", [.48, .16, .4], 1, "static", ["geology", "illustration", "history"]),
  cactus: def("cactus", "Desert cactus", [.58, 1, .32], 2, "static", ["biology", "illustration", "habitat"]),
  rain_gauge: def("rain_gauge", "Rain gauge model", [.28, .74, .28], .3, "static", ["weather", "illustration", "measurement"]),
  habitat_house: def("habitat_house", "Bug hotel model", [.8, .79, .6], 3, "static", ["biology", "illustration", "habitat"]),
} satisfies Record<LearningAssetId, AssetDef>;

export function isLearningAsset(id: string): id is LearningAssetId {
  return Object.hasOwn(LEARNING_ASSETS, id);
}
