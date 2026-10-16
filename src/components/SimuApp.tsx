"use client";

import dynamic from "next/dynamic";
import { useEffect, useSyncExternalStore } from "react";
import { useSim } from "@/lib/store";
import { useMotion } from "@/lib/useMotion";
import { initFirebase } from "@/lib/firebase";
import { cancelPlayback } from "@/lib/player";
import { stopSpeaking } from "@/lib/tts";
import { webglAvailable } from "@/lib/webgl";
import { MenuPanel, SettingsSheet, TopBar, Transcript } from "./ui/chrome";
import { Composer } from "./ui/composer";
import { CenterCards } from "./ui/infocard";
import { RightRail } from "./ui/controls";
import { ErrorToast, ExplanationCard, Metrics, NarratorCaption, QuestionCard } from "./ui/lesson";

const noop = () => () => {};

const SimuCanvas = dynamic(() => import("./world/SimuCanvas"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 grid place-items-center" role="status">
      <p className="thinking text-[17px] font-extrabold">Setting up the world…</p>
    </div>
  ),
});

export default function SimuApp() {
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
    <main className="relative h-dvh w-full overflow-hidden">
      {gl === false ? (
        <div className="glass fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[22px] p-5 text-center" role="alert">
          <p className="mb-2 text-[17px] font-extrabold">3D isn&apos;t available here</p>
          <p className="text-[14px] font-semibold text-ink-2">Your browser or device has WebGL turned off. Try a recent Chrome, Edge, Safari or Firefox, or enable hardware acceleration. You can still ask questions below.</p>
        </div>
      ) : (
        gl && <SimuCanvas />
      )}
      {/* Speech bubbles from the 3D scene render here, above the lesson cards. */}
      <div id="bubble-layer" className="pointer-events-none fixed inset-0 z-[35]" />
      <TopBar />
      <Metrics />
      <MenuPanel />
      <SettingsSheet />
      <Transcript />
      <ExplanationCard />
      <CenterCards />
      <QuestionCard />
      <RightRail />
      <NarratorCaption />
      <ErrorToast />
      <Composer />
    </main>
  );
}
