// Production browser check: disposable admin auth, live reads, then isolated UI fixtures.
// Never mutates live requests, orders, products, suppliers, or analytics events.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.REPORTING_BASE_URL || "http://127.0.0.1:3107";
const output =
  process.env.REPORTING_OUTPUT_DIR || "docs/reporting-evidence-2026-10-02";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
assert.ok(
  url && secret,
  "Configured database required; do not silently skip live checks",
);
const admin = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
  },
});
let userId;
let browser;
const checks = [];
const liveFailures = [];
const pass = (value) => {
  checks.push(value);
  console.log(`PASS ${value}`);
};
const totals = {
  revenueGross: 11800,
  revenueNet: 10000,
  vatTotal: 1800,
  cogs: 6500,
  grossProfit: 3500,
  margin: 0.35,
  discounts: 400,
  unitsSold: 24,
  orderCount: 8,
  inventoryValue: 26400,
  inventoryUnits: 60,
};
const range = {
  from: "2026-09-25T21:00:00.000Z",
  to: "2026-10-02T20:59:59.999Z",
  generatedAt: "2026-10-02T09:00:00.000Z",
};
const productId = randomUUID();
const categoryId = randomUUID();
const customerName =
  "A very long customer company name for narrow screen reading and resize validation";
const product = {
  productId,
  slug: "miro-security-camera-premium",
  name: {
    en: "MIRO Premium 4K Security Camera with a very long product name for responsive display",
    he: "מצלמת אבטחה איכותית עם שם מוצר ארוך מאוד לבדיקת תצוגה רספונסיבית",
  },
  category: {
    id: categoryId,
    slug: "cameras",
    name_en: "Security cameras",
    name_he: "מצלמות אבטחה",
  },
  views: 120,
  uniqueViewers: 85,
  contactClicks: 18,
  enquiries: 12,
  conversion: 0.1,
};
const finance = {
  range,
  totals,
  dailySeries: [
    { day: "2026-09-30", gross: 3540, net: 3000, orders: 3 },
    { day: "2026-10-01", gross: 0, net: 0, orders: 0 },
    { day: "2026-10-02", gross: 8260, net: 7000, orders: 5 },
  ],
  previous: {
    range: { from: "2026-09-18T21:00:00Z", to: "2026-09-25T20:59:59Z" },
    totals: { ...totals, revenueGross: 5900, grossProfit: 1750, orderCount: 4 },
  },
};
const analytics = {
  range,
  totals: {
    views: 120,
    impressions: 800,
    uniqueSessions: 85,
    searches: 45,
    noResultSearches: 4,
    contactClicks: { contact: 8, phone: 7, whatsapp: 3, total: 18 },
    productInquiries: 12,
    enquiriesSubmitted: 15,
    enquiryConversionRate: 15 / 85,
    salesCount: 8,
  },
  perProduct: [product],
  perSearchTerm: [
    {
      searchQuery:
        "4K security cameras and professional installation with a very long search query",
      searches: 32,
    },
  ],
  perCategory: [
    {
      categoryId,
      slug: "cameras",
      name: { en: "Security cameras", he: "מצלמות אבטחה" },
      views: 120,
    },
  ],
  dailySeries: {
    "2026-09-30": {
      product_view: { events: 20 },
      product_search: { events: 12 },
    },
    "2026-10-02": {
      product_view: { events: 100 },
      product_search: { events: 33 },
    },
  },
  partial: { uniqueViewersCapped: false },
};
const rows = ["new", "in_progress", "waiting_customer"].map(
  (status, index) => ({
    id: randomUUID(),
    customer: {
      id: null,
      name: index === 0 ? customerName : `Customer ${index + 1}`,
      email: "customer-with-a-very-long-email-address@example.test",
      phone: "0501234567",
    },
    source: "store",
    locale: "en",
    created_at: "2026-09-29T10:00:00Z",
    message:
      "Please help us choose a security camera and installation package for our business.",
    status,
    metadata: {},
    product: {
      id: productId,
      name_en: product.name.en,
      name_he: product.name.he,
    },
    variant: {
      id: randomUUID(),
      sku: "MIRO-CAMERA-VERY-LONG-4K-PRO-SKU",
      color_he: null,
      color_en: null,
      color_hex: null,
    },
    assignedTo: null,
  }),
);

