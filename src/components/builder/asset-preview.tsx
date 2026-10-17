"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { ASSETS, type AssetId } from "@/lib/world/catalog";
import { AssetModel } from "../world/assets";
import { webglAvailable } from "@/lib/webgl";
import { NeutralToneMapping } from "three";

export default function AssetPreview({ asset }: { asset: AssetId }) {
  const def = ASSETS[asset];
  const scale = 1.75 / Math.max(...def.size);
  if (!webglAvailable()) return <div className="grid h-full place-items-center px-5 text-center text-sm">3D preview is unavailable on this device. You can still explore the learning cards.</div>;
  return <Canvas aria-label={`3D preview of ${def.name}`} camera={{ position: [2.8, 1.9, 2.8], fov: 36 }} dpr={[1, 1.5]} frameloop="demand" onCreated={({ gl }) => { gl.toneMapping = NeutralToneMapping; }}>
    <ambientLight intensity={1.4} />
    <directionalLight position={[3, 5, 4]} intensity={2.4} />
    <directionalLight position={[-3, 2, -2]} intensity={.7} />
    <group scale={scale}><AssetModel asset={asset} /></group>
    <OrbitControls enableDamping={false} enablePan={false} enableZoom={false} minPolarAngle={.3} maxPolarAngle={Math.PI / 2} />
  </Canvas>;
}
