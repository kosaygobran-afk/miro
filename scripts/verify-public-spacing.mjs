// Public/customer geometry review. UI-only fixtures never authorize business writes.
// PUBLIC_SPACING_BASE_URL=http://127.0.0.1:3228 node scripts/verify-public-spacing.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.PUBLIC_SPACING_BASE_URL || "http://127.0.0.1:3000";
const output =
  process.env.PUBLIC_SPACING_OUTPUT_DIR || "/tmp/miro-public-spacing";
const baseline = process.argv.includes("--baseline");
const widths = (process.env.PUBLIC_SPACING_WIDTHS || "1440,1024,390,320")
  .split(",")
  .map(Number);
const themes = (process.env.PUBLIC_SPACING_THEMES || "dark,medium,light").split(
  ",",
);
const locales = (process.env.PUBLIC_SPACING_LOCALES || "en,he").split(",");
const scoped = process.env.PUBLIC_SPACING_PATHS?.split(",");
const reports = [],
  errors = [],
  blockedWrites = [],
  accessibility = [];
const detailStates = new Set();
let browser,
  context,
  page,
  userId,
  service,
  stage = "start";
const intentId = randomUUID();
let paymentState = "unavailable",
  mockFeedback = false;
const icons = [
  ".premium-icon-button",
  ".premium-account-action",
  ".premium-account-trigger",
  ".sf-product-quick-preview",
  ".sf-save-button",
  ".sf-add-cart-button.is-compact",
  ".sf-product-expand",
  ".sf-dialog-close",
  ".sf-search button",
  ".sf-subcategory-step",
  ".sf-hero-controls button",
  ".sf-company-toggle",
  ".sf-moving-rail-preview-button",
  ".sf-gallery-arrow",
  ".sf-hover-preview-arrow",
  ".sf-hover-preview-close",
  ".sf-image-magnifier-toggle",
  ".experience-icon",
  ".experience-capabilities svg",
  ".sf-cart-heading-icon",
  ".account-icon",
  ".account-panel-title > svg",
  ".account-panel-heading h2 > svg",
  ".premium-footer-consult > svg",
].join(",");

