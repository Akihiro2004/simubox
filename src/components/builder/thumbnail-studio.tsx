"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import { NeutralToneMapping } from "three";
import { ASSETS, type AssetId } from "@/lib/world/catalog";
import { DISCOVERIES } from "@/lib/builder/catalog";
import { AssetModel } from "../world/assets";
import { webglAvailable } from "@/lib/webgl";

const cache = new Map<AssetId, string>();

function CaptureModel({ asset, done }: { asset: AssetId; done: (id: AssetId, src: string) => void }) {
  const frames = useRef(0);
  const scale = 1.75 / Math.max(...ASSETS[asset].size);
  useFrame(({ gl, scene, camera }) => {
    if (++frames.current !== 3) return;
    gl.render(scene, camera);
    done(asset, gl.domElement.toDataURL("image/png"));
  });
  return <>
    <ambientLight intensity={1.4} />
    <directionalLight position={[3, 5, 4]} intensity={2.4} />
    <directionalLight position={[-3, 2, -2]} intensity={.7} />
    <group scale={scale}><AssetModel asset={asset} /></group>
  </>;
}

/** One small renderer, shared by the entire shop. Never create a WebGL context per card. */
export function ThumbnailRenderer({ onThumbnail }: { onThumbnail: (id: AssetId, src: string) => void }) {
  const [queue] = useState(() => DISCOVERIES.map(item => item.asset).filter(id => !cache.has(id)));
  const [index, setIndex] = useState(0);
  const asset = queue[index];
  if (!asset || !webglAvailable()) return null;
  return <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, width: 192, height: 144, pointerEvents: "none" }}>
    <Canvas dpr={1} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }} camera={{ position: [2.8, 1.9, 2.8], fov: 36 }} onCreated={({ gl }) => { gl.toneMapping = NeutralToneMapping; }}>
      <CaptureModel key={asset} asset={asset} done={(id, src) => { cache.set(id, src); onThumbnail(id, src); setIndex(i => i + 1); }} />
    </Canvas>
  </div>;
}

export function cachedThumbnails(): Partial<Record<AssetId, string>> {
  return Object.fromEntries(cache);
}

/** Development-only tool. scripts/generate-asset-thumbnails.mjs writes these images to public/. */
export default function ThumbnailStudio() {
  const [thumbnails, setThumbnails] = useState(cachedThumbnails);
  return <main style={{ height: "100dvh", overflow: "auto", padding: 24, background: "#f4f5f7" }}>
    <h1>Asset thumbnail studio</h1><p>{Object.keys(thumbnails).length} / {DISCOVERIES.length} exact model renders</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, 200px)", gap: 12 }}>{DISCOVERIES.map(item => <div key={item.asset} data-asset-id={item.asset}>
      {/* eslint-disable-next-line @next/next/no-img-element -- development-only image export */}
      {thumbnails[item.asset] && <img src={thumbnails[item.asset]} width={192} height={144} alt={ASSETS[item.asset].name} />}<p>{ASSETS[item.asset].name}</p>
    </div>)}</div>
    <ThumbnailRenderer onThumbnail={(id, src) => setThumbnails(current => ({ ...current, [id]: src }))} />
  </main>;
}
