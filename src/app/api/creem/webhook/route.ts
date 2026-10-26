import { creemProducts, validSignature, type CreemCheckout } from "@/lib/server/creem";
import { getAccount, grantPaidOrder, orStoreDown } from "@/lib/server/ledger";

// Creem calls this after a payment (Developers > Webhooks in the Creem dashboard:
// https://<your site>/api/creem/webhook). Creem retries until it gets a 2xx,
// so a 503 while the database is down is retried later.
export const POST = (req: Request) => orStoreDown(() => post(req));

async function post(req: Request) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("creem-signature"))) return Response.json({ error: "Bad signature." }, { status: 401 });
  const event = JSON.parse(raw) as { eventType?: string; object?: CreemCheckout };
  if (event.eventType !== "checkout.completed") return Response.json({ ok: true });

  const c = event.object;
  const accountId = typeof c?.metadata?.account === "string" ? c.metadata.account : "";
  const orderId = c?.request_id ?? "";
  if (!(accountId.startsWith("u:") || accountId === "local") || !orderId) return Response.json({ ok: true, ignored: "not a SimuBox order" });
  // The order must exist in that account and the paid product must be its pack.
  const order = (await getAccount(accountId)).orders.find((o) => o.id === orderId);
  const product = typeof c?.product === "string" ? c.product : c?.product?.id;
  if (!order || product !== creemProducts()[order.pack]) return Response.json({ ok: true, ignored: "unknown order" });
  await grantPaidOrder(accountId, orderId);
  return Response.json({ ok: true });
}
