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

/**
 * Speaks one line as raw 16-bit mono PCM, streamed: the first chunk arrives
 * in about a second, long before the whole line is generated. Resolves once
 * the first audio is in hand, so failures still surface as errors.
 */
export async function synthesizeStream(text: string, role: VoiceRole, lang: "en" | "id", cancel?: AbortSignal): Promise<SpeechStream> {
  // v3: raw PCM. v2 lines are sent bare (v1 style-prompted audio could contain the instruction).
  const key = `v3|${role}|${lang}|${text}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return { rate: hit.rate, chunks: (async function* () { yield hit.pcm; })() };
  }
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
        const all: Buffer[] = [Buffer.from(first!.data!, "base64")];
        yield all[0];
        for (let r = await it.next(); !r.done; r = await it.next()) {
          const d = audioOf(r)?.data;
          if (!d) continue;
          const b = Buffer.from(d, "base64");
          all.push(b);
          yield b;
        }
        cache.set(key, { pcm: Buffer.concat(all), rate });
        if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
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
