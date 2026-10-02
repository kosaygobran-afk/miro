// Live integration verification: disposable account, reversible design change,
// real anonymous storefront, private screenshots remain in /tmp.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import { format } from "prettier";
import AxeBuilder from "@axe-core/playwright";
nextEnv.loadEnvConfig(process.cwd());
const base = process.env.CUSTOMER_BASE_URL || "http://127.0.0.1:3112";
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const uploadedObjects = [];
const checks = [],
  runtimeErrors = [],
  violations = [];
const pass = (label) => {
  checks.push(label);
  console.log("PASS", label);
};
const check = (r) => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
let browser,
  userId,
  original,
  latestRevision,
  ceoPage,
  changed = false;
const output = "docs/customer-design-evidence-2026-10-02";
try {
  browser = await chromium.launch();
  const publicContext = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  const publicPage = await publicContext.newPage();
  publicPage.on("pageerror", (error) => runtimeErrors.push(error.message));
  await publicPage.goto(`${base}/en`, { waitUntil: "networkidle" });
  await expect(publicPage.locator(".sf-department")).toHaveCount(8);
  await expect(publicPage.locator(".sf-hero-slide")).toHaveCount(5);
  await expect(
    publicPage.locator(".sf-company-segment").first().locator("img"),
  ).toHaveCount(8);
  const slots = await publicPage
    .locator(".sf-company-mark")
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        width: node.offsetWidth,
        height: node.offsetHeight,
      })),
    );
  assert.equal(new Set(slots.map((s) => `${s.width}:${s.height}`)).size, 1);
  pass("8 categories, 5 backgrounds, 8 equal-size local brand marks");
  const departments = await publicPage
    .locator(".sf-department")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  for (const href of departments) {
    const response = await publicContext.request.get(`${base}${href}`);
    assert.equal(response.status(), 200, href);
  }
  pass("all category routes return 200");
  // Default interval really advances; manual pause really holds the same slide.
  const firstSlide = await publicPage
    .locator(".sf-hero-slide[data-active=true]")
    .getAttribute("class");
  void firstSlide;
  await expect
    .poll(() => publicPage.locator(".sf-hero-controls>span").textContent(), {
      timeout: 13000,
    })
    .not.toMatch(/^01/);
  await publicPage
    .getByRole("button", { name: "Pause backgrounds", exact: true })
    .click();
  const pausedSlide = await publicPage
    .locator(".sf-hero-controls>span")
    .textContent();
  await publicPage.waitForTimeout(10500);
  assert.equal(
    await publicPage.locator(".sf-hero-controls>span").textContent(),
    pausedSlide,
  );
  pass("10-second background rotation and pause work");
  await publicPage.locator(".sf-company-toggle").click();
  assert.equal(
    await publicPage
      .locator(".sf-company-track")
      .evaluate((node) => getComputedStyle(node).animationPlayState),
    "paused",
  );
  pass("brand rail pause control works");
  // Card cart quantity stays in sync with header, persists, and returns to add at zero.
  const cardHref = await publicPage
    .locator(".sf-product-card")
    .filter({ has: publicPage.locator(".sf-add-cart-button") })
    .first()
    .locator(".sf-product-media")
    .getAttribute("href");
  const card = publicPage.locator(".sf-product-card").filter({
    has: publicPage.locator(`.sf-product-media[href="${cardHref}"]`),
  });
  await card.locator(".sf-add-cart-button").click();
  await expect(card.locator(".sf-cart-quantity output")).toHaveText("1");
  await card.getByRole("button", { name: /Increase quantity/ }).click();
  await expect(card.locator(".sf-cart-quantity output")).toHaveText("2");
  await expect(publicPage.locator(".premium-cart-count")).toHaveText("2");
  await publicPage.reload({ waitUntil: "networkidle" });
  const selected = card;
  await expect(selected.locator("output")).toHaveText("2");
  await selected.getByRole("button", { name: /Decrease quantity/ }).click();
  await selected.getByRole("button", { name: /Decrease quantity/ }).click();
  await expect(selected.locator(".sf-cart-quantity")).toHaveCount(0);
  pass("card +/- quantity, header count, persistence and zero removal");
  // New SVG gallery in an unpriced reference model.
  await publicPage.goto(`${base}/en/store/cameras/ubiquiti-uvc-g5-bullet`, {
    waitUntil: "networkidle",
  });
  await expect(publicPage.locator(".sf-thumbnail")).toHaveCount(3);
  const src = await publicPage
    .locator(".sf-product-main-image")
    .getAttribute("src");
  await publicPage
    .getByRole("button", { name: "Next image", exact: true })
    .click();
  assert.notEqual(
    await publicPage.locator(".sf-product-main-image").getAttribute("src"),
    src,
  );
  await expect(publicPage.locator(".sf-add-cart-button")).toHaveCount(0);
  await expect(
    publicPage.locator(".sf-availability-pending").first(),
  ).toBeVisible();
  pass("reference gallery works; unconfirmed models are quote-only");
  // Real hover on original rail; portal stays still while pointer enters the dialog.
  await publicPage.goto(`${base}/en`, { waitUntil: "networkidle" });
  const railCard = publicPage
    .locator(".sf-moving-rail-segment")
    .first()
    .locator(".sf-moving-rail-card")
    .first();
  await publicPage
    .locator(".sf-moving-rail-viewport")
    .hover({ position: { x: 8, y: 8 } });
  await railCard.hover();
  await expect(publicPage.locator(".sf-hover-preview")).toBeVisible({
    timeout: 1000,
  });
  await publicPage.locator(".sf-hover-preview-title").hover();
  await publicPage.waitForTimeout(260);
  const before = await publicPage.locator(".sf-hover-preview").boundingBox();
  assert.equal(
    await publicPage
      .locator(".sf-moving-rail-viewport")
      .getAttribute("data-paused"),
    "true",
  );
  await publicPage.waitForTimeout(400);
  const after = await publicPage.locator(".sf-hover-preview").boundingBox();
  assert.ok(
    Math.abs(before.x - after.x) < 1 && Math.abs(before.y - after.y) < 1,
  );
  await publicPage.keyboard.press("Escape");
  await expect(publicPage.locator(".sf-hover-preview")).toHaveCount(0);
  pass("fast 3D rail hover stays positioned and closes with Escape");
  // Both locales and all themes, plus a 320px phone and reduced motion.
  for (const locale of ["en", "he"])
    for (const theme of ["dark", "medium", "light"]) {
      await publicPage.goto(`${base}/${locale}`, { waitUntil: "networkidle" });
      await publicPage.evaluate((theme) => {
        localStorage.setItem("miro-theme", theme);
        document.documentElement.dataset.theme = theme;
      }, theme);
      await publicPage.mouse.move(0, 0);
      await publicPage.waitForTimeout(500); // Let theme color transitions settle before contrast sampling.
      const results = await new AxeBuilder({ page: publicPage })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      violations.push(
        ...results.violations.map((v) => ({
          locale,
          theme,
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      );
      assert.ok(
        await publicPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await publicPage.screenshot({
        path: `/tmp/miro-customer-${locale}-${theme}.png`,
      });
    }
  assert.deepEqual(violations, []);
  pass("desktop Hebrew/English and dark/medium/light pass WCAG A/AA axe");
  await publicPage.setViewportSize({ width: 320, height: 700 });
  for (const locale of ["he", "en"])
    for (const theme of ["dark", "medium", "light"]) {
      await publicPage.goto(`${base}/${locale}`, { waitUntil: "networkidle" });
      await publicPage.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      assert.ok(
        await publicPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await publicPage.locator(".sf-product-quick-preview").first().click();
      await expect(publicPage.locator(".sf-hover-preview")).toBeVisible();
      const bounds = await publicPage
        .locator(".sf-hover-preview")
        .boundingBox();
      assert.ok(
        bounds.x >= 0 &&
          bounds.x + bounds.width <= 321 &&
          bounds.y + bounds.height <= 701,
      );
      await publicPage.keyboard.press("Escape");
      await publicPage.screenshot({
        path: `/tmp/miro-customer-phone-${locale}-${theme}.png`,
      });
    }
  pass(
    "320px Hebrew/English, all themes: no overflow; 3D dialog stays in viewport",
  );
  await publicPage.emulateMedia({ reducedMotion: "reduce" });
  await publicPage.reload({ waitUntil: "networkidle" });
  await expect(publicPage.locator(".sf-company-viewport")).toHaveAttribute(
    "data-static",
    "true",
  );
  await expect(publicPage.locator(".sf-moving-rail-viewport")).toHaveAttribute(
    "data-static",
    "true",
  );
  pass("reduced motion disables automatic rails");
  // Disposable management actor: real CEO form save -> anonymous open page refresh.
  const email = `design-qa-${Date.now()}@miro-test.local`,
    password = `Design-${randomUUID()}!`;
  userId = check(
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    }),
  ).user.id;
  async function role(value) {
    check(
      await service
        .from("user_roles")
        .upsert({ user_id: userId, role: value }, { onConflict: "user_id" }),
    );
    check(
      await service
        .from("profiles")
        .update({
          role: value,
          account_status: "active",
          full_name: "Design QA",
        })
        .eq("id", userId),
    );
  }
  await role("ceo");
  const ceoContext = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  ceoPage = await ceoContext.newPage();
  ceoPage.on("pageerror", (error) => runtimeErrors.push(error.message));
  await ceoPage.goto(`${base}/en/login`, { waitUntil: "networkidle" });
  await ceoPage.locator("input[name=email]").fill(email);
  await ceoPage.locator("input[name=password]").fill(password);
  await ceoPage.locator("input[name=password]").press("Enter");
  await ceoPage.waitForURL((url) => url.pathname !== "/en/login");
  await ceoPage.goto(`${base}/en/admin/store-design`, {
    waitUntil: "networkidle",
  });
  await expect(
    ceoPage.getByRole("button", { name: "Publish design", exact: true }),
  ).toBeVisible();
  for (const theme of ["dark", "medium", "light"]) {
    await ceoPage.evaluate((value) => {
      document.documentElement.dataset.theme = value;
      localStorage.setItem("miro-theme", value);
    }, theme);
    await ceoPage.waitForTimeout(500);
    const studio = await new AxeBuilder({ page: ceoPage })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      studio.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      [],
    );
    await ceoPage.screenshot({ path: `/tmp/miro-studio-${theme}.png` });
  }
  pass("CEO design studio passes WCAG A/AA axe in all three themes");
  const response = await ceoContext.request.get(
    `${base}/api/management/storefront/design`,
  );
  assert.equal(response.status(), 200);
  const current = await response.json();
  original = current.design;
  latestRevision = current.revision;
  const originalName = original.brands.items[0].name;
  await ceoPage
    .getByLabel("Company name", { exact: true })
    .first()
    .fill("Unsaved QA draft");
  await expect(
    ceoPage.getByRole("button", { name: "Reload", exact: true }),
  ).toBeDisabled();
  await ceoPage
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(
    ceoPage.getByLabel("Company name", { exact: true }).first(),
  ).toHaveValue(originalName);
  await expect(
    ceoPage.getByRole("button", { name: "Reload", exact: true }),
  ).toBeEnabled();
  pass("discarding a draft restores saved fields and enables conflict reload");

  const uploadResponse = ceoPage.waitForResponse(
    (response) =>
      response.url().endsWith("/api/management/storefront/design/assets") &&
      response.request().method() === "POST",
  );
  await ceoPage
    .getByLabel("Upload logo (up to 5 MB)", { exact: true })
    .first()
    .setInputFiles("public/images/brands/ibm.svg");
  const uploaded = await uploadResponse;
  assert.equal(uploaded.status(), 200);
  const { imageUrl: uploadedUrl } = await uploaded.json();
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-media/`;
  assert.ok(uploadedUrl.startsWith(`${prefix}storefront/design/`));
  uploadedObjects.push(uploadedUrl.slice(prefix.length));
  assert.equal((await publicContext.request.get(uploadedUrl)).status(), 200);
  await expect(
    ceoPage.getByLabel("Logo URL", { exact: true }).first(),
  ).toHaveValue(uploadedUrl);
  const unsafe = await ceoContext.request.post(
    `${base}/api/management/storefront/design/assets`,
    {
      headers: { Origin: base },
      multipart: {
        file: {
          name: "attack.svg",
          mimeType: "image/svg+xml",
          buffer: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
          ),
        },
      },
    },
  );
  assert.equal(unsafe.status(), 400);
  const mismatch = await ceoContext.request.post(
    `${base}/api/management/storefront/design/assets`,
    {
      headers: { Origin: base },
      multipart: {
        file: {
          name: "invalid.png",
          mimeType: "image/png",
          buffer: Buffer.from("not an image"),
        },
      },
    },
  );
  assert.equal(mismatch.status(), 400);
  pass(
    "CEO logo upload is publicly readable; unsafe SVG and spoofed image content are rejected",
  );

  await ceoPage
    .getByLabel("Company name", { exact: true })
    .first()
    .fill(`${originalName} QA`);
  const savedResponse = ceoPage.waitForResponse(
    (response) =>
      response.url().endsWith("/api/management/storefront/design") &&
      response.request().method() === "PUT",
  );
  changed = true;
  await ceoPage
    .getByRole("button", { name: "Publish design", exact: true })
    .click();
  const saved = await savedResponse;
  assert.equal(saved.status(), 200);
  latestRevision = (await saved.json()).revision;
  await expect(
    ceoPage.getByText("Saved. This design is now available in the store.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    publicPage
      .locator(".sf-company-segment")
      .first()
      .getByAltText(`${originalName} QA`, { exact: true }),
  ).toHaveCount(1, { timeout: 22000 });
  pass(
    "real CEO form save persists and updates a second open anonymous storefront",
  );
  const staleStartedAt = Date.now();
  const stale = await ceoContext.request.put(
    `${base}/api/management/storefront/design`,
    {
      headers: { Origin: base },
      data: { design: original, revision: current.revision },
    },
  );
  assert.equal(stale.status(), 409);
  assert.ok(
    Date.now() - staleStartedAt < 5000,
    "Revision conflicts must return promptly without database retry loops",
  );
  pass("stale design saves return 409");
  const restored = await ceoContext.request.put(
    `${base}/api/management/storefront/design`,
    {
      headers: { Origin: base },
      data: { design: original, revision: latestRevision },
    },
  );
  assert.equal(restored.status(), 200);
  latestRevision = (await restored.json()).revision;
  changed = false;
  await role("admin");
  await ceoPage.reload({ waitUntil: "networkidle" });
  await expect(
    ceoPage.getByRole("button", { name: "Publish design", exact: true }),
  ).toHaveCount(0);
  await expect(
    ceoPage.getByLabel("Company name", { exact: true }).first(),
  ).toBeDisabled();
  const denied = await ceoContext.request.put(
    `${base}/api/management/storefront/design`,
    {
      headers: { Origin: base },
      data: { design: original, revision: latestRevision },
    },
  );
  assert.equal(denied.status(), 403);
  pass("admin sees design, fields are read-only, backend rejects publishing");
  const uploadDenied = await ceoContext.request.post(
    `${base}/api/management/storefront/design/assets`,
    {
      headers: { Origin: base },
      multipart: {
        file: {
          name: "admin.svg",
          mimeType: "image/svg+xml",
          buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        },
      },
    },
  );
  assert.equal(uploadDenied.status(), 403);
  pass("admin image uploads denied");

  const deniedPublic = await publicContext.request.put(
    `${base}/api/management/storefront/design`,
    {
      headers: { Origin: base },
      data: { design: original, revision: latestRevision },
    },
  );
  assert.equal(deniedPublic.status(), 403);
  pass("anonymous design writes denied");
  assert.deepEqual(runtimeErrors, []);
  pass("no browser runtime errors");
} finally {
  if (changed && original && ceoPage) {
    const fresh = await ceoPage.request.get(
      `${base}/api/management/storefront/design`,
    );
    if (fresh.ok()) {
      const data = await fresh.json();
      await ceoPage.request.put(`${base}/api/management/storefront/design`, {
        headers: { Origin: base },
        data: { design: original, revision: data.revision },
      });
    }
  }
  if (uploadedObjects.length)
    check(await service.storage.from("product-media").remove(uploadedObjects));
  if (userId) {
    await service
      .from("user_roles")
      .update({ role: "customer" })
      .eq("user_id", userId);
    await service
      .from("profiles")
      .update({ role: "customer" })
      .eq("id", userId);
    await service.auth.admin.deleteUser(userId);
  }
  await browser?.close();
  await mkdir(output, { recursive: true });
  await writeFile(
    `${output}/checks.json`,
    await format(JSON.stringify({ checks, runtimeErrors, violations }), {
      parser: "json",
    }),
  );
}
