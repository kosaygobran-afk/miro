// Protected browser QA: only disposable auth is written; all catalog mutations
// are fulfilled with synthetic fixtures. No existing product/customer is changed.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";

nextEnv.loadEnvConfig(process.cwd());
const engine = process.env.IMAGE_REVIEW_BROWSER || "chromium";
const browserType = { chromium, firefox, webkit }[engine];
assert.ok(browserType, "Supported engines: chromium, firefox, webkit");
const base = process.env.ADMIN_BASE_URL || "http://127.0.0.1:3216";
const output =
  process.env.IMAGE_REVIEW_OUTPUT_DIR ||
  join(tmpdir(), `miro-image-review-${engine}`);
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
const checks = [];
const runtimeErrors = [];
const productId = "11111111-1111-4111-8111-111111111111";
const product = {
  id: productId,
  slug: "qa-camera",
  name_he: "מצלמת בדיקה",
  name_en: "QA camera",
  status: "draft",
  tags: [],
  out_of_stock_policy: "inherit",
  sort_order: 0,
  product_variants: [],
  product_prices: [],
  product_images: [],
};
const person = {
  id: productId,
  full_name: "Synthetic QA",
  email: "synthetic@example.invalid",
  phone: null,
  role: "customer",
  account_status: "active",
  created_at: "2026-10-16T00:00:00Z",
  last_seen_at: null,
};
const file = await sharp({
  create: { width: 40, height: 40, channels: 3, background: "white" },
})
  .jpeg()
  .toBuffer();