try {
  await mkdir(output, { recursive: true });
  const email = `reporting-qa-${Date.now()}@miro-test.local`;
  const password = `Reporting-${randomUUID()}!`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error)
    throw new Error(
      `Disposable account creation failed: ${created.error.code || created.error.status}`,
    );
  userId = created.data.user.id;
  const role = await admin
    .from("user_roles")
    .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id" });
  if (role.error) throw new Error(`Disposable role failed: ${role.error.code}`);
  const profile = await admin
    .from("profiles")
    .update({ account_status: "active", role: "admin" })
    .eq("id", userId);
  if (profile.error)
    throw new Error(`Disposable profile failed: ${profile.error.code}`);
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "America/Los_Angeles",
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${base}/en/login`, { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="password"]').press("Enter");
  await page.waitForURL((value) => value.pathname !== "/en/login", {
    timeout: 30000,
  });
  pass("real admin login without permission bypass");
  for (const section of ["requests", "finance", "analytics", "suppliers"]) {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/management/${section}`) &&
        response.request().method() === "GET",
      { timeout: 25000 },
    );
    await page.goto(`${base}/en/admin/${section}`, {
      waitUntil: "networkidle",
    });
    const response = await responsePromise;
    const body = await response.json();
    if (!response.ok()) {
      liveFailures.push({
        section,
        status: response.status(),
        error: body.error,
      });
      console.log(
        `LIVE BLOCKER ${section}: ${response.status()} ${body.error}`,
      );
    } else {
      assert.ok(
        section === "requests"
          ? Array.isArray(body.rows)
          : section === "suppliers"
            ? Array.isArray(body.suppliers)
            : body.totals,
      );
      pass(`live ${section} protected API/database contract`);
    }
  }
  const unauth = await browser.newContext();
  for (const section of ["requests", "finance", "analytics"]) {
    const response = await unauth.request.get(
      `${base}/api/management/${section}`,
    );
    assert.ok([401, 403].includes(response.status()));
  }
  await unauth.close();
  pass("anonymous report/request APIs denied");
  let failedAssignment = false;
  let financeFail = false;
  let financeDelay = false;
  let lastPatch = null;
  const reportCalls = [];
  await context.route("**/api/management/**", async (route) => {
    const request = route.request();
    const parsed = new URL(request.url());
    const section = parsed.pathname.split("/").at(-1);
    if (request.method() === "PATCH" && section === "requests") {
      lastPatch = request.postDataJSON();
      if (failedAssignment)
        return route.fulfill({
          status: 500,
          json: { error: "Assignment failed" },
        });
      const row = rows.find((entry) => entry.id === lastPatch.id);
      row.status = lastPatch.status;
      row.assignedTo = lastPatch.assignedTo
        ? { id: lastPatch.assignedTo, displayName: "QA operator" }
        : null;
      return route.fulfill({ json: { ok: true } });
    }
    if (section === "finance") {
      reportCalls.push(request.url());
      if (financeDelay)
        await new Promise((resolve) => setTimeout(resolve, 350));
      return route.fulfill(
        financeFail
          ? { status: 503, json: { error: "Temporary report failure" } }
          : { json: finance },
      );
    }
    if (section === "analytics") {
      reportCalls.push(request.url());
      return route.fulfill({ json: analytics });
    }
    if (section === "requests") {
      const status = parsed.searchParams.get("status");
      const assigned = parsed.searchParams.get("assigned");
      const filtered = rows.filter(
        (row) =>
          (!status || status === "all" || row.status === status) &&
          (!assigned ||
            assigned === "any" ||
            (assigned === "unassigned"
              ? !row.assignedTo
              : row.assignedTo?.id === assigned)),
      );
      return route.fulfill({
        json: {
          rows: filtered,
          totalCount: filtered.length,
          limit: 25,
          offset: 0,
        },
      });
    }
    if (section === "users")
      return route.fulfill({
        json: {
          users: [
            { id: userId, full_name: "QA operator", email, role: "admin" },
          ],
        },
      });
    if (section === "products")
      return route.fulfill({
        json: {
          products: [
            {
              id: productId,
              name_en: product.name.en,
              name_he: product.name.he,
            },
          ],
        },
      });
    if (section === "suppliers")
      return route.fulfill({
        json: {
          suppliers: [
            {
              id: randomUUID(),
              company_name: customerName,
              contact_person: "Supplier contact",
              phone: "0501234567",
              email: "supplier@example.test",
              lead_time_days: 5,
              currency: "ILS",
              is_active: true,
              notes: "",
              created_at: range.generatedAt,
            },
          ],
          total: 1,
        },
      });
    return route.continue();
  });
  if (!process.argv.includes("--a11y-only")) {
    for (const locale of ["en", "he"])
      for (const theme of ["dark", "medium", "light"])
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          for (const section of ["requests", "finance", "analytics"]) {
            await page.goto(`${base}/${locale}/admin/${section}`, {
              waitUntil: "networkidle",
            });
            await page.evaluate(
              (value) =>
                document.documentElement.setAttribute("data-theme", value),
              theme,
            );
            assert.ok(await page.locator("h1").isVisible());
            await page.waitForTimeout(100);
            const overflow = await page.evaluate(
              () =>
                document.documentElement.scrollWidth > window.innerWidth + 1,
            );
            assert.equal(
              overflow,
              false,
              `${locale}/${theme}/${width}/${section} must not overflow the viewport`,
            );
            if (
              (locale === "en" && theme === "dark" && width === 1440) ||
              (locale === "he" && theme === "light" && width === 390)
            )
              await page.screenshot({
                path: `${output}/${section}-${locale}-${theme}-${width}.png`,
                fullPage: true,
              });
            if (width === 390) {
              console.log(
                `CHECK drawer ${locale}/${theme}/${width}/${section}`,
              );
              const opener = page.getByRole("button", {
                name:
                  locale === "he"
                    ? section === "requests"
                      ? "סינון מתקדם"
                      : section === "finance"
                        ? "אפשרויות דוח"
                        : "אפשרויות תצוגה"
                    : section === "requests"
                      ? "Advanced filters"
                      : section === "finance"
                        ? "Report options"
                        : "View options",
              });
              await opener.click();
              assert.ok(await page.getByRole("dialog").isVisible());
              await page.waitForFunction(() =>
                document.activeElement?.closest('[role="dialog"]'),
              );
              await page.keyboard.press("Escape");
              await expect(page.getByRole("dialog")).toHaveCount(0);
              await expect(opener).toBeFocused();
            }
          }
          pass(
            `${locale}/${theme}/${width}: layout, drawers, Escape/focus restoration`,
          );
        }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/en/admin/finance`, { waitUntil: "networkidle" });
    const chooseRange = async (label) => {
      await page
        .getByRole("button", { name: /^Date range/ })
        .first()
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: label, exact: true })
        .click();
    };
    await chooseRange("All");
    await page.waitForTimeout(200);
    assert.ok(
      reportCalls.some(
        (value) =>
          new URL(value).pathname.endsWith("finance") &&
          !new URL(value).searchParams.has("from"),
      ),
    );
    await page.getByRole("button", { name: "Orders", exact: true }).click();
    assert.ok(
      (
        await page.locator('svg[role="img"]').getAttribute("aria-label")
      ).includes("Order count"),
    );
    await page.getByRole("button", { name: "Bars", exact: true }).click();
    await page
      .getByRole("button", { name: "Daily ledger", exact: true })
      .click();
    assert.ok(await page.getByRole("table").isVisible());
    pass("Finance All, order charts, bars and daily ledger");
    financeFail = true;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page
      .getByText("Temporary report failure", { exact: false })
      .waitFor();
    assert.ok(
      await page
        .getByText("Showing the last successfully loaded figures.", {
          exact: false,
        })
        .isVisible(),
    );
    financeFail = false;
    financeDelay = true;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await chooseRange("Today");
    await chooseRange("Last 7 days");
    await page.waitForTimeout(600);
    assert.equal(
      await page
        .getByRole("button", { name: "Refresh", exact: true })
        .isEnabled(),
      true,
    );
    pass(
      "Finance failed refresh preserves figures; range/refresh race settles",
    );
    await page.goto(`${base}/en/admin/analytics`, { waitUntil: "networkidle" });
    await chooseRange("All");
    await page.waitForTimeout(200);
    assert.ok(
      reportCalls.some(
        (value) =>
          new URL(value).pathname.endsWith("analytics") &&
          !new URL(value).searchParams.has("from"),
      ),
    );
    await page
      .getByRole("group", { name: "Chart activity", exact: true })
      .getByRole("button", { name: "Searches", exact: true })
      .click();
    assert.ok(
      (await page.getByRole("img").getAttribute("aria-label")).includes(
        "Event count",
      ),
    );
    await page
      .getByRole("button", { name: "Product performance", exact: true })
      .click();
    await page.getByRole("button", { name: /^Details for/ }).click();
    const dialog = page.getByRole("dialog");
    assert.equal(
      await dialog
        .getByRole("link", { name: "Edit product" })
        .getAttribute("href"),
      `/en/admin/products/${productId}`,
    );
    assert.equal(
      await dialog
        .getByRole("link", { name: "View in store" })
        .getAttribute("href"),
      `/en/store/cameras/${product.slug}`,
    );
    await page.keyboard.press("Escape");
    pass(
      "Analytics All, actual product_search metric, product editor/store detail routes",
    );
    await page.goto(`${base}/en/admin/requests`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Work board", exact: true }).click();
    await page.getByRole("button", { name: new RegExp(customerName) }).click();
    failedAssignment = true;
    await page.locator("#request-assignee").selectOption(userId);
    await page.getByText("Assignment failed", { exact: true }).waitFor();
    assert.equal(await page.locator("#request-assignee").inputValue(), "");
    failedAssignment = false;
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "In progress", exact: true })
      .click();
    await page.waitForTimeout(200);
    assert.equal(lastPatch.assignedTo, null);
    assert.equal(rows[0].status, "in_progress");
    await page.keyboard.press("Escape");
    pass(
      "Request board opens details; failed assignment cannot leak into later status patch",
    );
    await page.getByRole("button", { name: "Table", exact: true }).click();
    const longRail = page
      .locator(".mgmt-table__body .mgmt-overflow-text[data-overflow]")
      .first();
    await longRail.waitFor();
    assert.notEqual(
      await longRail
        .locator(".mgmt-overflow-text__content")
        .evaluate((element) => getComputedStyle(element).animationName),
      "none",
    );
    const reducedRail = page
      .getByTitle(await longRail.getAttribute("title"), { exact: true })
      .first();
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await reducedRail
        .locator(".mgmt-overflow-text__content")
        .evaluate((element) => getComputedStyle(element).animationName),
      "none",
    );
    const input = page.getByRole("searchbox").first();
    await input.fill(
      "A long search string entered by the operator stays still while typing",
    );
    assert.equal(
      await input.evaluate(
        (element) => getComputedStyle(element).animationName,
      ),
      "none",
    );
    pass(
      "clipped display rails animate; reduced motion stops them; typed text is static",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(`${base}/en/admin/suppliers`, { waitUntil: "networkidle" });
    const company = page.locator(".mgmt-supplier-company").first();
    assert.equal(
      await company.evaluate(
        (element) => getComputedStyle(element).justifyContent,
      ),
      "center",
    );
    assert.equal(
      await page
        .locator(".mgmt-supplier-table th")
        .first()
        .evaluate((element) => getComputedStyle(element).textAlign),
      "center",
    );
    pass("supplier company cell/header centered");
  }
  for (const section of ["requests", "finance", "analytics"]) {
    await page.goto(`${base}/en/admin/${section}`, {
      waitUntil: "networkidle",
    });
    for (const theme of ["dark", "medium", "light"]) {
      await page.evaluate(
        (value) => document.documentElement.setAttribute("data-theme", value),
        theme,
      );
      // Theme surface transitions must settle before measuring final contrast.
      await page.waitForTimeout(250);
      const results = await new AxeBuilder({ page })
        .include(".mgmt-shell__main")
        .analyze();
      if (results.violations.length)
        console.log(
          JSON.stringify(
            results.violations.map((v) => ({
              rule: v.id,
              nodes: v.nodes.map((n) => ({
                target: n.target,
                summary: n.failureSummary,
              })),
            })),
            null,
            2,
          ),
        );
      assert.deepEqual(
        results.violations.map((violation) => ({
          id: violation.id,
          nodes: violation.nodes.length,
        })),
        [],
        `${section}/${theme} accessibility`,
      );
    }
  }
  pass("axe: all three reporting pages in all three themes");
  assert.deepEqual(pageErrors, []);
  pass("no browser runtime errors");
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        date: "2026-10-02",
        checks,
        liveFailures,
        fixtureNote:
          "Populated reporting interactions use browser-only synthetic API responses; protected route/auth and initial database contract checks use the live configured database.",
      },
      null,
      2,
    ),
  );
  if (liveFailures.length)
    throw new Error(
      "Live backend failures recorded; UI fixtures cannot certify database integration",
    );
} finally {
  if (browser) await browser.close();
  if (userId) {
    const result = await admin.auth.admin.deleteUser(userId);
    if (result.error)
      throw new Error(
        `Disposable admin cleanup failed: ${result.error.code || result.error.status}`,
      );
    console.log("PASS disposable admin deleted");
  }
}
