"use client";

import { ArrowUp, Check, ChevronUp, LoaderCircle, Plus, Square, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ask, stopAsking } from "@/lib/ask";
import { useSim } from "@/lib/store";
import { popover, rise, spring, swap } from "@/lib/motion";
import { SwapIcon } from "./kit";
import { LIMITS } from "@/lib/world/catalog";
import { idToken } from "@/lib/firebase";

const BASE = "Ask anything to simulate…";
const LINE = 22;
const MAX_H = LINE * 5 + 22; // five lines plus vertical padding
export const STARTERS = [
  "What if gravity disappeared in my room?",
  "Throw a basketball at 40° and 20 km/h",
  "Why is a water molecule bent?",
  "What would a ball do on the Moon?",
  "Show me what a carbon atom looks like",
  "Do heavy things fall faster?",
  "Explain photosynthesis",
];

/** Cycles example questions through the placeholder instead of chips. */
function useRotatingHint(items: string[], active: boolean) {
  const [i, setI] = useState(0);
  const list = [BASE, ...items];
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setI((n) => n + 1), 3400);
    return () => clearInterval(t);
  }, [active]);
  const idx = i % list.length;
  return { text: list[idx], example: idx > 0 ? list[idx] : null, key: i };
}

type Thinking = NonNullable<ReturnType<typeof useSim.getState>["thinking"]>;

function useElapsed(since: number) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, Math.round((now - since) / 1000));
}