function inspect({ icons }) {
  const visible = (e) =>
    e.checkVisibility({ checkVisibilityCSS: true }) &&
    !e.closest('[hidden], [aria-hidden="true"]:not(svg)') &&
    e.getBoundingClientRect().width > 1;
  const painted = (e) => {
    const r = e.getBoundingClientRect();
    let left = r.left,
      right = r.right,
      top = r.top,
      bottom = r.bottom;
    for (let p = e.parentElement; p; p = p.parentElement) {
      const c = getComputedStyle(p),
        b = p.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(c.overflowX)) {
        left = Math.max(left, b.left);
        right = Math.min(right, b.right);
      }
      if (/auto|scroll|hidden|clip/.test(c.overflowY)) {
        top = Math.max(top, b.top);
        bottom = Math.min(bottom, b.bottom);
      }
    }
    return {
      left,
      right,
      top,
      bottom,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    };
  };
  const name = (e) => ({
    tag: e.tagName.toLowerCase(),
    class: e.getAttribute("class"),
    label: (e.getAttribute("aria-label") || e.textContent || "")
      .trim()
      .slice(0, 100),
  });
  const findings = [];
  const frames = [...document.querySelectorAll(icons)].filter((e) => {
    // Decorative icon tiles are aria-hidden by design; their frame still needs QA.
    return (
      e.checkVisibility({ checkVisibilityCSS: true }) &&
      e.getBoundingClientRect().width > 1
    );
  });
  for (const e of frames) {
    const c = getComputedStyle(e),
      r = e.getBoundingClientRect();
    const radius = parseFloat(c.borderTopLeftRadius);
    if (
      radius > Math.min(r.width, r.height) / 2 - 0.5 ||
      parseFloat(c.borderTopWidth) < 1 ||
      c.borderTopStyle === "none"
    )
      findings.push({
        kind: "icon-frame",
        element: name(e),
        radius,
        border: c.borderTop,
        width: r.width,
        height: r.height,
      });
    if (
      e.matches(".sf-image-magnifier-toggle") &&
      parseFloat(getComputedStyle(e, "::before").borderTopWidth) > 0
    )
      findings.push({ kind: "duplicate-icon-frame", element: name(e) });
  }
  const controls = [
    ...document.querySelectorAll(
      'button,input:not([type="hidden"]),select,textarea,summary,a.miro-button,a[role="menuitem"]',
    ),
  ].filter(visible);
  const connected =
    ".premium-theme-selector,.premium-search,.premium-mobile-search,.sf-search,.sf-cart-quantity,.sf-cart-stepper";
  for (let i = 0; i < controls.length; i++)
    for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i],
        b = controls[j];
      if (a.contains(b) || b.contains(a)) continue;
      if (a.closest(connected)?.contains(b)) continue;
      // Overlay controls deliberately paint over the page below. Compare within each layer.
      const layer = (e) =>
        e.closest(
          '[role="dialog"],[role="menu"],.premium-mobile-navigation,.premium-header,.premium-topbar',
        ) || document.body;
      if (layer(a) !== layer(b)) continue;
      const x = painted(a),
        y = painted(b);
      if (
        Math.min(x.right, y.right) - Math.max(x.left, y.left) > 2 &&
        Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 2
      )
        findings.push({ kind: "control-overlap", a: name(a), b: name(b) });
    }
  for (const form of document.querySelectorAll(
    "main form,main fieldset,.miro-contact-form > .block",
  )) {
    if (!visible(form)) continue;
    const children = [...form.children].filter(visible);
    for (let i = 1; i < children.length; i++) {
      const a = children[i - 1],
        b = children[i];
      const x = painted(a),
        y = painted(b);
      if (!x.width || !x.height || !y.width || !y.height) continue;
      if (
        Math.min(x.right, y.right) - Math.max(x.left, y.left) > 8 &&
        y.top >= x.bottom - 1 &&
        y.top - x.bottom < 7.5
      )
        findings.push({
          kind: "form-content-gap",
          gap: y.top - x.bottom,
          a: name(a),
          b: name(b),
        });
    }
  }
  for (const label of document.querySelectorAll("main label")) {
    if (!visible(label)) continue;
    const input = label.querySelector(
      'input:not([type="checkbox"]):not([type="radio"]),textarea,select',
    );
    if (!input || !visible(input)) continue;
    const r = painted(input);
    const textNodes = [...label.childNodes].filter(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
    );
    for (const node of textNodes) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const t = range.getBoundingClientRect();
      if (t.width && r.top >= t.bottom - 1 && r.top - t.bottom < 5.5)
        findings.push({
          kind: "label-control-gap",
          gap: r.top - t.bottom,
          label: name(label),
        });
    }
  }
  for (const row of document.querySelectorAll(
    ".sf-product-actions,.sf-moving-rail-actions,.sf-hover-preview-footer,.sf-product-actions-detail",
  )) {
    if (!visible(row)) continue;
    const items = [...row.children].filter(visible);
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++) {
        const a = painted(items[i]),
          b = painted(items[j]);
        if (!a.width || !b.width) continue;
        const vertical = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const horizontal =
          Math.min(a.right, b.right) - Math.max(a.left, b.left);
        let gap;
        if (vertical > 8)
          gap = Math.max(a.left, b.left) - Math.min(a.right, b.right);
        else if (horizontal > 8)
          gap = Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom);
        if (gap !== undefined && gap >= -1 && gap < 7.5)
          findings.push({
            kind: "action-gap",
            gap,
            a: name(items[i]),
            b: name(items[j]),
          });
      }
  }
  return {
    overflow: document.documentElement.scrollWidth - innerWidth,
    frames: frames.length,
    controls: controls.length,
    findings,
  };
}

