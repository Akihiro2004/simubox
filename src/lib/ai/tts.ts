import "server-only";
import { GoogleGenAI } from "@google/genai";
import { isQuotaError } from "./director";

// Cheapest Gemini speech model on this account that still sounds natural.
export const TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts";
export const MAX_TTS_CHARS = 320;

/** One distinct prebuilt voice per kind of speaker. */
export const VOICES = {
  robot: "Puck", // upbeat
  kid: "Leda", // youthful
  teacher: "Sulafat", // warm
  scientist: "Sadaltager", // knowledgeable
  astronaut: "Iapetus", // clear
  narrator: "Achird", // friendly
} as const;
export type VoiceRole = keyof typeof VOICES;

/**
 * English lines are voiced by Speechify Simba 3.2 (fast, cheaper, no daily
 * request cap); Indonesian stays on Gemini, which Simba doesn't speak. One of
 * Simba 3.2's curated English voices per kind of speaker; override any of
 * them with SPEECHIFY_VOICES='{"kid":"harper_32"}'.
 */
export const SPEECHIFY_MODEL = process.env.SPEECHIFY_MODEL || "simba-3.2";
export const SPEECHIFY_VOICES: Record<VoiceRole, string> = {
  robot: "edmund_32", // dynamic, bright; made for animation and e-learning
  kid: "harper_32", // playful, soft (Simba has no child voices)
  teacher: "beatrice_32", // warm, emotive, e-learning
  scientist: "wyatt_32", // middle-aged, sophisticated
  astronaut: "dominic_32", // heartfelt, deep
  narrator: "geffen_32", // warm, clear American
  ...(() => {
    try {
      return JSON.parse(process.env.SPEECHIFY_VOICES || "{}") as Partial<Record<VoiceRole, string>>;
    } catch {
      return {};
    }
  })(),
};

export function speechifyConfigured(): boolean {
  return Boolean(process.env.SPEECHIFY_API_KEY);
}

export type VoiceEngine = "gemini" | "speechify";

/** Who voices a line: Speechify only for English, when picked in Settings and it has a key; otherwise Gemini. */
export function voiceProvider(lang: "en" | "id", engine: VoiceEngine = "gemini"): VoiceEngine {
  return lang === "en" && engine === "speechify" && speechifyConfigured() ? "speechify" : "gemini";
}


let client: GoogleGenAI | null = null;
const ai = () =>
  (client ??=
    process.env.GOOGLE_GENAI_USE_VERTEXAI === "true"
      ? new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: process.env.GOOGLE_CLOUD_LOCATION || "global" })
      : new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

// ponytail: per-instance LRU of recent lines; replays and repeated lines cost nothing.
const cache = new Map<string, { pcm: Buffer; rate: number }>();
const CACHE_MAX = 300;

export interface SpeechStream {
  /** Samples per second of the 16-bit mono PCM chunks. */
  rate: number;
  chunks: AsyncIterable<Buffer>;
}

const TRANSIENT = /fetch failed|ECONNRESET|UND_ERR|429|500|503|UNAVAILABLE/i;

/** Keeps a finished line in the LRU so replays and repeated lines cost nothing. */
function remember(key: string, stream: SpeechStream): SpeechStream {
  const src = stream.chunks;
  async function* chunks() {
    const all: Buffer[] = [];
    for await (const b of src) {
      all.push(b);
      yield b;
    }
    cache.set(key, { pcm: Buffer.concat(all), rate: stream.rate });
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  }
  return { rate: stream.rate, chunks: chunks() };
}

/**
 * Speaks one line as raw 16-bit mono PCM, streamed: the first chunk arrives
 * well before the whole line is generated. Resolves once the first audio is
 * in hand, so failures still surface as errors. English goes to Speechify and
 * falls back to Gemini if Speechify can't take it.
 */
