// Read-only, authenticated component geometry review. Fixtures remain in the browser.
// For repeated layout QA use SPACING_REPORT_FIXTURES=1 after checking live API
// contracts once; repeated live matrices share the normal per-IP read budget.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.SPACING_BASE_URL || "http://127.0.0.1:3000";
const output = process.env.SPACING_OUTPUT_DIR || "/tmp/miro-management-spacing";
const baseline = process.argv.includes("--baseline");
const initialRole = process.env.SPACING_ROLE === "admin" ? "admin" : "ceo";
const reportingFixtures = process.env.SPACING_REPORT_FIXTURES === "1";
const widths = (process.env.SPACING_WIDTHS || "1440,1024,390,320")
  .split(",")
  .map(Number);
const locales = (process.env.SPACING_LOCALES || "en,he").split(",");
const themes = (process.env.SPACING_THEMES || "dark,medium,light").split(",");
const paths = (
  process.env.SPACING_PATHS ||
  ",products,products/new,categories,services,inventory,suppliers,sales,accounts,customers,users,audit,requests,settings,store-design,storefront-merchandising,finance,analytics,expenses,documents,cash,recurring,integrations,commerce-reports,pos"
).split(",");
if (!process.env.SPACING_PATHS) {
  const files = await readdir("src/app/[locale]/(protected)/admin", {
    recursive: true,
  });
  const staticPages = files
    .filter((file) => file === "page.tsx" || file.endsWith("/page.tsx"))
    .filter((file) => !file.includes("[id]"))
    .map((file) =>
      file === "page.tsx" ? "" : file.slice(0, -"/page.tsx".length),
    );
  assert.deepEqual(
    [...paths].sort(),
    staticPages.sort(),
    "Every static management page must be in the review",
  );
}
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(20000) }),
    },
  },
);
let browser,
  context,
  page,
  userId,
  cashFixture,
  commerceFixture,
  accountFixture = false,
  customerFixture = false;
