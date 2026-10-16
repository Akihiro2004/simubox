"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { Suspense, useState } from "react";
import { NeutralToneMapping } from "three";
import { useShallow } from "zustand/react/shallow";
import { useSim } from "@/lib/store";
import { useMotion } from "@/lib/useMotion";
import { WORLDS } from "@/lib/world/catalog";
import { CameraRig } from "./camera";
import { KeyboardNavigator } from "./keys";
import { CharacterView } from "./characters";
import { SceneObjects } from "./objects";
import { Overlays } from "./overlays";
import { ProjectileStage } from "./projectile";
import { WorldDecor } from "./worlds";
import { EnvironmentLayer, MOOD } from "./environment";
import { Buoyancy, Water } from "./modules/fluid";
import { SpaceModule } from "./modules/space";
import { GlobeModule } from "./modules/globe";
import { MathModule } from "./modules/math";
import { WorkshopModules } from "./modules/workshop";
import { CellModule, ParticlesModule } from "./modules/lab";

/** Science modules render themselves only when their state is active. */
function ModuleScenes({ animate }: { animate: boolean }) {
  return (
    <>
      <SpaceModule />
      <GlobeModule animate={animate} />
      <MathModule />
      <WorkshopModules animate={animate} />
      <ParticlesModule animate={animate} />
      <CellModule animate={animate} />
    </>
  );
}

function Characters({ animate }: { animate: boolean }) {
  const ids = useSim(useShallow((s) => Object.keys(s.characters)));
  return (
    <>
      {ids.map((id) => (
        <CharacterById key={id} id={id} animate={animate} />
      ))}
    </>
  );
}
function CharacterById({ id, animate }: { id: string; animate: boolean }) {
  const c = useSim((s) => s.characters[id]);
  return c ? <CharacterView c={c} animate={animate} /> : null;
}

function Lights({ shadows, mapSize }: { shadows: boolean; mapSize: number }) {
  const world = useSim((s) => s.world);
  const light = useSim((s) => s.environment?.light ?? "day");
  const court = world === "court";
  const space = world === "space";
  const indoor = world === "bedroom" || world === "lab" || world === "workshop";
  const t = WORLDS[world].camera.target;
  const mood = light === "day" ? null : MOOD[light];
  return (
    <>
      {/* soft studio daylight: bright sky fill, one warm key light (or the restyled mood) */}
      <hemisphereLight args={mood ? [mood.sky, mood.ground, mood.hemi] : [space ? "#a6bce5" : "#f6f8ff", indoor ? "#b9a78b" : "#a4b5b1", space ? .55 : .85]} />
      <ambientLight intensity={mood ? mood.ambient : space ? .12 : .2} color="#ffffff" />
      <directionalLight
        position={[t[0] + 7, 13, t[2] + 6]}
        intensity={mood ? mood.sunI : space ? 1.5 : court ? 2.6 : 3.1}
        color={mood ? mood.sun : space ? "#c2d6ff" : "#fff0d8"}
        castShadow={shadows}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-camera-left={court ? -30 : -9}
        shadow-camera-right={court ? 30 : 9}
        shadow-camera-top={court ? 30 : 9}
        shadow-camera-bottom={court ? -30 : -9}
        shadow-camera-far={60}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      >
        <object3D attach="target" position={t} />
      </directionalLight>
      <directionalLight position={[-8, 5, -3]} intensity={mood ? mood.fill : space ? .75 : .55} color="#d5e5ed" />
    </>
  );
}

function World({ animate }: { animate: boolean }) {
  const { world, worldNonce, gravity, paused, restyled } = useSim(useShallow((s) => ({ world: s.world, worldNonce: s.worldNonce, gravity: s.gravity, paused: s.paused, restyled: s.environment !== null })));
  return (
    <>
      {/* the court's ground fades into the studio backdrop (a restyle brings its own sky and haze) */}
      {world === "court" && !restyled && <fog attach="fog" args={["#e4e9ef", 60, 380]} />}
      <EnvironmentLayer />
      <Physics key={worldNonce} gravity={gravity} paused={paused} timeStep={1 / 60} interpolate>
        <WorldDecor world={world} animate={animate} />
        <SceneObjects animate={animate} />
        {world === "ocean" && <Buoyancy />}
      </Physics>
      {world === "ocean" && <Water />}
      <ModuleScenes key={`m${worldNonce}`} animate={animate} />
      <Characters key={`c${worldNonce}`} animate={animate} />
      {world === "court" && <ProjectileStage key={`p${worldNonce}`} animate={animate} />}
      <Overlays />
    </>
  );
}

export default function SimuCanvas() {
  const animate = useMotion();
  const setting = useSim((s) => s.settings.quality);
  // Phones and small GPUs start at medium; PerformanceMonitor adjusts from there.
  const [auto, setAuto] = useState<"low" | "medium" | "high">(() => (window.matchMedia("(max-width: 700px)").matches || (navigator.hardwareConcurrency ?? 8) <= 4 ? "medium" : "high"));
  const [lost, setLost] = useState(false);
  const quality = setting === "auto" ? auto : setting;

  const dpr: [number, number] = quality === "low" ? [1, 1] : quality === "medium" ? [1, 1.5] : [1, 2];
  const shadows = quality !== "low";

  return (
    <>
      <Canvas
        className="simu-canvas"
        shadows={shadows}
        dpr={dpr}
        gl={{ antialias: quality !== "low", alpha: true, powerPreference: "high-performance" }}
        camera={{ position: WORLDS.bedroom.camera.position, fov: 32, near: 0.1, far: 3000 }}
        onPointerMissed={() => useSim.getState().set({ selectedId: null })}
        onCreated={({ gl }) => {
          // Neutral keeps the pastel diorama colours true (ACES greys them out).
          gl.toneMapping = NeutralToneMapping;
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            setLost(true);
          });
          gl.domElement.addEventListener("webglcontextrestored", () => setLost(false));
        }}
        aria-label="Interactive 3D science world"
      >
        {setting === "auto" && (
          <PerformanceMonitor onDecline={() => setAuto((q) => (q === "high" ? "medium" : "low"))} flipflops={2} onFallback={() => setAuto("low")} />
        )}
        <Lights shadows={shadows} mapSize={quality === "high" ? 2048 : 1024} />
        <Suspense fallback={null}>
          <World animate={animate} />
        </Suspense>
        <CameraRig animate={animate} />
        <KeyboardNavigator />
      </Canvas>
      {lost && (
        <div className="glass fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-[22px] px-5 py-4 text-[15px] font-semibold" role="alert">
          Your browser paused the 3D view.{" "}
          <button className="font-bold underline" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      )}
    </>
  );
}
