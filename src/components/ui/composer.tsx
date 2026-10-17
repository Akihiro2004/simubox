"use client";

import { ArrowUp, Check, ChevronUp, LoaderCircle, Plus, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ask, stopAsking } from "@/lib/ask";
import { useSim } from "@/lib/store";
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
  return (
    <section id="thinking-panel" className="glass sheet pointer-events-auto max-h-[42dvh] w-full max-w-[680px] overflow-y-auto rounded-[22px] p-3" aria-live="polite" aria-label="What Simu is doing">
      <div className="flex items-baseline justify-between px-1 pb-2">
        <h2 className="text-[15px] font-extrabold">Simu is planning your lesson</h2>
        <span className="text-[13px] font-semibold tabular-nums text-ink-3">{secs}s</span>
      </div>
      {t.thoughts.length > 0 && (
        <div className="group-rows mb-2">
          {t.thoughts.map((th, i) => (
            <div key={i} className="px-3.5 py-2.5">
              <p className="text-[14px] font-bold">{th.title}</p>
              <p className="line-clamp-3 text-[13px] font-semibold leading-snug text-ink-3">{th.text.replace(/\*\*.+?\*\*\s*/, "")}</p>
            </div>
          ))}
        </div>
      )}
      <div className="group-rows">
        {t.steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2.5 px-3.5 py-2.5 text-[14px] font-semibold">
            <Check size={15} className="shrink-0 text-[#30a46c]" />
            {step}
          </div>
        ))}
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 text-[14px] font-semibold text-ink-3">
          <LoaderCircle size={15} className="shrink-0 animate-spin" />
          {t.status}
        </div>
      </div>
    </section>
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
      {status === "thinking" && showThinking && thinking && <ThinkingPanel t={thinking} />}
      {notice && (
        <p className="glass pop pointer-events-auto flex max-w-[640px] items-center gap-2 rounded-2xl py-2 pl-4 pr-2 text-[14px] font-semibold text-ink-2" role="status">
          {notice}
          <button className="btn btn-quiet grid h-7 w-7 shrink-0 place-items-center rounded-full" aria-label="Dismiss" onClick={() => setNotice(null)}>
            <X size={15} />
          </button>
        </p>
      )}
      <form
        className="glass pointer-events-auto flex w-full max-w-[680px] items-end gap-1 rounded-[28px] p-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input ref={file} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        <button type="button" className="btn btn-quiet grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-2" aria-label="Add a lesson file (PDF or text)" title="Add a lesson file (PDF or text)" disabled={uploading || busy} onClick={() => file.current?.click()}>
          {uploading ? <LoaderCircle size={20} className="animate-spin" /> : <Plus size={22} strokeWidth={2} />}
        </button>

        <div className="relative min-w-0 flex-1">
          {status === "thinking" ? (
            <button type="button" className="flex w-full min-w-0 items-center gap-1.5 py-[11px] text-left" aria-expanded={showThinking} aria-controls="thinking-panel" onClick={() => setShowThinking(!showThinking)}>
              <span className="thinking truncate text-[16px] font-bold leading-[22px] sm:text-[17px]">{thinking?.status ?? "Simu is thinking"}…</span>
              <ChevronUp size={17} className={`shrink-0 text-ink-3 transition-transform duration-300 ${showThinking ? "" : "rotate-180"}`} />
            </button>
          ) : (
            <>
              {!draft && (
                <span key={hint.key} aria-hidden className="fade pointer-events-none absolute inset-x-0 top-0 truncate py-[11px] text-[16px] font-semibold leading-[22px] text-ink-3 sm:text-[17px]">
                  {hint.text}
                </span>
              )}
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

        {busy ? (
          <button type="button" className="btn btn-ink grid h-11 w-11 shrink-0 place-items-center rounded-full" aria-label="Stop" onClick={stopAsking}>
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button type="submit" className="btn btn-accent grid h-11 w-11 shrink-0 place-items-center rounded-full" aria-label="Send" disabled={!draft.trim()}>
            <ArrowUp size={22} strokeWidth={2.6} />
          </button>
        )}
      </form>
    </div>
  );
}