await mkdir(output, { recursive: true });
const inventory = [];
for (const group of ["(public)", "(auth)"]) {
  const files = await readdir(`src/app/[locale]/${group}`, { recursive: true });
  inventory.push(
    ...files
      .filter((f) => f === "page.tsx" || f.endsWith("/page.tsx"))
      .filter((f) => !f.includes("["))
      .map((f) => (f === "page.tsx" ? "" : f.slice(0, -9))),
  );
}
async function save() {
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      { inventory, reports, errors, blockedWrites, accessibility },
      null,
      2,
    ),
  );
}
async function visit(path, locale) {
  stage = `visit ${locale}/${path}`;
  const response = await page.goto(
    `${base}/${locale}${path ? "/" + path : ""}`,
    { waitUntil: "networkidle", timeout: 45000 },
  );
  assert.equal(response.status(), 200, stage);
  await expect(page.locator("main h1").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
async function review(path, locale, state = "page", capture = true) {
  stage = `review ${locale}/${path}/${state}`;
  await page.waitForLoadState("networkidle");
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of themes) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.appearanceVersion = "2";
        document.documentElement.dataset.theme = theme;
      }, theme);
      const r = await page.evaluate(inspect, { icons });
      reports.push({ path, locale, state, width, theme, ...r });
      if (
        theme === themes[0] &&
        ((capture && (width === 390 || width === 1440)) || r.findings.length)
      ) {
        // Full-page captures otherwise paint fixed/sticky chrome at the
        // validation focus's scroll offset, misleadingly across the document.
        const top = await page.evaluate(() => scrollY);
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({
          path: `${output}/${locale}-${path.replaceAll("/", "-") || "home"}-${state}-${width}.png`,
          fullPage: true,
        });
        await page.evaluate((top) => scrollTo(0, top), top);
      }
    }
  }
  const r = reports.filter(
    (r) => r.path === path && r.locale === locale && r.state === state,
  );
  console.log(
    `${r.some((r) => r.findings.length || r.overflow > 1) ? "REVIEW" : "PASS"} ${locale}/${path || "home"}/${state}: ${r.reduce((n, r) => n + r.findings.length, 0)} findings`,
  );
  await save();
}
async function axe(label) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  accessibility.push({
    label,
    violations: r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        reason: n.failureSummary,
      })),
    })),
  });
  await save();
}

