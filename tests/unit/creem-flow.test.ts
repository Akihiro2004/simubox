import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// The whole purchase against a fake Creem: order → hosted checkout → buyer returns → credited once; webhook too.
describe("creem purchase flow", () => {
  // Imports the route modules fresh, which is slow on a busy machine.
  it("credits a pack only after Creem says it was paid", { timeout: 30_000 }, async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "");
    vi.stubEnv("FIREBASE_PROJECT_ID", "");
    vi.stubEnv("CREDITS_STORE", "file");
    vi.stubEnv("CREDITS_FILE", path.join(mkdtempSync(path.join(tmpdir(), "simubox-creem-")), "credits.json"));
    vi.stubEnv("CREEM_API_KEY", "creem_test_x");
    vi.stubEnv("CREEM_WEBHOOK_SECRET", "whsec");
    vi.stubEnv("CREEM_PRODUCTS", "starter:prod_s;explorer:prod_e");

    let status = "pending";
    const checkouts: Record<string, { request_id: string; product: string }> = {};
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      expect(url.startsWith("https://test-api.creem.io/v1/checkouts")).toBe(true);
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        expect(body.success_url).toBe(`https://simubox.test/wallet/checkout?order=${body.request_id}`);
        checkouts.chk_1 = { request_id: body.request_id, product: body.product_id };
        return Response.json({ id: "chk_1", status: "pending", checkout_url: "https://creem.test/pay/chk_1" });
      }
      return Response.json({ id: "chk_1", status, ...checkouts.chk_1, order: { status: status === "completed" ? "paid" : "pending" } });
    });

    const { POST, GET } = await import("@/app/api/credits/route");
    const webhook = (await import("@/app/api/creem/webhook/route")).POST;
    const call = async (body: object) => (await POST(new Request("https://simubox.test/api/credits", { method: "POST", headers: { "x-forwarded-proto": "https" }, body: JSON.stringify(body) }))).json();
    const balance = async () => (await (await GET(new Request("https://simubox.test/api/credits"))).json()).credits as number;

    const start = await balance();
    const ordered = await call({ action: "order", pack: "starter" });
    expect(ordered.checkoutUrl).toBe("https://creem.test/pay/chk_1");
    // The sandbox card form is closed when real payments are on.
    expect((await call({ action: "pay", order: ordered.order.id, method: "qris" })).error).toBeTruthy();

    expect((await call({ action: "confirm", order: ordered.order.id })).order.status).toBe("pending");
    expect(await balance()).toBe(start);

    status = "completed";
    const event = JSON.stringify({ eventType: "checkout.completed", object: { id: "chk_1", status: "completed", request_id: ordered.order.id, product: { id: "prod_s" }, metadata: { account: "local", order: ordered.order.id } } });
    const sig = createHmac("sha256", "whsec").update(event).digest("hex");
    expect((await webhook(new Request("https://simubox.test/api/creem/webhook", { method: "POST", headers: { "creem-signature": sig }, body: event }))).status).toBe(200);
    expect(await balance()).toBe(start + 150);
    expect((await webhook(new Request("https://simubox.test/api/creem/webhook", { method: "POST", headers: { "creem-signature": "bad" }, body: event }))).status).toBe(401);
    // The buyer's return (or a repeated webhook) after that credits nothing more.
    expect((await call({ action: "confirm", order: ordered.order.id })).order.status).toBe("paid");
    expect((await webhook(new Request("https://simubox.test/api/creem/webhook", { method: "POST", headers: { "creem-signature": sig }, body: event }))).status).toBe(200);
    expect(await balance()).toBe(start + 150);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("applies a Creem discount code to the checkout and the order price", { timeout: 30_000 }, async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "");
    vi.stubEnv("FIREBASE_PROJECT_ID", "");
    vi.stubEnv("CREDITS_STORE", "file");
    vi.stubEnv("CREDITS_FILE", path.join(mkdtempSync(path.join(tmpdir(), "simubox-creem-")), "credits.json"));
    vi.stubEnv("CREEM_API_KEY", "creem_test_x");
    vi.stubEnv("CREEM_PRODUCTS", "starter:prod_s;explorer:prod_e");
    let sent: Record<string, unknown> = {};
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url.includes("/v1/discounts")) {
        return url.endsWith("SAVE20")
          ? Response.json({ code: "SAVE20", status: "active", type: "percentage", percentage: 20, applies_to_products: ["prod_e"] })
          : new Response("not found", { status: 404 });
      }
      sent = JSON.parse(String(init?.body));
      return Response.json({ id: "chk_d", status: "pending", checkout_url: "https://creem.test/pay/chk_d" });
    });
    const { POST } = await import("@/app/api/credits/route");
    const call = async (body: object) => (await POST(new Request("https://simubox.test/api/credits", { method: "POST", body: JSON.stringify(body) }))).json();

    expect((await call({ action: "discount", code: "NOPE" })).error).toBeTruthy();
    expect((await call({ action: "discount", code: "SAVE20" })).discount).toMatchObject({ code: "SAVE20", packs: ["explorer"] });
    // It doesn't cover Starter, so that order is refused rather than charged full price silently.
    expect((await call({ action: "order", pack: "starter", discount: "SAVE20" })).error).toBeTruthy();
    const r = await call({ action: "order", pack: "explorer", discount: "SAVE20" });
    expect(sent).toMatchObject({ product_id: "prod_e", discount_code: "SAVE20" });
    expect(r.order).toMatchObject({ price: 799, discount: "SAVE20", credits: 350 });
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});
