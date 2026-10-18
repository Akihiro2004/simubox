"use client";

import dynamic from "next/dynamic";
import { MotionConfig, motion as m } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useSim } from "@/lib/store";
import { useMotion } from "@/lib/useMotion";
import { initFirebase } from "@/lib/firebase";
import { cancelPlayback } from "@/lib/player";
import { stopSpeaking } from "@/lib/tts";
import { webglAvailable } from "@/lib/webgl";
import BuildAndDiscover from "./builder/BuildAndDiscover";
import { useBuilder } from "@/lib/builder/store";
import { LeftPanel, RightPanel, TopBar } from "./ui/chrome";
import { Composer } from "./ui/composer";
import { Onboarding } from "./ui/onboarding";
import { SignInGate } from "./ui/signin-gate";
import { CenterCards } from "./ui/infocard";
import { RightRail, TableViewActions } from "./ui/controls";
import { ErrorToast, ExplanationCard, Metrics, NarratorCaption, QuestionCard, SimuFace } from "./ui/lesson";

const noop = () => () => {};

const SimuCanvas = dynamic(() => import("./world/SimuCanvas"), {
  ssr: false,
  loading: () => <Splash />,
});

function Splash() {
  return (
    <div className="fixed inset-0 grid place-items-center" role="status">
      <div className="flex flex-col items-center gap-3">
        <SimuFace size={56} className="splash-face drop-shadow-[0_10px_18px_rgba(31,41,55,0.25)]" />
        <p className="thinking text-[17px] font-extrabold">Setting up the world…</p>
      </div>
    </div>
  );
}

/**
 * Changing worlds dissolves through a soft frosted veil instead of cutting,
 * which also hides the frame or two the new world needs to build itself.
 */
function WorldVeil() {
  const world = useSim((s) => s.world);
  const [seen, setSeen] = useState({ world, changes: 0 });
  if (seen.world !== world) setSeen({ world, changes: seen.changes + 1 });
  if (!seen.changes) return null;
  return <Veil key={seen.changes} />;
}

function Veil() {
  // Hold the veil until the new world has drawn a couple of frames (building
  // it can block the main thread), then dissolve; otherwise the fade would
  // be spent while nothing could paint.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(() => setReady(true))));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <m.div
      aria-hidden
      initial={{ opacity: 1 }}
      animate={{ opacity: ready ? 0 : 1 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none fixed inset-0 z-[5] backdrop-blur-xl"
      style={{ background: "radial-gradient(ellipse 70% 55% at 50% 42%, rgba(247,249,251,.92), rgba(225,230,236,.85))" }}
    />
  );
}

export default function SimuApp() {
  const editingMap = useBuilder((s) => s.editing);
  const motion = useMotion();
  // null during SSR/hydration, then the real answer on the client.
  const gl = useSyncExternalStore(noop, webglAvailable, () => null);

  useEffect(() => {
    void initFirebase();
    // Friendly hello from the guide (caption only; audio needs a user gesture).
    const t = setTimeout(() => {
      const s = useSim.getState();
      if (s.messages.length === 0 && !s.speech) {
        s.set({ speech: { key: -1, speaker: "simu", text: "Hi, I'm Simu! Ask me anything and I'll build it in 3D." } });
        setTimeout(() => useSim.getState().speech?.key === -1 && useSim.getState().set({ speech: null }), 6500);
      }
    }, 1400);
    const onHide = () => document.hidden && stopSpeaking();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onHide);
      cancelPlayback();
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.motion = motion ? "on" : "off";
  }, [motion]);

  return (
    <MotionConfig reducedMotion={motion ? "never" : "always"}>
    <main className="relative h-dvh w-full overflow-hidden">
      {gl === false ? (
        <div className="glass fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[22px] p-5 text-center" role="alert">
          <p className="mb-2 text-[17px] font-extrabold">3D isn&apos;t available here</p>
          <p className="text-[14px] font-semibold text-ink-2">Your browser or device has WebGL turned off. Try a recent Chrome, Edge, Safari or Firefox, or enable hardware acceleration. You can still ask questions below.</p>
        </div>
      ) : (
        gl && <SimuCanvas />
      )}
      <WorldVeil />
      {/* Speech bubbles from the 3D scene render here, above the lesson cards. */}
      <div id="bubble-layer" className="pointer-events-none fixed inset-0 z-[35]" />
      <TopBar />
      <TableViewActions />
      <BuildAndDiscover />
      <Metrics />
      {/* One shared card per side: each morphs between the panels it hosts. */}
      <LeftPanel />
      <RightPanel />
      <ExplanationCard />
      <CenterCards />
      <QuestionCard />
      {!editingMap && <RightRail />}
      <NarratorCaption />
      <ErrorToast />
      {!editingMap && <Composer />}
      {/* First sign-in welcome (or ?onboarding=1), above everything. */}
      <Onboarding />
      {/* A guest's second question waits here until they sign in. */}
      <SignInGate />
    </main>
    </MotionConfig>
  );
}
