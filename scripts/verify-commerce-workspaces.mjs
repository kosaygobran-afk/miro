import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const base = process.env.COMMERCE_NEXT_URL;
const actors = JSON.parse(process.env.COMMERCE_TEST_ACTORS || "{}");
if (!base || !actors.admin || !actors.ceo)
  throw new Error("Fixture URLs/actors missing");
const cookieName = "sb-127-auth-token";
function cookieSession(actor) {
  const session = {
    access_token: actor.token,
    refresh_token: `refresh-${actor.token}`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: actor.id,
      aud: "authenticated",
      role: "authenticated",
      email: actor.email,
      app_metadata: {},
      user_metadata: { full_name: actor.name },
    },
  };
  return `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
}
function authHeaders(actor) {
  return {
    cookie: `${cookieName}=${cookieSession(actor)}`,
    origin: base,
    "content-type": "application/json",
  };
}
const navigationRetries = [];
async function navigateWorkspace(page, target) {
  try {
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch (error) {
    if (error.name !== "TimeoutError" && !String(error).includes("ERR_ABORTED"))
      throw error;
    navigationRetries.push({ target, reason: error.name });
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 45000 });
  }
}
async function post(page, actor, route, action, payload) {
  return page.request.post(`${base}/api/management/commerce/${route}`, {
    headers: authHeaders(actor),
    data: { action, payload },
  });
}
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  const expensePayload = {
    supplier: { name: "Fixture Supplier", business_number: "TEST-001" },
    document: {
      reference: "FIXTURE-EXP-001",
      document_date: "2026-10-06",
      expense_date: "2026-10-06",
      category: "office",
      description: "isolated integration fixture",
      currency: "ILS",
      deductibility: "pending",
    },
    items: [
      {
        description: "fixture service",
        quantity: 1,
        net_agorot: 10000,
        vat_agorot: 1800,
        gross_agorot: 11800,
      },
    ],
    attachments: [],
  };
  const saved = await post(
    page,
    actors.admin,
    "expenses",
    "expense_save",
    expensePayload,
  );
  assert.equal(
    saved.status(),
    200,
    `expense_save: ${saved.status()} ${await saved.text()}`,
  );
  const savedJson = await saved.json();
  const expense = savedJson.data;
  assert.equal(expense.gross_agorot, 11800);
  assert.equal(expense.state, "draft");

  const filtered = await page.request.get(
    `${base}/api/management/commerce/expenses?id=${expense.id}&status=draft`,
    { headers: authHeaders(actors.admin) },
  );
  assert.equal(filtered.status(), 200);
  const filteredJson = await filtered.json();
  assert.equal(filteredJson.total_count, 1);
  assert.equal(filteredJson.rows[0].id, expense.id);

  const submitted = await post(
    page,
    actors.admin,
    "expenses",
    "expense_submit",
    { expense_id: expense.id, expected_revision: 1 },
  );
  assert.equal(
    submitted.status(),
    200,
    `expense_submit: ${await submitted.text()}`,
  );
  const deniedApproval = await post(
    page,
    actors.admin,
    "expenses",
    "expense_approve",
    {
      expense_id: expense.id,
      expected_revision: 2,
      decision: "approve",
      note: "test",
    },
  );
  assert.equal(
    deniedApproval.status(),
    403,
    `admin unexpectedly approved: ${await deniedApproval.text()}`,
  );
  const approved = await post(page, actors.ceo, "expenses", "expense_approve", {
    expense_id: expense.id,
    expected_revision: 2,
    decision: "approve",
    note: "isolated test approval",
  });
  assert.equal(
    approved.status(),
    200,
    `CEO approval failed: ${await approved.text()}`,
  );
  const paymentPayload = {
    expense_id: expense.id,
    amount_agorot: 11800,
    method: "bank_transfer",
    effect_key: `integration-expense-${expense.id}`,
  };
  const paid = await post(
    page,
    actors.admin,
    "expenses",
    "expense_pay",
    paymentPayload,
  );
  assert.equal(
    paid.status(),
    200,
    `expense_pay: ${paid.status()} ${await paid.text()}`,
  );
  assert.equal((await paid.json()).data.state, "paid");
  const paidReplay = await post(
    page,
    actors.admin,
    "expenses",
    "expense_pay",
    paymentPayload,
  );
  assert.equal(
    paidReplay.status(),
    200,
    `idempotent expense payment retry: ${await paidReplay.text()}`,
  );

  const settings = await page.request.get(
    `${base}/api/management/commerce/settings`,
    { headers: authHeaders(actors.admin) },
  );
  assert.equal(
    settings.status(),
    200,
    `commerce_read: ${await settings.text()}`,
  );
  assert.equal(
    (await settings.json()).readiness.official_issuance_enabled,
    false,
  );

  // Unauthenticated writes must stop at the API boundary.
  const unauthenticated = await page.request.post(
    `${base}/api/management/commerce/expenses`,
    {
      headers: { origin: base, "content-type": "application/json" },
      data: { action: "expense_save", payload: expensePayload },
    },
  );
  assert.equal(
    unauthenticated.status(),
    401,
    `unauthenticated write was accepted: ${await unauthenticated.text()}`,
  );

  const inactiveRoute = await page.request.get(
    `${base}/api/management/commerce/settings`,
    { headers: authHeaders(actors.inactive) },
  );
  assert.equal(
    inactiveRoute.status(),
    401,
    `inactive management actor reached the application route: ${await inactiveRoute.text()}`,
  );
  const inactiveDatabaseRpc = await fetch(
    `${process.env.COMMERCE_FIXTURE_URL}/rest/v1/rpc/commerce_write`,
    {
      method: "POST",
      headers: {
        apikey: process.env.COMMERCE_TEST_PUBLISHABLE_KEY,
        authorization: `Bearer ${actors.inactive.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        p_action: "cash_open",
        p_payload: { opening_float_agorot: 1 },
      }),
    },
  );
  assert.equal(
    inactiveDatabaseRpc.status,
    403,
    `inactive actor reached commerce_write SQL: ${await inactiveDatabaseRpc.text()}`,
  );

  const evidenceDir =
    process.env.COMMERCE_OUTPUT_DIR ||
    process.env.COMMERCE_EVIDENCE_DIR ||
    process.env.REPORTING_OUTPUT_DIR ||
    path.join(os.tmpdir(), `miro-commerce-browser-${process.pid}`);
  await mkdir(evidenceDir, { recursive: true });
  await context.addCookies([
    {
      name: cookieName,
      value: cookieSession(actors.ceo),
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.addInitScript(() => {
    const theme = new URL(location.href).searchParams.get("__qa_theme");
    if (theme) localStorage.setItem("miro-theme", theme);
    window.__commerceCsp = [];
    document.addEventListener("securitypolicyviolation", (event) =>
      window.__commerceCsp.push({
        directive: event.violatedDirective,
        blocked: event.blockedURI,
      }),
    );
  });
  const pageErrors = [];
  page.on("pageerror", (error) =>
    pageErrors.push(`${new URL(page.url()).pathname}: ${error.message}`),
  );
  const routes = [
    "expenses",
    "documents",
    "cash",
    "recurring",
    "integrations",
    "commerce-reports",
    "pos",
  ];
  const locales = ["en", "he"];
  const routeHeadings = {
    expenses: { en: "Expense management", he: "ניהול הוצאות" },
    documents: { en: "Documents & numbering", he: "מסמכים ומספרים" },
    cash: { en: "Cash management", he: "ניהול קופה" },
    recurring: { en: "Recurring billing", he: "חיובים מחזוריים" },
    integrations: {
      en: "Business identity & integrations",
      he: "זהות עסקית ושילובים",
    },
    "commerce-reports": { en: "Commerce reports", he: "דוחות מסחר" },
    pos: { en: "Point of sale", he: "קופה" },
  };
  const widths = [320, 390, 768, 1440];
  const themes = ["dark", "medium", "light"];
  const overflows = [];
  const cspViolations = [];
  const pageCount = [];
  for (const route of routes) {
    for (const locale of locales) {
      for (const width of widths) {
        for (const theme of themes) {
          await page.setViewportSize({ width, height: 900 });
          const target = `${base}/${locale}/admin/${route}?__qa_theme=${theme}`;
          await navigateWorkspace(page, target);
          assert.equal(
            new URL(page.url()).pathname,
            `/${locale}/admin/${route}`,
            `${locale}/${route} did not render as an authenticated workspace`,
          );
          await page
            .locator("main")
            .waitFor({ state: "visible", timeout: 15000 });
          await page
            .waitForLoadState("networkidle", { timeout: 5000 })
            .catch(() => {});
          await page
            .getByRole("heading", {
              name: routeHeadings[route][locale],
              exact: true,
            })
            .first()
            .waitFor({ state: "visible", timeout: 15000 });
          await page.waitForTimeout(60);
          const state = await page.evaluate(() => ({
            theme: document.documentElement.dataset.theme,
            lang: document.documentElement.lang,
            width: window.innerWidth,
            bodyWidth: document.documentElement.scrollWidth,
            controls: document.querySelectorAll(
              "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])",
            ).length,
            csp: window.__commerceCsp || [],
          }));
          assert.equal(
            state.theme,
            theme,
            `${locale}/${route} theme bootstrap ${theme}`,
          );
          assert.equal(
            state.lang.slice(0, 2),
            locale,
            `${locale}/${route} document language`,
          );
          if (state.bodyWidth > state.width)
            overflows.push(
              `${locale}/${route}/${width}/${theme}: ${state.bodyWidth}px`,
            );
          cspViolations.push(
            ...state.csp.map(
              (row) => `${locale}/${route}/${row.directive}:${row.blocked}`,
            ),
          );
          assert.ok(
            state.controls > 0,
            `${locale}/${route} has no keyboard-actionable controls`,
          );
          if (route === "expenses" && width === 320 && theme === "dark") {
            await page.keyboard.press("Tab");
            const focused = await page.evaluate(
              () => document.activeElement?.tagName !== "BODY",
            );
            assert.ok(focused, "Tab did not move focus into expense workspace");
          }
          if (
            (locale === "en" && width === 320 && theme === "light") ||
            (locale === "he" && width === 1440 && theme === "dark")
          ) {
            await page.screenshot({
              path: path.join(
                evidenceDir,
                `${route}-${locale}-${width}-${theme}.png`,
              ),
              fullPage: true,
            });
          }
          pageCount.push(`${locale}/${route}/${width}/${theme}`);
        }
      }
    }
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const route of routes) {
    for (const locale of locales) {
      await page.setViewportSize({ width: 390, height: 844 });
      await navigateWorkspace(
        page,
        `${base}/${locale}/admin/${route}?__qa_theme=medium`,
      );
      await page.locator("main").waitFor({ state: "visible", timeout: 15000 });
      await page
        .waitForLoadState("networkidle", { timeout: 5000 })
        .catch(() => {});
      await page
        .getByRole("heading", {
          name: routeHeadings[route][locale],
          exact: true,
        })
        .first()
        .waitFor({ state: "visible", timeout: 15000 });
      const motionSmoke = await page.evaluate(() => ({
        reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
        theme: document.documentElement.dataset.theme,
      }));
      assert.equal(
        motionSmoke.reduced,
        false,
        `${locale}/${route} should honor no-preference motion context`,
      );
      assert.equal(motionSmoke.theme, "medium");
      pageCount.push(`${locale}/${route}/390/medium/no-preference`);
    }
  }
  // Open the real POS floating workspace on a narrow phone viewport and verify its viewport mode control remains usable.
  await page.setViewportSize({ width: 390, height: 844 });
  await navigateWorkspace(page, `${base}/en/admin/pos?__qa_theme=dark`);
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await page
    .getByRole("heading", { name: routeHeadings.pos.en, exact: true })
    .waitFor({ state: "visible", timeout: 15000 });
  const posShell = page.locator('[data-pos-shell="true"]');
  if (!(await posShell.isVisible()))
    await page
      .getByRole("button", { name: "Open POS", exact: true })
      .last()
      .click();
  await posShell.waitFor({ state: "visible", timeout: 15000 });
  const posWindow = page.getByRole("dialog").filter({ has: posShell }).first();
  await posWindow.waitFor({ state: "visible", timeout: 15000 });
  const posBounds = await posWindow.boundingBox();
  assert.ok(
    posBounds && posBounds.width <= 390,
    `POS workspace exceeds 390px viewport: ${JSON.stringify(posBounds)}`,
  );
  await posShell
    .getByRole("button", { name: "Fullscreen", exact: true })
    .click();
  await expect(posWindow).toHaveAttribute("data-pos-viewport", "true");
  await expect(
    posShell.getByRole("button", { name: "Exit fullscreen", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const fullscreenBounds = await posWindow.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(
    fullscreenBounds &&
      viewport &&
      Math.abs(fullscreenBounds.x) <= 1 &&
      Math.abs(fullscreenBounds.y) <= 1 &&
      Math.abs(fullscreenBounds.width - viewport.width) <= 1 &&
      Math.abs(fullscreenBounds.height - viewport.height) <= 1,
    `POS viewport mode did not fill the mobile viewport: ${JSON.stringify(fullscreenBounds)}`,
  );
  await page.screenshot({
    path: path.join(evidenceDir, "en-pos-fullscreen-390-dark.png"),
    fullPage: true,
  });
  await posShell
    .getByRole("button", { name: "Exit fullscreen", exact: true })
    .click();
  await expect(posWindow).not.toHaveAttribute("data-pos-viewport", "true");
  await expect(
    posShell.getByRole("button", { name: "Fullscreen", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
  // Exercise the expense form in the rendered workspace, then read its persisted row via the real API.
  await page.setViewportSize({ width: 1440, height: 900 });
  await navigateWorkspace(page, `${base}/en/admin/expenses?__qa_theme=dark`);
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await page
    .getByRole("heading", { name: routeHeadings.expenses.en, exact: true })
    .waitFor({ state: "visible", timeout: 15000 });
  await page.getByRole("button", { name: "New expense", exact: true }).click();
  await page
    .getByLabel("Supplier name", { exact: true })
    .fill("Browser Fixture Supplier");
  await page.getByLabel("Expense date", { exact: true }).fill("2026-10-06");
  await page.getByLabel("Accounting category", { exact: true }).fill("office");
  await page
    .getByLabel("Item description", { exact: true })
    .fill("Browser UI test service");
  await page.getByLabel("Net (ILS)", { exact: true }).fill("50.00");
  await page.getByLabel("VAT (ILS)", { exact: true }).fill("9.00");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Expense draft saved." })
    .waitFor({ state: "visible", timeout: 15000 });
  const browserRead = await page.evaluate(async () => {
    const response = await fetch(
      "/api/management/commerce/expenses?status=draft&search=Browser%20UI%20test",
      { cache: "no-store" },
    );
    return { status: response.status, body: await response.json() };
  });
  assert.equal(
    browserRead.status,
    200,
    "browser cookie did not authenticate the real route",
  );
  assert.ok(
    browserRead.body.rows.some(
      (row) => row.supplier_snapshot?.name === "Browser Fixture Supplier",
    ),
    "UI expense was not persisted through Next API and PostgreSQL",
  );
  await navigateWorkspace(page, `${base}/en/admin/cash?__qa_theme=dark`);
  await page.getByLabel("Opening float (ILS)", { exact: true }).fill("100.00");
  await page
    .getByRole("button", { name: "Open cash shift", exact: true })
    .click();
  await page
    .getByText("Manual cash movement", { exact: true })
    .waitFor({ state: "visible", timeout: 15000 });
  await page
    .getByLabel("Movement type", { exact: true })
    .selectOption("correction");
  await page
    .getByLabel("Correction direction", { exact: true })
    .selectOption("decrease");
  await page.getByLabel("Amount (ILS)", { exact: true }).fill("5.00");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Browser count correction");
  await page
    .getByRole("button", { name: "Record movement", exact: true })
    .click();
  await page
    .getByText("The server confirmed the action.", { exact: true })
    .waitFor({ state: "visible", timeout: 15000 });
  const cashRead = await page.evaluate(async () => {
    const r = await fetch("/api/management/commerce/cash", {
      cache: "no-store",
    });
    return r.json();
  });
  const correction = cashRead.rows
    .flatMap((row) => row.movements || [])
    .find((movement) => movement.reason === "Browser count correction");
  assert.ok(correction, "cash correction was not persisted");
  assert.equal(
    correction.signed_amount_agorot,
    -500,
    "cash correction direction was not signed by the UI",
  );
  if (pageErrors.length)
    throw new Error(
      `Browser page errors: ${pageErrors.slice(0, 8).join(" | ")}`,
    );
  if (cspViolations.length)
    throw new Error(`CSP violations: ${cspViolations.slice(0, 8).join(" | ")}`);
  if (overflows.length)
    throw new Error(
      `Horizontal overflow: ${overflows.slice(0, 12).join(" | ")}`,
    );
  const manifest = {
    outcome: "passed",
    routeRenders: pageCount,
    exercisedFlows: [
      "POS mobile workspace launch and fullscreen enter/exit",
      "expense draft browser UI → Next API → PostgreSQL",
      "cash signed correction browser UI → Next API → PostgreSQL",
      "idempotent expense payment API replay",
      "unauthenticated write denied",
      "inactive actor denied at route and SQL RPC",
    ],
    cspViolations,
    pageErrors,
    horizontalOverflows: overflows,
    navigationRetries,
    screenshots: (await import("node:fs/promises"))
      .readdir(evidenceDir)
      .then((files) => files.filter((name) => name.endsWith(".png"))),
  };
  manifest.screenshots = await manifest.screenshots;
  await (
    await import("node:fs/promises")
  ).writeFile(
    path.join(evidenceDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  process.stdout.write(
    `PASS actual expenses/documents/cash/recurring/integrations/reports/POS pages: ${pageCount.length} locale×viewport×theme renders; expense and signed cash-correction UI→Next API→PostgreSQL; idempotent payment replay; reduced-motion modes; unauthenticated write denied; screenshots=${evidenceDir}\n`,
  );
} finally {
  await browser.close();
}
