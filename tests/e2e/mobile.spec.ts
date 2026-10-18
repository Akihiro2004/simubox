import { expect, test } from "@playwright/test";

test("phone layout: no sideways scrolling on landing page or studio, composer and controls reachable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Ask anything\. Watch it come to life\./i })).toBeVisible();
  const landingOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(landingOverflow).toBe(false);

  await page.getByRole("link", { name: "Bedroom", exact: true }).click();
  await expect(page.getByLabel("Interactive 3D science world", { exact: true }).locator("canvas")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await expect(page.getByRole("textbox", { name: /ask simubox/i })).toBeInViewport();
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await expect(page.getByRole("region", { name: "Gravity" })).toBeVisible();
});
