import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Creem (merchant of record): it sells the credit packs on its own hosted
// checkout, handles card/tax, and pays out. Credits are granted only after
// Creem confirms the payment, either by its webhook or by the server asking
// Creem when the buyer comes back (so local dev works without a webhook).
//   CREEM_API_KEY         test keys (creem_test_...) use the test API automatically
//   CREEM_WEBHOOK_SECRET  verifies webhook calls
//   CREEM_PRODUCTS        pack:product pairs, e.g. starter:prod_1;explorer:prod_2
// Without CREEM_API_KEY the built-in sandbox checkout is used instead.

const key = process.env.CREEM_API_KEY ?? "";
const base = process.env.CREEM_API_BASE || (key.startsWith("creem_test_") ? "https://test-api.creem.io" : "https://api.creem.io");

export const creemEnabled = Boolean(key);

/** Pack id → Creem product id, from CREEM_PRODUCTS. */
export function creemProducts(raw = process.env.CREEM_PRODUCTS ?? ""): Record<string, string> {
  return Object.fromEntries(
    raw
      .split(/[;,\s]+/)
      .map((p) => p.split(":").map((s) => s.trim()))
      .filter((p): p is [string, string] => p.length === 2 && Boolean(p[0] && p[1])),
  );
}

export interface CreemCheckout {
  id: string;
  status: "pending" | "processing" | "completed" | "expired";
  checkout_url?: string;
  request_id?: string;
  product?: string | { id: string };
  order?: { status?: "pending" | "paid" } | string;
  metadata?: Record<string, unknown>;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(base + path, {
    ...init,
    headers: { "x-api-key": key, "content-type": "application/json", ...init?.headers },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Creem ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

export const createCheckout = (body: { product_id: string; request_id: string; success_url: string; metadata: Record<string, string>; discount_code?: string; customer?: { email: string } }) =>
  call<CreemCheckout>("/v1/checkouts", { method: "POST", body: JSON.stringify(body) });

/** A discount code made in the Creem dashboard (Discounts). Fixed amounts are in cents. */
export interface CreemDiscount {
  code: string;
  status: string;
  type: "percentage" | "fixed";
  percentage?: number;
  amount?: number;
  expiry_date?: string;
  max_redemptions?: number;
  redeem_count?: number;
  applies_to_products?: string[];
}

/** The discount for a code, or null when Creem doesn't know it. */
export async function getDiscount(code: string): Promise<CreemDiscount | null> {
  try {
    return await call<CreemDiscount>(`/v1/discounts?discount_code=${encodeURIComponent(code)}`);
  } catch (e) {
    if (/Creem 404/.test(String(e))) return null;
    throw e;
  }
}

/** Packs a usable code takes money off, or why it can't be used. */
export function discountPacks(d: CreemDiscount | null, products: Record<string, string>, now = Date.now()): { packs: string[] } | { error: string } {
  if (!d || d.status !== "active") return { error: "That discount code isn't valid." };
  if (d.expiry_date && Date.parse(d.expiry_date) < now) return { error: "That discount code has expired." };
  if (d.max_redemptions != null && (d.redeem_count ?? 0) >= d.max_redemptions) return { error: "That discount code has been used up." };
  const packs = Object.entries(products).filter(([, product]) => d.applies_to_products?.includes(product)).map(([pack]) => pack);
  return packs.length ? { packs } : { error: "That discount code doesn't apply to any credit pack." };
}

export const getCheckout = (id: string) => call<CreemCheckout>(`/v1/checkouts?checkout_id=${encodeURIComponent(id)}`);

/** True when the checkout is paid for and belongs to this order and pack. */
export function checkoutPaid(c: CreemCheckout, orderId: string, productId: string | undefined): boolean {
  const product = typeof c.product === "string" ? c.product : c.product?.id;
  const orderPaid = typeof c.order === "object" ? c.order?.status !== "pending" : true;
  return c.status === "completed" && orderPaid && c.request_id === orderId && Boolean(productId) && product === productId;
}

/** Creem signs each webhook body with HMAC-SHA256 (hex) in the `creem-signature` header. */
export function validSignature(rawBody: string, signature: string | null, secret = process.env.CREEM_WEBHOOK_SECRET ?? ""): boolean {
  if (!secret || !signature) return false;
  const a = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const b = Buffer.from(signature.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** This site's public address, for Creem's return link (Cloud Run terminates TLS in front of the app). */
export function siteUrl(req: Request): string {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0] ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}
