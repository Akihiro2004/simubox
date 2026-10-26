// Creates one Creem product per credit pack and prints CREEM_PRODUCTS.
// Run once per Creem mode:
//   Test key in .env.local:   npm run creem:setup      (also saves the line to .env.local)
//   Live key (production):    npm run creem:setup -- --live   (asks for the key, hidden)
//     A key given in the environment is only used, never written anywhere, and
//     .env.local keeps its test settings; copy the printed line to Cloud Run.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PACKS } from "../src/lib/credits.ts";

const envFile = ".env.local";
const env = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
const fromFile = (name) => env.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim();
/** Asks for a key without showing what is typed. */
async function askHidden(question) {
  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => rl.output.write(s.startsWith(question) ? s : "*".repeat(s.length ? 1 : 0));
  return new Promise((resolve) => rl.question(question, (a) => (rl.close(), process.stdout.write("\n"), resolve(a.trim()))));
}

//   --live asks for the live key here (hidden), so it's never typed into a command or saved.
const live = process.argv.includes("--live");
const typed = live ? await askHidden("Paste your LIVE Creem API key (creem_...), then press Enter: ") : "";
if (live && !/^creem_(?!test_)\w+$/.test(typed)) throw new Error("That isn't a live key (live keys start with creem_ and not creem_test_).");
const fromEnv = live || Boolean(process.env.CREEM_API_KEY);
const key = typed || process.env.CREEM_API_KEY || fromFile("CREEM_API_KEY");
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

const mode = base.includes("test") ? "test" : "LIVE";
const line = `CREEM_PRODUCTS=${pairs.join(";")}`;
if (fromEnv) {
  console.log(`\n${mode} mode products created. Set this on the Cloud Run service (it isn't saved anywhere):\n${line}`);
} else {
  writeFileSync(envFile, /^CREEM_PRODUCTS=.*$/m.test(env) ? env.replace(/^CREEM_PRODUCTS=.*$/m, line) : `${env.replace(/\n?$/, "\n")}${line}\n`);
  console.log(`\nSaved to ${envFile} (${mode} mode):\n${line}`);
}
