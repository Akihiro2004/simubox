import { z } from "zod";
import { aiConfigured } from "@/lib/ai/director";
import { MAX_TTS_CHARS, synthesize, VOICES, type VoiceRole } from "@/lib/ai/tts";
import { clientIp, rateLimit, verifyUser } from "@/lib/server/guard";

const Body = z.object({
  text: z.string().trim().min(1).max(MAX_TTS_CHARS),
  role: z.enum(Object.keys(VOICES) as [VoiceRole, ...VoiceRole[]]).default("robot"),
  lang: z.enum(["en", "id"]).default("en"),
});

export async function POST(req: Request) {
  if (!aiConfigured()) return Response.json({ error: "Voice needs the AI, which isn't connected here.", code: "ai_unconfigured" }, { status: 503 });
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

  try {
    const wav = await synthesize(parsed.data.text, parsed.data.role, parsed.data.lang);
    return new Response(new Uint8Array(wav), { headers: { "content-type": "audio/wav", "cache-control": "private, max-age=86400" } });
  } catch (e) {
    console.error(JSON.stringify({ event: "tts_error", message: String(e).slice(0, 200) }));
    return Response.json({ error: "Voice unavailable right now.", code: "tts_failed" }, { status: 502 });
  }
}
