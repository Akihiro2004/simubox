// Lets a lesson start before Gemini finishes writing it: finds each complete
// step in the partial ScenePlan JSON and validates the plan so far, so steps
// can be played one by one as they arrive.

import { normalizePlan, validatePlan, type ValidationResult } from "./validate";
import type { Command, ScenePlan, SceneSnapshot, Step } from "./schema";

/**
 * Splits partial plan JSON into the envelope written before "steps" and the
 * raw text of every step that is already complete. `head` is undefined until
 * the "steps" array has started.
 */
export function scanPlan(text: string): { head?: Record<string, unknown>; steps: string[] } {
  const start = text.indexOf("{");
  const steps: string[] = [];
  if (start < 0) return { steps };
  let depth = 0;
  let inString = false;
  let escaped = false;
  let key = "";
  let keyStart = -1;
  let lastString = "";
  let stringStart = -1;
  let stepsAt = -1; // index of the "steps" key
  let inSteps = false;
  let stepStart = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') {
        inString = false;
        lastString = text.slice(stringStart + 1, i);
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      stringStart = i;
    } else if (ch === ":" && depth === 1) {
      key = lastString;
      if (key === "steps" && stepsAt < 0) stepsAt = keyStart;
    } else if (ch === "{" || ch === "[") {
      depth++;
      if (inSteps && depth === 3 && ch === "{") stepStart = i;
      if (depth === 2 && ch === "[" && key === "steps") inSteps = true;
    } else if (ch === "}" || ch === "]") {
      if (inSteps && depth === 3 && ch === "}" && stepStart >= 0) {
        steps.push(text.slice(stepStart, i + 1));
        stepStart = -1;
      }
      if (inSteps && depth === 2 && ch === "]") inSteps = false;
      depth--;
    }
    // Remember where each top-level key starts so the head can be cut before "steps".
    if (depth === 1 && !inString && (ch === "{" || ch === ",")) keyStart = i + 1;
  }
  if (stepsAt < 0) return { steps };
  const before = text.slice(start, stepsAt).replace(/,\s*$/, "");
  try {
    const head = JSON.parse(`${before}}`) as unknown;
    return typeof head === "object" && head && !Array.isArray(head) ? { head: head as Record<string, unknown>, steps } : { steps };
  } catch {
    return { steps };
  }
}

export type StepEvent = { type: "begin"; plan: ScenePlan } | { type: "plan_step"; index: number; step: Step };

/**
 * Feed it the growing model text; it returns the steps that just became
 * playable. Every step goes through the same normalize + validate path as a
 * whole plan (re-run on the prefix, so ids spawned in earlier steps count).
 */
export function createStepStreamer(scene: Pick<SceneSnapshot, "world" | "objects" | "characters"> & Partial<Pick<SceneSnapshot, "gravity" | "projectile">> & { environment?: Record<string, unknown>; layouts?: SceneSnapshot["layouts"]; modules?: Record<string, unknown> }, lang: "en" | "id") {
  const emitted: Step[] = [];
  let last: Extract<ValidationResult, { ok: true }> | null = null;
  let scanned = 0;

  function feed(text: string): StepEvent[] {
    const scan = scanPlan(text);
    if (!scan.head || scan.steps.length <= scanned) return [];
    let raw: unknown[];
    try {
      raw = scan.steps.map((s) => JSON.parse(s) as unknown);
    } catch {
      return [];
    }
    const r = validatePlan(normalizePlan({ ...scan.head, steps: raw }, lang), scene, { partial: true });
    if (!r.ok) return [];
    scanned = scan.steps.length;
    last = r;
    const out: StepEvent[] = [];
    if (!emitted.length) out.push({ type: "begin", plan: { ...r.plan, steps: [] } });
    // A later step may make the validator add set_environment at the very
    // start of the plan (Moon/Mars gravity). That start already played, so
    // run it at the start of the first new step instead.
    const late: Command[] = emitted.length && !emitted[0].commands.some((c) => c.op === "set_environment") ? r.plan.steps[0].commands.filter((c) => c.op === "set_environment") : [];
    for (let i = emitted.length; i < r.plan.steps.length; i++) {
      const s = r.plan.steps[i];
      const step = i === emitted.length && late.length ? { ...s, commands: [...late, ...s.commands] } : s;
      emitted.push(step);
      out.push({ type: "plan_step", index: i, step });
    }
    return out;
  }

  /**
   * The whole plan validated: hand out any steps the stream didn't (a prefix
   * that failed to validate mid-stream must not cost the lesson its ending).
   */
  function finish(final: ScenePlan): StepEvent[] {
    const out: StepEvent[] = [];
    if (!emitted.length) out.push({ type: "begin", plan: { ...final, steps: [] } });
    for (let i = emitted.length; i < final.steps.length; i++) {
      emitted.push(final.steps[i]);
      out.push({ type: "plan_step", index: i, step: final.steps[i] });
    }
    return out;
  }

  return {
    feed,
    finish,
    /** How many steps have been handed out to play. */
    get count() {
      return emitted.length;
    },
    /** The plan as it was played, with the final envelope (follow-ups etc.) when given. */
    played(final?: ScenePlan): ScenePlan | null {
      const base = final ?? last?.plan;
      return base ? { ...base, steps: [...emitted] } : null;
    },
    get issues() {
      return last?.issues ?? [];
    },
  };
}
