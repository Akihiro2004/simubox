import { expect, test } from "@playwright/test";

test("a restored signed-in session goes straight from home to the studio", async ({ page }) => {
  const uid = "returning-student";
  const landingChunks: string[] = [];
  page.on("request", request => {
    if (/LandingStage/.test(request.url())) landingChunks.push(request.url());
  });
  await page.addInitScript(() => {
    new MutationObserver(records => {
      for (const { target } of records) {
        if (target instanceof Element && target.matches('[data-landing-ready="true"]')) Reflect.set(window, "__landingWasRevealed", true);
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-landing-ready"] });
  });
  await page.route("**/api/config", route => route.fulfill({ json: {
    firebase: { apiKey: "test-api-key", authDomain: "simubox-test.firebaseapp.com", projectId: "simubox-test", appId: "test-app" },
  } }));
  await page.route("**/identitytoolkit.googleapis.com/**", route => {
    if (route.request().url().includes("accounts:lookup")) return route.fulfill({ json: {
      users: [{ localId: uid, email: "student@example.test", emailVerified: true, providerUserInfo: [], createdAt: "1700000000000", lastLoginAt: "1700000000000" }],
    } });
    return route.abort();
  });
  await page.route("**/firestore.googleapis.com/**", route => route.abort());
  await page.route("**/securetoken.googleapis.com/**", route => route.abort());
  // Seed only this isolated browser context, using Firebase's normal persisted-session format.
  await page.goto("/privacy");
  await page.evaluate(async uid => {
    const now = Math.floor(Date.now() / 1000);
    const accessToken = `${btoa('{}')}.${btoa(JSON.stringify({ sub: uid, iat: now, exp: now + 3600, auth_time: now }))}.test`;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("firebaseLocalStorageDb", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("firebaseLocalStorage", { keyPath: "fbase_key" });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("firebaseLocalStorage", "readwrite");
        transaction.objectStore("firebaseLocalStorage").put({
          fbase_key: "firebase:authUser:test-api-key:[DEFAULT]",
          value: { uid, email: "student@example.test", emailVerified: true, isAnonymous: false, providerData: [],
            stsTokenManager: { refreshToken: "test-refresh-token", accessToken, expirationTime: (now + 3600) * 1000 },
            createdAt: "1700000000000", lastLoginAt: "1700000000000", apiKey: "test-api-key", appName: "[DEFAULT]" },
        });
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, uid);
  await page.goto("/");
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByLabel("Interactive 3D science world").locator("canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Account: signed in" })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, "__landingWasRevealed"))).not.toBe(true);
  await expect(page.getByRole("heading", { name: "Ask anything. Watch it come to life." })).toHaveCount(0);
  expect(landingChunks).toEqual([]);
});

test("a guest stays on home after the session check", async ({ page }) => {
  await page.route("**/api/config", route => route.fulfill({ json: { firebase: null } }));
  await page.goto("/");
  await expect(page.locator("[data-landing-ready]")).toHaveAttribute("data-landing-ready", "true");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Ask anything. Watch it come to life." })).toBeVisible();
});
