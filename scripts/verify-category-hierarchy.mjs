// Management catalog writes are intercepted synthetic fixtures. The optional
// public scope creates only uniquely identified QA categories/products, with
// unpublished prices, zero stock, and finally cleanup. Never edits owner rows.
// Run public scope only after applying the reviewed category migration:
// CATEGORY_HIERARCHY_FIXTURES=1 CATEGORY_HIERARCHY_SCOPE=full node scripts/verify-category-hierarchy.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.ADMIN_BASE_URL || "http://localhost:3000";
const engine = process.env.CATEGORY_HIERARCHY_BROWSER || "chromium";
const scope = process.env.CATEGORY_HIERARCHY_SCOPE || "management";
const browserType = { chromium, firefox, webkit }[engine];
assert.ok(browserType, "Supported engines: chromium, firefox, webkit");
assert.ok(["full", "public", "management"].includes(scope));
const publicScope = scope !== "management";
assert.ok(
  !publicScope || process.env.CATEGORY_HIERARCHY_FIXTURES === "1",
  "Public scope requires explicit CATEGORY_HIERARCHY_FIXTURES=1 for disposable rows",
);
const output =
  process.env.CATEGORY_HIERARCHY_OUTPUT_DIR ||
  join(tmpdir(), `miro-category-hierarchy-${engine}`);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  options,
);
const checks = [];
const runtimeErrors = [];
const cleanupErrors = [];
const token = randomUUID().slice(0, 8);
const prefix = `miro-qa-category-${token}`;
const rootId = randomUUID();
const otherRootId = randomUUID();
const childId = randomUUID();
const secondChildId = randomUUID();
const inlineChildId = randomUUID();
const apiChildId = randomUUID();
const productIds = [randomUUID(), randomUUID(), randomUUID()];
const root = {
  id: rootId,
  slug: `${prefix}-outer`,
  name_he: `בדיקת קטגוריה ${token}`,
  name_en: `QA category ${token}`,
  parent_id: null,
  is_active: true,
  sort_order: 99990,
  product_count: 3,
  subcategory_count: 2,
};
const otherRoot = {
  ...root,
  id: otherRootId,
  slug: `${prefix}-other`,
  name_he: `בדיקה נוספת ${token}`,
  name_en: `Other QA category ${token}`,
  product_count: 0,
  subcategory_count: 0,
};
const child = {
  ...root,
  id: childId,
  slug: `${prefix}-child`,
  name_he: `תת־קטגוריה א ${token}`,
  name_en: `QA child A ${token}`,
  parent_id: rootId,
  product_count: 1,
  subcategory_count: 0,
};
const secondChild = {
  ...child,
  id: secondChildId,
  slug: `${prefix}-second`,
  name_he: `תת־קטגוריה ב ${token}`,
  name_en: `QA child B ${token}`,
};
const products = productIds.map((id, index) => ({
  id,
  category_id: rootId,
  subcategory_id: [childId, secondChildId, null][index],
  slug: `${prefix}-product-${index + 1}`,
  name_he: `מוצר בדיקה ${index + 1} ${token}`,
  name_en: `QA product ${index + 1} ${token}`,
  status: "draft",
  price: null,
  purchase_cost: null,
  out_of_stock_policy: "keep_visible_contact",
  tags: [],
  sort_order: 0,
  product_variants: [],
  product_prices: [],
  product_images: [],
}));
let actorId;
let browser;
let context;
let page;
let actorReady = false;
let fixturesAttempted = false;
let managementCategories = [root, otherRoot, child, secondChild];
let createCalls = [];
let categoryCalls = [];
let patchCalls = [];
let loseCategoryResponse = false;
const pass = (label) => {
  checks.push(label);
  console.log(`PASS ${label}`);
};
const checked = async (query) => {
  const result = await query;
  if (result.error)
    throw new Error(`${result.error.code || "error"}: ${result.error.message}`);
  return result.data;
};
const withoutFields = (row, fields) =>
  Object.fromEntries(
    Object.entries(row).filter(([key]) => !fields.includes(key)),
  );
