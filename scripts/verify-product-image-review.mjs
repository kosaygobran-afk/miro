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
const scope = process.env.IMAGE_REVIEW_SCOPE || "full";
assert.ok(["full", "media"].includes(scope), "Supported scopes: full, media");
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
  const removalRequests = [];
  let batchBehaviors = null;
  let restoreRequests = 0;
  let existingRemovalStatus = "processed";
  let holdExistingRemoval = null;
  let expectedExistingImageId = null;
  await context.route("**/api/management/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith("/product-images/restore-original")) {
      const body = request.postDataJSON();
      const existing = images.find((image) => image.id === body.id);
      assert.ok(existing?.original_image_url);
      assert.equal(body.image_url, existing.image_url);
      restoreRequests++;
      const image = { ...existing, image_url: existing.original_image_url };
      images = images.map((entry) => (entry.id === image.id ? image : entry));
      return route.fulfill({ json: { image } });
    }
    if (pathname.endsWith("/product-images/remove-background")) {
      assert.equal(request.method(), "POST");
      const id = request.postDataJSON().id;
      if (expectedExistingImageId) assert.equal(id, expectedExistingImageId);
      removalRequests.push(id);
      const existing = images.find((image) => image.id === id);
      const outcome =
        batchBehaviors?.[images.indexOf(existing)] ?? existingRemovalStatus;
      assert.ok(existing, "Removal must target an existing image fixture");
      if (holdExistingRemoval) await holdExistingRemoval;
      if (outcome === "unavailable")
        return route.fulfill({
          status: 503,
          json: {
            error:
              "Background removal is unavailable. The saved image has not changed.",
            code: "background_removal_unavailable",
            background_removal: {
              status: "original",
              skipped: true,
              reason: "worker_not_configured",
            },
          },
        });
      if (outcome === "uncertain")
        return route.fulfill({
          status: 503,
          json: { code: "image_write_uncertain" },
        });
      const image =
        outcome === "processed"
          ? {
              ...existing,
              original_image_url:
                existing.original_image_url || existing.image_url,
              image_url:
                existing.image_url === "/images/catalog/dome-02.svg"
                  ? "/images/catalog/dome-03.svg"
                  : "/images/catalog/dome-02.svg",
            }
          : existing;
      images = images.map((entry) => (entry.id === image.id ? image : entry));
      return route.fulfill({
        json: {
          image,
          background_removal: {
            status: outcome,
            skipped: outcome === "transparent",
            reason: outcome === "transparent" ? "already transparent" : null,
          },
        },
      });
    }
    if (
      pathname.endsWith("/product-images/upload") ||
      (pathname.endsWith("/product-images") && request.method() === "POST")
    ) {
      if (pathname.endsWith("/upload")) {
        assert.ok(
          !request
            .postDataBuffer()
            .toString()
            .includes('name="remove_background"'),
        );
      } else {
        assert.equal(request.postDataJSON().remove_background, undefined);
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
    images = [];
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
    for (const status of ["original"]) {
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
    await expect(
      page.getByRole("checkbox", { name: /Remove background|הסרת רקע/ }),
    ).toHaveCount(0);
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
    // Re-open Media to clear prior upload notices. The gallery fixture persists,
    // so this exercises an existing image rather than creating another row.
    await page.reload({ waitUntil: "networkidle" });
    await page
      .getByRole("button", {
        name: locale === "he" ? "מדיה" : "Media",
        exact: true,
      })
      .click();
    const galleryTitle = locale === "he" ? "תמונות מוצר" : "Product images";
    const gallery = page.getByRole("list", { name: galleryTitle, exact: true });
    const imageTiles = gallery.locator(":scope > li");
    const removeLabel = locale === "he" ? "הסרת רקע" : "Remove background";
    const removedLabel = locale === "he" ? "הרקע הוסר" : "Background removed";
    const transparentLabel =
      locale === "he"
        ? "כבר שקוף — נשמר המקור"
        : "Already transparent — original saved";
    const savedLabel =
      locale === "he"
        ? "התמונה נשמרה ותופיע מיד ברשימת המוצרים ובחנות."
        : "Image saved. It now appears in the product list and storefront.";
    await expect(
      page.getByText(
        locale === "he"
          ? "תמונות חדשות נשמרות במקור. הסרת רקע יוצרת רקע שקוף סביב המוצר. ניתן לשחזר כל מקור שנשמר באמצעות הכפתור האדום. השינויים נשמרים מיד."
          : "New images keep their original. Background removal makes the area around the product transparent. Use the red button to restore a retained original. Changes save immediately.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", {
        name:
          locale === "he"
            ? "הסרת רקע בהעלאת תמונות חדשות (ניתן לבטל כדי לשמור מקור)"
            : "Remove background on new uploads (turn off to keep the original)",
        exact: true,
      }),
    ).toHaveCount(0);
    pass(
      `${locale}: original uploads, explicit processing and restore instructions replace automatic-removal checkbox`,
    );
    const initialCount = images.length;
    await expect(imageTiles).toHaveCount(initialCount);
    expectedExistingImageId = images[0].id;
    const originalReference = images[0].image_url;
    let releaseExisting;
    holdExistingRemoval = new Promise((resolve) => {
      releaseExisting = resolve;
    });
    existingRemovalStatus = "processed";
    await gallery
      .getByRole("button", { name: removeLabel, exact: true })
      .first()
      .click();
    await expect(
      gallery.getByRole("button", {
        name: locale === "he" ? "מסיר רקע…" : "Removing background…",
        exact: true,
      }),
    ).toHaveAttribute("aria-busy", "true");
    for (const button of await gallery.getByRole("button").all())
      await expect(button).toBeDisabled();
    await expect(page.locator('input[type="file"]')).toBeDisabled();
    await expect(
      page.getByRole("button", {
        name:
          locale === "he"
            ? "הסרת רקע מכל התמונות"
            : "Remove backgrounds from all images",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", {
        name: locale === "he" ? "הוסף מכתובת" : "Add by URL",
        exact: true,
      }),
    ).toBeDisabled();
    releaseExisting();
    holdExistingRemoval = null;
    await expect(
      page.getByRole("status").filter({ hasText: removedLabel }).first(),
    ).toBeVisible();
    await expect(imageTiles).toHaveCount(initialCount);
    await expect(imageTiles.first().locator("img").last()).toHaveAttribute(
      "src",
      images[0].image_url,
    );
    assert.notEqual(images[0].image_url, originalReference);
    assert.equal(images[0].id, expectedExistingImageId);
    await expect(page.locator('input[type="file"]')).toBeEnabled();
    pass(
      `${locale}: pending existing-image removal blocks mutations; success updates one existing row without duplication`,
    );
    existingRemovalStatus = "transparent";
    const processedReference = images[0].image_url;
    await gallery
      .getByRole("button", { name: removeLabel, exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: transparentLabel }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: removedLabel }).first(),
    ).toHaveCount(0);
    assert.equal(images[0].image_url, processedReference);
    await expect(imageTiles).toHaveCount(initialCount);
    pass(
      `${locale}: already-transparent existing image is reported truthfully without duplication`,
    );
    existingRemovalStatus = "unavailable";
    await gallery
      .getByRole("button", { name: removeLabel, exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("alert").filter({
        hasText:
          locale === "he"
            ? "שירות הסרת הרקע אינו זמין כרגע. התמונה הקיימת לא השתנתה."
            : "Background removal is unavailable. The saved image has not changed.",
      }),
    ).toBeVisible();
    await expect(page.getByText(savedLabel, { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: removedLabel }).first(),
    ).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: transparentLabel }).first(),
    ).toHaveCount(0);
    assert.equal(images[0].image_url, processedReference);
    await expect(imageTiles).toHaveCount(initialCount);
    await gallery
      .getByRole("button", { name: removeLabel, exact: true })
      .first()
      .focus();
    await expect(
      gallery.getByRole("button", { name: removeLabel, exact: true }).first(),
    ).toBeFocused();
    pass(
      `${locale}: unavailable removal shows a visible error without success or a changed image; button supports keyboard focus`,
    );
    const restoreLabel = locale === "he" ? "שחזור המקור" : "Restore original";
    const allLabel =
      locale === "he"
        ? "הסרת רקע מכל התמונות"
        : "Remove backgrounds from all images";
    await page.reload({ waitUntil: "networkidle" });
    await page
      .getByRole("button", {
        name: locale === "he" ? "מדיה" : "Media",
        exact: true,
      })
      .click();
    await expect(
      gallery.getByRole("button", { name: restoreLabel, exact: true }).first(),
    ).toBeVisible();
    await gallery
      .getByRole("button", { name: restoreLabel, exact: true })
      .first()
      .click();
    await expect(
      gallery.getByRole("button", { name: restoreLabel, exact: true }),
    ).toHaveCount(0);
    assert.equal(images[0].image_url, originalReference);
    assert.equal(images[0].original_image_url, originalReference);
    pass(
      `${locale}: restore remains available after reload and restores the exact retained original`,
    );

    expectedExistingImageId = null;
    batchBehaviors = images.map((_, index) =>
      index === 0 ? "processed" : index === 1 ? "unavailable" : "transparent",
    );
    const requestStart = removalRequests.length;
    let releaseBatch;
    holdExistingRemoval = new Promise((resolve) => {
      releaseBatch = resolve;
    });
    await page.getByRole("button", { name: allLabel, exact: true }).click();
    await expect(
      page.getByRole("button", { name: allLabel, exact: true }),
    ).toHaveAttribute("aria-busy", "true");
    await expect(page.locator('input[type="file"]')).toBeDisabled();
    await expect(
      gallery.getByRole("button", { name: removeLabel, exact: true }).last(),
    ).toBeDisabled();
    releaseBatch();
    holdExistingRemoval = null;
    await expect(
      page.getByRole("button", { name: allLabel, exact: true }),
    ).toBeEnabled();
    assert.deepEqual(
      removalRequests.slice(requestStart),
      images.map((image) => image.id),
    );
    await expect(
      page.getByText(
        locale === "he"
          ? `הוסרו רקעים: 1. כבר שקופות: ${images.length - 2}. נכשלו: 1. לא עובדו: 0.`
          : `Backgrounds removed: 1. Already transparent: ${images.length - 2}. Failed: 1. Not processed: 0.`,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      gallery.getByRole("button", { name: restoreLabel, exact: true }).first(),
    ).toBeVisible();
    pass(
      `${locale}: bulk processing handles each image once, reports partial failures and retains red restore controls`,
    );
    await gallery
      .getByRole("button", { name: restoreLabel, exact: true })
      .first()
      .click();
    assert.equal(images[0].image_url, originalReference);
    assert.ok(restoreRequests > 0);
    pass(`${locale}: repeated remove/restore keeps the first original`);

    batchBehaviors = images.map(() => "uncertain");
    const uncertainStart = removalRequests.length;
    await page.getByRole("button", { name: allLabel, exact: true }).click();
    const refresh = page.getByRole("button", {
      name: locale === "he" ? "רענון הגלריה" : "Refresh gallery",
      exact: true,
    });
    await expect(refresh).toBeVisible();
    await expect(
      page.getByRole("button", { name: allLabel, exact: true }),
    ).toBeDisabled();
    assert.equal(removalRequests.length - uncertainStart, 1);
    pass(
      `${locale}: uncertain bulk write stops the batch, locks retries and offers refresh`,
    );
    batchBehaviors = null;
    await refresh.click();
    await page
      .getByRole("button", {
        name: locale === "he" ? "מדיה" : "Media",
        exact: true,
      })
      .click();
    // Leave one reversible cutout visible for bilingual/theme accessibility QA.
    existingRemovalStatus = "processed";
    expectedExistingImageId = images[0].id;
    await gallery
      .getByRole("button", { name: removeLabel, exact: true })
      .first()
      .click();
    await expect(
      gallery.getByRole("button", { name: restoreLabel, exact: true }).first(),
    ).toBeVisible();

    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ["dark", "medium", "light"]) {
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        const restoreColors = await gallery
          .getByRole("button", { name: restoreLabel, exact: true })
          .first()
          .evaluate((button) => {
            const probe = document.createElement("span");
            probe.style.color = "var(--error-text)";
            button.append(probe);
            const colors = {
              actual: getComputedStyle(button).color,
              expected: getComputedStyle(probe).color,
            };
            probe.remove();
            return colors;
          });
        assert.equal(
          restoreColors.actual,
          restoreColors.expected,
          "Restore must use the red error color in every theme",
        );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `${locale}/${width}/${theme} gallery overflow`,
        );
        if (width === 320) {
          await page.evaluate(() => document.activeElement?.blur());
          await page.waitForTimeout(350);
          const accessibility = await new AxeBuilder({ page })
            .include(`[aria-label="${galleryTitle}"]`)
            .analyze();
          if (accessibility.violations.length)
            await writeFile(
              join(output, `axe-gallery-${locale}-${theme}-320.json`),
              JSON.stringify(accessibility.violations, null, 2),
            );
          assert.deepEqual(
            accessibility.violations.map(({ id, impact }) => ({ id, impact })),
            [],
            `${locale}/320/${theme} existing-image controls must be accessible`,
          );
        }
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
    expectedExistingImageId = null;
  }
  if (scope === "full") {
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
            await expect(
              page.locator(`.${prefix}__table-wrapper`),
            ).toBeHidden();
          } else {
            await expect(page.locator(`.${prefix}__card-list`)).toBeHidden();
            await expect(
              page.locator(`.${prefix}__table-wrapper`),
            ).toBeVisible();
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
      const ranking = page
        .locator("li")
        .filter({ hasText: "Synthetic ranking" });
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
  }
  assert.deepEqual(runtimeErrors, []);
  await writeFile(
    join(output, "results.json"),
    JSON.stringify({ engine, scope, checks, runtimeErrors }, null, 2),
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
