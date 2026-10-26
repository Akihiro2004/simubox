import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createOrder, freshAccount, settleOrder } from "@/lib/builder/economy";
import { discountedPrice } from "@/lib/credits";
import { checkoutPaid, creemProducts, discountPacks, validSignature } from "@/lib/server/creem";
import { firestoreSafe } from "@/lib/server/ledger";

const hasUndefined = (v: unknown): boolean => v === undefined || (typeof v === "object" && v !== null && Object.values(v).some(hasUndefined));

describe("firestore account data", () => {
  it("has no undefined fields after a Creem order is paid (Firestore rejects them)", () => {
    const { account, order } = createOrder(freshAccount(30, "Welcome bonus"), "starter", "ord_1");
    const paid = settleOrder(account, order!.id, { ok: true, method: "creem" }).account;
    expect(hasUndefined(paid)).toBe(true);
    expect(hasUndefined(firestoreSafe(paid))).toBe(false);
    expect(firestoreSafe(paid).credits).toBe(180);
  });
});

describe("creem", () => {
  it("parses pack:product pairs", () => {
    expect(creemProducts("starter:prod_a;explorer:prod_b")).toEqual({ starter: "prod_a", explorer: "prod_b" });
    expect(creemProducts("")).toEqual({});
  });

  it("accepts only bodies signed with the webhook secret", () => {
    const body = '{"eventType":"checkout.completed"}';
    const sig = createHmac("sha256", "whsec").update(body).digest("hex");
    expect(validSignature(body, sig, "whsec")).toBe(true);
    expect(validSignature(body + " ", sig, "whsec")).toBe(false);
    expect(validSignature(body, sig, "other")).toBe(false);
    expect(validSignature(body, null, "whsec")).toBe(false);
    expect(validSignature(body, sig, "")).toBe(false);
  });

  it("credits only a completed checkout for the same order and pack", () => {
    const paid = { id: "chk", status: "completed" as const, request_id: "ord_1", product: { id: "prod_a" }, order: { status: "paid" as const } };
    expect(checkoutPaid(paid, "ord_1", "prod_a")).toBe(true);
    expect(checkoutPaid({ ...paid, status: "pending" }, "ord_1", "prod_a")).toBe(false);
    expect(checkoutPaid(paid, "ord_2", "prod_a")).toBe(false);
    expect(checkoutPaid(paid, "ord_1", "prod_cheaper")).toBe(false);
    expect(checkoutPaid(paid, "ord_1", undefined)).toBe(false);
    expect(checkoutPaid({ ...paid, order: { status: "pending" } }, "ord_1", "prod_a")).toBe(false);
  });
});

describe("discount codes", () => {
  const products = { starter: "prod_s", explorer: "prod_e" };
  const d = { code: "SAVE20", status: "active", type: "percentage" as const, percentage: 20, applies_to_products: ["prod_e"] };

  it("finds the packs a code applies to, and refuses unusable codes", () => {
    expect(discountPacks(d, products)).toEqual({ packs: ["explorer"] });
    expect(discountPacks(null, products)).toHaveProperty("error");
    expect(discountPacks({ ...d, status: "expired" }, products)).toHaveProperty("error");
    expect(discountPacks({ ...d, expiry_date: "2020-01-01T00:00:00Z" }, products)).toHaveProperty("error");
    expect(discountPacks({ ...d, max_redemptions: 5, redeem_count: 5 }, products)).toHaveProperty("error");
    expect(discountPacks({ ...d, applies_to_products: ["prod_other"] }, products)).toHaveProperty("error");
  });

  it("takes percentages and fixed cents off, never below zero", () => {
    expect(discountedPrice(999, { type: "percentage", percentage: 20 })).toBe(799);
    expect(discountedPrice(499, { type: "fixed", amount: 2 })).toBe(497); // Creem's fixed amounts are cents
    expect(discountedPrice(499, { type: "percentage", percentage: 100 })).toBe(0);
    expect(discountedPrice(499, { type: "fixed", amount: 10_000 })).toBe(0);
  });
});
