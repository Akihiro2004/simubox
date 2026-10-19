"use client";

// Small animated building blocks shared by every panel.

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { useMotion } from "@/lib/useMotion";
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

export interface PickerOption<T extends string> {
  value: T;
  label: string;
  /** Small grey text after the label, e.g. a formula. */
  hint?: string;
}
export interface PickerGroup<T extends string> {
  name?: string;
  options: PickerOption<T>[];
}

/**
 * Dropdown in the app's glass style (replaces native <select>). A listbox in a
 * portal so panel scrolling can't clip it; flips upward when there's no room.
 * Keyboard: arrows, Home/End, Enter/Space, Escape, Tab, and type-to-jump.
 */
export function Picker<T extends string>({ label, value, onChange, groups, placeholder = "Choose…" }: { label: string; value: T | null; onChange: (v: T) => void; groups: PickerGroup<T>[]; placeholder?: string }) {
  const id = useId();
  const motionOn = useMotion();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; width: number; maxHeight: number; top?: number; bottom?: number }>({ left: 0, width: 0, maxHeight: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const flat = useMemo(() => groups.flatMap((g) => g.options), [groups]);
  const current = flat.find((o) => o.value === value);
  const down = pos.top !== undefined;

  const place = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
    const want = Math.min(380, flat.length * 40 + groups.filter((g) => g.name).length * 30 + 12);
    const width = Math.max(r.width, 220);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setPos(below >= want || below >= above ? { left, width, top: r.bottom + 6, maxHeight: Math.min(380, below) } : { left, width, bottom: window.innerHeight - r.top + 6, maxHeight: Math.min(380, above) });
  }, [flat.length, groups]);

  const show = () => {
    place();
    setActive(Math.max(0, flat.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }, []);
  const choose = (i: number) => {
    const o = flat[i];
    if (!o) return;
    close();
    if (o.value !== value) onChange(o.value);
  };

  useEffect(() => {
    if (!open) return;
    list.current?.focus({ preventScroll: true });
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !trigger.current?.contains(t)) close(false);
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place, close]);
  useEffect(() => {
    if (open) document.getElementById(`${id}-o${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);

  // Type-to-jump: letters typed within 0.7 s build a prefix to search for.
  const jump = (ch: string) => {
    const now = Date.now(), t = typed.current;
    t.text = now - t.at < 700 ? t.text + ch.toLowerCase() : ch.toLowerCase();
    t.at = now;
    const start = active + (t.text.length > 1 ? 0 : 1);
    for (let k = 0; k < flat.length; k++) {
      const i = (start + k) % flat.length;
      if (flat[i].label.toLowerCase().startsWith(t.text)) return setActive(i);
    }
  };
  const onListKey = (e: React.KeyboardEvent) => {
    const last = flat.length - 1;
    const keys: Record<string, () => void> = {
      ArrowDown: () => setActive((a) => Math.min(last, a + 1)),
      ArrowUp: () => setActive((a) => Math.max(0, a - 1)),
      Home: () => setActive(0),
      End: () => setActive(last),
      PageDown: () => setActive((a) => Math.min(last, a + 8)),
      PageUp: () => setActive((a) => Math.max(0, a - 8)),
      Enter: () => choose(active),
      " ": () => (Date.now() - typed.current.at < 700 ? jump(" ") : choose(active)),
      Escape: () => close(),
    };
    if (e.key === "Tab") return close(false);
    if (keys[e.key]) {
      e.preventDefault();
      keys[e.key]();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) jump(e.key);
  };

  let index = 0;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={`${label}: ${current?.label ?? placeholder}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        className="picker-trigger flex w-full items-center gap-2 rounded-[14px] px-3.5 py-2.5 text-left text-[15px] font-bold"
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
            e.preventDefault();
            show();
          }
        }}
      >
        <span className={`min-w-0 flex-1 truncate ${current ? "" : "text-ink-3"}`}>
          {current ? current.label : placeholder}
          {current?.hint && <span className="ml-1.5 font-semibold text-ink-3">{current.hint}</span>}
        </span>
        <ChevronDown size={18} aria-hidden className="shrink-0 text-ink-3 transition-transform duration-300" style={{ transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={list}
                id={`${id}-list`}
                role="listbox"
                aria-label={label}
                aria-activedescendant={`${id}-o${active}`}
                tabIndex={-1}
                onKeyDown={onListKey}
                className="picker-list glass fixed z-[80] overflow-y-auto overscroll-contain rounded-[18px] p-1.5 outline-none"
                style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight, transformOrigin: down ? "top center" : "bottom center" }}
                initial={motionOn ? { opacity: 0, scale: 0.96, y: down ? -6 : 6 } : { opacity: 0 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: motionOn ? 0.98 : 1, transition: { duration: 0.12 } }}
                transition={motionOn ? spring.snappy : { duration: 0 }}
              >
                {groups.map((g, gi) => (
                  <div key={g.name ?? gi} role="group" aria-label={g.name} className={gi ? "mt-1" : undefined}>
                    {g.name && <div aria-hidden className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">{g.name}</div>}
                    {g.options.map((o) => {
                      const i = index++;
                      const selected = o.value === value;
                      return (
                        <div
                          key={o.value}
                          id={`${id}-o${i}`}
                          role="option"
                          aria-selected={selected}
                          data-active={i === active}
                          className="picker-option relative flex min-h-10 cursor-pointer items-center gap-2 rounded-[11px] px-2.5 py-2 text-[14px]"
                          onPointerMove={() => i !== active && setActive(i)}
                          onClick={() => choose(i)}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {o.label}
                            {o.hint && <span className="ml-1.5 font-semibold text-ink-3">{o.hint}</span>}
                          </span>
                          {selected && <Check size={16} strokeWidth={2.6} aria-hidden className="shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
