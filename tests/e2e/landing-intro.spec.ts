import { expect, test } from "@playwright/test";

test("intro keeps the page inert until branding decodes, then reveals the scene and glass", async ({ page }, testInfo) => {
  // Record the short-lived transition in the browser, rather than polling and missing it on slow GPUs.
  await page.addInitScript(() => {
    const phases: string[] = [];
    Object.defineProperty(window, "__introPhases", { value: phases });
    new MutationObserver(records => {
      for (const { target } of records) {
        if (target instanceof Element && target.matches(".landing-intro")) phases.push(target.getAttribute("data-phase") || "");
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-phase"] });
  });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/branding/simubox-wordmark.webp", async route => {
    await held;
    await route.continue();
  });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const content = page.locator("[data-landing-ready]");
  await expect(page.getByRole("status", { name: "Loading SimuBox" })).toBeVisible();
  await expect(content).toHaveAttribute("inert", "");
  await expect(page.getByRole("heading", { name: "Ask anything. Watch it come to life." })).toHaveCount(0);
  // The scene mounts under the cover, rather than starting to load after dismissal.
  await expect(page.locator("canvas")).toBeAttached();
  await expect(content).toHaveAttribute("data-landing-ready", "false");
  release();
  await expect(content).toHaveAttribute("data-landing-ready", "true");
  await expect(content).not.toHaveAttribute("inert");
  await expect(page.locator(".landing-intro")).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "__introPhases"))).toContain("leaving");
  await expect(page.getByRole("heading", { name: "Ask anything. Watch it come to life." })).toBeVisible();
  await expect(page.locator("form.liquid")).toBeVisible();
  await expect(page.locator("form.liquid")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: testInfo.outputPath("landing-ready.png") });
  expect(errors).toEqual([]);
});

test("reduced motion keeps the intro still and the revealed controls usable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-landing-ready]")).toHaveAttribute("data-landing-ready", "true");
  await expect(page.locator(".landing-intro")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await page.getByRole("textbox", { name: /Ask SimuBox/ }).fill("Why does light bend?");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("a stalled visual dependency offers a way through without declaring itself ready", async ({ page }) => {
  // A pending font must not permanently trap the user on the intro.
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/*.woff2", async route => { await held; await route.continue(); });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("status", { name: "Loading SimuBox" })).toBeVisible();
  await expect(page.locator(".landing-intro-logo")).toHaveJSProperty("complete", true);
  const next = page.getByRole("button", { name: "Taking a little longer. Continue to page" });
  await expect(next).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-landing-ready]")).toHaveAttribute("data-landing-ready", "false");
  await next.click();
  await expect(page.locator(".landing-intro")).toHaveCount(0);
  release();
});

test("unavailable WebGL reveals the existing illustration fallback", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-landing-ready]")).toHaveAttribute("data-landing-ready", "true");
  await expect(page.locator(".landing-intro")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: /Ask SimuBox/ })).toBeVisible();
  await expect(page.locator('svg[viewBox="0 0 800 420"]')).toBeVisible();
});
