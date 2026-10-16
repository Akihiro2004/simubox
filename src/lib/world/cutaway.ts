// Dollhouse cutaway: a room wall lowers when the camera is on its outer side.

const HIDE_AT = 0.12; // hysteresis so walls don't flicker when viewed edge-on
const SHOW_AT = 0.0;

/**
 * Should a wall with outward normal (nx, nz) be lowered for a camera at
 * (camX, camZ), given the room is centred on the origin?
 */
export function wallBlocksView(normal: readonly [number, number], camX: number, camZ: number, wasHidden: boolean): boolean {
  const len = Math.hypot(camX, camZ);
  if (len < 1e-6) return wasHidden; // straight overhead: keep the current state
  const facing = (camX * normal[0] + camZ * normal[1]) / len;
  return wasHidden ? facing > SHOW_AT : facing > HIDE_AT;
}