let stage = "authenticate";
const syntheticOrder = {
  order_id: randomUUID(),
  order_number: "QA-ONLY-001",
  created_at: "2026-10-19T08:00:00Z",
  status: "confirmed",
  source: "pos",
  customer_name: "Synthetic customer",
  customer_email: "qa@example.test",
  recorded_by_name: "Synthetic cashier",
  items_count: 1,
  units_count: 2,
  subtotal_net: 200,
  discount: 0,
  net_total: 200,
  vat_total: 36,
  total: 236,
  payments: [
    {
      payment_method: "cash",
      amount: 236,
      installments: 1,
      payment_status: "paid",
      external_reference: "SYNTHETIC-QA-REFERENCE",
      paid_at: "2026-10-19T08:00:00Z",
    },
  ],
};
const syntheticCustomer = {
  id: randomUUID(),
  full_name: "Synthetic customer",
  email: "synthetic-customer@example.test",
  phone: null,
  account_status: "active",
  role: "customer",
  created_at: "2026-10-01T08:00:00Z",
  last_seen_at: "2026-10-19T08:00:00Z",
};
const syntheticPosCategory = {
  id: randomUUID(),
  slug: "qa-only",
  name_he: "קטגוריית בדיקה",
  name_en: "Synthetic category",
  sort_order: 0,
  is_active: true,
};
const syntheticPosProduct = {
  id: randomUUID(),
  slug: "qa-only-product",
  name_he: "מוצר בדיקה בלבד",
  name_en: "Synthetic product QA only",
  image_url: null,
  category: syntheticPosCategory,
  price: 118,
  sale_price: null,
  tracking_mode: "none",
  variants: [0, 1].map((index) => ({
    id: randomUUID(),
    sku: `QA-ONLY-${index}`,
    barcode: null,
    color_he: index ? "כסוף" : "שחור",
    color_en: index ? "Silver" : "Black",
    color_hex: null,
    price_override: null,
    is_default: index === 0,
    stock_qty: 5,
    low_stock_threshold: 1,
  })),
};
// Explicit browser-only reporting mode for large layout matrices after live
// contracts were verified. Server read limits remain enabled and unchanged.
const fixtureRange = {
  from: "2026-10-01T00:00:00Z",
  to: "2026-10-19T23:59:59Z",
  generatedAt: "2026-10-19T08:00:00Z",
};
const fixtureTotals = {
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
const fixtureFinance = {
  range: fixtureRange,
  totals: fixtureTotals,
  dailySeries: [
    { day: "2026-10-17", gross: 3540, net: 3000, orders: 3 },
    { day: "2026-10-18", gross: 0, net: 0, orders: 0 },
    { day: "2026-10-19", gross: 8260, net: 7000, orders: 5 },
  ],
  previous: {
    range: fixtureRange,
    totals: {
      ...fixtureTotals,
      revenueGross: 5900,
      grossProfit: 1750,
      orderCount: 4,
    },
  },
};
const fixtureAnalytics = {
  range: fixtureRange,
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
  perProduct: [],
  perSearchTerm: [{ searchQuery: "Synthetic search", searches: 32 }],
  perCategory: [
    {
      categoryId: syntheticPosCategory.id,
      slug: "qa-only",
      name: { en: "Synthetic category", he: "קטגוריית בדיקה" },
      views: 120,
    },
  ],
  dailySeries: {
    "2026-10-19": {
      product_view: { events: 120 },
      product_search: { events: 45 },
    },
  },
  partial: { uniqueViewersCapped: false },
  channel: "all",
};
const fixtureRequest = {
  id: randomUUID(),
  customer: {
    id: null,
    name: "Synthetic customer",
    email: "qa@example.test",
    phone: "0500000000",
  },
  source: "store",
  locale: "en",
  created_at: "2026-10-19T08:00:00Z",
  message: "Synthetic request for component geometry checks",
  status: "new",
  metadata: {},
  product: {
    id: syntheticPosProduct.id,
    name_en: syntheticPosProduct.name_en,
    name_he: syntheticPosProduct.name_he,
  },
  variant: {
    id: syntheticPosProduct.variants[0].id,
    sku: "QA-ONLY",
    color_he: null,
    color_en: null,
    color_hex: null,
  },
  assignedTo: null,
};
const reports = [],
  apiFailures = [],
  blockedWrites = [],
  errors = [];
const cache = new Map();

// Compare actual nested content, not just page overflow or metric-card borders.
async function inspect(page) {
  return page.evaluate(() => {
    const roots = [
      ...document.querySelectorAll(
        ".mgmt-shell-root, #mgmt-overlay-portal-host, [data-workspace-window-id]",
      ),
    ].filter(
      (root, _, all) =>
        !all.some((other) => other !== root && other.contains(root)),
    );
    const visible = (e) => {
      const r = e.getBoundingClientRect(),
        s = getComputedStyle(e);
      return (
        r.width > 0 &&
        r.height > 0 &&
        s.visibility !== "hidden" &&
        !e.closest('[aria-hidden="true"], [hidden]')
      );
    };
    const identify = (e) => ({
      tag: e.tagName.toLowerCase(),
      class: typeof e.className === "string" ? e.className : "",
      label: (
        e.getAttribute("aria-label") ||
        e.labels?.[0]?.textContent ||
        e.textContent ||
        ""
      )
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 110),
    });
    const box = (e) => {
      const r = e.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    const controls = roots
      .flatMap((root) => [
        ...root.querySelectorAll(
          'button,input:not([type="hidden"]),select,textarea',
        ),
      ])
      .filter(visible);
    const floating = (e) => {
      for (
        let node = e;
        node && !roots.includes(node);
        node = node.parentElement
      ) {
        if (
          ["absolute", "fixed", "sticky"].includes(
            getComputedStyle(node).position,
          )
        )
          return node;
      }
      return null;
    };
    const findings = [];
    const painted = (node) => {
      const rect = box(node);
      let clip = null;
      for (
        let parent = node.parentElement;
        parent && parent !== document.body;
        parent = parent.parentElement
      ) {
        const css = getComputedStyle(parent),
          bounds = parent.getBoundingClientRect();
        if (css.overflowX !== "visible") {
          clip ??= parent;
          rect.left = Math.max(rect.left, bounds.left + parent.clientLeft);
          rect.right = Math.min(
            rect.right,
            bounds.left + parent.clientLeft + parent.clientWidth,
          );
        }
        if (css.overflowY !== "visible") {
          clip ??= parent;
          rect.top = Math.max(rect.top, bounds.top + parent.clientTop);
          rect.bottom = Math.min(
            rect.bottom,
            bounds.top + parent.clientTop + parent.clientHeight,
          );
        }
      }
      rect.width = Math.max(0, rect.right - rect.left);
      rect.height = Math.max(0, rect.bottom - rect.top);
      return { rect, clip };
    };
    const controlGeometry = controls.map((node) => ({
      node,
      rect: box(node),
      paint: painted(node),
      floating: floating(node),
      dialog: node.closest('[role="dialog"]'),
    }));
    for (let i = 0; i < controls.length; i++)
      for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i],
          b = controls[j];
        if (
          a.contains(b) ||
          b.contains(a) ||
          controlGeometry[i].floating !== controlGeometry[j].floating
        )
          continue;
        if (controlGeometry[i].dialog !== controlGeometry[j].dialog) continue;
        const sameClip =
          controlGeometry[i].paint.clip === controlGeometry[j].paint.clip;
        const ar = sameClip
            ? controlGeometry[i].rect
            : controlGeometry[i].paint.rect,
          br = sameClip
            ? controlGeometry[j].rect
            : controlGeometry[j].paint.rect,
          x = Math.min(ar.right, br.right) - Math.max(ar.left, br.left),
          y = Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top);
        // Segmented controls and calculator keypads deliberately have compact horizontal seams.
        if (ar.width <= 0 || ar.height <= 0 || br.width <= 0 || br.height <= 0)
          continue;
        if (x > 3 && y > 3)
          findings.push({
            kind: "control-overlap",
            a: identify(a),
            b: identify(b),
            aBox: ar,
            bBox: br,
          });
        else if (x > Math.min(ar.width, br.width) * 0.4) {
          const gap = Math.max(ar.top, br.top) - Math.min(ar.bottom, br.bottom);
          if (
            gap >= -0.5 &&
            gap < 7.5 &&
            !(a.tagName === "BUTTON" && b.tagName === "BUTTON")
          )
            findings.push({
              kind: "field-action-gap",
              gap,
              a: identify(a),
              b: identify(b),
              aBox: ar,
              bBox: br,
            });
        }
      }
    const interactive = (e) =>
      e.matches("button,input,select,textarea") ||
      !!e.querySelector("button,input,select,textarea");
    for (const root of roots)
      for (const parent of root.querySelectorAll(
        "div,section,form,fieldset,article",
      )) {
        if (!visible(parent) || parent.closest("table")) continue;
        // Shared table chrome and the padded section header/body share a bordered shell.
        if (
          parent.matches(
            ".mgmt-table,.mgmt-scroll-region,.mgmt-form-section,.mgmt-dialog,.mgmt-drawer,.mgmt-shell__body,[data-pos-shell]",
          )
        )
          continue;
        if (
          parent.matches('[class*="calculator-window"][class*="__container"]')
        )
          continue;
        const children = [...parent.children].filter(
          (e) =>
            visible(e) &&
            !["absolute", "fixed"].includes(getComputedStyle(e).position),
        );
        for (let i = 1; i < children.length; i++) {
          const a = children[i - 1],
            b = children[i];
          // Padded list header/pagination are attached parts of a single table/card.
          if (
            (String(b.className).includes("pager") &&
              parseFloat(getComputedStyle(b).paddingBlockStart) >= 8) ||
            (b.classList.contains("border-t") &&
              parseFloat(getComputedStyle(b).paddingBlockStart) >= 8) ||
            (a.classList.contains("border-b") &&
              parseFloat(getComputedStyle(a).paddingBlockEnd) >= 8)
          )
            continue;
          if (
            !a.matches("div,section,form,fieldset,article,p,button") ||
            !b.matches("div,section,form,fieldset,article,p,button")
          )
            continue;
          if (
            !interactive(a) &&
            !(a.matches("p,pre") && String(a.className).includes("helpText"))
          )
            continue;
          if (
            a.matches("p") &&
            !a.className.includes("helpText") &&
            !a.matches('[role="alert"],[role="status"]')
          )
            continue;
          if (
            b.matches("p") &&
            !b.className.includes("helpText") &&
            !b.matches('[role="alert"],[role="status"]')
          )
            continue;
          const ar = box(a),
            br = box(b),
            gap = br.top - ar.bottom;
          if (
            ar.height < 22 ||
            br.height < 22 ||
            gap < -0.5 ||
            gap >= 7.5 ||
            Math.min(ar.right, br.right) - Math.max(ar.left, br.left) <
              Math.min(ar.width, br.width) * 0.4
          )
            continue;
          findings.push({
            kind: "content-action-gap",
            gap,
            parent: identify(parent),
            a: identify(a),
            b: identify(b),
            aBox: ar,
            bBox: br,
          });
        }
      }
    return {
      controls: controls.length,
      overflow: document.documentElement.scrollWidth - innerWidth,
      findings,
    };
  });
}

