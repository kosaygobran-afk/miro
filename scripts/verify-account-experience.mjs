// Disposable customer's own saved record only. Profile/request submissions are mocked;
// no enquiries, orders, invoices, owner settings or catalog records are created/changed.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.ACCOUNT_BASE_URL || "http://127.0.0.1:3121";
const output = process.env.ACCOUNT_OUTPUT_DIR || "/tmp/miro-account-experience";
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const checks = [];
const pass = (label) => {
  checks.push(label);
  console.log("PASS", label);
};
let userId;
let browser;
const errors = [];
try {
  const email = `account-qa-${Date.now()}-long-mobile-readability@miro-test.local`;
  const password = `AccountQA-${randomUUID()}!`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const updated = await service
    .from("profiles")
    .update({
      role: "customer",
      account_status: "active",
      full_name: "בדיקת חשבון לקוח עם שם ארוך במיוחד להתאמה למסך טלפון צר",
    })
    .eq("id", userId);
  if (updated.error) throw updated.error;
  const role = await service
    .from("user_roles")
    .upsert({ user_id: userId, role: "customer" }, { onConflict: "user_id" });
  if (role.error) throw role.error;
  const products = await service
    .from("products")
    .select("id, out_of_stock_policy")
    .eq("status", "active")
    .limit(20);
  if (products.error) throw products.error;
  const product = products.data.find(
    (item) => item.out_of_stock_policy !== "hide_from_public",
  );
  assert.ok(product, "One existing visible catalog product is required");
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 900 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/en/login`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="password"]').press("Enter");
  await page.waitForURL((url) => url.pathname !== "/en/login");
  const saved = await context.request.post(
    `${base}/api/account/saved-products`,
    { headers: { Origin: base }, data: { productId: product.id } },
  );
  assert.equal(saved.status(), 200);
  pass("real customer login and own saved product through authorized API");
  let layouts = 0;
  for (const locale of ["en", "he"])
    for (const theme of ["dark", "medium", "light"])
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(`${base}/${locale}/account`);
        await expect(page.locator("html")).toHaveAttribute(
          "data-motion-ready",
          "true",
        );
        await page.evaluate(
          (theme) =>
            document.querySelector(`[data-theme-option="${theme}"]`).click(),
          theme,
        );
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator(".account-saved-card")).toHaveCount(1);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          `${locale}/${theme}/${width}`,
        );
        const axe = await new AxeBuilder({ page }).analyze();
        if (axe.violations.length)
          console.log(
            JSON.stringify(
              axe.violations.map((v) => ({
                id: v.id,
                nodes: v.nodes.map((n) => ({
                  target: n.target,
                  failureSummary: n.failureSummary,
                })),
              })),
              null,
              2,
            ),
          );
        assert.deepEqual(
          axe.violations.map((v) => v.id),
          [],
          `${locale}/${theme}/${width}`,
        );
        if (locale === "he" && theme === "light" && width === 320) {
          await mkdir(output, { recursive: true });
          await page.screenshot({
            path: `${output}/account-he-light-320.png`,
            fullPage: true,
          });
        }
        layouts++;
      }
  const savedHref = await page
    .locator(".account-saved-link")
    .getAttribute("href");
  assert.equal(
    (await context.request.get(`${base}${savedHref}`)).status(),
    200,
  );
  pass("saved card links use the canonical storefront category route");
  pass(
    `${layouts} account bilingual/theme/320/390/1440 layouts with no overflow or axe violations`,
  );
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto(`${base}/en/account`);
  const profile = page.locator('form:has(input[value="profile"])');
  const request = page.locator('form:has(input[value="request"])');
  await profile
    .locator('input[name="full_name"]')
    .fill("Unsaved profile draft");
  await request
    .locator("textarea")
    .fill("My service request draft must remain after another form fails.");
  let calls = 0;
  let release;
  let mode = "hold";
  await page.route("**/api/account", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    calls++;
    if (mode === "hold")
      await new Promise((done) => {
        release = done;
      });
    await route.fulfill({
      status: mode === "success" ? 200 : 400,
      contentType: "application/json",
      body: JSON.stringify(
        mode === "success" ? { ok: true } : { error: "Fixture failure" },
      ),
    });
  });
  await profile.getByRole("button", { name: "Save profile" }).click();
  await expect(profile).toHaveAttribute("aria-busy", "true");
  await expect(request.getByRole("button")).toBeEnabled();
  await profile.evaluate((form) =>
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
  await expect.poll(() => calls).toBe(1);
  mode = "failure";
  release();
  await expect(profile.getByRole("status")).toContainText("Could not save");
  await expect(request.getByRole("status")).toHaveText("");
  await expect(request.locator("textarea")).toHaveValue(
    "My service request draft must remain after another form fails.",
  );
  pass(
    "independent forms, duplicate guard and profile failure preserve request draft",
  );
  await request.getByRole("button", { name: "Submit request" }).click();
  await expect(request.getByRole("status")).toContainText(
    "Check request history",
  );
  await expect(request.locator("textarea")).not.toHaveValue("");
  mode = "success";
  await request.getByRole("button", { name: "Submit request" }).click();
  await expect(request.getByRole("status")).toContainText("Saved successfully");
  await expect(request.locator("textarea")).toHaveValue("");
  await expect(profile.locator('input[name="full_name"]')).toHaveValue(
    "Unsaved profile draft",
  );
  pass(
    "request failure preserves text; successful mocked save resets only its form",
  );
  let removeFails = true;
  await page.route("**/api/account/saved-products?*", async (route) => {
    if (removeFails)
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: '{"error":"Fixture failure"}',
      });
    return route.continue();
  });
  await page.evaluate(() => {
    window.__accountDocumentToken = "stable-account-document";
  });
  await page
    .locator(".account-saved-card")
    .getByRole("button", { name: /^Remove / })
    .click();
  await expect(
    page.locator(".account-remove-control").getByRole("status"),
  ).toContainText("Could not remove");
  await expect(page.locator(".account-saved-card")).toHaveCount(1);
  removeFails = false;
  await page
    .locator(".account-saved-card")
    .getByRole("button", { name: /^Remove / })
    .click();
  await expect(page.locator(".account-saved-card")).toHaveCount(0);
  await expect(page.locator("#account-saved-heading")).toBeFocused();
  await expect(profile.locator('input[name="full_name"]')).toHaveValue(
    "Unsaved profile draft",
  );
  assert.equal(
    await page.evaluate(() => window.__accountDocumentToken),
    "stable-account-document",
  );
  pass(
    "failed removal is retryable; real own-record deletion refreshes without losing drafts or document reload",
  );
  assert.deepEqual(errors, []);
  await mkdir(output, { recursive: true });
  await writeFile(
    `${output}/checks.json`,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        checks,
        layoutCases: layouts,
        axeViolations: 0,
        runtimeErrors: errors,
        submissions: "mocked",
        savedRecord: "disposable customer only",
      },
      null,
      2,
    ),
  );
  pass("no browser runtime errors; sanitized check metadata saved");
} finally {
  await browser?.close();
  if (userId) {
    const removed = await service.auth.admin.deleteUser(userId);
    if (removed.error) throw new Error("Disposable account cleanup failed");
  }
}
