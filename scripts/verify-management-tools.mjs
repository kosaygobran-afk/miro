// Disposable administrator; tool data and mutations are browser fixtures.
// Existing business records, stock, sales and calculator history are untouched.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.ADMIN_BASE_URL || "http://127.0.0.1:3121";
assert.ok(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY,
);
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
    },
  },
);
const variant = {
  id: randomUUID(),
  product_id: randomUUID(),
  sku: "QA-TOOLS",
  barcode: null,
  is_active: true,
  stock_qty: 10,
  price_override: null,
};
const product = {
  id: variant.product_id,
  name_en: "QA Camera",
  name_he: "מצלמת בדיקה",
  status: "active",
  is_active: true,
  price: 118,
  sale_price: null,
  tracking_mode: "none",
  product_variants: [variant],
};
let userId;
let browser;
const errors = [];
let stage = "create disposable admin";
try {
  const email = `tools-qa-${Date.now()}@miro-test.local`;
  const password = `ToolsTest-${randomUUID()}!`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  for (const result of await Promise.all([
    service
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id" }),
    service
      .from("profiles")
      .update({
        account_status: "active",
        role: "admin",
        full_name: "MIRO Tools QA",
      })
      .eq("id", userId),
  ]))
    if (result.error) throw result.error;
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/en/login`, { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="password"]').press("Enter");
  await page.waitForURL((url) => url.pathname !== "/en/login");
  // All tool requests are synthetic. Never allow an unexpected business write.
  await context.route("**/api/management/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") {
      assert.equal(path, "/api/management/calculator-history");
      return route.fulfill({ json: { result: 4, historyId: randomUUID() } });
    }
    const fixtures = {
      "/api/management/products": { products: [product] },
      "/api/management/product-lookup": { results: [{ product, variant }] },
      "/api/management/customers": { customers: [] },
      "/api/management/categories": { categories: [] },
      "/api/management/tax": {
        taxRates: [{ status: "current", is_active: true, rate: 18 }],
      },
      "/api/management/calculator-history": { history: [] },
    };
    if (fixtures[path]) return route.fulfill({ json: fixtures[path] });
    return route.continue();
  });
  for (const locale of ["en", "he"]) {
    const he = locale === "he";
    for (const width of [1440, 390]) {
      stage = `${locale} ${width}px`;
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${base}/${locale}/admin`, { waitUntil: "networkidle" });
      await page.evaluate(
        (id) => localStorage.removeItem(`miro.management.tools.${id}`),
        userId,
      );
      await page.reload({ waitUntil: "networkidle" });
      await page
        .getByRole("button", {
          name: he ? "פתיחת קופה" : "Open POS",
          exact: true,
        })
        .click();
      const pos = page.getByRole("dialog", {
        name: he ? "קופה רושמת" : "POS / Cash Register",
        exact: true,
      });
      await expect(pos.locator("#pos-product-search")).toBeVisible();
      assert.deepEqual(errors, [], `${stage}: opening POS`);
      await pos.locator("#pos-product-search").fill("QA-TOOLS");
      await pos.locator("#pos-product-search").press("Enter");
      await expect(
        pos.getByRole("button", { name: he ? "הסרת פריט" : "Remove item" }),
      ).toBeVisible();
      await pos
        .getByLabel(he ? "שם מלא" : "Full name", { exact: true })
        .fill("QA Customer");
      await pos
        .getByLabel(he ? "אימייל" : "Email", { exact: true })
        .fill("qa@example.com");
      await pos
        .getByRole("button", {
          name: he
            ? "השלמת היתרה בתשלום הראשון"
            : "Apply remaining amount to first payment",
        })
        .click();
      const reviewButton = pos.getByRole("button", {
        name: he ? "סקירת המכירה" : "Review sale",
        exact: true,
      });
      await reviewButton.click();
      const review = page.getByRole("dialog", {
        name: he ? "סקירת מכירה לפני רישום" : "Review sale before recording",
        exact: true,
      });
      await expect(review).toBeVisible();
      await expect(page.locator("#main-content")).toHaveAttribute("inert", "");
      await review.getByRole("button").last().focus();
      await page.keyboard.press("Tab");
      await expect(review.getByRole("button").first()).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(review).not.toBeVisible();
      await expect(reviewButton).toBeFocused();
      await expect(pos.locator("#pos-product-search")).toBeVisible();
      await pos
        .getByRole("button", {
          name: he ? "סגירת קופה" : "Close POS",
          exact: true,
        })
        .click();
      await expect(pos).not.toBeVisible();
      await page
        .getByRole("button", {
          name: he ? "פתיחת מחשבון" : "Open calculator",
          exact: true,
        })
        .click();
      const calculator = page.getByRole("dialog", {
        name: he ? "מחשבון" : "Calculator",
        exact: true,
      });
      await calculator.getByRole("button", { name: "2", exact: true }).click();
      await calculator
        .getByRole("button", { name: he ? "חיבור" : "Add", exact: true })
        .click();
      await calculator.getByRole("button", { name: "2", exact: true }).click();
      await calculator
        .getByRole("button", { name: he ? "שווה ל" : "Equals", exact: true })
        .click();
      await expect(calculator.getByRole("textbox")).toHaveText("4");
      await expect
        .poll(() =>
          page.evaluate(
            (id) =>
              JSON.parse(
                localStorage.getItem(`miro.management.tools.${id}`) || "{}",
              ).calculator?.open,
            userId,
          ),
        )
        .toBe(true);
      await page.reload({ waitUntil: "networkidle" });
      await expect(calculator.getByRole("textbox")).toBeVisible();
      await page
        .getByRole("button", {
          name: he ? "פתיחת קופה" : "Open POS",
          exact: true,
        })
        .click();
      await expect(pos.locator("#pos-product-search")).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            (id) =>
              JSON.parse(
                localStorage.getItem(`miro.management.tools.${id}`) || "{}",
              ).pos?.open,
            userId,
          ),
        )
        .toBe(true);
      await page.reload({ waitUntil: "networkidle" });
      await expect(pos.locator("#pos-product-search")).toBeVisible();
      await expect(calculator.getByRole("textbox")).toBeVisible();
      assert.deepEqual(errors, [], `${stage}: restored tools`);
      console.log(
        `PASS ${stage}: POS open/review/focus/Escape, calculator, restored tools`,
      );
    }
  }
} catch (error) {
  console.error(`FAIL ${stage}`);
  throw error;
} finally {
  await browser?.close();
  if (userId) {
    const deleted = await service.auth.admin.deleteUser(userId);
    if (deleted.error) throw deleted.error;
    console.log("PASS disposable admin cleanup");
  }
}
