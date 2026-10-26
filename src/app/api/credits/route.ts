import { z } from "zod";
import { answerDiscovery, createOrder, settleOrder, unlock, type Account, type Order } from "@/lib/builder/economy";
import { DISCOVERIES } from "@/lib/builder/catalog";
import { clientIp, rateLimit } from "@/lib/server/guard";
import { discountedPrice, type Discount } from "@/lib/credits";
import { checkoutPaid, createCheckout, creemEnabled, creemProducts, discountPacks, getCheckout, getDiscount, siteUrl } from "@/lib/server/creem";
import { getAccount, grantPaidOrder, newOrderId, sandboxCharge, transact, whoIs, type Who, orStoreDown } from "@/lib/server/ledger";
import type { AssetId } from "@/lib/world/catalog";

const assetIds = DISCOVERIES.map((d) => d.asset) as [AssetId, ...AssetId[]];
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("unlock"), asset: z.enum(assetIds) }),
  z.object({ action: z.literal("discovery"), asset: z.enum(assetIds), choice: z.number().int().min(0).max(9) }),
  z.object({ action: z.literal("order"), pack: z.string().max(20), discount: z.string().regex(/^[A-Za-z0-9]{1,14}$/).optional() }),
  z.object({ action: z.literal("discount"), code: z.string().regex(/^[A-Za-z0-9]{1,14}$/) }),
  z.object({
    action: z.literal("pay"),
    order: z.string().max(40),
    method: z.enum(["card", "qris", "ewallet"]),
    card: z.object({ number: z.string().max(24), expiry: z.string().max(7), cvc: z.string().max(4) }).optional(),
  }),
  z.object({ action: z.literal("confirm"), order: z.string().max(40) }),
]);

/** What the browser may see: never other accounts, never full card data (none is stored). */
function view(a: Account, who: Who) {
  return { credits: a.credits, owned: a.owned, earned: a.earned, history: a.history, orders: a.orders, signedIn: who.signedIn, payments: creemEnabled ? "creem" : "sandbox" };
}

export const GET = (req: Request) => orStoreDown(() => get(req));

async function get(req: Request) {
  const who = await whoIs(req);
  return Response.json(view(await getAccount(who.id), who), { headers: { "cache-control": "no-store" } });
}

export const POST = (req: Request) => orStoreDown(() => post(req));

async function post(req: Request) {
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

  if (a.action === "pay" && creemEnabled) return Response.json({ error: "Pay on the secure checkout page." }, { status: 400 });
  if (a.action === "discount") return checkDiscount(a.code);
  if (a.action === "order" && creemEnabled) return creemOrder(req, who, a.pack, a.discount);
  if (a.action === "order" && a.discount) return Response.json({ error: "Discount codes work at the secure checkout, which isn't set up here." }, { status: 400 });
  if (a.action === "confirm") return confirm(who, a.order);

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

/** A Creem discount code, as the wallet shows it, or why it can't be used. */
async function lookupDiscount(code: string): Promise<{ discount: Discount } | { error: string }> {
  if (!creemEnabled) return { error: "Discount codes work at the secure checkout, which isn't set up here." };
  const d = await getDiscount(code.toUpperCase());
  const r = discountPacks(d, creemProducts());
  if ("error" in r || !d) return { error: "error" in r ? r.error : "That discount code isn't valid." };
  return { discount: { code: d.code, type: d.type, percentage: d.percentage, amount: d.amount, packs: r.packs } };
}

async function checkDiscount(code: string) {
  try {
    const r = await lookupDiscount(code);
    return Response.json(r, { status: "error" in r ? 400 : 200 });
  } catch (e) {
    console.error(JSON.stringify({ event: "creem_error", message: String(e).slice(0, 300) }));
    return Response.json({ error: "Couldn't check that code. Please try again." }, { status: 502 });
  }
}

/** Starts a Creem hosted checkout for a pack; credits arrive once Creem confirms payment. */
async function creemOrder(req: Request, who: Who, packId: string, code?: string) {
  const product = creemProducts()[packId];
  if (!product) return Response.json({ error: "This pack isn't on sale yet." }, { status: 503 });
  let discount: Discount | undefined;
  if (code) {
    try {
      const r = await lookupDiscount(code);
      if ("error" in r) return Response.json(r, { status: 400 });
      if (!r.discount.packs.includes(packId)) return Response.json({ error: "That discount code doesn't apply to this pack." }, { status: 400 });
      discount = r.discount;
    } catch (e) {
      console.error(JSON.stringify({ event: "creem_error", message: String(e).slice(0, 300) }));
      return Response.json({ error: "Couldn't check that code. Please try again." }, { status: 502 });
    }
  }
  const { order, error } = await transact(who.id, (acc) => {
    const r = createOrder(acc, packId, newOrderId());
    if (!r.order || !discount) return { account: r.account, out: { order: r.order, error: r.error } };
    // The order keeps what the buyer pays before tax, and which code took money off.
    const o = { ...r.order, price: discountedPrice(r.order.price, discount), discount: discount.code };
    return { account: { ...r.account, orders: r.account.orders.map((x) => (x.id === o.id ? o : x)) }, out: { order: o as Order | undefined, error: undefined as string | undefined } };
  });
  if (!order) return Response.json({ error }, { status: 400 });
  try {
    const checkout = await createCheckout({
      product_id: product,
      request_id: order.id,
      success_url: `${siteUrl(req)}/wallet/checkout?order=${order.id}`,
      metadata: { account: who.id, order: order.id },
      ...(discount ? { discount_code: discount.code } : {}),
    });
    if (!checkout.checkout_url) throw new Error("Creem returned no checkout link");
    const account = await transact(who.id, (acc) => {
      const next = { ...acc, orders: acc.orders.map((o) => (o.id === order.id ? { ...o, checkout: checkout.id } : o)) };
      return { account: next, out: next };
    });
    return Response.json({ order: { ...order, checkout: checkout.id }, checkoutUrl: checkout.checkout_url, account: view(account, who) });
  } catch (e) {
    console.error(JSON.stringify({ event: "creem_error", message: String(e).slice(0, 300) }));
    return Response.json({ error: "The payment page couldn't open. Please try again." }, { status: 502 });
  }
}

/** The buyer is back from Creem: ask Creem whether that checkout was paid, and credit it once. */
async function confirm(who: Who, orderId: string) {
  const before = await getAccount(who.id);
  const order = before.orders.find((o) => o.id === orderId);
  if (!order) return Response.json({ error: "Order not found.", account: view(before, who) }, { status: 404 });
  if (order.status === "paid" || !order.checkout || !creemEnabled) return Response.json({ order, account: view(before, who) });
  let paid = false;
  try {
    paid = checkoutPaid(await getCheckout(order.checkout), order.id, creemProducts()[order.pack]);
  } catch (e) {
    console.error(JSON.stringify({ event: "creem_error", message: String(e).slice(0, 300) }));
  }
  if (!paid) return Response.json({ order, account: view(before, who) });
  const r = await grantPaidOrder(who.id, order.id);
  return Response.json({ order: r.order, account: view(r.account, who) });
}