try {
  browser = await chromium.launch();
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await context.route("**/api/**", async (route) => {
    const u = new URL(route.request().url()),
      method = route.request().method();
    if (u.pathname === "/api/track") return route.fulfill({ status: 204 });
    if (u.pathname === "/api/commerce/eligibility")
      return route.fulfill({ json: { eligible: false } });
    if (
      u.pathname === `/api/commerce/intents/${intentId}` &&
      method === "GET"
    ) {
      if (paymentState === "unavailable")
        return route.fulfill({ status: 503, json: { error: "unavailable" } });
      return route.fulfill({
        json: {
          intent: {
            id: intentId,
            status: paymentState === "complete" ? "paid" : "awaiting_payment",
            total_agorot: 11800,
            remaining_agorot: paymentState === "complete" ? 0 : 11800,
            channel: "website",
            read_only_expired: paymentState === "expired",
            order_number: paymentState === "complete" ? "QA-ONLY-001" : null,
            order_id: paymentState === "complete" ? randomUUID() : null,
            currency: "ILS",
            expires_at: "2030-01-01T00:00:00Z",
          },
          resume_pos_url: null,
          attempts:
            paymentState === "pending"
              ? [
                  {
                    id: randomUUID(),
                    state: "unknown",
                    method: "credit_card",
                    amount_agorot: 11800,
                    idempotency_key: "synthetic-only",
                  },
                ]
              : [],
          readiness: {
            configured: paymentState !== "disabled",
            environment: "sandbox",
            capabilities: {
              hostedCard: "enabled",
              bit: "enabled",
              installments: "enabled",
            },
          },
        },
      });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      if (
        mockFeedback &&
        ["/api/account", "/api/enquiries", "/api/auth/resend-reset"].includes(
          u.pathname,
        )
      )
        return route.fulfill({
          status: 503,
          json: { code: "unavailable", error: "Synthetic QA failure" },
        });
      blockedWrites.push({ path: u.pathname, method });
      return route.fulfill({
        status: 503,
        json: { error: "qa_write_blocked" },
      });
    }
    await route.continue();
  });
  await visit("store", "en");
  for (let count = 0; count < 20; count++) {
    const more = page.locator(".sf-load-more button");
    if (!(await more.isVisible())) break;
    await more.click();
  }
  const storeLinks = await page.locator("a[href]").evaluateAll((nodes) =>
    nodes
      .map((n) => n.getAttribute("href"))
      .filter((h) => /^\/en\/store\/[^?#]+$/.test(h))
      .map((h) => h.slice(4)),
  );
  await visit("services", "en");
  const serviceLinks = await page.locator("a[href]").evaluateAll((nodes) =>
    nodes
      .map((n) => n.getAttribute("href"))
      .filter((h) => /^\/en\/services\/[^?#]+$/.test(h))
      .map((h) => h.slice(4)),
  );
  const paths = scoped || [
    ...new Set([...inventory, "store", ...storeLinks, ...serviceLinks]),
  ];
  await writeFile(
    `${output}/route-inventory.json`,
    JSON.stringify({ static: inventory, discovered: paths }, null, 2),
  );
  for (const locale of locales)
    for (const path of paths.filter(
      (path) => !["pay", "account"].includes(path),
    )) {
      await visit(path, locale);
      await review(path, locale, "page", !path.match(/^store\/[^/]+\/[^/]+$/));
      if (/^store\/[^/]+$/.test(path)) {
        const expand = page.locator(".sf-departments-controls button");
        if (await expand.isVisible()) {
          await expand.click();
          await review(path, locale, "expanded-categories");
        }
        const children = await page
          .locator(".sf-subcategory-links a[href]")
          .evaluateAll((nodes) =>
            nodes
              .map((n) => n.getAttribute("href"))
              .filter((h) => h.includes("subcategory=")),
          );
        for (const href of [...new Set(children)]) {
          await visit(href.slice(locale.length + 2), locale);
          await review(
            path,
            locale,
            `subcategory-${new URL(href, base).searchParams.get("subcategory")}`,
          );
        }
      }
      if (/^store\/[^/]+\/[^/]+$/.test(path)) {
        for (const [key, selector] of [
          ["gallery", ".sf-gallery-arrow-next"],
          ["magnifier", ".sf-image-magnifier-toggle"],
          ["variant", ".sf-variant-chip"],
        ]) {
          if (detailStates.has(`${locale}:${key}`)) continue;
          const controls = page.locator(selector);
          const button = key === "variant" ? controls.nth(1) : controls.first();
          if (
            (key === "variant" && (await controls.count()) < 2) ||
            !(await button.isVisible()) ||
            !(await button.isEnabled())
          )
            continue;
          await button.focus();
          await button.press("Space");
          await review(path, locale, key);
          if (key === "magnifier") await button.press("Space");
          detailStates.add(`${locale}:${key}`);
        }
      }
      if (
        [
          "contact",
          "login",
          "signup",
          "forgot-password",
          "check-email",
        ].includes(path)
      )
        await axe(`${locale}/${path}`);
      if (path === "contact") {
        await page.locator(".miro-contact-form button[type=submit]").click();
        await expect(page.locator("#contact-error-summary")).toBeVisible();
        await review(path, locale, "validation");
        await axe(`${locale}/contact validation`);
      }
      if (path === "services") {
        for (const [i, summary] of (
          await page.locator(".experience-faq summary").all()
        ).entries()) {
          await summary.click();
          await review(path, locale, `faq-${i}`);
          await summary.click();
        }
      }
      if (path === "store") {
        const expand = page.locator(".sf-departments-controls button");
        if (await expand.isVisible()) {
          await expand.click();
          await review(path, locale, "expanded-categories");
        }
        const search = page.locator(".sf-search input");
        if (await search.isVisible()) {
          await search.fill("no-such-synthetic-model");
          await expect(page.locator(".sf-product-card")).toHaveCount(0);
          await review(path, locale, "empty-search");
          await page.locator(".sf-search button").click();
        }
        const preview = page.locator(".sf-product-quick-preview").first();
        if (await preview.isVisible()) {
          await page.setViewportSize({ width: 1440, height: 1000 });
          await preview.click();
          await expect(page.locator(".sf-hover-preview")).toBeVisible();
          await review(path, locale, "preview");
          await axe(`${locale}/product preview`);
          await page.keyboard.press("Escape");
        }
      }
    }
  if (!scoped || scoped.includes("cart")) {
    for (const locale of locales) {
      await page.evaluate(() =>
        localStorage.setItem(
          "miro-cart-v1",
          JSON.stringify([
            {
              productId: "synthetic-qa-item",
              variantId: null,
              slug: "qa-only",
              category: "cameras",
              name: "Synthetic QA cart product — long bilingual name מוצר לבדיקה בלבד",
              imageUrl: null,
              unitPrice: 118,
              quantity: 2,
            },
          ]),
        ),
      );
      await visit("cart", locale);
      await review("cart", locale, "populated");
      await axe(`${locale}/cart populated`);
      await visit("checkout", locale);
      await review("checkout", locale, "populated");
      await page.locator(".sf-checkout-submit").click();
      await expect(page.locator(".sf-checkout-error")).toBeVisible();
      await review("checkout", locale, "validation");
      await axe(`${locale}/checkout validation`);
      await page.evaluate(() => localStorage.removeItem("miro-cart-v1"));
    }
  }
  if (!scoped || scoped.includes("pay")) {
    for (const locale of locales)
      for (const state of [
        "unavailable",
        "disabled",
        "ready",
        "pending",
        "expired",
        "complete",
      ]) {
        paymentState = state;
        await visit(`pay/${intentId}`, locale);
        await review("pay", locale, state);
        await axe(`${locale}/pay ${state}`);
      }
  }
  if (!scoped || scoped.includes("account")) {
    service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const email = `public-spacing-${randomUUID()}@miro-test.local`,
      password = `QA-${randomUUID()}!`;
    const actor = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (actor.error) throw new Error("Disposable customer creation failed");
    userId = actor.data.user.id;
    for (const result of await Promise.all([
      service
        .from("user_roles")
        .upsert(
          { user_id: userId, role: "customer" },
          { onConflict: "user_id" },
        ),
      service
        .from("profiles")
        .update({
          role: "customer",
          account_status: "active",
          full_name: "Public Customer QA",
        })
        .eq("id", userId),
    ]))
      if (result.error) throw new Error("Disposable customer setup failed");
    await visit("login", "en");
    await page.locator("input[name=email]").fill(email);
    await page.locator("input[name=password]").fill(password);
    await page.locator("input[name=password]").press("Enter");
    await page.waitForURL((u) => u.pathname !== "/en/login");
    for (const locale of locales) {
      await visit("account", locale);
      await review("account", locale);
      await axe(`${locale}/account`);
      const profile = page.locator(".account-form").first();
      await profile.locator("input[name=phone]").fill("0501234567");
      mockFeedback = true;
      await profile.locator("button").click();
      await expect(profile.locator("[role=status]")).not.toBeEmpty();
      await review("account", locale, "profile-error");
      mockFeedback = false;
      const request = page.locator(".account-form").nth(1);
      await request
        .locator("textarea")
        .fill(
          "Synthetic browser-only request. This is never submitted to the server.",
        );
      mockFeedback = true;
      await request.locator("button").click();
      await expect(request.locator("[role=status]")).not.toBeEmpty();
      await review("account", locale, "request-error");
      mockFeedback = false;
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.locator(".premium-account-trigger").first().click();
      await expect(page.getByRole("menu")).toBeVisible();
      await review("account", locale, "account-menu");
      await page.keyboard.press("Escape");
    }
    // A favourite belongs only to the disposable actor. No product, order,
    // request or invoice is created/changed to populate account presentation.
    const product = await service
      .from("products")
      .select("id")
      .eq("status", "active")
      .limit(1)
      .single();
    if (product.error)
      throw new Error("Saved-product fixture source unavailable");
    const saved = await service
      .from("saved_products")
      .insert({ user_id: userId, product_id: product.data.id });
    if (saved.error) throw new Error("Disposable favourite setup failed");
    for (const locale of locales) {
      await visit("account", locale);
      await expect(page.locator(".account-saved-card")).toHaveCount(1);
      await review("account", locale, "saved-product");
      await axe(`${locale}/account saved product`);
    }
  }
  const summary = {
    layouts: reports.length,
    findings: reports.reduce((n, r) => n + r.findings.length, 0),
    overflows: reports.filter((r) => r.overflow > 1).length,
    runtimeErrors: errors.length,
    blockedWrites,
    axeViolations: accessibility.filter((a) => a.violations.length).length,
  };
  console.log(JSON.stringify(summary));
  await save();
  assert.deepEqual(blockedWrites, [], "No business writes attempted");
  assert.deepEqual(errors, [], "No browser runtime errors");
  if (!baseline) {
    assert.equal(summary.findings, 0, "Spacing/frame findings need review");
    assert.equal(summary.overflows, 0, "Page overflow");
    assert.equal(
      summary.axeViolations,
      0,
      "Accessibility findings need review",
    );
  }
} catch (e) {
  console.error(
    `${stage}: ${String(e.message).split("\n").slice(0, 8).join("\n")}`,
  );
  process.exitCode = 1;
  await save();
  await page
    ?.screenshot({ path: `${output}/failure.png`, fullPage: true })
    .catch(() => {});
} finally {
  try {
    await context?.unrouteAll({ behavior: "ignoreErrors" });
    await browser?.close();
  } finally {
    if (userId) {
      const saved = await service
        .from("saved_products")
        .delete()
        .eq("user_id", userId);
      if (saved.error) {
        console.error(
          "Disposable favourite cleanup failed; deleting the owning actor",
        );
        process.exitCode = 1;
      }
      const result = await service.auth.admin.deleteUser(userId);
      if (result.error) throw new Error("Disposable customer cleanup failed");
      console.log("PASS disposable customer deleted");
    }
  }
}
