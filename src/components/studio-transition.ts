"use client";

// Landing → studio: whatever was clicked grows into a frosted veil that fills
// the screen, Simu's mark pops in, the studio route loads underneath, and the
// veil dissolves once the 3D world has actually drawn, so it reads as one move.

import { animate, spring } from "animejs";

/** Same frosted paper as the studio's own world-change veil. */
// Opaque enough to need no backdrop blur (which re-blurs every frame while growing).
const VEIL = "radial-gradient(ellipse 70% 55% at 50% 42%, rgb(247,249,251), rgb(228,233,239))";

let active = false;

export function playStudioEntrance(from: HTMLElement | null, navigate: () => void, motion: boolean, page?: HTMLElement | null) {
  if (!motion || active) return navigate();
  active = true;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const r = from?.getBoundingClientRect() ?? new DOMRect(vw / 2 - 40, vh / 2 - 40, 80, 80);
  const radius = from ? parseFloat(getComputedStyle(from).borderTopLeftRadius) || 22 : 40;

  const veil = document.createElement("div");
  veil.setAttribute("aria-hidden", "true");
  veil.style.cssText = `position:fixed;z-index:100;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:${radius}px;background:${VEIL};box-shadow:0 30px 80px -30px rgba(31,41,55,.35);opacity:0;display:grid;place-items:center;overflow:hidden;pointer-events:auto`;
  const mark = document.createElement("img");
  mark.src = "/branding/simubox-mark.webp";
  mark.alt = "";
  mark.style.cssText = "width:120px;height:120px;opacity:0;transform:scale(.5)";
  veil.appendChild(mark);
  document.body.appendChild(veil);

  // The page sinks back while the veil takes over.
  if (page) animate(page, { scale: 0.965, opacity: 0.35, duration: 520, ease: "out(3)" });
  animate(veil, { opacity: [0, 1], duration: 160, ease: "out(2)" });
  // Grow to full screen first, then load the studio under it: loading the 3D
  // studio blocks the main thread, which would freeze the growth halfway.
  animate(veil, { left: 0, top: 0, width: vw, height: vh, borderRadius: 0, ease: spring({ bounce: 0, duration: 560 }), onComplete: () => setTimeout(navigate, 30) });
  animate(mark, { opacity: [0, 1], scale: [0.5, 1], delay: 200, ease: spring({ bounce: 0.45, duration: 640 }) });
  // Gentle breathing while the studio loads.
  const breathe = animate(mark, { translateY: [-4, 4], duration: 1100, ease: "inOutSine", loop: true, alternate: true, delay: 760 });

  const started = performance.now();
  const reveal = () => {
    breathe.pause();
    animate(mark, { scale: 1.12, opacity: 0, duration: 380, ease: "in(2)" });
    animate(veil, {
      opacity: 0,
      duration: 620,
      delay: 120,
      ease: "out(3)",
      onComplete: () => {
        veil.remove();
        active = false;
      },
    });
  };
  // Wait until the studio's 3D canvas has painted a couple of frames.
  let frames = 0;
  const wait = () => {
    const ready = location.pathname.startsWith("/app") && document.querySelector("canvas");
    frames = ready ? frames + 1 : 0;
    if (frames > 3 && performance.now() - started > 900) return reveal();
    if (performance.now() - started > 6000) return reveal();
    requestAnimationFrame(wait);
  };
  requestAnimationFrame(wait);
}
