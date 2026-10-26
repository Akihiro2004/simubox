import { direct, planPrice, type DirectorEvent, type DirectorResult } from "@/lib/ai/director";
import { charge, refund } from "@/lib/builder/economy";
import { finalPrice, PRICES } from "@/lib/credits";
import { PlanRequest } from "@/lib/ssp/schema";
import { clientIp, rateLimit } from "@/lib/server/guard";
import { transact, whoIs, orStoreDown } from "@/lib/server/ledger";

function logResult(signedIn: boolean, result: DirectorResult, verifyMs: number, credits: number) {
  console.log(
    JSON.stringify({
      event: "plan",
      user: signedIn ? "signed_in" : "guest",
      ok: result.ok,
      verifyMs,
      credits,
      ...(result.ok ? { model: result.model, mode: result.mode, ms: result.ms, firstStepMs: result.firstStepMs, repaired: result.repaired, dropped: result.issues.length, scope: result.plan.scope, capability: result.plan.capability } : { code: result.code }),
    }),
  );
}

// Serverless hosts cut functions off early by default; a lesson may take up to AI_TIMEOUT_MS (70 s) plus settling credits.
export const maxDuration = 90;

export const POST = (req: Request) => orStoreDown(() => post(req));

async function post(req: Request) {
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

  const verifyStart = Date.now();
  const who = await whoIs(req);
  const verifyMs = Date.now() - verifyStart;
  const key = who.signedIn ? who.id : `ip:${clientIp(req)}`;
  // Guests: ~6/min, burst 10. Signed-in: ~15/min, burst 25.
  if (!(who.signedIn ? rateLimit(key, 15, 25) : rateLimit(key, 6, 10))) {
    return Response.json({ error: "You're asking very fast! Take a breath and try again in a minute.", code: "rate_limited" }, { status: 429 });
  }

  // Pay before the model runs, so two questions at once can't overspend.
  const kind = planPrice(parsed.data);
  const price = kind ? PRICES[kind] : 0;
  const paid = await transact(who.id, (a) => {
    const r = charge(a, price, kind === "quick" ? "Changed the scene" : `Lesson: ${parsed.data.prompt.slice(0, 50)}`);
    return { account: r.account, out: r.error ? null : r.account.credits };
  });
  if (paid === null) {
    return Response.json(
      { error: who.signedIn ? `This needs ${price} credits. Buy more to keep exploring.` : "Your free guest lesson is used up. Sign in to get 30 free credits.", code: who.signedIn ? "no_credits" : "sign_in", price },
      { status: 402 },
    );
  }
  const settle = async (result: DirectorResult) => {
    const back = price - finalPrice(price, result);
    const credits = back ? await transact(who.id, (a) => ({ account: refund(a, back, "Refund"), out: a.credits + back })) : paid;
    logResult(who.signedIn, result, verifyMs, price - back);
    return { credits, spent: price - back };
  };

  // Streaming: progress events, then the result, as newline-delimited JSON.
  if (req.headers.get("accept")?.includes("application/x-ndjson")) {
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (o: unknown) => controller.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
        const result = await direct(
          parsed.data,
          (e: DirectorEvent) => {
            if (!req.signal.aborted) send(e);
          },
          req.signal,
        );
        const wallet = await settle(result);
        if (req.signal.aborted) return;
        send(result.ok ? { type: "result", plan: result.plan, issues: result.issues, model: result.model, wallet } : { type: "error", error: result.error, code: result.code, status: result.status, wallet });
        controller.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
  }

  const result = await direct(parsed.data, undefined, req.signal);
  const wallet = await settle(result);
  if (!result.ok) return Response.json({ error: result.error, code: result.code, wallet }, { status: result.status });
  return Response.json({ plan: result.plan, issues: result.issues, model: result.model, wallet });
}