const categoryRow = (row) =>
  withoutFields(row, ["product_count", "subcategory_count"]);
const productRow = (row) =>
  withoutFields(row, ["product_variants", "product_prices", "product_images"]);
const name = (row, locale) => (locale === "he" ? row.name_he : row.name_en);

async function assertFitting(page, label) {
  const metrics = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(
    metrics.scroll <= metrics.width + 1,
    `${label}: horizontal document overflow ${JSON.stringify(metrics)}`,
  );
}

async function assertAccessible(page, selector, label) {
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(350);
  const result = await new AxeBuilder({ page }).include(selector).analyze();
  if (result.violations.length)
    await writeFile(
      join(output, `axe-${label}.json`),
      JSON.stringify(result.violations, null, 2),
    );
  assert.deepEqual(
    result.violations.map(({ id, impact }) => ({ id, impact })),
    [],
    `${label}: accessible category controls`,
  );
}

async function seedPublicFixtures() {
  // Known IDs are assigned before inserts so a lost response is reconciled by
  // finally cleanup. Products enter draft, then receive synthetic zero-stock
  // variants; only this brief read-only browser check makes them public.
  const schema = await service
    .from("products")
    .select("id,subcategory_id")
    .limit(0);
  assert.equal(
    schema.error,
    null,
    "Apply the category migration before fixture writes",
  );
  await writeFile(
    join(output, "fixtures.json"),
    JSON.stringify(
      {
        prefix,
        productIds,
        categoryIds: [rootId, childId, secondChildId, apiChildId],
      },
      null,
      2,
    ),
  );
  fixturesAttempted = true;
  await checked(service.from("categories").insert(categoryRow(root)));
  await checked(
    service.from("categories").insert([child, secondChild].map(categoryRow)),
  );
  await checked(service.from("products").insert(products.map(productRow)));
  await checked(
    service.from("product_variants").insert(
      products.map((product, index) => ({
        id: randomUUID(),
        product_id: product.id,
        sku: `MIRO-REF-QA-${token}-${index + 1}`,
        barcode: `MIRO-REF-QA-${token}-${index + 1}`,
        stock_qty: 0,
        is_active: true,
        is_default: true,
      })),
    ),
  );
  await checked(
    service.from("products").update({ status: "active" }).in("id", productIds),
  );
  pass(
    "disposable public fixtures: required root, two optional children, unassigned product, zero stock and unpublished prices",
  );
}