try {
  await mkdir(output, { recursive: true });
  const email = `component-spacing-${Date.now()}-${randomUUID().slice(0, 8)}@miro-test.local`,
    password = `Spacing-${randomUUID()}!`;
  const actor = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (actor.error) throw actor.error;
  userId = actor.data.user.id;
  for (const result of await Promise.all([
    service
      .from("user_roles")
      .upsert(
        { user_id: userId, role: initialRole },
        { onConflict: "user_id" },
      ),
    service
      .from("profiles")
      .update({
        role: initialRole,
        account_status: "active",
        full_name: "Component QA",
      })
      .eq("id", userId),
  ]))
    if (result.error) throw result.error;
  browser = await chromium.launch();
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/en/login`, { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="password"]').press("Enter");
  await page.waitForURL((url) => url.pathname !== "/en/login");
  await context.route("**/api/management/**", async (route) => {
    try {
      const request = route.request(),
        url = new URL(request.url());
      if (request.method() !== "GET") {
        blockedWrites.push({ path: url.pathname, method: request.method() });
        return await route.fulfill({
          status: 403,
          json: { error: "read_only_visual_qa" },
        });
      }
      if (reportingFixtures) {
        let fixture;
        if (url.pathname === "/api/management/finance")
          fixture = fixtureFinance;
        if (url.pathname === "/api/management/analytics")
          fixture = fixtureAnalytics;
        if (url.pathname === "/api/management/sales")
          fixture = { orders: [], totalCount: 0 };
        if (url.pathname === "/api/management/audit")
          fixture = {
            auditEvents: [
              {
                id: randomUUID(),
                action: "product_updated",
                user_id: userId,
                entity_type: "product",
                entity_id: syntheticPosProduct.id,
                details: { synthetic: true },
                created_at: fixtureRange.generatedAt,
                profiles: { full_name: "Synthetic actor" },
              },
            ],
            totalCount: 1,
          };
        if (url.pathname === "/api/management/requests")
          fixture = { rows: [fixtureRequest], totalCount: 1 };
        if (url.pathname === "/api/management/users") {
          const users = [
            { ...syntheticCustomer, id: userId, role: initialRole },
            {
              ...syntheticCustomer,
              id: "11111111-1111-4111-8111-111111111111",
              role: "worker",
              full_name: "Synthetic worker",
            },
          ].filter(
            (user) =>
              !url.searchParams.has("role") ||
              user.role === url.searchParams.get("role"),
          );
          fixture = { users, totalCount: users.length };
        }
        if (fixture) return await route.fulfill({ json: fixture });
      }
      if (url.pathname === "/api/management/pos/catalog")
        return await route.fulfill({
          json: {
            products: [syntheticPosProduct],
            categories: [syntheticPosCategory],
            totalPages: 1,
            total: 1,
          },
        });
      if (url.pathname === "/api/management/calculator-history")
        return await route.fulfill({
          json: {
            history: [
              {
                created_at: "2026-10-19T08:00:00Z",
                expression: "1000 + 18%",
                result: 1180,
              },
              {
                created_at: "2026-10-19T09:00:00Z",
                expression: "12345678901234567890 + 18%",
                result: 14567901003456790000,
              },
            ],
          },
        });
      if (
        (accountFixture || reportingFixtures) &&
        url.pathname === "/api/management/accounts"
      )
        return await route.fulfill({
          json: {
            range: {
              from: "2026-10-01T00:00:00Z",
              to: "2026-10-19T23:59:59Z",
              generatedAt: "2026-10-19T08:00:00Z",
            },
            orders: [syntheticOrder],
            totals: {
              transaction_count: 1,
              revenue: 236,
              units_sold: 2,
              avg_ticket: 236,
              by_method: { cash: 236 },
            },
            summary: {
              transaction_count: 1,
              revenue: 236,
              units_sold: 2,
              avg_ticket: 236,
              by_method: {
                cash: 236,
                credit_card: 0,
                bank_transfer: 0,
                bit: 0,
                check: 0,
                other: 0,
              },
            },
            total_count: 1,
          },
        });
      if (
        (accountFixture || reportingFixtures) &&
        url.pathname === `/api/management/accounts/${syntheticOrder.order_id}`
      )
        return await route.fulfill({
          json: {
            order: syntheticOrder,
            order_items: [
              {
                sku_snapshot: "QA-ONLY",
                product_name_en: "Synthetic product",
                product_name_he: "מוצר בדיקה",
                quantity: 2,
                unit_price: 118,
                discount_amount: 0,
                vat_amount: 36,
                total_price: 236,
              },
            ],
            order_payments: syntheticOrder.payments,
            stock_movements: [{ id: randomUUID(), reference: "SYNTHETIC-QA" }],
          },
        });
      if (
        (customerFixture || reportingFixtures) &&
        url.pathname === "/api/management/customers"
      )
        return await route.fulfill({
          json: url.searchParams.has("id")
            ? {
                customer: syntheticCustomer,
                orders: [
                  {
                    id: syntheticOrder.order_id,
                    ...syntheticOrder,
                    subtotal: 200,
                    currency: "ILS",
                  },
                ],
                serviceRequests: [
                  {
                    id: randomUUID(),
                    service_id: "Synthetic installation request",
                    status: "in_progress",
                    message: "Synthetic request text",
                    created_at: "2026-10-19T08:00:00Z",
                  },
                ],
                events: [
                  {
                    event_type: "product_view",
                    product_id: null,
                    search_query: null,
                    created_at: "2026-10-19T08:00:00Z",
                  },
                ],
              }
            : { customers: [syntheticCustomer], totalCount: 1 },
        });
      if (cashFixture && url.pathname === "/api/management/commerce/cash")
        return await route.fulfill({
          json: { rows: cashFixture, total_count: cashFixture.length },
        });
      if (
        commerceFixture &&
        url.pathname === `/api/management/commerce/${commerceFixture.section}`
      )
        return await route.fulfill({
          json: {
            rows: commerceFixture.rows,
            total_count: commerceFixture.rows.length,
          },
        });
      if (
        reportingFixtures &&
        /^\/api\/management\/commerce\/(documents|settings|report|reports|integrations|expenses|cash|recurring|payments|payment-links|intents)$/.test(
          url.pathname,
        )
      )
        return await route.fulfill({
          json: {
            rows: [],
            total_count: 0,
            summary: {},
            revision: 0,
            readiness: {},
            runtime: {},
          },
        });
      const key = url.pathname + url.search;
      if (cache.has(key)) return await route.fulfill({ json: cache.get(key) });
      let response;
      try {
        response = await route.fetch({ timeout: 20000 });
      } catch {
        // Never dump Playwright request logs: they can contain disposable auth cookies.
        apiFailures.push({ path: url.pathname, status: "transport_error" });
        await route.abort().catch(() => {});
        return;
      }
      if (!response.ok())
        apiFailures.push({ path: url.pathname, status: response.status() });
      else cache.set(key, await response.json());
      return await route.fulfill({ response });
    } catch (error) {
      // Navigating/closing a panel can cancel a route after its response arrives.
      const message = String(error.message || error);
      if (
        !message.includes("already handled") &&
        !message.includes("closed") &&
        !message.includes("disposed")
      )
        errors.push("Management read interception failed");
      await route.abort().catch(() => {});
    }
  });
  async function visit(path, locale) {
    stage = `visit ${locale}/${path || "overview"}`;
    // goto performs a hard reload; wait for the UI's debounced tool layout to
    // persist so a just-closed tool is not restored from its previous snapshot.
    if (new URL(page.url()).pathname.includes("/admin"))
      await expect
        .poll(() =>
          page.evaluate((userId) => {
            const stored = JSON.parse(
              localStorage.getItem(`miro.management.tools.${userId}`) || "{}",
            );
            return [
              ["pos", "Open POS", "פתיחת קופה"],
              ["calculator", "Open calculator", "פתיחת מחשבון"],
            ].every(([id, en, he]) => {
              const button = [
                ...document.querySelectorAll(
                  ".mgmt-topbar__controls button[aria-pressed]",
                ),
              ].find((button) =>
                [en, he].includes(button.getAttribute("aria-label")),
              );
              return (
                Boolean(stored[id]?.open) ===
                (button?.getAttribute("aria-pressed") === "true")
              );
            });
          }, userId),
        )
        .toBe(true);
    const response = await page.goto(
      `${base}/${locale}/admin${path ? `/${path}` : ""}`,
      { waitUntil: "networkidle", timeout: 45000 },
    );
    assert.equal(response.status(), 200, `Actual ${path} page must render`);
    await expect(page.locator(".mgmt-shell__main h1").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
  }
  async function review(path, locale, state = "page", height = 1000) {
    stage = `review ${locale}/${path || "overview"}/${state}`;
    await page.waitForLoadState("networkidle");
    for (const width of widths) {
      await page.setViewportSize({ width, height });
      for (const theme of themes) {
        await page.evaluate((theme) => {
          document.documentElement.dataset.appearanceVersion = "2";
          document.documentElement.dataset.theme = theme;
        }, theme);
        const result = await inspect(page);
        reports.push({ path, locale, state, width, height, theme, ...result });
        if (
          theme === themes[0] &&
          (result.findings.length || width === 1440 || width === 390)
        )
          await page.screenshot({
            path: `${output}/${locale}-${path.replaceAll("/", "-") || "overview"}-${state}-${width}.png`,
            fullPage: true,
          });
      }
    }
    const findings = reports
      .filter(
        (r) => r.path === path && r.locale === locale && r.state === state,
      )
      .flatMap((r) => r.findings);
    console.log(
      `${findings.length ? "REVIEW" : "PASS"} ${locale}/${path || "overview"}/${state}: ${findings.length} component findings`,
    );
    // Keep incremental evidence even if a later surface cannot load.
    await writeFile(
      `${output}/results.json`,
      JSON.stringify(
        {
          reportingFixtures,
          initialRole,
          reports,
          apiFailures,
          blockedWrites,
          errors,
        },
        null,
        2,
      ),
    );
  }
  for (const locale of locales)
    for (const path of paths) {
      cashFixture = path === "cash" ? [] : undefined;
      await visit(path, locale);
      await review(
        path,
        locale,
        initialRole === "admin" ? "admin-page" : "page",
      );
      if (initialRole === "admin") continue;
      if (path === "accounts" || path === "customers") {
        accountFixture = path === "accounts";
        customerFixture = path === "customers";
        await visit(path, locale);
        await review(path, locale, "populated-records");
        await page.setViewportSize({ width: 1440, height: 1000 });
        const opener =
          path === "accounts"
            ? page
                .getByRole("button", {
                  name: locale === "he" ? "פרטים" : "Details",
                  exact: true,
                })
                .first()
            : page
                .getByRole("button", {
                  name: locale === "he" ? /^צפה בפרטי/ : /^View details for/,
                })
                .first();
        await opener.click();
        await page.waitForLoadState("networkidle");
        await review(path, locale, "record-drawer");
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        accountFixture = false;
        customerFixture = false;
      }
      if (path === "") {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.locator(".mgmt-account__trigger").click();
        await review(path, locale, "account-menu");
        await page.keyboard.press("Escape");
        for (const [index, name] of (locale === "he"
          ? ["חיפוש עמוד בסביבת העבודה", "תצוגת סביבת העבודה"]
          : ["Find a workspace page", "Workspace display"]
        ).entries()) {
          await page.setViewportSize({ width: 1440, height: 1000 });
          await page.getByRole("button", { name, exact: true }).click();
          await review(path, locale, `workspace-panel-${index}`);
          await page.keyboard.press("Escape");
        }
        await page.setViewportSize({ width: 390, height: 1000 });
        await page
          .getByRole("button", {
            name: locale === "he" ? "כלים ותצוגה" : "Tools and display",
            exact: true,
          })
          .click();
        await review(path, locale, "mobile-tools");
        await page.keyboard.press("Escape");
        await page.setViewportSize({ width: 390, height: 1000 });
        await page
          .getByRole("button", {
            name: locale === "he" ? "פתיחת ניווט" : "Open navigation",
            exact: true,
          })
          .click();
        await review(path, locale, "mobile-navigation");
        await page.keyboard.press("Escape");
      }
      const dialogs = {
        categories: [
          locale === "he" ? "הוספת קטגוריה ראשית" : "Add main category",
        ],
        services: [locale === "he" ? "הוספת שירות" : "Add service"],
        suppliers: [locale === "he" ? "הוסף ספק" : "Add Supplier"],
        inventory:
          locale === "he"
            ? ["קבלה", "התאמה", "הוצאה"]
            : ["Receive", "Adjust", "Out"],
        finance: [
          locale === "he" ? "אפשרויות דוח" : "Report options",
          locale === "he" ? "השוואת תקופות" : "Compare periods",
          locale === "he" ? "פרטי מלאי" : "Inventory details",
        ],
        analytics: [locale === "he" ? "אפשרויות תצוגה" : "View options"],
      };
      for (const [index, name] of (dialogs[path] || []).entries()) {
        await page.setViewportSize({ width: 1440, height: 1000 });
        const buttons = page.getByRole("button", { name, exact: true });
        let opener;
        for (let i = 0; i < (await buttons.count()); i++)
          if (
            (await buttons.nth(i).isVisible()) &&
            (await buttons.nth(i).isEnabled())
          ) {
            opener = buttons.nth(i);
            break;
          }
        assert.ok(
          opener,
          `${locale}/${path}/${name}: dialog opener must be exercised`,
        );
        await opener.click();
        await expect(page.getByRole("dialog").last()).toBeVisible();
        await review(path, locale, `dialog-${index}`);
        if (path === "services") {
          const add = page.getByRole("dialog").getByRole("button", {
            name: locale === "he" ? "הוספת פריט" : "Add item",
            exact: true,
          });
          for (let item = 0; item < (await add.count()); item++)
            await add.nth(item).click();
          await review(path, locale, "structured-content-draft");
          await page.keyboard.press("Escape");
          await review(path, locale, "discard-content-confirmation");
          await page
            .getByRole("button", {
              name:
                locale === "he" ? "סגירה בלי שמירה" : "Close without saving",
              exact: true,
            })
            .click();
        } else {
          await page.keyboard.press("Escape");
        }
        await expect(page.getByRole("dialog")).toHaveCount(0);
      }
      if (path === "documents") {
        for (const readiness of [false, true]) {
          commerceFixture = {
            section: "documents",
            rows: [
              {
                id: randomUUID(),
                type: "receipt",
                status: "draft",
                readiness,
                revision: 1,
                total_agorot: 11800,
                customer_snapshot: { name: "Synthetic document customer" },
              },
            ],
          };
          await visit(path, locale);
          await page
            .getByRole("button", {
              name: locale === "he" ? "בחירה" : "Select",
              exact: true,
            })
            .first()
            .click();
          await review(
            path,
            locale,
            readiness ? "ready-document-details" : "document-details",
          );
        }
        commerceFixture = undefined;
      }
      if (path === "recurring" || path === "expenses") {
        commerceFixture =
          path === "recurring"
            ? {
                section: path,
                rows: [
                  {
                    id: randomUUID(),
                    name: "Synthetic schedule",
                    status: "active",
                    amount_agorot: 11800,
                    interval_months: 1,
                    next_charge_at: "2026-10-25T08:00:00Z",
                    consent_reference: "SYNTHETIC-QA",
                    revision: 1,
                  },
                ],
              }
            : {
                section: path,
                rows: [
                  {
                    id: randomUUID(),
                    status: "approved",
                    supplier_name: "Synthetic supplier",
                    expense_date: "2026-10-19",
                    gross_agorot: 11800,
                    paid_agorot: 0,
                    revision: 1,
                    items: [
                      {
                        description: "Synthetic item",
                        net_agorot: 10000,
                        vat_agorot: 1800,
                      },
                    ],
                    attachments: [],
                  },
                ],
              };
        await visit(path, locale);
        await page
          .getByRole("button", {
            name: locale === "he" ? "בחירה" : "Select",
            exact: true,
          })
          .first()
          .click();
        await review(path, locale, "selected-record");
        if (path === "recurring") {
          await page
            .getByRole("button", {
              name: locale === "he" ? "ביטול" : "Cancel",
              exact: true,
            })
            .first()
            .click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await review(path, locale, "cancel-confirmation");
          await page.keyboard.press("Escape");
        }
        commerceFixture = undefined;
      }
      if (path === "pos") {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page
          .locator(".mgmt-shell__main")
          .getByRole("button", {
            name: locale === "he" ? "פתיחת קופה" : "Open POS",
            exact: true,
          })
          .click();
        await expect(page.locator("[data-pos-shell]")).toBeVisible();
        await page.waitForTimeout(600);
        await review(path, locale, "workspace");
        await page.setViewportSize({ width: 1440, height: 1000 });
        const customer = page.getByRole("button", {
          name: locale === "he" ? "בחר לקוח" : "Select customer",
          exact: true,
        });
        await customer.click();
        await review(path, locale, "customer-sheet");
        await page.keyboard.press("Escape");
        await expect(page.locator(".mgmt-dialog:visible")).toHaveCount(0);
        // Only local draft additions; never click the action that records/charges a sale.
        const products = page.locator(
          '[data-pos-shell] button[class*="productCard"]:enabled',
        );
        if (await products.count()) {
          await page.setViewportSize({ width: 1440, height: 1000 });
          await products.first().click();
          const picker = page.locator(".mgmt-dialog:visible").last();
          if (await picker.isVisible()) {
            await review(path, locale, "variant-picker");
            await picker
              .locator(".mgmt-dialog__body button:enabled")
              .first()
              .click();
          }
          await review(path, locale, "cart-draft");
          await page.setViewportSize({ width: 390, height: 1000 });
          await page
            .getByRole("button", {
              name:
                locale === "he" ? "פתיחת עגלה ותשלום" : "Open cart and payment",
              exact: true,
            })
            .click();
          await review(path, locale, "mobile-cart");
          const paymentMethods = page.getByRole("group", {
            name: locale === "he" ? "הוספת אמצעי תשלום" : "Add payment method",
            exact: true,
          });
          await paymentMethods.getByRole("button").last().click();
          await review(path, locale, "split-payment-fields");
        }
        await page
          .getByRole("button", {
            name: locale === "he" ? "סגירת קופה" : "Close POS",
            exact: true,
          })
          .click();
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page
          .getByRole("button", {
            name: locale === "he" ? "פתיחת מחשבון" : "Open calculator",
            exact: true,
          })
          .click();
        await review(path, locale, "calculator");
        await page
          .getByRole("button", {
            name: locale === "he" ? "היסטוריה" : "History",
            exact: true,
          })
          .click();
        await review(path, locale, "calculator-history");
        await review(path, locale, "calculator-short", 600);
        const vat = page.getByRole("button", {
          name: locale === "he" ? '+מע"מ' : "+VAT",
          exact: true,
        });
        await vat.focus();
        await expect(vat).toBeInViewport({ ratio: 1 });
        await page
          .getByRole("button", {
            name: locale === "he" ? "היסטוריה" : "History",
            exact: true,
          })
          .focus();
        const clear = page.getByRole("button", {
          name: locale === "he" ? "נקוי היסטוריה" : "Clear History",
          exact: true,
        });
        await clear.click();
        await review(path, locale, "calculator-clear-confirmation");
        await page.keyboard.press("Escape");
        await page
          .getByRole("button", {
            name: locale === "he" ? "סגירת מחשבון" : "Close calculator",
            exact: true,
          })
          .click();
      }
      if (["finance", "analytics", "accounts", "sales"].includes(path)) {
        stage = `date picker ${locale}/${path}`;
        const dateButton = page
          .getByRole("button", {
            name: locale === "he" ? /^טווח תאריכים/ : /^Date range/,
          })
          .first();
        if (await dateButton.isVisible()) {
          await dateButton.click();
          await review(path, locale, "date-picker");
          const custom = page.getByRole("dialog").getByRole("button", {
            name: locale === "he" ? "מותאם אישית" : "Custom",
            exact: true,
          });
          if (await custom.isVisible()) {
            await custom.click();
            await review(path, locale, "custom-dates");
          }
          await page.keyboard.press("Escape");
        }
      }
      if (path === "cash") {
        cashFixture = [
          {
            id: randomUUID(),
            status: "open",
            opened_at: "2026-10-19T08:00:00Z",
            opening_float_agorot: 10000,
            revision: 1,
          },
        ];
        await visit(path, locale);
        await review(path, locale, "active-shift");
        const movement = page.getByLabel(
          locale === "he" ? "סוג תנועה" : "Movement type",
          { exact: true },
        );
        await movement.selectOption("correction");
        await review(path, locale, "cash-correction");
        await page
          .getByRole("button", {
            name: locale === "he" ? "בחירה" : "Select",
            exact: true,
          })
          .first()
          .click();
        await review(path, locale, "selected-shift");
        cashFixture = undefined;
      }
      const tabs = page.getByRole("tab");
      const count = await tabs.count();
      for (let index = 0; index < count; index++) {
        const tab = tabs.nth(index);
        if (!(await tab.isVisible()) || !(await tab.isEnabled())) continue;
        if (path === "commerce-reports" && index === 1) {
          commerceFixture = {
            section: "payments",
            rows: [
              {
                id: randomUUID(),
                intent_id: randomUUID(),
                method: "card",
                state: "succeeded",
                amount_agorot: 11800,
                currency: "ILS",
                collection_kind: "sandbox",
                refunds: [
                  {
                    id: randomUUID(),
                    state: "unknown",
                    amount_agorot: 1000,
                    reason: "Synthetic refund only",
                    created_at: fixtureRange.generatedAt,
                  },
                ],
              },
            ],
          };
        }
        await tab.click();
        await page.waitForTimeout(100);
        await review(path, locale, `tab-${index}`);
        if (path === "commerce-reports" && index === 1) {
          await page
            .getByRole("button", {
              name: locale === "he" ? "בחירה" : "Select",
              exact: true,
            })
            .first()
            .click();
          await review(path, locale, "payment-refund-fields");
          await page
            .getByRole("button", {
              name:
                locale === "he" ? "שליחת בקשת החזר" : "Submit refund request",
              exact: true,
            })
            .click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await review(path, locale, "refund-confirmation");
          await page.keyboard.press("Escape");
          commerceFixture = undefined;
        }
      }
      const groupNames = await page
        .locator('div[role="group"][class*="choices"]')
        .evaluateAll((groups) =>
          groups.map((group) => group.getAttribute("aria-label")),
        );
      for (const [groupIndex, name] of groupNames.entries()) {
        const group = page.getByRole("group", { name, exact: true });
        if (!(await group.isVisible())) continue;
        const options = group.getByRole("button");
        for (let index = 0; index < (await options.count()); index++) {
          await options.nth(index).click();
          await page.waitForTimeout(100);
          await review(path, locale, `choice-${groupIndex}-${index}`);
          if (
            path === "sales" &&
            (await page
              .getByRole("button", {
                name: locale === "he" ? "סגירת קופה" : "Close POS",
                exact: true,
              })
              .isVisible())
          )
            await page
              .getByRole("button", {
                name: locale === "he" ? "סגירת קופה" : "Close POS",
                exact: true,
              })
              .click();
        }
        await options.first().click();
        if (
          path === "sales" &&
          (await page
            .getByRole("button", {
              name: locale === "he" ? "סגירת קופה" : "Close POS",
              exact: true,
            })
            .isVisible())
        )
          await page
            .getByRole("button", {
              name: locale === "he" ? "סגירת קופה" : "Close POS",
              exact: true,
            })
            .click();
      }
      if (path === "products") {
        const products = [...cache.entries()].find(([key]) =>
          key.startsWith("/api/management/products?"),
        )?.[1]?.products;
        if (products?.[0]?.id) {
          const edit = `products/${products[0].id}`;
          await visit(edit, locale);
          await review("products/edit", locale);
          const tabs = page.locator(
            'nav[aria-label] button[aria-current], nav[aria-label] button[class*="sectionNavItem"]',
          );
          for (let index = 0; index < (await tabs.count()); index++) {
            if (!(await tabs.nth(index).isEnabled())) continue;
            await tabs.nth(index).click();
            await page.waitForTimeout(100);
            await review("products/edit", locale, `tab-${index}`);
            const editorDialogs =
              locale === "he"
                ? ["הוסף וריאנט", "הוסף מכתובת", "ערוך טקסט חלופי"]
                : ["Add variant", "Add by URL", "Edit alt text"];
            for (const [dialogIndex, name] of editorDialogs.entries()) {
              const button = page
                .locator(".mgmt-shell__main")
                .getByRole("button", { name, exact: true })
                .first();
              if (!(await button.isVisible()) || !(await button.isEnabled()))
                continue;
              await button.click();
              await review(
                "products/edit",
                locale,
                `tab-${index}-dialog-${dialogIndex}`,
              );
              const lastAction = page
                .locator(".mgmt-dialog:visible .mgmt-dialog__footer button")
                .last();
              await lastAction.focus();
              await expect(lastAction).toBeInViewport({ ratio: 1 });
              await page.keyboard.press("Escape");
              await expect(page.locator(".mgmt-dialog:visible")).toHaveCount(0);
            }
          }
        }
      }
    }
  if (
    (!process.env.SPACING_PATHS && process.env.SPACING_ADMIN !== "0") ||
    process.env.SPACING_ADMIN === "1"
  ) {
    for (const result of await Promise.all([
      service
        .from("user_roles")
        .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id" }),
      service.from("profiles").update({ role: "admin" }).eq("id", userId),
    ]))
      if (result.error)
        throw new Error("Disposable admin role assignment failed");
    cache.clear();
    for (const locale of locales)
      for (const path of paths) {
        cashFixture = path === "cash" ? [] : undefined;
        await visit(path, locale);
        await review(path, locale, "admin-page");
        cashFixture = undefined;
      }
  }
  await page.waitForLoadState("networkidle");
  await context.unrouteAll({ behavior: "ignoreErrors" });
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        reportingFixtures,
        initialRole,
        reports,
        apiFailures,
        blockedWrites,
        errors,
      },
      null,
      2,
    ),
  );
  const total = reports.reduce((n, r) => n + r.findings.length, 0);
  console.log(
    JSON.stringify({
      layouts: reports.length,
      findings: total,
      overflows: reports.filter((r) => r.overflow > 1).length,
      apiFailures,
      blockedWrites,
      errors,
    }),
  );
  assert.deepEqual(blockedWrites, [], "QA must never attempt business writes");
  assert.deepEqual(
    apiFailures,
    [],
    "Do not mistake failed data loads for component coverage",
  );
  assert.deepEqual(errors, [], "No browser runtime errors");
  if (!baseline) {
    assert.equal(total, 0, "Component spacing findings need review");
    assert.equal(
      reports.filter((r) => r.overflow > 1).length,
      0,
      "No page overflow",
    );
  }
} catch (error) {
  console.error(
    `${stage}: ${String(error.message || error)
      .split("\n")
      .slice(0, 8)
      .join("\n")}`,
  );
  await page
    ?.screenshot({ path: `${output}/failure.png`, fullPage: true })
    .catch(() => {});
  process.exitCode = 1;
} finally {
  try {
    await context?.unrouteAll({ behavior: "ignoreErrors" });
    await browser?.close();
  } finally {
    if (userId) {
      const deleted = await service.auth.admin.deleteUser(userId);
      if (deleted.error) throw new Error("Disposable CEO cleanup failed");
      console.log("Disposable CEO deleted");
    }
  }
}
