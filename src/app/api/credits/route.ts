import { z } from "zod";
import { answerDiscovery, createOrder, settleOrder, unlock, type Account, type Order } from "@/lib/builder/economy";
import { DISCOVERIES } from "@/lib/builder/catalog";
import { clientIp, rateLimit } from "@/lib/server/guard";
import { getAccount, newOrderId, sandboxCharge, transact, whoIs, type Who } from "@/lib/server/ledger";
import type { AssetId } from "@/lib/world/catalog";

const assetIds = DISCOVERIES.map((d) => d.asset) as [AssetId, ...AssetId[]];
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("unlock"), asset: z.enum(assetIds) }),
  z.object({ action: z.literal("discovery"), asset: z.enum(assetIds), choice: z.number().int().min(0).max(9) }),
  z.object({ action: z.literal("order"), pack: z.string().max(20) }),
  z.object({
    action: z.literal("pay"),
    order: z.string().max(40),
    method: z.enum(["card", "qris", "ewallet"]),
    card: z.object({ number: z.string().max(24), expiry: z.string().max(7), cvc: z.string().max(4) }).optional(),
  }),
]);

/** What the browser may see: never other accounts, never full card data (none is stored). */
function view(a: Account, who: Who) {
  return { credits: a.credits, owned: a.owned, earned: a.earned, history: a.history, orders: a.orders, signedIn: who.signedIn };
}

export async function GET(req: Request) {
  const who = await whoIs(req);
  return Response.json(view(await getAccount(who.id), who), { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = Action.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const who = await whoIs(req);
  if (!rateLimit(`credits:${who.signedIn ? who.id : clientIp(req)}`, 30, 30)) return Response.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  const a = parsed.data;
  if (!who.signedIn && a.action !== "discovery") return Response.json({ error: "Sign in to unlock items or buy credits.", code: "sign_in" }, { status: 401 });

  const step = (account: Account): { account: Account; out: { error?: string; correct?: boolean; reward?: number; order?: Order } } => {
    switch (a.action) {
      case "unlock": {
        const r = unlock(account, a.asset);
        return { account: r.account, out: { error: r.error } };
      }
      case "discovery": {
        // Guests can practise, but rewards go to signed-in accounts only.
        if (!who.signedIn) return { account, out: { correct: answerDiscovery(account, a.asset, a.choice).correct, reward: 0 } };
        const r = answerDiscovery(account, a.asset, a.choice);
        return { account: r.account, out: { correct: r.correct, reward: r.reward } };
      }
      case "order": {
        const r = createOrder(account, a.pack, newOrderId());
        return { account: r.account, out: { order: r.order, error: r.error } };
      }
      case "pay": {
        // settleOrder answers a paid order as-is, so a double click can't credit twice.
        const r = settleOrder(account, a.order, sandboxCharge(a.method, a.card));
        if (r.order) console.log(JSON.stringify({ event: "payment", sandbox: true, status: r.order.status, pack: r.order.pack, price: r.order.price }));
        return { account: r.account, out: { order: r.order, error: r.error ?? (r.order?.status === "failed" ? r.order.failure : undefined) } };
      }
    }
  };
  const { out, account } = await transact(who.id, (acc) => {
    const r = step(acc);
    return { account: r.account, out: { out: r.out, account: r.account } };
  });
  // A declined payment is a normal answer (200) that carries the reason.
  const status = out.error && !out.order ? 400 : 200;
  return Response.json({ ...out, account: view(account, who) }, { status });
}
