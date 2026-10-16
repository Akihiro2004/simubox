import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { type PlanRequest, type PlanIssue, type ScenePlan } from "../ssp/schema";
import { normalizePlan, validatePlan, type ValidationResult } from "../ssp/validate";
import { matchCapabilities } from "./capabilities";
import { looksIndonesian, precheck, safePlan } from "./guard";
import { systemPrompt, userPrompt } from "./prompt";

export const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

export function aiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_USE_VERTEXAI === "true");
}

let client: GoogleGenAI | null = null;
export function ai(): GoogleGenAI {
  if (client) return client;
  client =
    process.env.GOOGLE_GENAI_USE_VERTEXAI === "true"
      ? new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: process.env.GOOGLE_CLOUD_LOCATION || "global" })
      : new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

/**
 * Zod -> JSON Schema trimmed to what Gemini structured output accepts. Used
 * for small schemas (lesson upload). The lesson plan itself is too large for
 * Gemini's schema limits, so plans use JSON mode plus the generated command
 * reference in the prompt, and Zod validates the result.
 */
export function geminiSchema(schema: z.ZodType): unknown {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any" });
  const KEEP = new Set(["type", "properties", "required", "enum", "items", "anyOf", "minItems", "maxItems", "minimum", "maximum", "description", "additionalProperties", "$ref", "$defs", "propertyOrdering"]);
  const walk = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(walk);
    if (!n || typeof n !== "object") return n;
    const src = n as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      if (k === "const") out.enum = [v];
      else if (k === "oneOf") out.anyOf = walk(v);
      else if (k === "properties") out.properties = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([p, s]) => [p, walk(s)]));
      else if (KEEP.has(k)) out[k] = walk(v);
    }
    if (out.enum && !out.type) out.type = typeof (out.enum as unknown[])[0] === "number" ? "number" : "string";
    // Gemini rejects item-count limits on arrays of objects or of arrays
    // (they explode its decoder states). Zod still enforces every limit.
    const items = out.items as Record<string, unknown> | undefined;
    if (out.type === "array" && items && (items.type === "object" || items.type === "array" || items.anyOf)) {
      delete out.maxItems;
      delete out.minItems;
    }
    return out;
  };
  return walk(json);
}

/** Progress events streamed to the student while a lesson is being planned. */
export type DirectorEvent = { type: "status"; text: string } | { type: "thought"; title: string; text: string } | { type: "step"; title: string };

export type DirectorResult =
  | { ok: true; plan: ScenePlan; issues: PlanIssue[]; model: string; repaired: boolean; ms: number; mode?: "quick" | "lesson" }
  | { ok: false; status: number; error: string; code: "ai_unconfigured" | "ai_failed" | "ai_timeout" };

const TRANSIENT = /\b(429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE|fetch failed|ECONNRESET|UND_ERR/i;

/** First bold heading of a thought summary, e.g. "**Planning the scene**". */
function thoughtTitle(text: string): string {
  return (/\*\*(.+?)\*\*/.exec(text)?.[1] ?? text.split("\n")[0]).trim().slice(0, 80);
}

const EDIT_VERB = /^(please\s+)?(make|turn|set|change|break|fix|remove|delete|add|drop|push|throw|launch|double|halve|triple|increase|decrease|raise|lower|open|close|switch|zoom|focus|spin|stop|start|pause|put|move|heat|cool|warm|freeze|melt|plot|draw|graph|mark|try|swap|replace|use|give|let|now)\b/i;
const ABOUT_SCENE = /^(what|why|how|and|so|then|but)\b.{0,40}\b(if|it|this|that|these|those|the (one|other|bulb|ball|switch|lever|wave|cube|planet|cell|block))\b/i;

/**
 * How hard to think. Tweaks to the current scene and short follow-ups get a
 * quick plan with low thinking; new questions get a full lesson. ponytail:
 * keyword heuristic, a classifier call would add a round trip to every prompt.
 */
export function lessonMode(req: Pick<PlanRequest, "prompt" | "history">): "quick" | "lesson" {
  const p = req.prompt.trim();
  const words = p.split(/\s+/).length;
  if (words > 18) return "lesson";
  if (EDIT_VERB.test(p) && words <= 14) return "quick";
  return req.history.length > 0 && ABOUT_SCENE.test(p) ? "quick" : "lesson";
}

async function generate(contents: string, signal: AbortSignal, emit: (e: DirectorEvent) => void, quick: boolean): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const stream = await ai().models.generateContentStream({
        model: MODEL,
        contents,
        config: {
          systemInstruction: systemPrompt(),
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: quick ? ThinkingLevel.LOW : ThinkingLevel.MEDIUM, includeThoughts: true },
          maxOutputTokens: quick ? 6000 : 12000,
          abortSignal: signal,
        },
      });
      let text = "";
      const seenSteps = new Set<string>();
      for await (const chunk of stream) {
        for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
          if (!part.text) continue;
          if (part.thought) emit({ type: "thought", title: thoughtTitle(part.text), text: part.text.slice(0, 600) });
          else {
            text += part.text;
            // Surface step titles as the plan is being written.
            for (const m of text.matchAll(/"title"\s*:\s*"([^"]{1,60})"\s*,\s*"commands"/g)) {
              if (!seenSteps.has(m[1])) {
                seenSteps.add(m[1]);
                emit({ type: "step", title: m[1] });
              }
            }
          }
        }
      }
      if (!text) throw new Error("empty response");
      return text;
    } catch (e) {
      lastErr = e;
      if (signal.aborted || !TRANSIENT.test(String(e))) break;
      emit({ type: "status", text: "Connection hiccup, trying again…" });
      await new Promise((r) => setTimeout(r, 700 * 2 ** attempt));
    }
  }
  throw lastErr;
}