/** What Simu is doing right now: Gemini's thought summaries and the lesson steps as they're written. */
function ThinkingPanel({ t }: { t: Thinking }) {
  const secs = useElapsed(t.startedAt);
  const row = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, transition: spring.layout } as const;
  return (
    <motion.section {...popover("bottom center", "bottom")} id="thinking-panel" className="glass pointer-events-auto max-h-[42dvh] w-full max-w-[680px] overflow-y-auto rounded-[22px] p-3" aria-live="polite" aria-label="What Simu is doing">
      <div className="flex items-baseline justify-between px-1 pb-2">
        <h2 className="text-[15px] font-extrabold">Simu is planning your lesson</h2>
        <span className="text-[13px] font-semibold tabular-nums text-ink-3">{secs}s</span>
      </div>
      {t.thoughts.length > 0 && (
        <div className="group-rows mb-2 overflow-hidden">
          <AnimatePresence initial={false}>
            {t.thoughts.map((th, i) => (
              <motion.div key={i} {...row} className="overflow-hidden">
                <div className="px-3.5 py-2.5">
                  <p className="text-[14px] font-bold">{th.title}</p>
                  <p className="line-clamp-3 text-[13px] font-semibold leading-snug text-ink-3">{th.text.replace(/\*\*.+?\*\*\s*/, "")}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      <div className="group-rows overflow-hidden">
        <AnimatePresence initial={false}>
          {t.steps.map((step, i) => (
            <motion.div key={i} {...row} className="overflow-hidden">
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 text-[14px] font-semibold">
                <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={spring.bouncy} className="grid shrink-0">
                  <Check size={15} className="text-[#30a46c]" />
                </motion.span>
                {step}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 text-[14px] font-semibold text-ink-3">
          <LoaderCircle size={15} className="shrink-0 animate-spin" />
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={t.status} {...swap}>
              {t.status}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </motion.section>
  );
}

export function Composer() {
  const draft = useSim((s) => s.draft);
  const status = useSim((s) => s.aiStatus);
  const followUps = useSim((s) => s.followUps);
  const hasMessages = useSim((s) => s.messages.length > 0);
  const lessonSuggestions = useSim((s) => s.lessonSuggestions);
  const set = useSim((s) => s.set);
  const area = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const thinking = useSim((s) => s.thinking);
  const [showThinking, setShowThinking] = useState(false);
  const busy = status !== "idle";

  const examples = lessonSuggestions.length ? lessonSuggestions.map((s) => s.prompt) : hasMessages && followUps.length ? followUps : STARTERS;
  const hint = useRotatingHint(examples, !draft && !busy);

  // Grow with the text up to MAX_H, and only allow scrolling past that (like ChatGPT/Claude).
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    const h = el.scrollHeight;
    el.style.height = `${Math.min(h, MAX_H)}px`;
    el.style.overflowY = h > MAX_H ? "auto" : "hidden";
  }, [draft]);

  const submit = (text = draft) => {
    if (!text.trim()) return;
    set({ draft: "", lessonSuggestions: [] });
    setNotice(null);
    void ask(text);
  };

  const upload = async (f: File) => {
    setNotice(null);
    if (f.size > 4 * 1024 * 1024) return setNotice("That file is over 4 MB. Try a shorter PDF or a text file.");
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", f);
      const token = await idToken();
      const res = await fetch("/api/ai/lesson", { method: "POST", body, headers: token ? { authorization: `Bearer ${token}` } : {} });
      const data = (await res.json().catch(() => ({}))) as { suggestions?: { label: string; prompt: string }[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      const suggestions = data.suggestions ?? [];
      set({ lessonSuggestions: suggestions });
      setNotice(suggestions.length ? `Got ${suggestions.length} ideas from “${f.name}”. They're in the box below, press Tab to use one.` : "No school science or maths topics found in that file.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 px-3 pb-[max(14px,env(safe-area-inset-bottom))] sm:pb-7">
      <AnimatePresence>{status === "thinking" && showThinking && thinking && <ThinkingPanel key="thinking" t={thinking} />}</AnimatePresence>
      <AnimatePresence>
        {notice && (
          <motion.p key={notice} {...rise} className="glass pointer-events-auto flex max-w-[640px] items-center gap-2 rounded-2xl py-2 pl-4 pr-2 text-[14px] font-semibold text-ink-2" role="status">
            {notice}
            <button className="btn btn-quiet grid h-7 w-7 shrink-0 place-items-center rounded-full" aria-label="Dismiss" onClick={() => setNotice(null)}>
              <X size={15} />
            </button>
          </motion.p>
        )}
      </AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...spring.smooth, delay: 0.25 }}
        className="relative w-full max-w-[680px]"
      >
        {/* Light running around the edge while Simu thinks; it glows through the glass. */}
        <AnimatePresence>
          {status === "thinking" && (
            <motion.span key="glow" aria-hidden initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, transition: { duration: 0.5 } }} transition={{ duration: 0.4 }} className="pointer-events-none absolute -inset-[3px] rounded-[31px]">
              <span className="ai-glow-halo absolute inset-0" />
              <span className="ai-glow absolute inset-0" />
            </motion.span>
          )}
        </AnimatePresence>
      <form
        className="glass composer pointer-events-auto relative flex w-full items-end gap-1 rounded-[28px] p-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input ref={file} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        <button type="button" className="btn btn-quiet grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-2" aria-label="Add a lesson file (PDF or text)" title="Add a lesson file (PDF or text)" disabled={uploading || busy} onClick={() => file.current?.click()}>
          <SwapIcon id={uploading ? "up" : "plus"}>{uploading ? <LoaderCircle size={20} className="animate-spin" /> : <Plus size={22} strokeWidth={2} />}</SwapIcon>
        </button>

        <div className="relative min-w-0 flex-1">
          {status === "thinking" ? (
            <button type="button" className="flex w-full min-w-0 items-center gap-1.5 py-[11px] text-left" aria-expanded={showThinking} aria-controls="thinking-panel" onClick={() => setShowThinking(!showThinking)}>
              <span className="relative min-w-0 overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span key={thinking?.status ?? ""} {...swap} className="thinking block truncate text-[16px] font-bold leading-[22px] sm:text-[17px]">
                    {thinking?.status ?? "Simu is thinking"}…
                  </motion.span>
                </AnimatePresence>
              </span>
              <motion.span animate={{ rotate: showThinking ? 0 : 180 }} transition={spring.snappy} className="grid shrink-0 text-ink-3">
                <ChevronUp size={17} />
              </motion.span>
            </button>
          ) : (
            <>
              <AnimatePresence initial={false} mode="wait">
                {!draft && (
                  <motion.span
                    key={hint.key}
                    aria-hidden
                    initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -10, filter: "blur(4px)", transition: { duration: 0.22 } }}
                    transition={spring.smooth}
                    className="pointer-events-none absolute inset-x-0 top-0 truncate py-[11px] text-[16px] font-semibold leading-[22px] text-ink-3 sm:text-[17px]"
                  >
                    {hint.text}
                  </motion.span>
                )}
              </AnimatePresence>
              <textarea
                id="prompt"
                ref={area}
                rows={1}
                value={draft}
                maxLength={LIMITS.maxPromptChars}
                aria-label="Ask SimuBox anything to simulate"
                className="scroll-thin relative block h-[44px] w-full resize-none overflow-hidden break-words bg-transparent py-[11px] text-[16px] font-semibold leading-[22px] text-ink outline-none [overflow-wrap:anywhere] sm:text-[17px]"
                onChange={(e) => set({ draft: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Tab" && !draft && hint.example) {
                    e.preventDefault();
                    set({ draft: hint.example });
                  } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
            </>
          )}
        </div>

        {/* One button that turns from Send into Stop (and back) instead of swapping elements. */}
        <button
          type={busy ? "button" : "submit"}
          className={`btn grid h-11 w-11 shrink-0 place-items-center rounded-full ${busy ? "btn-ink" : "btn-accent"}`}
          aria-label={busy ? "Stop" : "Send"}
          disabled={!busy && !draft.trim()}
          onClick={busy ? (e) => (e.preventDefault(), stopAsking()) : undefined}
        >
          <SwapIcon id={busy ? "stop" : "send"}>{busy ? <Square size={14} fill="currentColor" /> : <ArrowUp size={22} strokeWidth={2.6} />}</SwapIcon>
        </button>
      </form>
      </motion.div>
    </div>
  );
}
