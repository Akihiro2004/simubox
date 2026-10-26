import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { charge, createOrder, freshAccount, refund, settleOrder } from "@/lib/builder/economy";
import { COST_USD, finalPrice, margin, PACKS, PRICES, type PriceKind } from "@/lib/credits";
import { luhn, sandboxCharge, transact } from "@/lib/server/ledger";

describe("credit prices", () => {
  it.each(Object.keys(PRICES) as PriceKind[])("%s stays profitable on every pack, even at its worst-case cost", (kind) => {
    for (const pack of PACKS) {
      expect(margin(kind, pack, "worst")).toBeGreaterThan(0.1);
      expect(margin(kind, pack, "typical")).toBeGreaterThan(0.5);
    }
  });
  it("gives bigger packs more credits per dollar", () => {
    const perDollar = PACKS.map((p) => p.credits / p.price);
    expect([...perDollar].sort((a, b) => a - b)).toEqual(perDollar);
    expect(COST_USD.lesson.worst).toBeGreaterThan(COST_USD.lesson.typical);
  });
  it("refunds failures, keeps cancellations and charges non-lessons the quick price", () => {
    const ok = (scope: string, model = "gemini-3.8-flash") => ({ ok: true as const, model, plan: { scope } });
    expect(finalPrice(10, ok("in_scope"))).toBe(10);
    expect(finalPrice(10, ok("off_topic"))).toBe(PRICES.quick);
    expect(finalPrice(3, ok("needs_clarification"))).toBe(3);
    expect(finalPrice(10, ok("unsafe", "guard"))).toBe(0);
    expect(finalPrice(10, { ok: false, status: 502 })).toBe(0);
    expect(finalPrice(10, { ok: false, status: 499 })).toBe(10);
  });
});

describe("account ledger", () => {
  it("never goes below zero and logs every change", () => {
    const a = freshAccount(12, "Welcome bonus");
    const once = charge(a, 10, "Lesson");
    expect(once.account.credits).toBe(2);
    expect(charge(once.account, 10, "Lesson").error).toBeTruthy();
    expect(refund(once.account, 7, "Refund").credits).toBe(9);
    expect(refund(once.account, 7, "Refund").history.map((h) => h.amount)).toEqual([7, -10, 12]);
  });
  it("credits a paid order exactly once and lets a declined one be retried", () => {
    const { account, order } = createOrder(freshAccount(0, "x"), "starter", "ord_1");
    expect(order).toMatchObject({ status: "pending", credits: 150, price: 499 });
    const declined = settleOrder(account, "ord_1", { ok: false, method: "card", failure: "The card was declined." });
    expect(declined.account.credits).toBe(0);
    const paid = settleOrder(declined.account, "ord_1", { ok: true, method: "card", last4: "4242" });
    expect(paid.account.credits).toBe(150);
    expect(settleOrder(paid.account, "ord_1", { ok: true, method: "card" }).account.credits).toBe(150);
    expect(createOrder(account, "nope", "ord_2").error).toBeTruthy();
    expect(settleOrder(account, "ord_9", { ok: true, method: "qris" }).error).toBeTruthy();
  });
  it("cannot be overspent by concurrent charges", async () => {
    process.env.CREDITS_FILE = path.join(mkdtempSync(path.join(tmpdir(), "simubox-ledger-")), "credits.json");
    try {
      // A fresh local account starts with the welcome bonus (30): only three 10-credit lessons fit.
      const tries = await Promise.all(Array.from({ length: 6 }, () => transact("local", (a) => {
        const r = charge(a, 10, "Lesson");
        return { account: r.account, out: !r.error };
      })));
      expect(tries.filter(Boolean)).toHaveLength(3);
      expect(await transact("local", (a) => ({ account: a, out: a.credits }))).toBe(0);
    } finally {
      delete process.env.CREDITS_FILE;
    }
  });
});

describe("sandbox gateway", () => {
  const card = (number: string, expiry = "12/30", cvc = "123") => ({ number, expiry, cvc });
  it("follows the test card numbers", () => {
    expect(sandboxCharge("card", card("4242 4242 4242 4242"))).toEqual({ ok: true, method: "card", last4: "4242" });
    expect(sandboxCharge("card", card("4000000000000002"))).toMatchObject({ ok: false, failure: "The card was declined." });
    expect(sandboxCharge("card", card("4000000000009995"))).toMatchObject({ ok: false, failure: "The card has insufficient funds." });
    expect(sandboxCharge("card", card("4242424242424241"))).toMatchObject({ ok: false, failure: "The card number is not valid." });
    expect(sandboxCharge("card", card("4242424242424242", "01/20"))).toMatchObject({ ok: false, failure: "The card has expired." });
    expect(sandboxCharge("card", card("4242424242424242", "12/30", "1"))).toMatchObject({ ok: false });
    expect(sandboxCharge("qris")).toEqual({ ok: true, method: "qris" });
  });
  it("checks card numbers with Luhn", () => {
    expect(luhn("4242424242424242")).toBe(true);
    expect(luhn("5555555555554444")).toBe(true);
    expect(luhn("1234567812345678")).toBe(false);
    expect(luhn("42")).toBe(false);
  });
});
