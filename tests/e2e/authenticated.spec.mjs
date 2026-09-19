import { test, expect } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL;
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  test.skip(!baseURL || !email || !password, "Authenticated E2E credentials/base URL are not configured");
  await page.goto(baseURL, { waitUntil: "networkidle" });
});

async function bypassLocalPin(page) {
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const authKey = Object.keys(localStorage).find(k => k.endsWith("-auth-token"));
    if (!authKey) return;
    try {
      const raw = JSON.parse(localStorage.getItem(authKey) || "{}");
      const userId = raw?.user?.id || raw?.currentSession?.user?.id;
      if (userId) localStorage.setItem(`pm_pin_disabled__${userId}`, "1");
    } catch {}
  });
  await page.reload({ waitUntil: "networkidle" });
}

test("signs in and reaches the protected app shell", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "PowerMate" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();

  await page.waitForTimeout(1200);
  await bypassLocalPin(page);

  await expect(page.getByText("Power Works Field Service CRM")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();
});

test("opens Follow-ups through the real protected router", async ({ page }) => {
  await page.getByLabel("Email").fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForTimeout(1200);
  await bypassLocalPin(page);

  await page.goto(`${baseURL}?screen=Followups`, { waitUntil: "networkidle" });
  await expect(page.getByText("Follow-ups", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Add/ }).first()).toBeVisible();
});

test("writes a follow-up offline and survives reload", async ({ page, context }) => {
  await page.getByLabel("Email").fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForTimeout(1200);
  await bypassLocalPin(page);
  await page.goto(`${baseURL}?screen=Followups`, { waitUntil: "networkidle" });

  await page.getByRole("button", { name: /Add/ }).first().click();
  const marker = `E2E ${Date.now()}`;
  await page.getByLabel("What to follow up on").fill(marker);

  await context.setOffline(true);
  await page.getByRole("button", { name: "Add Follow-up", exact: true }).click();

  await expect(page.getByText(marker, { exact: true })).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText(marker, { exact: true })).toBeVisible();
  await context.setOffline(false);
});

test("Diagnostics loads without a crash after protected navigation", async ({ page }) => {
  await page.getByLabel("Email").fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForTimeout(1200);
  await bypassLocalPin(page);

  await page.goto(`${baseURL}?screen=Diagnostics`, { waitUntil: "networkidle" });
  await expect(page.getByText(/Diagnostics/i).first()).toBeVisible();
  await expect(page.getByText(/Recent crashes/i)).toBeVisible();
});
