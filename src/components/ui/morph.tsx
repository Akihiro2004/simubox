"use client";

import { AnimatePresence, motion } from "motion/react";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { popover } from "@/lib/motion";

const subscribe = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
const size = () => `${window.innerWidth}x${window.innerHeight}`;

/** Viewport size in px, live; 1280×800 before hydration. */
export function useViewport(): { w: number; h: number } {
  const s = useSyncExternalStore(subscribe, size, () => "1280x800");
  const [w, h] = s.split("x").map(Number);
  return { w, h };
}

/**
 * The glass springs to its new size quickly, with the faintest settle. Size
 * changes repaint the frosted glass every frame, so the shorter the better.
 */
const morph = { type: "spring", visualDuration: 0.26, bounce: 0.06 } as const;
const sized = { width: morph, height: morph, y: morph };

/**
 * New content fades and lifts in while the old one fades out. Only opacity and
 * transform: animating blur here re-rendered the whole panel every frame.
 */
/** The landing page's swap: content dissolves through a blur, like frosted glass. */
const blurSwap = {
  initial: { opacity: 0, y: 8, scale: 0.98, filter: "blur(10px)" },
  animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, filter: "blur(10px)", transition: { duration: 0.18, ease: "easeIn" } },
  transition: { type: "spring", visualDuration: 0.34, bounce: 0 },
} as const;

const contentSwap = {
  initial: { opacity: 0, y: 6, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, transition: { duration: 0.08, ease: "easeIn" } },
  transition: { type: "spring", visualDuration: 0.24, bounce: 0 },
} as const;

/**
 * One glass card that several panels share. Changing `contentKey` morphs the
 * same card into the new panel: its width, height and position spring to fit
 * while the content cross-fades, so the panels feel like one object.
 *
 * Place it inside a fixed area (`area`); the card sits at the top of it, or
 * centred vertically when `center` is set.
 */
export function MorphPanel({
  contentKey,
  width,
  center = false,
  side,
  area,
  surface = "glass rounded-[22px]",
  blur = false,
  children,
}: {
  /** null hides the card. */
  contentKey: string | null;
  width: number;
  center?: boolean;
  side: "left" | "right";
  /** Classes positioning the fixed area the card lives in. */
  area: string;
  /** Classes for the card's material and corners. */
  surface?: string;
  /** Swap content through a blur (fine for small cards; costs a repaint per frame). */
  blur?: boolean;
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  const [room, setRoom] = useState(0);
  const open = contentKey !== null;

  // Track the content's height and the room the area offers.
  useLayoutEffect(() => {
    const el = inner.current;
    const area = box.current;
    if (!el || !area) return;
    const measure = () => {
      setH(el.offsetHeight);
      setRoom(area.clientHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(area);
    return () => ro.disconnect();
  }, [open]);

  // Re-measure as soon as the content switches (the old content has already
  // been popped out of the flow), so a growing card starts growing at once.
  useLayoutEffect(() => {
    if (inner.current) setH(inner.current.offsetHeight);
  }, [contentKey]);

  const y = center && h ? Math.max(0, (room - h) / 2) : 0;
  const enter = popover(side === "left" ? "top left" : "top right");

  return (
    <div ref={box} className={`pointer-events-none fixed ${area}`}>
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ ...enter.initial, width, y }}
            animate={{ ...enter.animate, width, y, ...(h ? { height: h } : {}) }}
            exit={enter.exit}
            transition={{ ...enter.transition, ...sized }}
            className={`${surface} pointer-events-auto absolute top-0 overflow-hidden ${side === "left" ? "left-0" : "right-0"}`}
          >
            <div ref={inner} className="scroll-thin overflow-y-auto overflow-x-hidden" style={{ width, maxHeight: room || undefined }}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div key={contentKey} {...(blur ? blurSwap : contentSwap)} style={{ transformOrigin: side === "left" ? "0 0" : "100% 0" }}>
                  {children}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
