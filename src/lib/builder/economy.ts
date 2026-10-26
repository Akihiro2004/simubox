import { z } from "zod";
import { DISCOVERIES, DISCOVERY_BY_ID, DISCOVERY_REWARD, STARTER_ASSETS } from "./catalog";
import { PACK_BY_ID } from "../credits";
import type { AssetId } from "../world/catalog";

// One learner's credits, unlocked assets and purchases. The server owns this
// (src/lib/server/ledger.ts); the browser only shows a copy. Pure functions.

export interface Wallet { credits: number; owned: AssetId[]; earned: AssetId[] }
export interface LedgerEntry { at: number; amount: number; reason: string }
export interface Order { id: string; pack: string; credits: number; price: number; status: "pending" | "paid" | "failed"; createdAt: number; paidAt?: number; method?: string; last4?: string; failure?: string; checkout?: string }
export interface Account extends Wallet { history: LedgerEntry[]; orders: Order[] }

const MAX_HISTORY = 30;
const MAX_ORDERS = 20;

export const freshWallet = (credits = 0): Wallet => ({ credits, owned: [...STARTER_ASSETS], earned: [] });
export const freshAccount = (credits: number, reason: string): Account => ({ ...freshWallet(credits), history: credits ? [{ at: Date.now(), amount: credits, reason }] : [], orders: [] });

const shopIds = new Set(DISCOVERIES.map(item => item.asset));
const asset = z.custom<AssetId>(v => typeof v === "string" && shopIds.has(v as AssetId));
const AccountData = z.object({
  credits: z.number().int().min(0).max(10_000_000),
  owned: z.array(asset).max(DISCOVERIES.length),
  earned: z.array(asset).max(DISCOVERIES.length),
  history: z.array(z.object({ at: z.number(), amount: z.number().int(), reason: z.string().max(80) })).max(MAX_HISTORY).default([]),
  orders: z.array(z.object({ id: z.string().max(40), pack: z.string().max(20), credits: z.number().int(), price: z.number().int(), status: z.enum(["pending", "paid", "failed"]), createdAt: z.number(), paidAt: z.number().optional(), method: z.string().max(20).optional(), last4: z.string().max(4).optional(), failure: z.string().max(80).optional(), checkout: z.string().max(80).optional() })).max(MAX_ORDERS).default([]),
});

/** A stored account, or null when it is missing or corrupt. */
export function readAccount(raw: unknown): Account | null {
  const parsed = AccountData.safeParse(raw);
  return parsed.success ? { ...parsed.data, owned: [...new Set([...STARTER_ASSETS, ...parsed.data.owned])], earned: [...new Set(parsed.data.earned)] } : null;
}

const log = (a: Account, amount: number, reason: string): Account => ({ ...a, credits: a.credits + amount, history: [{ at: Date.now(), amount, reason }, ...a.history].slice(0, MAX_HISTORY) });

export function charge(a: Account, amount: number, reason: string): { account: Account; error?: string } {
  if (amount <= 0) return { account: a };
  if (a.credits < amount) return { account: a, error: `You need ${amount} credits and have ${a.credits}.` };
  return { account: log(a, -amount, reason) };
}
export const refund = (a: Account, amount: number, reason: string): Account => (amount > 0 ? log(a, amount, reason) : a);

export function unlock(a: Account, id: AssetId): { account: Account; error?: string } {
  const item = DISCOVERY_BY_ID[id];
  if (!item) return { account: a, error: "That item isn't in the shop." };
  if (a.owned.includes(id)) return { account: a };
  if (a.credits < item.price) return { account: a, error: `This needs ${item.price} credits. You have ${a.credits}.` };
  const paid = charge(a, item.price, `Unlocked ${id.replace(/_/g, " ")}`).account;
  return { account: { ...paid, owned: [...paid.owned, id] } };
}
export function answerDiscovery(a: Account, id: AssetId, choice: number): { account: Account; correct: boolean; reward: number } {
  const item = DISCOVERY_BY_ID[id];
  const correct = Boolean(item && Number.isInteger(choice) && choice === item.answer);
  if (!correct || a.earned.includes(id)) return { account: a, correct, reward: 0 };
  return { account: { ...log(a, DISCOVERY_REWARD, "Discovery reward"), earned: [...a.earned, id] }, correct, reward: DISCOVERY_REWARD };
}

export function createOrder(a: Account, packId: string, id: string): { account: Account; order?: Order; error?: string } {
  const pack = PACK_BY_ID[packId];
  if (!pack) return { account: a, error: "Unknown credit pack." };
  const order: Order = { id, pack: pack.id, credits: pack.credits, price: pack.price, status: "pending", createdAt: Date.now() };
  return { account: { ...a, orders: [order, ...a.orders].slice(0, MAX_ORDERS) }, order };
}

/** Applies the gateway's verdict once: a paid order never credits twice, a failed one can be retried. */
export function settleOrder(a: Account, id: string, verdict: { ok: true; method: string; last4?: string } | { ok: false; method: string; failure: string }): { account: Account; order?: Order; error?: string } {
  const order = a.orders.find(o => o.id === id);
  if (!order) return { account: a, error: "Order not found." };
  if (order.status === "paid") return { account: a, order };
  const next: Order = verdict.ok
    ? { ...order, status: "paid", paidAt: Date.now(), method: verdict.method, last4: verdict.last4, failure: undefined }
    : { ...order, status: "failed", method: verdict.method, failure: verdict.failure };
  const orders = a.orders.map(o => (o.id === id ? next : o));
  const account = verdict.ok ? log({ ...a, orders }, order.credits, `Bought ${PACK_BY_ID[order.pack]?.name ?? order.pack} pack`) : { ...a, orders };
  return { account, order: next };
}
