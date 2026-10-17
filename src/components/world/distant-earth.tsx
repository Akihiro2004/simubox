"use client";

import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { SRGBColorSpace, type Group } from "three";

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - (modelMatrix * vec4(position, 1.0)).xyz);
    gl_Position = projectionMatrix * p;
  }
`;
const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec3 n = normalize(vNormal);
    float sunlight = dot(n, normalize(vec3(-0.55, 0.5, 1.0)));
    float day = smoothstep(-0.04, 0.14, sunlight);
    vec3 surface = texture2D(map, vUv).rgb;
    surface *= mix(0.008, 0.4 + 0.6 * max(sunlight, 0.0), day);
    float rim = pow(1.0 - max(0.0, dot(n, normalize(vView))), 3.5);
    surface += vec3(0.12, 0.38, 0.8) * rim * day * 0.45;
    gl_FragColor = vec4(surface, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Sky-distance Earth: camera translation produces no nearby-object parallax. */
export function DistantEarth() {
  const sky = useRef<Group>(null);
  const map = useTexture("/textures/earth-blue-marble.webp", (texture) => { texture.colorSpace = SRGBColorSpace; });
  useFrame(({ camera }) => sky.current?.position.copy(camera.position));
  return (
    <group ref={sky}>
      <mesh position={[-660, 100, -2180]} rotation={[0.18, -1.1, 0.05]}>
        <sphereGeometry args={[42, 48, 32]} />
        <shaderMaterial uniforms={{ map: { value: map } }} vertexShader={vertexShader} fragmentShader={fragmentShader} />
      </mesh>
    </group>
  );
}