let actorId;
let browser;
const pass = (label) => {
  checks.push(label);
  console.log(`PASS ${label}`);
};
try {
  browser = await browserType.launch();
  const email = `image-review-${randomUUID()}@miro-test.local`;
  const password = `Review-${randomUUID()}!`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  actorId = created.data.user.id;
  for (const result of await Promise.all([
    service
      .from("user_roles")
      .upsert({ user_id: actorId, role: "ceo" }, { onConflict: "user_id" }),
    service
      .from("profiles")
      .update({
        account_status: "active",
        role: "ceo",
        full_name: "Synthetic QA",
      })
      .eq("id", actorId),
  ]))
    if (result.error) throw result.error;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await page.goto(`${base}/en/login`, { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="password"]').press("Enter");
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), {
    timeout: 30000,
  });
  pass("real disposable CEO login");
  let images = [];
  let resultStatus = "original";
  let failUpload = false;
  let holdUpload = null;
  let expectedRemoval = true;
  await context.route("**/api/management/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (
      pathname.endsWith("/product-images/upload") ||
      (pathname.endsWith("/product-images") && request.method() === "POST")
    ) {
      if (pathname.endsWith("/upload")) {
        assert.ok(
          request
            .postDataBuffer()
            .toString()
            .includes(`name="remove_background"\r\n\r\n${expectedRemoval}`),
        );
      } else {
        assert.equal(request.postDataJSON().remove_background, expectedRemoval);
      }
      if (holdUpload) await holdUpload;
      if (failUpload)
        return route.fulfill({
          status: 400,
          json: { error: "Synthetic rejected upload" },
        });
      const image = {
        id: randomUUID(),
        product_id: productId,
        image_url: "/images/catalog/dome-01.svg",
        sort_order: images.length,
        alt_he: "בדיקה",
        alt_en: "QA",
      };
      images.push(image);
      return route.fulfill({
        json: {
          image,
          background_removal: {
            status: resultStatus,
            skipped: resultStatus !== "processed",
            reason:
              resultStatus === "original" ? "worker_not_configured" : null,
          },
        },
      });
    }
    assert.equal(
      request.method(),
      "GET",
      `Unexpected business mutation ${pathname}`,
    );
    if (pathname.endsWith("/product-images"))
      return route.fulfill({ json: { images } });
    if (pathname.endsWith(`/products/${productId}`))
      return route.fulfill({ json: { product } });
    if (pathname.endsWith("/categories"))
      return route.fulfill({ json: { categories: [] } });
    if (pathname.endsWith("/suppliers"))
      return route.fulfill({ json: { suppliers: [] } });
    if (pathname.endsWith("/analytics"))
      return route.fulfill({
        json: {
          range: {
            from: "2026-10-15",
            to: "2026-10-16",
            generatedAt: "2026-10-16T00:00:00Z",
          },
          totals: {
            views: 1,
            impressions: 1,
            uniqueSessions: 1,
            searches: 1,
            noResultSearches: 0,
            contactClicks: { contact: 0, phone: 0, whatsapp: 0, total: 0 },
            productInquiries: 0,
            enquiriesSubmitted: 0,
            enquiryConversionRate: 0,
            salesCount: 0,
          },
          perProduct: [],
          perSearchTerm: [{ searchQuery: "Synthetic ranking", searches: 1 }],
          perCategory: [],
          dailySeries: {},
          partial: { uniqueViewersCapped: false },
          channel: "all",
        },
      });
    if (pathname.endsWith("/customers"))
      return route.fulfill({ json: { customers: [person] } });
    if (pathname.endsWith("/users"))
      return route.fulfill({ json: { users: [person] } });
    return route.continue();
  });
  await context.route("https://image-review.example.invalid/**", (route) =>
    route.fulfill({ contentType: "image/jpeg", body: file }),
  );
  await mkdir(output, { recursive: true });
  for (const locale of ["en", "he"]) {
    await page.goto(`${base}/${locale}/admin/products/${productId}`, {
      waitUntil: "networkidle",
    });
    await page
      .getByRole("button", {
        name: locale === "he" ? "מדיה" : "Media",
        exact: true,
      })
      .click();
    await expect(page.locator('input[type="file"]')).toBeAttached();
    for (const status of ["original", "transparent", "processed"]) {
      resultStatus = status;
      let release;
      holdUpload = new Promise((resolve) => {
        release = resolve;
      });
      await page.locator('input[type="file"]').setInputFiles({
        name: `${status}.jpg`,
        mimeType: "image/jpeg",
        buffer: file,
      });
      await expect(page.getByRole("progressbar").last()).toBeVisible();
      await expect(page.locator('input[type="file"]')).toBeDisabled();
      release();
      holdUpload = null;
      const label =
        locale === "he"
          ? {
              original: "המקור נשמר ללא הסרת רקע",
              transparent: "כבר שקוף — נשמר המקור",
              processed: "הרקע הוסר",
            }[status]
          : {
              original: "Original saved without background removal",
              transparent: "Already transparent — original saved",
              processed: "Background removed",
            }[status];
      await expect(page.getByText(label, { exact: true }).last()).toBeVisible();
      await expect(page.locator('input[type="file"]')).toBeEnabled();
      pass(`${locale}: actual pending state and truthful ${status} result`);
    }
    expectedRemoval = false;
    await page
      .getByRole("checkbox", { name: /Remove background|הסרת רקע/ })
      .uncheck();
    resultStatus = "original";
    await page.locator('input[type="file"]').setInputFiles({
      name: "keep-original.jpg",
      mimeType: "image/jpeg",
      buffer: file,
    });
    await expect(page.locator('input[type="file"]')).toBeEnabled();
    await page.locator('input[type="file"]').focus();
    await expect(page.locator('input[type="file"]')).toBeFocused();
    pass(`${locale}: keep-original request and keyboard upload focus`);
    failUpload = true;
    await page.locator('input[type="file"]').setInputFiles({
      name: "rejected.jpg",
      mimeType: "image/jpeg",
      buffer: file,
    });
    await expect(
      page.getByRole("alert").filter({ hasText: "Synthetic rejected upload" }),
    ).toBeVisible();
    failUpload = false;
    pass(`${locale}: upload failure remains visible`);
    // URL import has the same original-saved status, without a red error notice.
    resultStatus = "original";
    await page
      .getByRole("button", {
        name: locale === "he" ? "הוסף מכתובת" : "Add by URL",
        exact: true,
      })
      .click();
    await page
      .locator("#image-url")
      .fill("https://image-review.example.invalid/camera.jpg");
    // The preview is intercepted above; no third-party image request is sent.
    await page
      .getByRole("dialog")
      .getByRole("button", {
        name: locale === "he" ? "הוסף תמונה" : "Add image",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page
        .getByText(
          locale === "he"
            ? "המקור נשמר ללא הסרת רקע"
            : "Original saved without background removal",
          { exact: true },
        )
        .first(),
    ).toBeVisible();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ["dark", "medium", "light"]) {
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `${locale}/${width}/${theme} gallery overflow`,
        );
      }
    }
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: join(output, `gallery-${locale}.png`),
      fullPage: true,
    });
    await page.waitForTimeout(350); // Let the final theme transition settle before measuring contrast.
    const accessibility = await new AxeBuilder({ page })
      .include(".mgmt-shell__main")
      .analyze();
    if (accessibility.violations.length)
      await writeFile(
        join(output, `axe-${locale}.json`),
        JSON.stringify(accessibility.violations, null, 2),
      );
    assert.deepEqual(
      accessibility.violations.map((item) => ({
        id: item.id,
        impact: item.impact,
      })),
      [],
    );
    pass(`${locale}: gallery in three themes at 320/390/1440px; axe clean`);
    expectedRemoval = true;
  }
  for (const locale of ["en", "he"]) {
    for (const section of ["users", "customers"]) {
      await page.goto(`${base}/${locale}/admin/${section}`, {
        waitUntil: "networkidle",
      });
      const prefix =
        section === "users" ? "users-management" : "customers-manager";
      for (const width of [320, 390, 767, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        if (width < 768) {
          await expect(page.locator(`.${prefix}__card-list`)).toBeVisible();
          await expect(page.locator(`.${prefix}__table-wrapper`)).toBeHidden();
        } else {
          await expect(page.locator(`.${prefix}__card-list`)).toBeHidden();
          await expect(page.locator(`.${prefix}__table-wrapper`)).toBeVisible();
        }
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `${section}/${locale}/${width} overflow`,
        );
      }
      pass(
        `${section}/${locale}: cards below 768px, tables at 768px+, bounded layout`,
      );
    }
  }
  const gradients = {};
  for (const locale of ["en", "he"]) {
    await page.goto(`${base}/${locale}/admin/analytics`, {
      waitUntil: "networkidle",
    });
    const ranking = page.locator("li").filter({ hasText: "Synthetic ranking" });
    await expect(ranking).toBeVisible();
    gradients[locale === "he" ? "rtl" : "ltr"] = await ranking.evaluate(
      (item) =>
        getComputedStyle(item.lastElementChild.firstElementChild)
          .backgroundImage,
    );
  }
  assert.ok(/90deg|to right/.test(gradients.ltr), gradients.ltr);
  assert.ok(/270deg|-90deg|to left/.test(gradients.rtl), gradients.rtl);
  assert.notEqual(gradients.ltr, gradients.rtl);
  pass("analytics ranking gradient mirrors correctly in RTL");
  // Inspect the actual loaded CSS for the recent RTL motion/gradient contract.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const rtl = await page.evaluate(() => {
    const selectors = ["inventory-manager__toast", "settings-panel__toast"];
    return selectors.map((name) => {
      const node = document.createElement("div");
      node.className = name;
      document.body.append(node);
      const animation = getComputedStyle(node).animationName;
      node.remove();
      return animation;
    });
  });
  assert.ok(rtl.every((name) => name === "toast-enter-rtl"));
  pass("Hebrew toast animation uses the anchored RTL direction");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await page.evaluate(() => {
    const node = document.createElement("div");
    node.className = "settings-panel__toast";
    document.body.append(node);
    const name = getComputedStyle(node).animationName;
    node.remove();
    return name;
  });
  assert.equal(reduced, "none");
  pass("reduced motion overrides the new RTL animation");
  assert.deepEqual(runtimeErrors, []);
  await writeFile(
    join(output, "results.json"),
    JSON.stringify({ engine, checks, runtimeErrors }, null, 2),
  );
  console.log(`Evidence: ${output}`);
} finally {
  await browser?.close();
  if (actorId) {
    const result = await service.auth.admin.deleteUser(actorId);
    if (result.error) throw result.error;
    console.log("PASS disposable CEO cleanup");
  }
}
