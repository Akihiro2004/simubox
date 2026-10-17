"use client";

// Small animated building blocks shared by every panel.

import { AnimatePresence, motion } from "motion/react";
import { useId } from "react";
import { spring } from "@/lib/motion";

/** iOS segmented control: the white thumb slides to the picked segment. */
export function Segmented<T extends string | number>({ label, value, options, onChange, cols }: { label: string; value: T | null; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; cols?: number }) {
  const id = useId();
  // Without `cols`, segments size to their labels when there is room (and shrink, truncated, when there is not).
  return (
    <div role="group" aria-label={label} className="seg grid gap-0.5" style={{ gridTemplateColumns: cols ? `repeat(${cols}, minmax(0, 1fr))` : `repeat(${options.length}, auto)` }}>
      {options.map(([v, l]) => {
        const on = value === v;
        return (
          <button key={String(v)} type="button" aria-pressed={on} className="relative min-h-8 min-w-0 px-2 text-[13px]" onClick={() => onChange(v)}>
            {on && <motion.span layoutId={`seg-${id}`} className="seg-thumb absolute inset-0" transition={spring.snappy} />}
            <span className="relative block truncate">{l}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Text that comes into focus one word at a time, the way the line is heard.
 * Long lines speed up so the whole thing is readable within about a second.
 */
export function RevealText({ text }: { text: string }) {
  const words = text.split(/(\s+)/).filter(Boolean);
  // Index among real words only, so spaces don't add to the delay.
  const order = words.map((_, k) => words.slice(0, k).filter((w) => w.trim()).length);
  const count = words.filter((w) => w.trim()).length;
  const step = Math.max(14, Math.min(42, 1100 / Math.max(1, count)));
  return (
    <span style={{ ["--step" as string]: `${step}ms` }}>
      {words.map((w, k) => (w.trim() ? <span key={k} className="reveal-word" style={{ ["--i" as string]: order[k] }}>{w}</span> : w))}
    </span>
  );
}

/** Crossfades icons with a little spin and blur when `id` changes (menu ↔ close, play ↔ pause…). */
export function SwapIcon({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={id}
        className="grid place-items-center"
        initial={{ opacity: 0, scale: 0.4, rotate: -45, filter: "blur(4px)" }}
        animate={{ opacity: 1, scale: 1, rotate: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, scale: 0.4, rotate: 45, filter: "blur(4px)" }}
        transition={spring.snappy}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}
