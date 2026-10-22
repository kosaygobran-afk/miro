// Browser-only read failure/recovery checks. Business writes are blocked; only a
// disposable auth actor is created and removed. Evidence remains outside Git.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.DATA_STATES_BASE_URL || "http://127.0.0.1:3105";
const origin = new URL(base).origin;
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname));
const output =
  process.env.DATA_STATES_OUTPUT_DIR || "/tmp/miro-data-audit-20261022/states";
assert.ok(
  !path.resolve(output).startsWith(`${process.cwd()}${path.sep}`) &&
    path.resolve(output) !== process.cwd(),
);
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
const supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
const paths = [
  "products",
  "categories",
  "services",
  "inventory",
  "suppliers",
  "sales",
  "customers",
  "analytics",
  "finance",
  "users",
  "requests",
  "audit",
  "settings",
  "store-design",
  "storefront-merchandising",
  "accounts",
  "commerce-reports",
  "cash",
  "expenses",
  "documents",
  "integrations",
  "recurring",
];
const selected = process.env.DATA_STATES_PATHS?.split(",") || paths;
assert.ok(selected.every((value) => paths.includes(value)));
const report = {
  scope:
    "Chromium, disposable CEO, EN desktop and HE phone; browser management GETs return synthetic 503, then restore normal GETs. All writes except disposable auth blocked. Server data/auth remain live.",
  cases: [],
  errors: [],
  blockedWrites: [],
  cleanup: false,
};
const sanitize = (message) =>
  String(message)
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ":email");
let id;
let browser;
let state;
let failing = true;
let intercepts = 0;
await mkdir(output, { recursive: true, mode: 0o700 });
try {
  const email = `data-states-${Date.now()}@miro-test.local`;
  const password = `DataStates-${randomUUID()}!`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  id = created.data.user.id;
  for (const result of await Promise.all([
    service
      .from("user_roles")
      .upsert({ user_id: id, role: "ceo" }, { onConflict: "user_id" }),
    service
      .from("profiles")
      .update({
        account_status: "active",
        role: "ceo",
        full_name: "MIRO Data States QA",
      })
      .eq("id", id),
  ]))
    if (result.error) throw result.error;
  browser = await chromium.launch();
  const context = await browser.newContext({
    reducedMotion: "reduce",
    serviceWorkers: "block",
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) =>
    report.errors.push({ state, message: sanitize(error.message) }),
  );
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.origin === origin && url.pathname === "/api/track")
      return route.fulfill({ status: 204 });
    const auth =
      url.origin === supabaseOrigin &&
      url.pathname === "/auth/v1/token" &&
      method === "POST";
    if (!["GET", "HEAD", "OPTIONS"].includes(method) && !auth) {
      report.blockedWrites.push({
        state,
        method,
        path: sanitize(url.pathname),
      });
      return route.fulfill({ status: 409, json: { code: "read_only_audit" } });
    }
    if (
      failing &&
      url.origin === origin &&
      url.pathname.startsWith("/api/management/") &&
      method === "GET"
    ) {
      intercepts++;
      return route.fulfill({
        status: 503,
        json: {
          error: "QA simulated data outage",
          code: "commerce_unavailable",
        },
      });
    }
    return route.continue();
  });
  failing = false;
  await page.goto(`${base}/en/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="password"]').press("Enter");
  await page.waitForURL((url) => url.pathname !== "/en/login", {
    timeout: 45000,
  });
  for (const routePath of selected)
    for (const locale of ["en", "he"]) {
      state = `${locale}/${routePath}`;
      const entry = { state, failures: [], intercepted: 0, recovery: null };
      report.cases.push(entry);
      try {
        await page.setViewportSize({
          width: locale === "en" ? 1440 : 390,
          height: 1000,
        });
        failing = true;
        const before = intercepts;
        await page.goto(`${base}/${locale}/admin/${routePath}`, {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });
        const main = page.locator(".mgmt-shell__main");
        await expect(main.locator("h1").first()).toBeVisible();
        await expect
          .poll(() => intercepts - before, { timeout: 20000 })
          .toBeGreaterThan(0);
        const errorSurface = main
          .locator(
            '[role="alert"], .mgmt-error-state, .users-management__error',
          )
          .filter({ visible: true });
        await expect
          .poll(
            async () =>
              (await errorSurface.count()) ||
              /QA simulated data outage|Failed to load|Unable to load|Connection error|טעינה נכשלה|שגיאת חיבור|לא ניתן לטעון/.test(
                await main.innerText(),
              ),
            { timeout: 20000 },
          )
          .toBeTruthy();
        await expect(
          main.locator('[data-route-loading="true"], [aria-busy="true"]'),
        ).toHaveCount(0, { timeout: 20000 });
        const axe = await new AxeBuilder({ page })
          .include(".mgmt-shell__main")
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        entry.axe = axe.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.length,
        }));
        assert.equal(
          entry.axe.length,
          0,
          `Accessibility violations: ${entry.axe.map((row) => row.id).join(", ")}`,
        );
        entry.intercepted = intercepts - before;
        failing = false;
        const retry = main
          .getByRole("button", {
            name: /^(Try again|Retry|נסה שוב|נסו שוב|ניסיון נוסף|רענון|Refresh)$/i,
          })
          .filter({ visible: true })
          .first();
        if (await retry.count()) {
          await retry.click();
          entry.recovery = "visible retry";
        } else {
          await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
          entry.recovery = "reload (no generic retry button)";
        }
        await expect(
          main.locator('[data-route-loading="true"], [aria-busy="true"]'),
        ).toHaveCount(0, { timeout: 25000 });
        await expect
          .poll(
            async () =>
              main
                .locator(".mgmt-error-state, .users-management__error")
                .filter({ visible: true })
                .count(),
            { timeout: 30000 },
          )
          .toBe(0);
        await expect
          .poll(
            async () =>
              (await main.innerText()).includes("QA simulated data outage"),
            { timeout: 30000 },
          )
          .toBe(false);
        console.log(`PASS ${state} failure + ${entry.recovery}`);
      } catch (error) {
        entry.failures.push(sanitize(error.message));
        await page
          .screenshot({
            path: path.join(output, `${locale}-${routePath}.png`),
            fullPage: true,
          })
          .catch(() => {});
        console.log(`FAIL ${state}: ${sanitize(error.message).split("\n")[0]}`);
      }
      await writeFile(
        path.join(output, "data-page-states.json"),
        JSON.stringify(report, null, 2),
        { mode: 0o600 },
      );
    }
} catch (error) {
  report.errors.push({ state, message: sanitize(error.message) });
} finally {
  await browser?.close().catch(() => {});
  if (id) {
    const removed = await service.auth.admin.deleteUser(id);
    report.cleanup = !removed.error;
    if (removed.error)
      report.errors.push({ cleanup: sanitize(removed.error.message) });
  }
  report.summary = {
    cases: report.cases.length,
    failed: report.cases.filter((row) => row.failures.length).length,
    runtimeErrors: report.errors.length,
    cleanup: report.cleanup,
  };
  await writeFile(
    path.join(output, "data-page-states.json"),
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(report.summary));
}
if (
  report.errors.length ||
  report.cases.some((row) => row.failures.length) ||
  !report.cleanup
)
  process.exitCode = 1;
