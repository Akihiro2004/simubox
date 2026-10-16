import { DataTexture, RedFormat, RepeatWrapping, LinearFilter, UnsignedByteType } from "three";

const textures = new Map<string, DataTexture>();

/** Subtle procedural relief; no network textures or random changes on reset. */
export function surfaceBump(kind: "wood" | "woven" | "stone") {
  const cached = textures.get(kind);
  if (cached) return cached;
  const size = 128, pixels = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const grain = Math.sin(x * .55 + Math.sin(y * .07) * 1.7);
    const noise = ((x * 17 + y * 31 + x * y * 3) % 29) / 29;
    const value = kind === "wood" ? .5 + grain * .16 + noise * .13 : kind === "woven" ? .4 + (x % 4 < 2 ? .2 : 0) + (y % 4 < 2 ? .2 : 0) : .45 + noise * .3;
    pixels[y * size + x] = Math.round(value * 255);
  }
  const texture = new DataTexture(pixels, size, size, RedFormat, UnsignedByteType);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  textures.set(kind, texture);
  return texture;
}
