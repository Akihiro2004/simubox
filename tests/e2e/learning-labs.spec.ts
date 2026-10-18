import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }, info) => {
  await page.addInitScript(() => {
    // The development-only Next badge covers Controls on the shared dev server.
    const observer = new MutationObserver(() => {
      const portal = document.querySelector<HTMLElement>("nextjs-portal");
      if (portal) { portal.style.display = "none"; observer.disconnect(); }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.route("**/api/config", route => route.fulfill({ json: { firebase: null } }));
  await page.addInitScript(({ motion, quality }) => localStorage.setItem("simubox-settings", JSON.stringify({ version: 1, state: { settings: { motion, quality, voice: false, voiceRate: 1, englishVoice: "gemini", language: "en", gradeBand: "middle" } } })), { motion: info.title.includes("playback") ? "on" : "off", quality: info.title.startsWith("room labels") ? "medium" : "low" });
});
async function openMap(page: Page, name: RegExp) {
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.getByRole("button", { name }).click();
  const controls = page.getByRole("button", { name: "Controls", exact: true });
  if (await controls.getAttribute("aria-expanded") !== "true") await controls.click();
}

test("Mechanics Lab exposes working force, collision and pendulum experiments", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/app");
  await openMap(page, /^Mechanics lab Forces/);
  const panel = page.getByRole("region", { name: "Mechanics lab", exact: true });
  await expect(page.getByLabel("Mechanics mode")).toBeVisible();
  await page.getByLabel("Cart / bob mass (kg)", { exact: true }).fill("4");
  await page.getByLabel("Cart / bob mass (kg)", { exact: true }).press("Tab");
  await expect(panel).toContainText("1 m/s²");
  await page.getByLabel("Mechanics mode").selectOption("collision");
  await expect(panel).toContainText("Total momentum");
  await expect(panel).toContainText("2 kg·m/s");
  await expect(page.getByText("2 kg", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await page.screenshot({ path: info.outputPath("mechanics-lab.png") });
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await page.getByLabel("Mechanics mode").selectOption("pendulum");
  await page.getByLabel("Pendulum length (m)").fill("1");
  await page.getByLabel("Pendulum length (m)").press("Tab");
  await expect(panel).toContainText("2.0060667 s");
  expect(errors).toEqual([]);
});

test("Math Studio covers its instruments, responds to inputs and preserves graphing", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/app");
  await openMap(page, /^Math studio Arithmetic/);
  const panel = page.getByRole("region", { name: "Math studio", exact: true });
  await expect(panel).toContainText("5/6");
  await page.getByLabel("First numerator", { exact: true }).fill("2");
  await page.getByLabel("First numerator", { exact: true }).press("Tab");
  await expect(panel).toContainText("4/3");
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await page.screenshot({ path: info.outputPath("math-studio.png") });
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  for (const mode of ["number_line", "arithmetic", "place_value", "angles", "ratio", "percent", "equation", "inequality", "quadratic", "linear_system", "geometry", "trigonometry", "statistics", "probability", "sequence", "transform"]) {
    await page.getByLabel("Math investigation").selectOption(mode);
    await expect(page.getByLabel("Math investigation")).toHaveValue(mode);
  }
  await page.getByLabel("Math investigation").selectOption("measurement");
  await expect(panel).toContainText("2 m = 200 cm");
  await page.getByLabel("Target unit").selectOption("km");
  await expect(panel).toContainText("0.002 km");
  await page.getByLabel("Math investigation").selectOption("functions");
  await page.getByRole("textbox", { name: "Function expression", exact: true }).fill("sin(x)");
  await page.getByRole("button", { name: "Plot function", exact: true }).click();
  await expect(panel).toContainText("y = sin(x)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("mechanics playback updates the on-track readout and reaches the computed endpoint", async ({ page }) => {
  await page.goto("/app");
  await openMap(page, /^Mechanics lab Forces/);
  const readout = page.getByText(/^t \d+\.\d s\s+·\s+v/);
  await expect(readout).toBeVisible();
  await expect(readout).toContainText("t 4.0 s", { timeout: 15_000 });
  await expect(readout).toContainText("v 8.00 m/s");
});

test("workshop wind driver switches to a straight-wave model and can be set to calm", async ({ page }) => {
  await page.goto("/app");
  await openMap(page, /^Workshop Circuits/);
  await page.getByRole("button", { name: "Ripples", exact: true }).click();
  await page.getByRole("switch", { name: "Wind-driven waves (qualitative)", exact: true }).check();
  await expect(page.getByRole("slider", { name: "Wind strength", exact: true })).toBeVisible();
  const slider = page.getByRole("slider", { name: "Wind strength", exact: true });
  await slider.focus(); await slider.press("Home");
  await expect(slider).toHaveValue("0");
  await expect(page.getByText(/0 m\/s · qualitative forcing/)).toBeVisible();
});

test("room labels have padding, static measurements render, and maps follow the requested menu order", async ({ page, context }, info) => {
  test.setTimeout(150_000);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/app");
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  expect(await page.getByRole("button", { name: /^Math studio Arithmetic/ }).evaluate(el => el.nextElementSibling?.textContent)).toContain("Math grid");
  expect(await page.getByRole("button", { name: /^Mechanics lab Forces/ }).evaluate(el => el.nextElementSibling?.textContent)).toContain("Workshop");
  await page.getByRole("button", { name: /^Mechanics lab Forces/ }).click();
  const readout = page.locator(".lab-readout");
  await expect(readout).toContainText("t 4.0 s");
  await expect(readout).toContainText("v 8.00 m/s");
  await expect(readout).toHaveCSS("padding-left", "16px");
  await expect(readout).toHaveCSS("white-space", "normal");
  const box = await readout.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  // The throttled check above covers initial rendering/readiness. Capture the
  // remaining instrument layouts without compounding software-GPU throttling.
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const controls = page.getByRole("button", { name: "Controls", exact: true });
  if (await controls.getAttribute("aria-expanded") !== "true") await controls.click();
  await page.getByLabel("Mechanics mode").selectOption("ramp");
  await page.getByLabel("Ramp angle (°)").fill("60");
  await page.getByLabel("Ramp angle (°)").press("Tab");
  await controls.click();
  await expect(page.getByText("Hi, I'm Simu! Ask me anything and I'll build it in 3D.", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("mechanics-ramp-room.png") });
  await controls.click();
  await page.getByLabel("Mechanics mode").selectOption("pendulum");
  await page.getByLabel("Pendulum length (m)").fill("3");
  await page.getByLabel("Pendulum length (m)").press("Tab");
  await controls.click();
  await page.screenshot({ path: info.outputPath("mechanics-pendulum-room.png") });
  await openMap(page, /^Math studio Arithmetic/);
  await page.getByLabel("Math investigation").selectOption("transform");
  await controls.click();
  await expect(page.getByRole("status").filter({ hasText: "Preparing experiment" })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("math-transform-room.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
