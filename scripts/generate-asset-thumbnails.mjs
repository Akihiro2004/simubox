// Start npm run dev, then run node scripts/generate-asset-thumbnails.mjs.
// One shared renderer uses the same AssetModel, lights, camera and tone mapping as the shop preview.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`${process.env.ASSET_STUDIO_URL || "http://localhost:3000"}/asset-studio`);
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll("[data-asset-id]")];
    return cards.length > 0 && cards.every(card => card.querySelector("img")?.src.startsWith("data:image/png;base64,"));
  }, undefined, { timeout: 60_000 });
  const images = await page.locator("[data-asset-id]").evaluateAll(cards => cards.map(card => ({ id: card.getAttribute("data-asset-id"), src: card.querySelector("img").src })));
  const folder = fileURLToPath(new URL("../public/asset-thumbnails/", import.meta.url));
  await mkdir(folder, { recursive: true });
  for (const image of images) {
    if (!/^[a-z][a-z0-9_]+$/.test(image.id) || !image.src.startsWith("data:image/png;base64,")) throw new Error("Invalid thumbnail export");
    await writeFile(`${folder}/${image.id}.png`, Buffer.from(image.src.split(",")[1], "base64"));
  }
  console.log(`Saved ${images.length} exact model thumbnails to ${folder}`);
} finally {
  await browser.close();
}