async function verifyManagement(context, page) {
  await context.route("**/api/management/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (path.endsWith("/categories")) {
      if (method === "GET")
        return route.fulfill({ json: { categories: managementCategories } });
      assert.equal(method, "POST", `Unexpected category mutation ${method}`);
      const payload = request.postDataJSON();
      categoryCalls.push(payload);
      assert.equal(
        payload.parent_id,
        rootId,
        "Inline children stay under selected root",
      );
      const created = { ...child, ...payload, id: inlineChildId };
      managementCategories = [
        ...managementCategories.filter((row) => row.id !== created.id),
        created,
      ];
      if (loseCategoryResponse)
        return route.fulfill({
          status: 503,
          json: { error: "Synthetic unknown write" },
        });
      return route.fulfill({ json: { category: created } });
    }
    if (path.endsWith("/products") && method === "POST") {
      const payload = request.postDataJSON();
      createCalls.push(payload);
      return route.fulfill({
        json: { product: { ...products[0], ...payload } },
      });
    }
    if (path.endsWith("/products") && method === "PATCH") {
      const payload = request.postDataJSON();
      patchCalls.push(payload);
      return route.fulfill({
        json: { product: { ...products[0], ...payload } },
      });
    }
    assert.equal(
      method,
      "GET",
      `Unexpected business mutation blocked: ${method} ${path}`,
    );
    if (path.endsWith(`/products/${productIds[0]}`))
      return route.fulfill({ json: { product: products[0] } });
    if (path.endsWith("/products"))
      return route.fulfill({
        json: {
          products,
          categories: managementCategories,
          totalCount: 3,
          page: 1,
          totalPages: 1,
        },
      });
    if (path.endsWith("/suppliers"))
      return route.fulfill({ json: { suppliers: [] } });
    if (path.endsWith("/product-images"))
      return route.fulfill({ json: { images: [] } });
    if (path.endsWith("/variants"))
      return route.fulfill({ json: { variants: [] } });
    if (path.endsWith("/product-prices"))
      return route.fulfill({ json: { prices: [] } });
    return route.continue();
  });
  for (const locale of ["en", "he"]) {
    const he = locale === "he";
    managementCategories = [root, otherRoot, child, secondChild];
    await page.goto(`${base}/${locale}/admin/products/new`, {
      waitUntil: "networkidle",
    });
    const main = page.getByRole("combobox", {
      name: he ? "קטגוריה ראשית" : "Main category",
      exact: true,
    });
    const sub = page.getByRole("combobox", {
      name: he ? "תת־קטגוריה (רשות)" : "Subcategory (optional)",
      exact: true,
    });
    const create = page.getByRole("button", {
      name: he ? "צור מוצר" : "Create product",
      exact: true,
    });
    const inline = page.getByRole("button", {
      name: he ? "יצירת תת־קטגוריה" : "Create subcategory",
      exact: true,
    });
    await expect(main).toHaveAttribute("required", "");
    await expect(sub).toBeDisabled();
    await expect(inline).toBeDisabled();
    await expect(
      page.getByText(
        he
          ? "קטגוריה ראשית היא חובה; תת־קטגוריה היא רשות. ניתן לשנות את השיוך בכל עת."
          : "A main category is required; a subcategory is optional. You can change this assignment at any time.",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole("textbox", {
        name: he ? "שם בעברית" : "Name (Hebrew)",
        exact: true,
      })
      .fill("מוצר בדיקה");
    await page
      .getByRole("textbox", {
        name: he ? "שם באנגלית" : "Name (English)",
        exact: true,
      })
      .fill("Synthetic product");
    const beforeCreate = createCalls.length;
    await create.click();
    await expect(main).toHaveAttribute("aria-invalid", "true");
    assert.equal(
      createCalls.length,
      beforeCreate,
      "Missing outer category stays client-side without a write",
    );
    const options = await main
      .locator("option")
      .evaluateAll((nodes) => nodes.map((node) => node.value));
    assert.deepEqual(
      options.sort(),
      ["", rootId, otherRootId].sort(),
      "Root picker excludes child categories",
    );
    await main.selectOption(rootId);
    await expect(sub).toBeEnabled();
    await sub.selectOption(childId);
    await main.selectOption(otherRootId);
    await expect(sub).toHaveValue("");
    assert.equal(
      await sub.locator("option").count(),
      1,
      "Changing root clears stale child options",
    );
    await main.selectOption(rootId);
    await inline.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(name(root, locale), { exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("textbox", {
        name: he ? "שם בעברית" : "Name (Hebrew)",
        exact: true,
      })
      .fill("תת־קטגוריה חדשה לבדיקה");
    await dialog
      .getByRole("textbox", {
        name: he ? "שם באנגלית" : "Name (English)",
        exact: true,
      })
      .fill("New synthetic subcategory");
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ["dark", "medium", "light"]) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        await assertFitting(
          page,
          `${locale}/${width}/${theme}/subcategory-dialog`,
        );
        if (width === 320)
          await assertAccessible(
            page,
            '[role="dialog"]',
            `${locale}-${theme}-dialog-320`,
          );
      }
    }
    const beforeCategory = categoryCalls.length;
    loseCategoryResponse = true;
    await dialog
      .getByRole("button", {
        name: he ? "יצירת תת־קטגוריה" : "Create subcategory",
        exact: true,
      })
      .click();
    const reconcile = dialog.getByRole("button", {
      name: he ? "בדיקת קטגוריות שמורות" : "Check saved categories",
      exact: true,
    });
    await expect(reconcile).toBeVisible();
    assert.equal(
      categoryCalls.length,
      beforeCategory + 1,
      "Unknown category response is not retried",
    );
    await expect(
      dialog.getByRole("textbox", {
        name: he ? "שם באנגלית" : "Name (English)",
        exact: true,
      }),
    ).toBeDisabled();
    loseCategoryResponse = false;
    await reconcile.click();
    await expect(dialog).toHaveCount(0);
    await expect(sub).toHaveValue(inlineChildId);
    assert.equal(
      categoryCalls.length,
      beforeCategory + 1,
      "Reconciliation uses a read, never duplicate create",
    );
    pass(
      `${locale}: required outer, optional child, scoped options, reset on outer change and inline creation/reconciliation`,
    );
    await create.click();
    await page.waitForURL(`**/${locale}/admin/products/${productIds[0]}`);
    assert.equal(createCalls.at(-1).category_id, rootId);
    assert.equal(createCalls.at(-1).subcategory_id, inlineChildId);
    const editorMain = page.locator("#product-category");
    const editorSub = page.locator("#product-subcategory");
    await expect(editorMain).toHaveValue(rootId);
    await expect(editorSub).toHaveValue(childId);
    await editorMain.selectOption(otherRootId);
    await expect(editorSub).toHaveValue("");
    pass(
      `${locale}: create payload includes both assignments and editor can change them`,
    );
    await page.goto(`${base}/${locale}/admin/categories`, {
      waitUntil: "networkidle",
    });
    const addChild = page.getByRole("button", {
      name: `${he ? "הוספת תת־קטגוריה" : "Add subcategory"} · ${name(root, locale)}`,
      exact: true,
    });
    await addChild.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const parent = page
      .getByRole("dialog")
      .locator("select")
      .filter({ has: page.locator(`option[value="${rootId}"]`) });
    await expect(parent).toHaveValue(rootId);
    await assertFitting(page, `${locale}/category-manager`);
    await page.screenshot({
      path: join(output, `management-${locale}.png`),
      fullPage: true,
    });
    await page.getByRole("dialog").press("Escape");
    pass(
      `${locale}: category settings offers per-root child creation with selected parent`,
    );
  }
}

