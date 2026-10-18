import { expect, test } from "@playwright/test";

test("court changes between Earth campus, rocky Mars and Jupiter simulation deck", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.route("**/api/config", route => route.fulfill({ json: { firebase: null } }));
  await page.addInitScript(() => {
    localStorage.setItem("simubox-settings", JSON.stringify({ version: 1, state: { settings: { motion: "off", quality: "low", voice: false } } }));
    const observer = new MutationObserver(() => {
      const portal = document.querySelector<HTMLElement>("nextjs-portal");
      if (portal) { portal.style.display = "none"; observer.disconnect(); }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.goto("/app");
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.getByRole("button", { name: /^Sports court Throwing/ }).click();
  const controls = page.getByRole("button", { name: "Controls", exact: true });
  if (await controls.getAttribute("aria-expanded") !== "true") await controls.click();
  await page.getByRole("button", { name: "Jupiter", exact: true }).click();
  await expect(page.getByText(/This planet has no solid surface/)).toBeVisible();
  await controls.click();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: info.outputPath("jupiter-deck.png") });
  await controls.click();
  await page.getByRole("button", { name: "Mars", exact: true }).click();
  await expect(page.getByText(/This planet has no solid surface/)).toHaveCount(0);
  await controls.click();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: info.outputPath("mars-station.png") });
  await controls.click();
  await page.getByRole("button", { name: "Moon", exact: true }).click();
  await controls.click();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: info.outputPath("moon-preserved.png") });
  await controls.click();
  await page.getByRole("button", { name: "Earth", exact: true }).click();
  await expect(page.getByText(/This planet has no solid surface/)).toHaveCount(0);
  await controls.click();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: info.outputPath("earth-campus.png") });
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.getByRole("button", { name: /^Space Planets/ }).click();
  for (const name of ["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"]) {
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  }
  await page.screenshot({ path: info.outputPath("all-eight-planets.png") });
  expect(errors).toEqual([]);
});
