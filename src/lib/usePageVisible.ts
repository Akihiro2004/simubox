"use client";

import { useSyncExternalStore } from "react";

const subscribe = (notify: () => void) => {
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
};
const visible = () => !document.hidden;

/** Suspend GPU work in background tabs without changing the user's Pause state. */
export function usePageVisible() {
  return useSyncExternalStore(subscribe, visible, () => true);
}
