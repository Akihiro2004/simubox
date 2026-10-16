"use client";

import { pickFixture } from "./ai/fixtures";
import { safePlan, looksIndonesian } from "./ai/guard";
import { idToken } from "./firebase";
import { cancelPlayback, finishPlan, runPlan } from "./player";
import { ScenePlan, Step } from "./ssp/schema";
import { snapshot, useSim } from "./store";
import { LIMITS } from "./world/catalog";

let inflight: AbortController | null = null;

type PlanReply = { plan?: unknown; error?: string; code?: string };

/** A queue the player reads steps from while they are still arriving. */
function stepQueue() {
  const items: Step[] = [];
  let wake: (() => void) | null = null;
  let closed = false;
  const poke = () => {
    wake?.();
    wake = null;
  };
  return {
    push: (s: Step) => (items.push(s), poke()),
    close: () => ((closed = true), poke()),
    async *[Symbol.asyncIterator]() {
      for (;;) {
        if (items.length) yield items.shift()!;
        else if (closed) return;
        else await new Promise<void>((r) => (wake = r));
      }
    },
  };
}

/** Reads progress events into the store and returns the final result. Steps go to `onStep` as they arrive. */
async function readPlanStream(res: Response, signal: AbortSignal, onBegin: (plan: ScenePlan) => void, onStep: (step: Step) => void): Promise<PlanReply> {
  if (!res.ok || !res.body || !res.headers.get("content-type")?.includes("ndjson")) return (await res.json().catch(() => ({}))) as PlanReply;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let final: PlanReply = { error: "The connection closed before the lesson was ready." };
  const update = (f: (t: NonNullable<ReturnType<typeof useSim.getState>["thinking"]>) => void) => {
    const t = useSim.getState().thinking;
    if (!t || signal.aborted) return;
    const next = { ...t, steps: [...t.steps], thoughts: [...t.thoughts] };
    f(next);
    useSim.getState().set({ thinking: next });
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let e: { type: string; text?: string; title?: string; plan?: unknown; step?: unknown; error?: string; code?: string };
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }
      if (e.type === "status" && e.text) update((t) => void (t.status = e.text!));
      else if (e.type === "thought" && e.title) update((t) => void (t.thoughts.push({ title: e.title!, text: e.text ?? "" }), (t.status = e.title!)));
      else if (e.type === "step" && e.title) update((t) => void (t.steps.push(e.title!), (t.status = `Planning: ${e.title}`)));
      else if (e.type === "begin") {
        // Defense in depth: the client re-validates everything it plays.
        const head = ScenePlan.safeParse(e.plan);
        if (head.success && !signal.aborted) onBegin(head.data);
      } else if (e.type === "plan_step") {
        const step = Step.safeParse(e.step);
        if (step.success && !signal.aborted) onStep(step.data);
      } else if (e.type === "result") final = { plan: e.plan };
      else if (e.type === "error") final = { error: e.error, code: e.code };
    }
  }
  return final;
}

export async function ask(raw: string) {
  const prompt = raw.trim().slice(0, LIMITS.maxPromptChars);
  if (!prompt) return;
  inflight?.abort();
  const ctl = new AbortController();
  inflight = ctl;
  cancelPlayback();

  const s = useSim.getState();
  // History: the student's prompts and the short replies, not every spoken line.
  const history = s.messages
    .filter((m) => !m.speech)
    .slice(-8)
    .map((m) => ({ role: m.role, text: m.text.slice(0, 1200) }));
  s.addMessage("user", prompt);
  // The raw question until Gemini sums it up.
  s.set({ topic: prompt });
  s.set({ aiStatus: "thinking", aiError: null, followUps: [], question: null, thinking: { status: "Sending your question", steps: [], thoughts: [], startedAt: Date.now() } });
  const guide = s.characters.simu;
  if (guide) s.patchCharacter("simu", { animation: "think", animNonce: guide.animNonce + 1 });

  const queue = stepQueue();
  try {
    const token = await idToken();
    const res = await fetch("/api/ai/plan", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/x-ndjson", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ prompt, scene: snapshot(useSim.getState()), history, gradeBand: s.settings.gradeBand, language: s.settings.language }),
      signal: ctl.signal,
    });
    // The lesson starts with its first step, while the rest is still being written.
    let playing: Promise<void> | null = null;
    const data = await readPlanStream(
      res,
      ctl.signal,
      (head) => {
        useSim.getState().set({ thinking: null, aiStatus: "idle" });
        playing = runPlan(head, "gemini", { steps: queue });
      },
      (step) => queue.push(step),
    );
    queue.close();
    if (ctl.signal.aborted) return;
    useSim.getState().set({ thinking: null });

    if (res.ok && data.plan) {
      // Defense in depth: the client re-validates the envelope too.
      const parsed = ScenePlan.safeParse(data.plan);
      if (playing) {
        if (parsed.success) finishPlan(parsed.data, "gemini");
        await playing;
        return;
      }
      if (!parsed.success) throw new Error("The AI answer was not in the expected format.");
      useSim.getState().set({ aiStatus: "idle" });
      await runPlan(parsed.data, "gemini");
      return;
    }
    // A cut-off stream still leaves the steps that arrived playing.
    if (playing) {
      await playing;
      return;
    }
    if (data.code === "ai_unconfigured" || data.code === "ai_quota") {
      const quota = data.code === "ai_quota";
      const fixture = pickFixture(prompt);
      const lang = looksIndonesian(prompt) ? "id" : "en";
      useSim.getState().set({ aiStatus: "idle" });
      if (fixture) {
        if (quota) useSim.getState().set({ aiError: lang === "id" ? "AI langsung sedang mencapai batas pemakaian, jadi ini demo bawaan." : "Live AI has reached its usage limit, so this is a built-in demo." });
        await runPlan(fixture, "offline-demo");
      } else {
        const why = quota
          ? lang === "id" ? "AI langsung sedang mencapai batas pemakaian." : "Live AI has reached its usage limit for now."
          : lang === "id" ? "AI belum tersambung di server ini." : "The AI isn't connected on this server yet.";
        const msg =
          lang === "id"
            ? `Mode demo offline: ${why} Coba salah satu demo: gravitasi, lemparan bola, atau molekul air.`
            : `Offline demo mode: ${why} Try one of the built-in demos: gravity, throwing a ball, or a water molecule.`;
        await runPlan(safePlan(msg, lang, "needs_clarification"), "local");
      }
      return;
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  } catch (e) {
    if (ctl.signal.aborted) return;
    const msg = e instanceof Error ? e.message : "Something went wrong.";
    useSim.getState().set({ aiStatus: "idle", aiError: msg.includes("fetch") ? "Can't reach SimuBox right now. Check your connection and try again." : msg });
    const g = useSim.getState().characters.simu;
    if (g) useSim.getState().patchCharacter("simu", { animation: "surprised", animNonce: g.animNonce + 1 });
  } finally {
    queue.close();
    if (inflight === ctl) {
      inflight = null;
      useSim.getState().set({ thinking: null });
    }
  }
}

export function stopAsking() {
  inflight?.abort();
  inflight = null;
  cancelPlayback();
  useSim.getState().set({ aiStatus: "idle", thinking: null });
}