export async function synthesizeStream(text: string, role: VoiceRole, lang: "en" | "id", engine: VoiceEngine, cancel?: AbortSignal): Promise<SpeechStream> {
  const provider = voiceProvider(lang, engine);
  // v3: raw PCM. v2 lines are sent bare (v1 style-prompted audio could contain the instruction).
  const key = `${provider}|v3|${role}|${lang}|${text}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return { rate: hit.rate, chunks: (async function* () { yield hit.pcm; })() };
  }
  if (provider === "speechify") {
    try {
      return remember(key, await speechifyStream(text, role, cancel));
    } catch (e) {
      if (cancel?.aborted) throw e;
      // Out of credits, rate-limited or down: this line falls back to Gemini.
      console.error(JSON.stringify({ event: "speechify_fallback", message: String(e).slice(0, 200) }));
      return remember(`gemini|v3|${role}|${lang}|${text}`, await geminiStream(text, role, cancel));
    }
  }
  try {
    return remember(key, await geminiStream(text, role, cancel));
  } catch (e) {
    // English on Gemini that hits its daily cap (or fails) is voiced by Speechify instead, if it has a key.
    if (cancel?.aborted || lang !== "en" || !speechifyConfigured()) throw e;
    console.error(JSON.stringify({ event: "gemini_tts_fallback", message: String(e).slice(0, 200) }));
    return remember(`speechify|v3|${role}|${lang}|${text}`, await speechifyStream(text, role, cancel));
  }
}

/** Speechify streams raw 16-bit little-endian mono PCM (24 kHz) for Accept: audio/pcm. */
async function speechifyStream(text: string, role: VoiceRole, cancel?: AbortSignal): Promise<SpeechStream> {
  const timeout = AbortSignal.timeout(20_000);
  const res = await fetch(`${process.env.SPEECHIFY_BASE_URL || "https://api.speechify.ai"}/v1/audio/stream`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.SPEECHIFY_API_KEY}`, "content-type": "application/json", accept: "audio/pcm" },
    body: JSON.stringify({ input: text, voice_id: SPEECHIFY_VOICES[role], model: SPEECHIFY_MODEL, language: "en-US" }),
    signal: cancel ? AbortSignal.any([timeout, cancel]) : timeout,
  });
  if (!res.ok || !res.body) throw new Error(`Speechify ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const rate = Number(/rate=(\d+)/.exec(res.headers.get("content-type") ?? "")?.[1] ?? 24000);
  const reader = res.body.getReader();
  // Wait for the first audio here, so a failure can still fall back to Gemini.
  const first = await reader.read();
  if (first.done || !first.value?.length) throw new Error("Speechify sent no audio");
  async function* chunks() {
    yield Buffer.from(first.value!);
    for (let r = await reader.read(); !r.done; r = await reader.read()) yield Buffer.from(r.value);
  }
  return { rate, chunks: chunks() };
}

async function geminiStream(text: string, role: VoiceRole, cancel?: AbortSignal): Promise<SpeechStream> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Only the line itself: a style instruction ("Say cheerfully...") is
      // sometimes read out loud by the TTS model. Each role's voice carries the character.
      const stream = await ai().models.generateContentStream({
        model: TTS_MODEL,
        contents: [{ role: "user", parts: [{ text }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICES[role] } } },
          abortSignal: cancel ? AbortSignal.any([AbortSignal.timeout(30_000), cancel]) : AbortSignal.timeout(30_000),
        },
      });
      const it = stream[Symbol.asyncIterator]();
      const audioOf = (r: IteratorResult<{ candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] }>) => (r.done ? undefined : r.value.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData);
      // Wait for the first audio here, where a retry is still possible.
      let first = audioOf(await it.next());
      while (!first) {
        const r = await it.next();
        if (r.done) throw new Error("no audio in response");
        first = audioOf(r);
      }
      const rate = Number(/rate=(\d+)/.exec(first.mimeType ?? "")?.[1] ?? 24000);
      async function* chunks() {
        yield Buffer.from(first!.data!, "base64");
        for (let r = await it.next(); !r.done; r = await it.next()) {
          const d = audioOf(r)?.data;
          if (d) yield Buffer.from(d, "base64");
        }
      }
      return { rate, chunks: chunks() };
    } catch (e) {
      lastErr = e;
      if (isQuotaError(e) || !TRANSIENT.test(String(e))) break;
      await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
    }
  }
  throw lastErr;
}
