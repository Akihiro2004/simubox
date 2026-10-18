import { expect, test } from "@playwright/test";

// Preserve the phone viewport while keeping software-WebGL captures affordable.
test.use({ deviceScaleFactor: 1 });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // The development-only Next badge covers Controls on the shared dev server.
    const observer = new MutationObserver(() => {
      const portal = document.querySelector<HTMLElement>("nextjs-portal");
      if (portal) { portal.style.display = "none"; observer.disconnect(); }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.route("**/api/config", route => route.fulfill({ json: { firebase: null } }));
  await page.addInitScript(() => localStorage.setItem("simubox-settings", JSON.stringify({ version: 1, state: { settings: { motion: "off", quality: "low", voice: false } } })));
});

test("periodic table explains selected elements locally, permits exploration and exits the close view", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  let aiRequests = 0;
  await page.route("**/api/ai/plan", route => { aiRequests++; return route.abort(); });
  await page.goto("/app");
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.getByRole("button", { name: /^Science lab Atoms/ }).click();
  const controls = page.getByRole("button", { name: "Controls", exact: true });
  if (await controls.getAttribute("aria-expanded") !== "true") await controls.click();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Periodic table view" });
  await expect(nav).toBeVisible();
  if (await controls.getAttribute("aria-expanded") !== "true") await controls.click();
  await page.getByLabel("Find an element").selectOption("35");
  await expect(page.getByText("Atomic number 35 means 35 protons.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Show its period", exact: true }).click();
  await page.getByRole("button", { name: "Explain Bromine", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await expect(page.getByText(/Bromine has atomic number 35/).first()).toBeVisible();
  await nav.getByRole("button", { name: "Back to lab", exact: true }).click();
  await expect(nav).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
  if (await controls.getAttribute("aria-expanded") !== "true") await controls.click();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  if (await controls.getAttribute("aria-expanded") !== "true") await controls.click();
  await page.getByLabel("Find an element").selectOption("118");
  await expect(page.getByRole("button", { name: "Explain Oganesson", exact: true })).toBeVisible();
  await expect(page.getByText(/bracketed value is an isotope/)).toBeVisible();
  await controls.click();
  const canvas = page.locator("canvas"), box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * .48, box.y + box.height * .5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .62, box.y + box.height * .55, { steps: 12 });
  await page.mouse.up();
  await nav.getByRole("button", { name: "Fit table", exact: true }).click();
  if (await controls.getAttribute("aria-expanded") !== "true") await controls.click();
  await expect(page.getByLabel("Find an element")).toHaveValue("118");
  await controls.click();
  await page.screenshot({ path: info.outputPath("periodic-table-exploration.png") });
  expect(aiRequests).toBe(0);
  expect(errors).toEqual([]);
});