async function verifyPublic(page) {
  for (const locale of ["en", "he"]) {
    const route = `${base}/${locale}/store/${root.slug}`;
    const result = await page.goto(route, { waitUntil: "networkidle" });
    assert.equal(result.status(), 200);
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      locale === "he" ? "rtl" : "ltr",
    );
    const nav = page.locator(".sf-departments");
    const toggle = nav.locator("button[aria-expanded]");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(
      nav.locator('.sf-department[aria-current="page"]'),
    ).toContainText(name(root, locale));
    assert.equal(
      await nav.locator("a:visible").count(),
      1,
      "Collapsed outer navigation shows the selected root only",
    );
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    assert.ok((await nav.locator("a:visible").count()) > 1);
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const childLink = page.locator(
      `a[href="/${locale}/store/${root.slug}?subcategory=${child.slug}"]`,
    );
    await expect(childLink).toBeVisible();
    await expect(page.locator(".sf-product-card")).toHaveCount(3);
    await childLink.click();
    await expect(page).toHaveURL(`${route}?subcategory=${child.slug}`);
    await expect(childLink).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".sf-product-card")).toHaveCount(1);
    await expect(page.locator(".sf-product-card")).toHaveAttribute(
      "data-product-name",
      name(products[0], locale),
    );
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.reload({ waitUntil: "networkidle" });
    await expect(childLink).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".sf-product-card")).toHaveCount(1);
    pass(
      `${locale}: actual root route, collapsed/keyboard navigation, active child filtering and reload persistence`,
    );
    await page.evaluate(() => {
      document.documentElement.dataset.appearanceVersion = "1";
    });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(childLink).toHaveAttribute("aria-current", "page");
    await assertFitting(page, `${locale}/appearance-1`);
    await page.screenshot({
      path: join(output, `public-${locale}-appearance-1.png`),
      fullPage: true,
    });
    await page.evaluate(() => {
      document.documentElement.dataset.appearanceVersion = "2";
    });
    pass(
      `${locale}: Version 1 retains functional collapsed navigation and selected internal category`,
    );
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ["dark", "medium", "light"]) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        await assertFitting(page, `${locale}/${width}/${theme}/public`);
        const selection = await page
          .locator(".sf-subcategory-links")
          .evaluate((node) => {
            const selected = getComputedStyle(
              node.querySelector('[aria-current="page"]'),
            );
            const other = getComputedStyle(
              node.querySelector("a:not([aria-current])"),
            );
            return {
              selected: selected.backgroundColor,
              other: other.backgroundColor,
              weight: Number(selected.fontWeight),
            };
          });
        assert.notEqual(
          selection.selected,
          selection.other,
          `${locale}/${width}/${theme}: selected child has a distinct colored surface`,
        );
        assert.ok(
          selection.weight >= 700,
          `${locale}/${width}/${theme}: selected child is bold`,
        );
        const positioning = await page
          .locator('[data-testid="store-catalog"]')
          .evaluate((node) => {
            const bounds = (selector) => {
              const rect = node.querySelector(selector).getBoundingClientRect();
              return {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              };
            };
            return {
              bar: bounds(".sf-subcategories"),
              toolbar: bounds(".sf-catalog-toolbar"),
            };
          });
        const containerEdge = positioning.toolbar.x + positioning.toolbar.width;
        assert.ok(
          positioning.bar.y + positioning.bar.height <=
            positioning.toolbar.y + 1,
          `${locale}/${width}: subcategory bar sits above the search toolbar without overlap`,
        );
        assert.ok(
          Math.abs(positioning.bar.x + positioning.bar.width - containerEdge) <=
            2,
          `${locale}/${width}: subcategory bar spans the same container as the toolbar`,
        );
        if (width <= 767) {
          assert.ok(
            Math.abs(positioning.bar.x - positioning.toolbar.x) <= 2,
            `${locale}/${width}: stacked controls share the same start edge`,
          );
        }
        if (width === 320) {
          await assertAccessible(
            page,
            ".sf-departments",
            `${locale}-${theme}-outer-320`,
          );
          await assertAccessible(
            page,
            '[data-testid="store-catalog"]',
            `${locale}-${theme}-catalog-320`,
          );
        }
      }
      await page.screenshot({
        path: join(output, `public-${locale}-${width}.png`),
        fullPage: true,
      });
    }
    pass(
      `${locale}: responsive category controls in three themes at 320/390/768/1440px`,
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await toggle.click();
    const otherCategory = nav
      .locator("a")
      .filter({ hasNotText: name(root, locale) })
      .first();
    const nextHref = await otherCategory.getAttribute("href");
    assert.ok(nextHref && !nextHref.includes("subcategory="));
    await otherCategory.click();
    await expect(page).toHaveURL(`${base}${nextHref}`, { timeout: 30000 });
    await expect(
      page.locator(".sf-departments button[aria-expanded]"),
    ).toHaveAttribute("aria-expanded", "false");
    pass(
      `${locale}: entering another outer category collapses the expanded category bar`,
    );
  }
}

