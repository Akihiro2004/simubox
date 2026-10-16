import type { AssetDef, Vec3 } from "./catalog";

// Rendered and collided from the same local-space parts. Furniture participates
// in the normal scene lifecycle; no hidden, immovable collider duplicates.
export interface FurniturePart { size: Vec3; position: Vec3; color: string; radius?: number; accent?: boolean }
const part = (size: Vec3, position: Vec3, color: string, radius = 0.02, accent = false): FurniturePart => ({ size, position, color, radius, accent });
const wood = "#ad754b", dark = "#344a49", cream = "#eee4d2";
export const FURNITURE_PARTS = {
  bed: [
    part([1.9, .28, 2.3], [0, -.29, 0], wood),
    part([1.8, .22, 2.2], [0, -.02, 0], cream, .07),
    part([1.84, .12, 1.45], [0, .15, .4], "#668f89", .045, true),
    part([1.9, 1.1, .14], [0, 0, -1.08], wood, .035),
    ...[-.72, -.48, -.24, 0, .24, .48, .72].map(x => part([.035, .7, .03], [x, .12, -.99], "#c89563", .008)),
    ...[-.46, .46].map(x => part([.65, .16, .38], [x, .18, -.73], "#f7efdf", .07)),
    part([1.87, .045, .32], [0, .22, .85], "#d5b37b", .012),
  ],
  desk: [
    part([1.1, .08, 1.8], [0, .34, 0], wood),
    ...[-.44, .44].flatMap(x => [-.76, .76].map(z => part([.075, .68, .075], [x, -.04, z], dark))),
    part([.82, .3, .46], [0, .14, -.59], cream),
    part([.32, .025, .035], [0, .14, -.34], dark, .008),
  ],
  chair: [
    part([.54, .1, .54], [0, -.03, 0], "#668f89", .04, true),
    part([.08, .45, .54], [.23, .245, 0], "#668f89", .04, true),
    ...[-.19, .19].flatMap(x => [-.19, .19].map(z => part([.045, .42, .045], [x, -.29, z], wood))),
  ],
  bookcase: [
    part([1.3, 1.8, .06], [0, 0, -.18], dark),
    ...[-.61, .61].map(x => part([.08, 1.8, .42], [x, 0, 0], wood)),
    ...[-.86, -.3, .27, .86].map(y => part([1.3, .07, .42], [0, y, 0], wood)),
    ...[-.69, -.13, .44].flatMap((y, row) => Array.from({ length: 6 }, (_, i) => part([.12, .27 + (i % 3) * .04, .26], [-.46 + i * .18, y, .02], ["#d5b37b", "#6f9390", "#c17159", "#f0e6d7"][(i + row) % 4], .008))),
  ],
  cabinet: [
    part([5, .86, .8], [0, -.03, 0], "#b2c9c1", .035, true),
    part([5.1, .06, .86], [0, .43, 0], "#344a49"),
    ...[-1.98, -.98, .02, 1.02, 2.02].flatMap(x => [
      part([.92, .68, .025], [x, -.02, .41], cream),
      part([.28, .025, .035], [x, .2, .44], dark, .008),
    ]),
  ],
  bench: [
    ...[-.22, 0, .22].map(z => part([2.4, .09, .18], [0, -.04, z], wood)),
    ...[.19, .4].map(y => part([2.4, .16, .06], [0, y, -.27], wood)),
    ...[-.9, .9].map(x => part([.09, .94, .09], [x, 0, -.28], dark)),
    ...[-.9, .9].map(x => part([.09, .43, .55], [x, -.26, 0], dark)),
  ],
  planter: [
    part([.72, .52, .72], [0, 0, 0], "#d8c2a4", .055, true),
    part([.63, .025, .63], [0, .263, 0], "#514435", .03),
  ],
  desk_lamp: [
    part([.26, .04, .24], [0, -.23, 0], dark),
    part([.025, .38, .025], [-.07, -.03, 0], "#b99b62", .008),
    part([.23, .12, .22], [0, .19, 0], dark, .025, true),
    part([.18, .012, .17], [0, .124, 0], "#ffe0a0", .004),
  ],
  garden_fence: [
    ...[-.25, .2].map(y => part([2.6, .07, .07], [0, y, -.04], "#c9b28e")),
    ...Array.from({ length: 10 }, (_, i) => part([.12, .9, .075], [-1.17 + i * .26, 0, .025], cream, .02, true)),
  ],
  pedestal: [
    part([1.05, .08, 1.05], [0, -.36, 0], dark, .04),
    part([.78, .64, .78], [0, 0, 0], cream, .06, true),
    part([.96, .08, .96], [0, .36, 0], "#b2d4c9", .04),
  ],
  nightstand: [
    part([.64, .48, .58], [0, -.04, 0], wood, .035),
    part([.69, .06, .63], [0, .23, 0], wood),
    part([.54, .19, .025], [0, .04, .3], cream, .015, true),
    part([.12, .025, .035], [0, .04, .33], "#b99b62", .008),
    ...[-.24, .24].flatMap(x => [-.2, .2].map(z => part([.055, .08, .055], [x, -.29, z], dark))),
  ],
  stool: [
    part([.46, .09, .46], [0, .255, 0], "#bf9360", .045, true),
    ...[-.16, .16].flatMap(x => [-.16, .16].map(z => part([.04, .51, .04], [x, -.045, z], dark))),
    part([.36, .035, .035], [0, -.13, -.16], dark),
    part([.36, .035, .035], [0, -.13, .16], dark),
  ],
  workbench: [
    part([4.8, .08, .95], [0, .45, 0], wood),
    ...[-1.75, 1.75].map(x => part([1.05, .86, .78], [x, -.02, 0], "#687e7d", .025, true)),
    ...[-1.75, 1.75].flatMap(x => [-.22, .06, .3].map(y => part([.91, .025, .045], [x, y, .41], "#d1b684", .008))),
    part([2.4, .08, .72], [0, -.33, 0], dark),
  ],
  instrument_cart: [
    ...[-.28, .22].map(y => part([.8, .055, .6], [0, y, 0], "#dce5df", .02, true)),
    ...[-.35, .35].flatMap(x => [-.25, .25].map(z => part([.035, .75, .035], [x, .025, z], dark, .008))),
    ...[-.32, .32].flatMap(x => [-.22, .22].map(z => part([.12, .14, .08], [x, -.37, z], dark, .025))),
  ],
  storage_box: [
    part([.58, .36, .42], [0, -.025, 0], "#bd9c73", .035, true),
    part([.61, .06, .45], [0, .185, 0], cream, .018),
    part([.16, .045, .015], [0, .04, .218], dark, .008),
    ...[-.15, .15].map(x => part([.035, .36, .015], [x, -.025, .215], "#d5b98f", .004)),
  ],
  covered_stand: [
    ...[0, 1, 2].flatMap(row => [
      part([5.2, .35 + row * .35, .58], [0, -1.325 + row * .175, .64 - row * .62], "#b9c1b4", .025),
      part([5.35, .075, .5], [0, -1.11 + row * .35, .64 - row * .62], "#bc8b5f", .025, true),
    ]),
    ...[-2.5, 2.5].flatMap(x => [-.9, .9].map(z => part([.075, 2.85, .075], [x, -.075, z], dark, .012))),
    part([5.6, .1, 2.25], [0, 1.4, 0], "#e8dfc6", .025),
    part([5.65, .23, .09], [0, 1.33, 1.1], "#547d7b", .015),
    part([5.65, .23, .09], [0, 1.33, -1.1], "#547d7b", .015),
  ],
  ball_rack: [
    ...[-.8, .8].flatMap(x => [-.25, .25].map(z => part([.04, 1.04, .04], [x, 0, z], dark, .008))),
    ...[-.32, .16].flatMap(y => [-.25, .25].map(z => part([1.64, .035, .035], [0, y, z], "#9caeaa", .008))),
    ...[-.8, .8].flatMap(x => [-.25, .25].map(z => part([.1, .12, .08], [x, -.54, z], dark, .025))),
  ],
  garden_arbor: [
    ...[-1.3, 1.3].flatMap(x => [-.5, .5].map(z => part([.1, 2.7, .1], [x, -.05, z], "#9b8059", .012))),
    ...[-.5, .5].map(z => part([2.9, .14, .14], [0, 1.27, z], "#9b8059", .015)),
    ...Array.from({ length: 9 }, (_, i) => part([.07, .09, 1.3], [-1.36 + i * .34, 1.35, 0], "#c7b48b", .012, true)),
    ...[-1.3, 1.3].flatMap(x => [-.7, -.35, 0, .35, .7].map(y => part([.04, .04, 1], [x, y, 0], "#b29a70", .008))),
  ],
  reef_arch: [
    ...[-.52, .52].map(x => part([.32, .9, .5], [x, -.15, 0], "#a5aaa0", .07, true)),
    part([1.4, .3, .55], [0, .45, 0], "#b5b9aa", .08, true),
  ],
} satisfies Record<string, FurniturePart[]>;
export type FurnitureId = keyof typeof FURNITURE_PARTS;
const def = (id: FurnitureId, name: string, size: Vec3, massKg: number, color: string): AssetDef => ({ id, name, size, massKg, color, collider: "cuboid", defaultPhysics: "static", tags: ["furniture", "decor"], bounciness: .05 });
export const FURNITURE = {
  bed: def("bed", "Oak bed", [1.9, 1.1, 2.3], 45, "#668f89"),
  desk: def("desk", "Writing desk", [1.1, .76, 1.8], 20, wood),
  chair: def("chair", "Upholstered chair", [.54, 1, .54], 5, "#668f89"),
  bookcase: def("bookcase", "Oak bookcase", [1.3, 1.8, .42], 30, wood),
  cabinet: def("cabinet", "Laboratory cabinet", [5.1, .92, .93], 60, "#b2c9c1"),
  bench: def("bench", "Garden bench", [2.4, 1, .65], 25, wood),
  planter: def("planter", "Stone planter", [.72, .56, .72], 15, "#d8c2a4"),
  desk_lamp: def("desk_lamp", "Reading lamp", [.26, .5, .24], 1, dark),
  garden_fence: def("garden_fence", "Garden fence", [2.6, .9, .15], 12, cream),
  pedestal: def("pedestal", "Display pedestal", [1.05, .8, 1.05], 25, cream),
  nightstand: def("nightstand", "Oak bedside cabinet", [.69, .66, .7], 9, cream),
  stool: def("stool", "Workshop stool", [.46, .6, .46], 4, "#bf9360"),
  workbench: def("workbench", "Maker workbench", [4.8, .98, .95], 60, "#687e7d"),
  instrument_cart: def("instrument_cart", "Instrument trolley", [.8, .88, .6], 12, "#dce5df"),
  storage_box: def("storage_box", "Lidded storage basket", [.61, .43, .46], 2, "#bd9c73"),
  covered_stand: def("covered_stand", "Covered spectator stand", [5.65, 3, 2.3], 180, "#bc8b5f"),
  ball_rack: def("ball_rack", "Sports ball rack", [1.75, 1.2, .6], 8, "#9caeaa"),
  garden_arbor: def("garden_arbor", "Garden pergola", [2.9, 2.8, 1.3], 45, "#c7b48b"),
  reef_arch: def("reef_arch", "Aquarium stone arch", [1.4, 1.2, .55], 25, "#a5aaa0"),
};
export function isFurniture(id: string): id is FurnitureId { return Object.hasOwn(FURNITURE_PARTS, id); }
