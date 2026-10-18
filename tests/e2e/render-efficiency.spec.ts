import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/config", route => route.fulfill({ json: { firebase: null } }));
  await page.addInitScript(() => {
    localStorage.setItem("simubox-settings", JSON.stringify({ version: 1, state: { settings: { motion: "off", quality: "medium", voice: false } } }));
    const stats = { draws: 0, waterUploads: 0, hidden: false };
    Reflect.set(window, "__renderStats", stats);
    Object.defineProperty(document, "hidden", { configurable: true, get: () => stats.hidden });
    // Observe real GPU submissions without adding instrumentation to the app.
    for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      const draw = prototype.drawElements;
      prototype.drawElements = function (...args) { stats.draws++; return draw.apply(this, args); };
      const upload = prototype.bufferSubData;
      prototype.bufferSubData = function (...args: Parameters<typeof upload>) {
        if (args[2] && args[2].byteLength >= 200_000) stats.waterUploads++;
        return Reflect.apply(upload, this, args);
      };
    }
  });
});

const stats = (page: Page) => page.evaluate(() => Reflect.get(window, "__renderStats") as { draws: number; waterUploads: number; hidden: boolean });

test("studio stops GPU submissions while hidden and resumes without changing Pause", async ({ page }) => {
  await page.goto("/app");
  await expect.poll(async () => (await stats(page)).draws).toBeGreaterThan(10);
  await page.evaluate(() => {
    Reflect.get(window, "__renderStats").hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(250); // Let the already scheduled frame finish.
  const hidden = (await stats(page)).draws;
  await page.waitForTimeout(400);
  expect((await stats(page)).draws).toBe(hidden);
  await page.evaluate(() => {
    Reflect.get(window, "__renderStats").hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(async () => (await stats(page)).draws).toBeGreaterThan(hidden);
  const controls = page.getByRole("button", { name: "Controls", exact: true });
  if (await controls.getAttribute("aria-expanded") !== "true") await controls.click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
});

test("settled ripples retain their GPU buffers and still respond to view changes", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/app");
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.getByRole("button", { name: /^Workshop Circuits/ }).click();
  const controls = page.getByRole("button", { name: "Controls", exact: true });
  if (await controls.getAttribute("aria-expanded") !== "true") await controls.click();
  await page.getByRole("button", { name: "Ripples", exact: true }).click();
  await expect(page.getByRole("button", { name: "Where they add up", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Preparing experiment" })).toHaveCount(0);
  await page.waitForTimeout(800);
  const settled = (await stats(page)).waterUploads;
  await page.waitForTimeout(500);
  expect((await stats(page)).waterUploads).toBe(settled);
  await page.getByRole("button", { name: "Where they add up", exact: true }).click();
  await expect.poll(async () => (await stats(page)).waterUploads).toBeGreaterThan(settled);
  await page.waitForTimeout(250);
  const updated = (await stats(page)).waterUploads;
  await page.waitForTimeout(400);
  expect((await stats(page)).waterUploads).toBe(updated);
  expect(errors).toEqual([]);
});

test("all worlds load their first-use experiments with a 4x slower CPU", async ({ page, context }) => {
  test.setTimeout(180_000);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/app");
  for (const name of [/^Mechanics lab Forces/, /^Math studio Arithmetic/, /^Space Planets/, /^Globe Countries/, /^Workshop Circuits/, /^Light lab Mirrors/, /^Ocean dock Floating/, /^Science lab Atoms/, /^Math grid Graphs/, /^Park Plants/, /^Sports court Throwing/, /^Blank stage Anything/, /^Bedroom Gravity/]) {
    await page.getByRole("button", { name: "Open menu", exact: true }).click();
    const before = (await stats(page)).draws;
    await page.getByRole("button", { name }).click();
    await expect.poll(async () => (await stats(page)).draws).toBeGreaterThan(before);
    await expect(page.getByRole("status").filter({ hasText: "Preparing experiment" })).toHaveCount(0);
    await expect(page.locator("canvas")).toBeVisible();
  }
  // The stage's optional signal experiment also has its own deferred renderer.
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.getByRole("button", { name: /^Blank stage Anything/ }).click();
  const controls = page.getByRole("button", { name: "Controls", exact: true });
  if (await controls.getAttribute("aria-expanded") !== "true") await controls.click();
  await page.getByRole("button", { name: "Signals", exact: true }).click();
  await expect(page.getByLabel("Kind of signal", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Preparing experiment" })).toHaveCount(0);
  await page.getByRole("button", { name: "Strength", exact: true }).click();
  await page.getByLabel("Kind of signal", { exact: true }).selectOption("sound");
  expect(errors).toEqual([]);
});

test("a failed experiment download keeps the room and navigation usable", async ({ page }) => {
  await page.goto("/app");
  await expect.poll(async () => (await stats(page)).draws).toBeGreaterThan(10);
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.route("**/_next/static/chunks/**", route => route.abort());
  await page.getByRole("button", { name: /^Mechanics lab Forces/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This experiment couldn’t load" })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await page.unroute("**/_next/static/chunks/**");
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.getByRole("button", { name: /^Bedroom Gravity/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This experiment couldn’t load" })).toHaveCount(0);
  const before = (await stats(page)).draws;
  await expect.poll(async () => (await stats(page)).draws).toBeGreaterThan(before);
});

test("animated ripples stop uploading on Pause and continue on Play", async ({ page }) => {
  await page.addInitScript(() => {
    const saved = JSON.parse(localStorage.getItem("simubox-settings")!);
    saved.state.settings.motion = "on";
    localStorage.setItem("simubox-settings", JSON.stringify(saved));
  });
  await page.goto("/app");
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.getByRole("button", { name: /^Workshop Circuits/ }).click();
  const controls = page.getByRole("button", { name: "Controls", exact: true });
  if (await controls.getAttribute("aria-expanded") !== "true") await controls.click();
  await page.getByRole("button", { name: "Ripples", exact: true }).click();
  await expect.poll(async () => (await stats(page)).waterUploads).toBeGreaterThan(3);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.waitForTimeout(250);
  const paused = (await stats(page)).waterUploads;
  await page.waitForTimeout(400);
  expect((await stats(page)).waterUploads).toBe(paused);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => (await stats(page)).waterUploads).toBeGreaterThan(paused);
});
