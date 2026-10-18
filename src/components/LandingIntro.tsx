"use client";

import { useEffect, useState, type RefObject } from "react";

/** Keep the real page painting underneath: hiding it would also skip glass compositing. */
export default function LandingIntro({ sceneReady, allowContinue = true, motion, pageRef, onReveal }: {
  sceneReady: boolean;
  allowContinue?: boolean;
  motion: boolean;
  pageRef: RefObject<HTMLDivElement | null>;
  onReveal: () => void;
}) {
  const [assetsReady, setAssetsReady] = useState(false);
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [slow, setSlow] = useState(false);
  const [phase, setPhase] = useState<"loading" | "leaving" | "done">("loading");

  useEffect(() => {
    let alive = true;
    // Include the inline SVG displacement map: it is an image dependency too.
    const images = Array.from(pageRef.current?.querySelectorAll("img, feImage") ?? [], el => {
      const image = new Image();
      image.src = el.getAttribute("src") || el.getAttribute("href") || "";
      return image.decode();
    });
    void Promise.allSettled([document.fonts.ready, ...images]).then(() => {
      if (alive) setAssetsReady(true);
    });
    const minimum = window.setTimeout(() => setMinimumElapsed(true), 900);
    const escape = window.setTimeout(() => setSlow(true), 12_000);
    return () => { alive = false; clearTimeout(minimum); clearTimeout(escape); };
  }, [pageRef]);

  useEffect(() => {
    if (phase !== "loading" || !assetsReady || !minimumElapsed || !sceneReady) return;
    // Two browser paints let decoded images, fonts and the SVG filter settle together.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setPhase("leaving"));
    });
    return () => cancelAnimationFrame(frame);
  }, [assetsReady, minimumElapsed, sceneReady, phase]);

  useEffect(() => {
    if (phase !== "leaving") return;
    // Give the logo its own goodbye before the page entrance starts underneath.
    const reveal = window.setTimeout(onReveal, motion ? 120 : 0);
    const dismiss = window.setTimeout(() => setPhase("done"), motion ? 850 : 0);
    return () => { clearTimeout(reveal); clearTimeout(dismiss); };
  }, [phase, onReveal, motion]);

  if (phase === "done") return null;
  return (
    <div className="landing-intro" data-phase={phase} data-animated={motion}>
      <div role="status" aria-label="Loading SimuBox" className="landing-intro-brand">
        {/* eslint-disable-next-line @next/next/no-img-element -- immediate local branding, shared with the header */}
        <img src="/branding/simubox-wordmark.webp" alt="SimuBox" width={720} height={279} fetchPriority="high" className="landing-intro-logo" />
        <span className="landing-intro-dots" aria-hidden><i /><i /><i /></span>
      </div>
      {slow && allowContinue && phase === "loading" && <button className="landing-intro-continue btn" onClick={() => setPhase("leaving")}>Taking a little longer. Continue to page</button>}
    </div>
  );
}