async function ensureActor() {
  if (actorReady) return;
  const email = `category-qa-${randomUUID()}@miro-test.local`;
  const password = `Category-${randomUUID()}!`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  actorId = created.data.user.id;
  await checked(
    service
      .from("user_roles")
      .upsert({ user_id: actorId, role: "ceo" }, { onConflict: "user_id" }),
  );
  await checked(
    service
      .from("profiles")
      .update({
        account_status: "active",
        role: "ceo",
        full_name: "Synthetic category QA",
      })
      .eq("id", actorId),
  );
  await page.goto(`${base}/en/login`, { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="password"]').press("Enter");
  await page.waitForURL((url) => !url.pathname.endsWith("/login"));
  pass("real disposable CEO login for isolated category QA");
  actorReady = true;
  const posCatalog = await context.request.get(
    `${base}/api/management/pos/catalog?limit=1`,
  );
  assert.equal(
    posCatalog.status(),
    200,
    `POS catalog must retain an unambiguous root join: ${await posCatalog.text()}`,
  );
  const posBody = await posCatalog.json();
  assert.ok(Array.isArray(posBody.categories));
  assert.ok(Array.isArray(posBody.products));
  pass(
    "real authorized POS catalog read accepts explicit root relation after optional child FK",
  );
}

try {
  await mkdir(output, { recursive: true });
  browser = await browserType.launch();
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  await context.route("**/api/track", (route) =>
    route.fulfill({ status: 204 }),
  );
  page = await context.newPage();
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  if (publicScope) {
    await seedPublicFixtures();
    await verifyPublic(page);
  }
  if (scope !== "public") {
    await ensureActor();
    if (publicScope) {
      const headers = { Origin: new URL(base).origin };
      const created = await context.request.post(
        `${base}/api/management/categories`,
        {
          headers,
          data: {
            id: apiChildId,
            parent_id: rootId,
            slug: `${prefix}-real-api`,
            name_he: `בדיקת שמירה ${token}`,
            name_en: `QA saved category ${token}`,
            description_he: null,
            description_en: null,
            image_url: null,
            sort_order: 0,
            is_active: true,
          },
        },
      );
      assert.equal(
        created.status(),
        200,
        `Real category create must accept the management payload: ${await created.text()}`,
      );
      assert.equal((await created.json()).category.parent_id, rootId);
      const patched = await context.request.patch(
        `${base}/api/management/categories`,
        {
          headers,
          data: {
            id: apiChildId,
            description_he: null,
            description_en: null,
            image_url: null,
          },
        },
      );
      assert.equal(patched.status(), 200);
      assert.equal((await patched.json()).category.description_he, null);
      pass(
        "real authorized category POST/PATCH accepts nullable management payload and persists the selected root",
      );
    }
    await verifyManagement(context, page);
  }
  assert.deepEqual(runtimeErrors, []);
  await writeFile(
    join(output, "results.json"),
    JSON.stringify({ engine, scope, checks, runtimeErrors }, null, 2),
  );
  console.log(`Evidence: ${output}`);
} finally {
  if (fixturesAttempted) {
    // Hide before deleting; no category can disappear under an owner product.
    for (const query of [
      service
        .from("products")
        .update({ status: "hidden" })
        .in("id", productIds),
      service.from("products").delete().in("id", productIds),
      service
        .from("categories")
        .delete()
        .in("id", [childId, secondChildId, apiChildId]),
    ]) {
      const result = await query;
      if (result.error) cleanupErrors.push(result.error.message);
    }
    try {
      await ensureActor();
      const removed = await context.request.delete(
        `${base}/api/management/categories?id=${rootId}&hard=true`,
        {
          headers: { Origin: new URL(base).origin },
        },
      );
      assert.equal(
        removed.status(),
        200,
        "Authorized root deletion must invalidate public navigation cache",
      );
      console.log(
        "PASS real authorized root cleanup invalidates public navigation cache",
      );
    } catch (error) {
      cleanupErrors.push(`Navigation cache cleanup: ${error.message}`);
      const fallback = await service
        .from("categories")
        .delete()
        .eq("id", rootId);
      if (fallback.error) cleanupErrors.push(fallback.error.message);
    }
    const remainingProducts = await checked(
      service.from("products").select("id").in("id", productIds),
    );
    const remainingCategories = await checked(
      service
        .from("categories")
        .select("id")
        .in("id", [rootId, childId, secondChildId, apiChildId]),
    );
    if (remainingProducts.length || remainingCategories.length)
      cleanupErrors.push(
        `Fixture rows remain: ${JSON.stringify({ products: remainingProducts, categories: remainingCategories })}`,
      );
    if (!cleanupErrors.length)
      console.log(
        "PASS disposable public fixture cleanup and read-back reconciliation",
      );
  }
  if (actorId) {
    const result = await service.auth.admin.deleteUser(actorId);
    if (result.error) cleanupErrors.push(result.error.message);
    else console.log("PASS disposable CEO cleanup");
  }
  await browser?.close();
  assert.deepEqual(
    cleanupErrors,
    [],
    "All disposable fixtures must be cleaned up",
  );
}
