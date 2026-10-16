import { direct, type DirectorEvent, type DirectorResult } from "@/lib/ai/director";
import { PlanRequest } from "@/lib/ssp/schema";
import { clientIp, rateLimit, verifyUser } from "@/lib/server/guard";

function logResult(uid: string | null, result: DirectorResult) {
  console.log(
    JSON.stringify({
      event: "plan",
      user: uid ? "signed_in" : "guest",
      ok: result.ok,
      ...(result.ok ? { model: result.model, mode: result.mode, ms: result.ms, repaired: result.repaired, dropped: result.issues.length, scope: result.plan.scope, capability: result.plan.capability } : { code: result.code }),
    }),
  );
}

export async function POST(req: Request) {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > 64_000) return Response.json({ error: "Request too large." }, { status: 413 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = PlanRequest.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid request.", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });

  const uid = await verifyUser(req);
  const key = uid ? `u:${uid}` : `ip:${clientIp(req)}`;
  // Guests: ~6/min, burst 10. Signed-in: ~15/min, burst 25.
  if (!(uid ? rateLimit(key, 15, 25) : rateLimit(key, 6, 10))) {
    return Response.json({ error: "You're asking very fast! Take a breath and try again in a minute.", code: "rate_limited" }, { status: 429 });
  }

  // Streaming: progress events, then the result, as newline-delimited JSON.
  if (req.headers.get("accept")?.includes("application/x-ndjson")) {
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (o: unknown) => controller.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
        const result = await direct(parsed.data, (e: DirectorEvent) => send(e));
        logResult(uid, result);
        send(result.ok ? { type: "result", plan: result.plan, issues: result.issues, model: result.model } : { type: "error", error: result.error, code: result.code, status: result.status });
        controller.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
  }

  const result = await direct(parsed.data);
  logResult(uid, result);
  if (!result.ok) return Response.json({ error: result.error, code: result.code }, { status: result.status });
  return Response.json({ plan: result.plan, issues: result.issues, model: result.model });
}
