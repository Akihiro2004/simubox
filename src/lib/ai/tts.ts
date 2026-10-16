import "server-only";
import { GoogleGenAI } from "@google/genai";

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

const STYLE: Record<VoiceRole, string> = {
  robot: "cheerfully, like a friendly little robot guide talking to kids",
  kid: "with curious excitement, like a young student",
  teacher: "warmly and clearly, like a kind teacher",
  scientist: "clearly and enthusiastically, like a friendly scientist",
  astronaut: "calmly and clearly, like an astronaut on a radio",
  narrator: "in a friendly, clear storytelling voice for children",
};

let client: GoogleGenAI | null = null;
const ai = () =>
  (client ??=
    process.env.GOOGLE_GENAI_USE_VERTEXAI === "true"
      ? new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: process.env.GOOGLE_CLOUD_LOCATION || "global" })
      : new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

// ponytail: per-instance LRU of recent lines; replays and repeated lines cost nothing.
const cache = new Map<string, Buffer>();
const CACHE_MAX = 300;

/** Wrap raw 16-bit mono PCM in a WAV header (when the API returns L16). */
function pcmToWav(pcm: Buffer, rate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export async function synthesize(text: string, role: VoiceRole, lang: "en" | "id"): Promise<Buffer> {
  const key = `${role}|${lang}|${text}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const prompt = `Say ${STYLE[role]}${lang === "id" ? ", in Indonesian" : ""}: ${text}`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await ai().models.generateContent({
        model: TTS_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICES[role] } } },
          abortSignal: AbortSignal.timeout(30_000),
        },
      });
      const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (!part?.inlineData?.data) throw new Error("no audio in response");
      const raw = Buffer.from(part.inlineData.data, "base64");
      const mime = part.inlineData.mimeType ?? "";
      const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000);
      const wav = mime.includes("wav") ? raw : pcmToWav(raw, rate);
      cache.set(key, wav);
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
      return wav;
    } catch (e) {
      lastErr = e;
      if (!/fetch failed|ECONNRESET|UND_ERR|429|500|503|UNAVAILABLE/i.test(String(e))) break;
      await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
    }
  }
  throw lastErr;
}
