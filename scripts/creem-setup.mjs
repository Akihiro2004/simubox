// Creates one Creem product per credit pack and saves CREEM_PRODUCTS to .env.local.
// Run once per Creem mode (test key first, then again with the live key):
//   npm run creem:setup
// Reads CREEM_API_KEY from the environment or .env.local.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PACKS } from "../src/lib/credits.ts";

const envFile = ".env.local";
const env = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
const fromFile = (name) => env.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim();
const key = process.env.CREEM_API_KEY || fromFile("CREEM_API_KEY");
if (!key) throw new Error("Put CREEM_API_KEY=... in .env.local first (Creem dashboard > Developers > API keys).");
const base = key.startsWith("creem_test_") ? "https://test-api.creem.io" : "https://api.creem.io";

const pairs = [];
for (const p of PACKS) {
  const res = await fetch(`${base}/v1/products`, {
    method: "POST",
    headers: { "x-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      name: `SimuBox ${p.name} pack`,
      description: `${p.credits} SimuBox credits for asking Simu science questions (${p.note}).`,
      price: p.price,
      currency: "USD",
      billing_type: "onetime",
      tax_category: "digital-goods-service",
    }),
  });
  if (!res.ok) throw new Error(`Creem ${res.status} creating ${p.name}: ${await res.text()}`);
  const product = await res.json();
  console.log(`${p.name}: ${product.id}`);
  pairs.push(`${p.id}:${product.id}`);
}

const line = `CREEM_PRODUCTS=${pairs.join(";")}`;
writeFileSync(envFile, /^CREEM_PRODUCTS=.*$/m.test(env) ? env.replace(/^CREEM_PRODUCTS=.*$/m, line) : `${env.replace(/\n?$/, "\n")}${line}\n`);
console.log(`\nSaved to ${envFile} (${base.includes("test") ? "test" : "LIVE"} mode):\n${line}`);
