// Shared motion language: a few springs, used everywhere, so every piece of
// the interface moves with the same physical feel (like SwiftUI's defaults).

import type { TargetAndTransition, Transition } from "motion/react";

export const spring = {
  /** Buttons, icons, small toggles. */
  snappy: { type: "spring", visualDuration: 0.28, bounce: 0.18 },
  /** Panels, cards, sheets. */
  smooth: { type: "spring", visualDuration: 0.42, bounce: 0.12 },
  /** Playful arrivals: speech, correct answers, chips. */
  bouncy: { type: "spring", visualDuration: 0.5, bounce: 0.32 },
  /** Height and layout changes: no overshoot so text never jiggles. */
  layout: { type: "spring", visualDuration: 0.38, bounce: 0 },
} as const satisfies Record<string, Transition>;

/** Leaving is quicker than arriving, and never bounces. */
const leave: Transition = { type: "tween", duration: 0.18, ease: [0.4, 0, 1, 1] };

type Preset = { initial: TargetAndTransition; animate: TargetAndTransition; exit: TargetAndTransition; transition: Transition };

/** A glass panel that grows out of the control that opened it. */
export function popover(origin: string, from: "top" | "bottom" = "top"): Preset {
  const dy = from === "top" ? -10 : 10;
  return {
    initial: { opacity: 0, scale: 0.9, y: dy, transformOrigin: origin },
    animate: { opacity: 1, scale: 1, y: 0, transformOrigin: origin },
    exit: { opacity: 0, scale: 0.95, y: dy / 2, transition: leave },
    transition: spring.smooth,
  };
}

/** A card that rises into place. */
export const rise: Preset = {
  initial: { opacity: 0, y: 18, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 10, scale: 0.98, transition: leave },
  transition: spring.smooth,
};

/** Content swapping in place: the old text blurs away, the new one comes into focus. */
export const swap: Preset = {
  initial: { opacity: 0, y: 8, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -8, filter: "blur(6px)", transition: leave },
  transition: spring.snappy,
};

/** Parent/child variants for lists that cascade in. */
export const cascade = {
  parent: { hidden: {}, show: { transition: { staggerChildren: 0.025, delayChildren: 0.02 } } },
  child: {
    hidden: { opacity: 0, y: 6 },
    show: { opacity: 1, y: 0, transition: spring.snappy },
  },
} as const;
