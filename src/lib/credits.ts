// Credits: what each AI call and shop unlock costs, the packs on sale, and the
// cost model the prices were set from. Shared by the server (charging) and
// the client (showing prices). Pure data and arithmetic only.

/** Credits charged per call. "quick" = a tweak to the current scene; off-topic or unclear answers also cost "quick". */
export const PRICES = { lesson: 10, quick: 3, upload: 5 } as const;
export type PriceKind = keyof typeof PRICES;

/** Free credits: a new signed-in account, a guest (one lesson per network), and each first correct discovery answer. */
export const SIGNUP_BONUS = 30;
export const GUEST_CREDITS = PRICES.lesson;

export interface CreditPack { id: string; name: string; credits: number; /** US cents. */ price: number; note: string }
export const PACKS: CreditPack[] = [
  { id: "starter", name: "Starter", credits: 150, price: 499, note: "About 15 lessons" },
  { id: "explorer", name: "Explorer", credits: 350, price: 999, note: "About 35 lessons · 17% bonus" },
  { id: "family", name: "Family", credits: 800, price: 1999, note: "About 80 lessons · 33% bonus" },
  { id: "classroom", name: "Classroom", credits: 2200, price: 4999, note: "About 220 lessons · 47% bonus" },
];
export const PACK_BY_ID = Object.fromEntries(PACKS.map((p) => [p.id, p])) as Record<string, CreditPack>;

/**
 * What one call costs us in USD, from real usage logged by the director on
 * 2026-10-26 (gemini_usage / deepseek_usage events), priced at the
 * January 2027 list prices, which are double the 2026 ones:
 *   Gemini 3.8 Flash   $1.50 in, $0.15 cached in, $7.50 out (thinking included) per 1M tokens
 *   DeepSeek flash     $0.30 in (peak, cache miss), $1.20 out per 1M tokens
 *   Gemini TTS         $0.003 per 10 s of audio; Speechify $10 per 1M characters
 * Measured lesson: ~20.5k input tokens (8-18k of them cached), 2.0-3.3k output.
 * Measured quick tweak (DeepSeek): ~20.4k input, ~1.2k output.
 * "worst" assumes no cache, the 12k output cap, a full Gemini repair round and ~60 s of voice.
 */
export const COST_USD: Record<PriceKind, { typical: number; worst: number }> = {
  // typical: 20.5k uncached in ($0.031) + 3.3k out ($0.025) + 60 s voice ($0.018)
  // worst:   lesson at the 12k cap ($0.121) + Gemini repair ($0.055) + voice ($0.018)
  lesson: { typical: 0.074, worst: 0.194 },
  // typical: DeepSeek ($0.008) + short voice ($0.005); worst: falls back to Gemini ($0.045) + voice
  quick: { typical: 0.013, worst: 0.05 },
  // A 4 MB PDF is ~100 pages at ~258 tokens a page, plus a short answer.
  upload: { typical: 0.02, worst: 0.08 },
};

type PlanOutcome = { ok: false; status: number } | { ok: true; model: string; plan: { scope: string } };

/**
 * What a plan finally costs after paying `paid` up front. Failures are refunded
 * (the app plays an offline demo instead); a cancelled one is not, since the
 * model already ran. Answers that teach nothing (off topic, unclear, too
 * advanced) cost the quick price.
 */
export function finalPrice(paid: number, result: PlanOutcome): number {
  if (!result.ok) return result.status === 499 ? paid : 0;
  if (result.model === "guard") return 0;
  return result.plan.scope === "in_scope" ? paid : Math.min(paid, PRICES.quick);
}

/** Card-style gateway fee on each purchase: 2.9% + $0.30. */
export function netRevenuePerCredit(pack: CreditPack): number {
  return (pack.price / 100 - (pack.price / 100) * 0.029 - 0.3) / pack.credits;
}

/** Profit margin for one call bought with credits from `pack`, at the typical or worst cost. */
export function margin(kind: PriceKind, pack: CreditPack, at: "typical" | "worst"): number {
  const revenue = PRICES[kind] * netRevenuePerCredit(pack);
  return (revenue - COST_USD[kind][at]) / revenue;
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** A Creem discount code as the wallet shows it. Fixed amounts are in cents, as Creem stores them. */
export interface Discount {
  code: string;
  type: "percentage" | "fixed";
  percentage?: number;
  amount?: number;
  /** Pack ids it applies to. */
  packs: string[];
}

/** Price in cents after a discount (before any tax the checkout adds). */
export function discountedPrice(price: number, d: Pick<Discount, "type" | "percentage" | "amount">): number {
  const off = d.type === "percentage" ? Math.round((price * (d.percentage ?? 0)) / 100) : (d.amount ?? 0);
  return Math.max(0, price - off);
}
