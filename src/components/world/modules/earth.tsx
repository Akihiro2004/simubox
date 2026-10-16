"use client";

// Shared space/geography pieces: an Earth texture drawn from Natural Earth
// country outlines (public domain, via world-atlas), and a "sun-lit" material
// whose lit half always faces a given Sun position. That makes Moon phases,
// day/night and seasons correct regardless of the room lighting.

import { useMemo } from "react";
import { CanvasTexture, Color, SRGBColorSpace, ShaderMaterial, Vector3, type Texture } from "three";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import countries from "world-atlas/countries-110m.json";

let earthTexture: CanvasTexture | null = null;

/** Equirectangular Earth map: ocean, land, borders and a light graticule. */
export function getEarthTexture(): CanvasTexture {
  if (earthTexture) return earthTexture;
  const W = 2048, H = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#7fb7dd";
  ctx.fillRect(0, 0, W, H);
  const x = (lon: number) => ((lon + 180) / 360) * W;
  const y = (lat: number) => ((90 - lat) / 180) * H;

  // Graticule every 30°, equator and tropics a little stronger.
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  for (let lon = -180; lon <= 180; lon += 30) {
    ctx.beginPath();
    ctx.moveTo(x(lon), 0);
    ctx.lineTo(x(lon), H);
    ctx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y(lat));
    ctx.lineTo(W, y(lat));
    ctx.stroke();
  }

  const topo = countries as unknown as Topology<{ countries: GeometryCollection }>;
  const geo = feature(topo, topo.objects.countries) as unknown as { features: { geometry: { type: string; coordinates: number[][][] | number[][][][] } | null }[] };
  ctx.fillStyle = "#b9d39a";
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 1.2;
  for (const f of geo.features) {
    if (!f.geometry) continue;
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates as number[][][]] : (f.geometry.coordinates as number[][][][]);
    for (const poly of polys) {
      ctx.beginPath();
      for (const ring of poly) {
        ring.forEach(([lon, lat], i) => {
          // Avoid drawing lines across the map when a ring crosses the date line.
          const prev = ring[i - 1];
          if (i === 0 || (prev && Math.abs(prev[0] - lon) > 180)) ctx.moveTo(x(lon), y(lat));
          else ctx.lineTo(x(lon), y(lat));
        });
        ctx.closePath();
      }
      ctx.fill("evenodd");
      ctx.stroke();
    }
  }
  ctx.strokeStyle = "rgba(255,197,49,0.65)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, y(0));
  ctx.lineTo(W, y(0));
  ctx.stroke();

  earthTexture = new CanvasTexture(canvas);
  earthTexture.colorSpace = SRGBColorSpace;
  earthTexture.anisotropy = 4;
  return earthTexture;
}

const vert = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const frag = /* glsl */ `
  uniform vec3 uSun;
  uniform vec3 uColor;
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform float uNight;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  void main() {
    vec3 base = mix(uColor, texture2D(uMap, vUv).rgb, uHasMap);
    float d = dot(normalize(vWorldNormal), normalize(uSun - vWorldPos));
    // Soft terminator between the lit and dark halves.
    float lit = smoothstep(-0.06, 0.12, d);
    float shade = mix(uNight, 1.0, lit) * (0.75 + 0.25 * max(d, 0.0));
    gl_FragColor = vec4(base * shade, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Material lit only by the Sun at `sun` (world space). */
export function useSunLitMaterial(color: string, sun: [number, number, number], map?: Texture | null, night = 0.12) {
  return useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uSun: { value: new Vector3(...sun) },
          uColor: { value: new Color(color) },
          uMap: { value: map ?? null },
          uHasMap: { value: map ? 1 : 0 },
          uNight: { value: night },
        },
        vertexShader: vert,
        fragmentShader: frag,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uniforms are updated in place by callers
    [color, map, night],
  );
}
