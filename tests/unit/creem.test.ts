import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createOrder, freshAccount, settleOrder } from "@/lib/builder/economy";
import { checkoutPaid, creemProducts, validSignature } from "@/lib/server/creem";
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
