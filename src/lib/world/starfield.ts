import { BufferGeometry, Float32BufferAttribute } from "three";

export const STAR_COUNT = 6144;
const SKY_RADIUS = 2800;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Even sky coverage with deterministic variation, generated once into GPU buffers. */
export function createStarfield() {
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);
  let seed = 34791;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < STAR_COUNT; i++) {
    const y = 1 - 2 * (i + 0.5) / STAR_COUNT;
    const r = Math.sqrt(1 - y * y);
    const angle = i * GOLDEN_ANGLE + (random() - 0.5) * 0.25;
    positions.set([Math.cos(angle) * r * SKY_RADIUS, y * SKY_RADIUS, Math.sin(angle) * r * SKY_RADIUS], i * 3);
    const bright = random();
    const intensity = 0.3 + bright * 0.7;
    const warm = random() > 0.8;
    colors.set([intensity * (warm ? 1 : 0.83), intensity * (warm ? 0.89 : 0.91), intensity * (warm ? 0.75 : 1)], i * 3);
    sizes[i] = bright > 0.96 ? 2.5 : 0.9 + bright * 0.8;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("size", new Float32BufferAttribute(sizes, 1));
  geometry.computeBoundingSphere();
  return geometry;
}
