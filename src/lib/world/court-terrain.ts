/** Finite rocky diorama. Every crater's entire rim must fit within this footprint. */
export const ROCKY_COURT = { centerX: 28, width: 84, depth: 45, surfaceY: -.1, edgeClearance: 1.2 } as const;
export const COURT_CRATERS = [
  { x: -9, z: -12, r: 1.2 }, { x: 5, z: -11, r: 1.1 },
  { x: 19, z: -12, r: 1.3 }, { x: 34, z: -11.5, r: 1.1 },
  { x: 49, z: -12, r: 1.4 }, { x: 64, z: -12, r: 1.2 },
  { x: -7, z: 17, r: 1.5 }, { x: 7, z: 14.5, r: 1.7 },
  { x: 21, z: 18.5, r: 1.3 }, { x: 36, z: 14.5, r: 1.4 },
  { x: 50, z: 18, r: 1.6 }, { x: 64, z: 15, r: 1.5 },
] as const;

export const craterOuterRadius = (r: number) => r * 1.16;
