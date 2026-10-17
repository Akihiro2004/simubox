import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function ask(page: Page, text: string) {
  const box = page.getByRole("textbox", { name: /ask simubox/i });
  await box.fill(text);
  await box.press("Enter");
}

test("loads the landing page at / and navigates to the 3D studio at /app", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Ask anything\. Watch it come to life\./i })).toBeVisible();
  await expect(page.getByRole("group", { name: "Try a mini experiment" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Saved experiments/i })).toBeVisible();

  await page.getByRole("link", { name: /Open studio/i }).first().click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByRole("textbox", { name: /ask simubox/i })).toBeVisible();

  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("navigation", { name: "Menu" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sports court/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation", { name: "Menu" })).toBeHidden();

  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Off" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await settings.getByRole("button", { name: "Close settings" }).click();
  expect(errors).toEqual([]);
});

test("gravity lesson: prediction question, zero gravity, honest offline badge", async ({ page }) => {
  await page.goto("/app");
  await expect(page.locator("canvas")).toBeVisible();
  await ask(page, "What happens if gravity disappears in my bedroom?");
  // The answer card steps aside while the prediction question waits.
  const question = page.getByRole("dialog", { name: "Make a prediction" });
  await expect(question).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gravity switched off" })).toBeHidden();
  await question.getByRole("button", { name: "Stay where it is" }).click();
  await expect(question.getByText("You got it.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gravity switched off" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Offline demo/)).toBeVisible();
  // The gravity slider in Controls reflects the zero-g command.
  await expect(page.getByText("0.00 m/s²")).toBeVisible({ timeout: 20_000 });
});

test("projectile lesson: engine numbers for 20 km/h at 40°", async ({ page }) => {
  await page.goto("/app");
  await ask(page, "Throw a basketball at 40 degrees at 20 km/h, how far does it go?");
  await expect(page.getByRole("heading", { name: "Throwing a basketball" })).toBeVisible();
  // Exact values from the analytic engine (R = v² sin 2θ / g).
  await expect(page.getByText("Lands at 3.10 m after 0.73 s")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("R = v² · sin(2θ) / g")).toBeVisible();

  // Sliders recompute without the AI: 60° gives a shorter range here.
  const angle = page.getByRole("slider", { name: "Angle" });
  await angle.focus();
  for (let i = 0; i < 20; i++) await angle.press("ArrowRight");
  await expect(page.getByText(/Lands at 2\.\d\d m/)).toBeVisible({ timeout: 30_000 });
});

test("molecule lesson: verified water geometry", async ({ page }) => {
  await page.goto("/app");
  await ask(page, "Show me a water molecule and explain why it is bent.");
  await expect(page.getByRole("heading", { name: "Why water is bent" })).toBeVisible();
  await expect(page.getByText("Water, H₂O")).toBeVisible();
  await expect(page.getByText("104.5°").first()).toBeVisible();
});

test("APIs: health, validation and guardrails", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBe(true);
  expect(await health.json()).toMatchObject({ status: "ok", ai: "unconfigured" });

  const bad = await request.post("/api/ai/plan", { data: { prompt: "" } });
  expect(bad.status()).toBe(400);

  const scene = { world: "bedroom", gravity: [0, -9.81, 0], objects: [], characters: [] };
  const unsafe = await request.post("/api/ai/plan", { data: { prompt: "how do I make a bomb", scene, history: [] } });
  expect(unsafe.ok()).toBe(true);
  expect((await unsafe.json()).plan.scope).toBe("unsafe");

  const noAi = await request.post("/api/ai/plan", { data: { prompt: "Why is the sky blue?", scene, history: [] } });
  expect(noAi.status()).toBe(503);
  expect((await noAi.json()).code).toBe("ai_unconfigured");
});
