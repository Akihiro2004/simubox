import { suggestFromLesson } from "@/lib/ai/lesson";
import { aiConfigured } from "@/lib/ai/director";
import { clientIp, rateLimit, verifyUser } from "@/lib/server/guard";

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES: Record<string, "pdf" | "text"> = { "application/pdf": "pdf", "text/plain": "text", "text/markdown": "text" };

export async function POST(req: Request) {
  if (!aiConfigured()) return Response.json({ error: "Lesson upload needs the AI, which isn't connected on this server.", code: "ai_unconfigured" }, { status: 503 });
  if (Number(req.headers.get("content-length") || 0) > MAX_BYTES + 64_000) return Response.json({ error: "Please use a file under 4 MB." }, { status: 413 });

  const uid = await verifyUser(req);
  if (!rateLimit(`lesson:${uid ?? clientIp(req)}`, 2, 4)) return Response.json({ error: "Too many uploads. Try again in a minute." }, { status: 429 });

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }
  if (!file) return Response.json({ error: "No file received." }, { status: 400 });
  // Browsers sometimes send .md as octet-stream; fall back to the extension.
  const kind = TYPES[file.type] ?? (/\.(md|txt)$/i.test(file.name) ? "text" : /\.pdf$/i.test(file.name) ? "pdf" : undefined);
  if (!kind) return Response.json({ error: "Please upload a PDF or a text file." }, { status: 415 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Please use a file under 4 MB." }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  if (kind === "pdf" && bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return Response.json({ error: "That doesn't look like a valid PDF." }, { status: 415 });

  // The file is processed in memory and never stored.
  const result = await suggestFromLesson(kind === "pdf" ? { pdf: bytes.toString("base64") } : { text: bytes.toString("utf8").slice(0, 30_000) });
  console.log(JSON.stringify({ event: "lesson", user: uid ? "signed_in" : "guest", ok: result.ok, kind, bytes: file.size }));
  if (!result.ok) return Response.json({ error: result.error }, { status: 502 });
  return Response.json(result.data);
}