function issueReport(r: ValidationResult): string {
  if (!r.ok) return `The plan itself was invalid: ${r.error}`;
  return r.issues.map((i) => `- step ${i.step + 1}, command ${i.index + 1} (${i.op}): ${i.message}`).join("\n");
}

/** Prefer a valid plan, then the one that lost fewer commands. */
function better(a: ValidationResult, b: ValidationResult): ValidationResult {
  if (a.ok !== b.ok) return a.ok ? a : b;
  if (!a.ok || !b.ok) return a;
  return b.issues.length < a.issues.length ? b : a;
}

export async function direct(req: PlanRequest, emit: (e: DirectorEvent) => void = () => {}): Promise<DirectorResult> {
  const started = Date.now();
  const blocked = precheck(req.prompt, req.language);
  if (blocked) return { ok: true, plan: blocked, issues: [], model: "guard", repaired: false, ms: 0 };
  if (!aiConfigured()) return { ok: false, status: 503, code: "ai_unconfigured", error: "Gemini is not configured on this server." };

  const lang = req.language === "auto" ? (looksIndonesian(req.prompt) ? "id" : "en") : req.language;
  const signal = AbortSignal.timeout(Number(process.env.AI_TIMEOUT_MS) || 70_000);
  const mode = lessonMode(req);
  const base = userPrompt(req, matchCapabilities(req.prompt), mode);
  try {
    emit({ type: "status", text: mode === "quick" ? "Changing the scene" : "Reading your question" });
    let result = validatePlan(normalizePlan(safeJson(await generate(base, signal, emit, mode === "quick")), lang), req.scene);
    let repaired = false;
    // One repair round if anything was rejected, with the exact problems.
    if (!result.ok || result.issues.length) {
      emit({ type: "status", text: result.ok ? `Fixing ${result.issues.length} step${result.issues.length === 1 ? "" : "s"} that didn't fit` : "Tidying up the plan" });
      repaired = true;
      const prev = result.ok ? JSON.stringify(result.plan).slice(0, 12000) : "";
      const retry = `${base}\n\nYour previous ScenePlan had problems:\n${issueReport(result)}\n${prev ? `Previous plan (fix it, keep what worked):\n${prev}\n` : ""}Return the complete corrected ScenePlan JSON using only the documented command shapes.`;
      try {
        // Fixing named problems is mechanical: think briefly.
        const second = validatePlan(normalizePlan(safeJson(await generate(retry, signal, emit, true)), lang), req.scene);
        result = better(result, second);
      } catch (e) {
        if (!result.ok) throw e;
      }
    }
    if (!result.ok) {
      const msg = lang === "id" ? "Maaf, aku belum bisa menyiapkan pelajaran itu. Coba tanyakan dengan cara lain ya!" : "Sorry, I couldn't set up that lesson. Could you try asking another way?";
      return { ok: true, plan: safePlan(msg, lang, "needs_clarification"), issues: [], model: MODEL, repaired, ms: Date.now() - started };
    }
    emit({ type: "status", text: "Starting the lesson" });
    return { ok: true, plan: result.plan, issues: result.issues, model: MODEL, repaired, ms: Date.now() - started, mode };
  } catch (e) {
    const timeout = signal.aborted;
    console.error(JSON.stringify({ event: "ai_error", model: MODEL, timeout, message: String(e).slice(0, 300) }));
    return timeout
      ? { ok: false, status: 504, code: "ai_timeout", error: "The AI took too long. Please try again." }
      : { ok: false, status: 502, code: "ai_failed", error: "The AI service had a problem. Please try again in a moment." };
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Tolerate stray code fences or text around the object.
    const m = text.match(/\{[\s\S]*\}/);
    try {
      return m ? JSON.parse(m[0]) : null;
    } catch {
      return null;
    }
  }
}
