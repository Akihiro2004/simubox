"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { createStarfield } from "@/lib/world/starfield";

const vertexShader = /* glsl */ `
  attribute float size;
  uniform float pixelRatio;
  varying vec3 vColor;
  void main() {
    vColor = color;
    // Sky directions only: camera translation cannot pull the stars closer.
    vec3 direction = mat3(viewMatrix) * position;
    gl_Position = projectionMatrix * vec4(direction, 1.0);
    // Pixel sizing keeps distant stars visible without large glowing sprites.
    gl_PointSize = size * pixelRatio;
  }
`;
const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float radius = length(gl_PointCoord - vec2(0.5));
    if (radius > 0.5) discard;
    float alpha = 1.0 - smoothstep(0.08, 0.5, radius);
    gl_FragColor = vec4(vColor, alpha);
    #include <colorspace_fragment>
  }
`;

/** One static points draw call, with no animation loop or per-star scene objects. */
export function Starfield() {
  const dpr = useThree((s) => s.viewport.dpr);
  const geometry = useMemo(() => createStarfield(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{ pixelRatio: { value: Math.min(dpr, 2) } }}
        vertexColors
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}
