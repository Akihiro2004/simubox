"use client";

import { Html } from "@/components/world/html";
import type { OpticsSetup } from "@/lib/engine/optics";

const vertexShader = /* glsl */ `
  varying vec3 worldPoint;
  void main() {
    vec4 p = modelMatrix * vec4(position, 1.0);
    worldPoint = p.xyz;
    gl_Position = projectionMatrix * viewMatrix * p;
  }
`;
const fragmentShader = /* glsl */ `
  uniform vec3 enabled;
  varying vec3 worldPoint;
  void main() {
    vec3 lamps[3];
    lamps[0] = vec3(-1.1, 1.5, 1.4);
    lamps[1] = vec3(0.0, 1.55, 1.55);
    lamps[2] = vec3(1.1, 1.5, 1.4);
    vec3 targets[3];
    targets[0] = vec3(-0.32, 2.05, -3.9);
    targets[1] = vec3(0.0, 2.45, -3.9);
    targets[2] = vec3(0.32, 2.05, -3.9);
    vec3 result = vec3(0.018);
    for (int i = 0; i < 3; i++) {
      vec3 path = worldPoint - lamps[i];
      float distanceToScreen = length(path);
      vec3 direction = path / distanceToScreen;
      float cone = smoothstep(cos(0.24), cos(0.18), dot(direction, normalize(targets[i] - lamps[i])));
      // Exact line/sphere occlusion; the three colour shadows need no shadow maps.
      vec3 toSphere = vec3(0.0, 1.85, -1.4) - lamps[i];
      float t = dot(toSphere, direction);
      float perpendicular2 = max(0.0, dot(toSphere, toSphere) - t * t);
      float shadow = t > 0.0 && t < distanceToScreen ? 1.0 - smoothstep(0.023, 0.028, perpendicular2) : 0.0;
      result[i] += enabled[i] * cone * (1.0 - shadow) * 0.95;
    }
    gl_FragColor = vec4(result, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Additive RGB projection with analytic coloured shadows, in one screen draw call. */
export function OpticsMixing({ m }: { m: NonNullable<OpticsSetup["mixing"]> }) {
  const lamps = [
    { name: "red", on: m.red, color: "#ff3232", at: [-1.1, 1.5, 1.4] as const },
    { name: "green", on: m.green, color: "#30ed69", at: [0, 1.55, 1.55] as const },
    { name: "blue", on: m.blue, color: "#4d7dff", at: [1.1, 1.5, 1.4] as const },
  ];
  const on = lamps.filter((lamp) => lamp.on).map((lamp) => lamp.name);
  const mix = on.length === 3 ? "white" : ({ "red,green": "yellow", "green,blue": "cyan", "red,blue": "magenta" } as Record<string, string>)[on.join(",")] ?? on[0];
  return <>
    <mesh position={[0, 2.2, -3.895]}>
      <planeGeometry args={[3.36, 1.72]} />
      <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={{ enabled: { value: [Number(m.red), Number(m.green), Number(m.blue)] } }} toneMapped={false} />
    </mesh>
    {lamps.map((lamp) => <group key={lamp.name} position={lamp.at}>
      <mesh><sphereGeometry args={[0.09, 16, 12]} /><meshBasicMaterial color={lamp.on ? lamp.color : "#596c70"} toneMapped={false} /></mesh>
      <mesh position={[0, -0.29, 0]}><cylinderGeometry args={[0.018, 0.018, 0.5, 8]} /><meshStandardMaterial color="#73949a" /></mesh>
    </group>)}
    <mesh position={[0, 1.85, -1.4]}><sphereGeometry args={[0.16, 24, 18]} /><meshStandardMaterial color="#f5eee0" roughness={0.65} /></mesh>
    <mesh position={[0, 1.28, -1.4]}><cylinderGeometry args={[0.012, 0.012, 0.82, 8]} /><meshStandardMaterial color="#73949a" /></mesh>
    <Html position={[0, 3.28, -3.9]} center zIndexRange={[14, 0]} style={{ pointerEvents: "none" }}>
      <div className="tag max-w-[80vw] px-3 py-1 text-center text-[12px]">{on.length ? `In the overlap: ${on.join(" + ")} = ${mix}` : "All projectors off"}</div>
    </Html>
  </>;
}
