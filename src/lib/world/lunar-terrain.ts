import { BufferGeometry, Float32BufferAttribute, RingGeometry } from "three";

const RADIUS = 1200;

/** Fixed, varied crater coverage from the test site to the far lunar limb. */
export function lunarCraters(flatRadius = 100, center = 30) {
  let seed = 38571;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const craters: { x: number; z: number; r: number }[] = [];
  const extent = flatRadius + 1100;
  for (const [distance, count, size] of [[55, 16, 2.5], [140, 26, 5], [280, 40, 9], [460, 58, 15], [700, 76, 23], [950, 92, 30]]) {
    for (let i = 0; i < count; i++) {
      const angle = (i + random() * 0.8) / count * Math.PI * 2;
      const d = (distance + (random() - 0.5) * distance * 0.5) * extent / 1200;
      const x = Math.cos(angle) * d, z = Math.sin(angle) * d;
      const r = size * (0.6 + random() * 0.8);
      // Keep the experiment lane and its landing area clear.
      if (Math.abs(z) < 12 + r && Math.abs(x) < center + 25 + r) continue;
      if (Math.hypot(x, z) + r > extent * 0.97) continue;
      if (craters.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r + 3)) continue;
      craters.push({ x, z, r });
    }
  }
  return craters;
}

/** One merged mesh for smooth raised rims and shaded bowls at every distance. */
export function createLunarCraterGeometry(flatRadius = 100, center = 30) {
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
  const extent = flatRadius + 1100;
  const profile = [[0, 0.015, 0.57], [0.5, 0.02, 0.64], [0.73, 0.055, 0.72], [0.88, 0.13, 1.04], [1, 0.065, 0.96], [1.2, 0, 0.87]];
  for (const crater of lunarCraters(flatRadius, center)) {
    const start = positions.length / 3;
    const segments = 48;
    for (const [radius, height, shade] of profile) {
      for (let i = 0; i <= segments; i++) {
        const a = i / segments * Math.PI * 2;
        const x = crater.x + Math.cos(a) * crater.r * radius;
        const z = crater.z + Math.sin(a) * crater.r * radius;
        const elevation = lunarHeight(x, z, flatRadius) + 0.12 + crater.r * height;
        positions.push(x, elevation, z);
        const variation = 1 + Math.sin(a * 3 + crater.x) * 0.035;
        colors.push(shade * variation, shade * variation, shade * variation * 0.98);
        uvs.push(x / (extent * 2) + 0.5, 0.5 - z / (extent * 2));
      }
    }
    for (let row = 0; row < profile.length - 1; row++) for (let i = 0; i < segments; i++) {
      const a = start + row * (segments + 1) + i;
      const b = a + segments + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** The lesson stays level; only the distant landscape curves away. */
export function lunarHeight(x: number, z: number, flatRadius = 100): number {
  const distance = Math.hypot(x, z);
  const r = Math.min(RADIUS - 1, Math.max(0, distance - flatRadius));
  const curve = -r * r / (RADIUS + Math.sqrt(RADIUS * RADIUS - r * r));
  const fade = Math.min(1, Math.max(0, (distance - flatRadius) / 100));
  const hills = (Math.sin(x * 0.012) * Math.cos(z * 0.017) + Math.sin(x * 0.031 + z * 0.009) * 0.35) * 3;
  return -0.01 + curve + hills * fade * fade;
}

export function createLunarTerrain(flatRadius = 100) {
  const geometry = new RingGeometry(0, flatRadius + 1100, 192, 80).rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    positions.setY(i, lunarHeight(x, z, flatRadius));
    const shade = 0.87 + 0.08 * Math.sin(x * 0.019 + z * 0.011) * Math.cos(z * 0.026);
    colors.set([shade, shade, shade * 0.98], i * 3);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
