"use client";

import { useSyncExternalStore } from "react";
import { useSim } from "./store";

const query = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(query);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/** True when animations should play (setting, falling back to the OS preference). */
export function useMotion(): boolean {
  const setting = useSim((s) => s.settings.motion);
  const reduced = useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
  return setting === "on" ? true : setting === "off" ? false : !reduced;
}
