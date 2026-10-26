import { z } from "zod";
import { aiConfigured, isQuotaError } from "@/lib/ai/director";
import { MAX_TTS_CHARS, speechifyConfigured, synthesizeStream, VOICES, type VoiceRole } from "@/lib/ai/tts";
import { clientIp, rateLimit, verifyUser } from "@/lib/server/guard";

const Body = z.object({
  text: z.string().trim().min(1).max(MAX_TTS_CHARS),
  role: z.enum(Object.keys(VOICES) as [VoiceRole, ...VoiceRole[]]).default("robot"),
  lang: z.enum(["en", "id"]).default("en"),
  engine: z.enum(["gemini", "speechify"]).default("gemini"),
});

// Serverless hosts cut functions off early by default; one voice line may take up to 30 s.
export const maxDuration = 45;

export async function POST(req: Request) {
  if (!aiConfigured() && !speechifyConfigured()) return Response.json({ error: "Voice needs the AI, which isn't connected here.", code: "ai_unconfigured" }, { status: 503 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });

  const uid = await verifyUser(req);
  // A lesson has ~3-8 lines; prefetching makes bursts normal.
  if (!rateLimit(`tts:${uid ?? clientIp(req)}`, 40, 24)) return Response.json({ error: "Too many voice requests.", code: "rate_limited" }, { status: 429 });

  let speech;
  try {
    speech = await synthesizeStream(parsed.data.text, parsed.data.role, parsed.data.lang, parsed.data.engine, req.signal);
  } catch (e) {
    console.error(JSON.stringify({ event: "tts_error", message: String(e).slice(0, 200) }));
    // Out of credits: 503 tells the client to switch to the browser's own voice.
    if (isQuotaError(e)) return Response.json({ error: "Voice has reached its usage limit.", code: "ai_quota" }, { status: 503 });
    return Response.json({ error: "Voice unavailable right now.", code: "tts_failed" }, { status: 502 });
  }
  // Raw 16-bit little-endian mono PCM, sent as it is generated so playback can start at once.
  const chunks = speech.chunks[Symbol.asyncIterator]();
  const audio = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const r = await chunks.next();
        if (r.done) controller.close();
        else controller.enqueue(new Uint8Array(r.value));
      } catch (e) {
        console.error(JSON.stringify({ event: "tts_stream_error", message: String(e).slice(0, 200) }));
        controller.error(e);
      }
    },
    cancel() {
      void chunks.return?.();
    },
  });
  return new Response(audio, { headers: { "content-type": `audio/L16; rate=${speech.rate}`, "x-sample-rate": String(speech.rate), "cache-control": "no-store" } });
}
