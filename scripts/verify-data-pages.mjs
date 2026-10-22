// Read-only production-browser audit. Run with DATA_AUDIT_BASE_URL pointing to
// a local production server. Reports and screenshots contain management metadata
// and deliberately stay outside the repository. Business mutations are blocked.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium, firefox, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.DATA_AUDIT_BASE_URL || "http://127.0.0.1:3105";
const origin = new URL(base).origin;
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname),
  "This audit is restricted to a local server",
);
const output =
  process.env.DATA_AUDIT_OUTPUT_DIR || "/tmp/miro-data-audit-20261022";
assert.ok(
  path.resolve(output) !== process.cwd() &&
    !path.resolve(output).startsWith(`${process.cwd()}${path.sep}`),
  "Private audit evidence must stay outside the repository",
);
assert.ok(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY,
);
const supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
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

const paths = [
  "",
  "products",
  "products/new",
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
  "pos",
  "accounts",
  "commerce-reports",
  "cash",
  "expenses",
  "documents",
  "integrations",
  "recurring",
];
const requestedPaths = process.env.DATA_AUDIT_PATHS?.split(",");
const roles = process.env.DATA_AUDIT_ROLES?.split(",") || ["ceo", "admin"];
assert.ok(roles.every((role) => ["ceo", "admin"].includes(role)));
const browserName = process.env.DATA_AUDIT_BROWSER || "chromium";
assert.ok(["chromium", "firefox"].includes(browserName));
const smokeOnly = process.env.DATA_AUDIT_SMOKE === "1";
const report = {
  date: "2026-10-22",
  scope: {
    browser: browserName,
    server: origin,
    roles,
    ceo: smokeOnly
      ? "Requested routes: EN 1440px dark and HE 390px light"
      : "Every requested route: EN/HE, 1440/390px, dark/medium/light; 320px light",
    admin: "Every route: EN 1440px dark and HE 390px light",
    reads:
      "First management API GET per exact URL and role is live; identical later GETs replay only that successful response in browser memory. Server-rendered data and auth remain real on every navigation.",
    writes:
      "All browser writes blocked except Supabase auth token exchanges for disposable actors. No business save/payment/invoice/send exercised.",
    limits: [
      "Automated accessibility is not manual keyboard/screen-reader or physical-device certification.",
      "Existing datasets determine whether detail drawers and pagination can be exercised; absent records are reported as unavailable.",
      "No load, penetration, real provider integration, official document issuance or financial mutation test is performed here.",
    ],
  },
  cases: [],
  interactions: [],
  apiReads: [],
  apiFailures: [],
  runtimeErrors: [],
  consoleErrors: [],
  networkFailures: [],
  blockedWrites: [],
  failures: [],
  cleanup: [],
};
const sanitize = (value) =>
  String(value)
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ":email")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, ":token")
    .replace(/Bearer\s+\S+/gi, "Bearer :redacted");
const name = (routePath) =>
  routePath.startsWith("products/") && routePath !== "products/new"
    ? "products/edit"
    : routePath || "overview";
const caseName = (state) =>
  `${state.role}/${state.locale}/${name(state.routePath)}/${state.width}/${state.theme}`;
const actorIds = [];
let browser;
let stopRequested = false;
for (const signal of ["SIGINT", "SIGTERM", "SIGUSR1"]) {
  process.on(signal, () => {
    stopRequested = true;
    console.log(
      "Pause requested; finishing current condition and cleaning up actors",
    );
  });
}

await mkdir(output, { recursive: true, mode: 0o700 });
async function persist() {
  report.summary = {
    cases: report.cases.length,
    failedCases: report.cases.filter((entry) => entry.failures.length).length,
    interactions: report.interactions.length,
    liveApiReads: report.apiReads.filter((entry) => entry.source === "live")
      .length,
    replayedApiReads: report.apiReads.filter(
      (entry) => entry.source === "replay",
    ).length,
    apiFailures: report.apiFailures.length,
    runtimeErrors: report.runtimeErrors.length,
    consoleErrors: report.consoleErrors.length,
    networkFailures: report.networkFailures.length,
    blockedWrites: report.blockedWrites.length,
    failures: report.failures.length,
  };
  await writeFile(
    path.join(output, "data-pages-results.json"),
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
}

async function makeActor(role) {
  const email = `data-audit-${role}-${Date.now()}@miro-test.local`;
  const password = `DataAudit-${randomUUID()}!`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const id = created.data.user.id;
  actorIds.push(id);
  for (const result of await Promise.all([
    service
      .from("user_roles")
      .upsert({ user_id: id, role }, { onConflict: "user_id" }),
    service
      .from("profiles")
      .update({ account_status: "active", role, full_name: "MIRO Data Audit" })
      .eq("id", id),
  ])) {
    if (result.error) throw result.error;
  }
  return { id, email, password };
}

async function runRole(role) {
  const actor = await makeActor(role);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const cache = new Map();
  const pending = new Set();
  let state = {
    role,
    locale: "en",
    routePath: "login",
    width: 1440,
    theme: "dark",
  };
  page.on("pageerror", (error) => {
    report.runtimeErrors.push({
      case: caseName(state),
      message: sanitize(error.message),
    });
  });
  page.on("console", (message) => {
    if (message.type() === "error")
      report.consoleErrors.push({
        case: caseName(state),
        message: sanitize(message.text()),
        source: sanitize(message.location().url.split("?")[0]),
      });
  });
  page.on("requestfailed", (request) => {
    const reason = request.failure()?.errorText || "unknown";
    if (reason.includes("ERR_ABORTED")) return;
    const url = new URL(request.url());
    report.networkFailures.push({
      case: caseName(state),
      source: sanitize(`${url.origin}${url.pathname}`),
      type: request.resourceType(),
      reason,
    });
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const tokenExchange =
      url.origin === supabaseOrigin &&
      url.pathname === "/auth/v1/token" &&
      method === "POST";
    if (!["GET", "HEAD", "OPTIONS"].includes(method) && !tokenExchange) {
      report.blockedWrites.push({
        case: caseName(state),
        path: sanitize(url.pathname),
        method,
      });
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ code: "read_only_audit_blocked_write" }),
      });
    }
    if (url.origin !== origin || !url.pathname.startsWith("/api/management/"))
      return route.continue();
    const key = url.pathname + url.search;
    const entry = {
      case: caseName(state),
      path: sanitize(url.pathname),
      source: cache.has(key) ? "replay" : "live",
    };
    report.apiReads.push(entry);
    if (cache.has(key)) return route.fulfill(cache.get(key));
    pending.add(request);
    try {
      const response = await route.fetch({ timeout: 30000, maxRedirects: 0 });
      const body = await response.body();
      entry.status = response.status();
      if (!response.ok())
        report.apiFailures.push({ ...entry, status: response.status() });
      const replay = {
        status: response.status(),
        headers: response.headers(),
        body,
      };
      if (response.ok()) cache.set(key, replay);
      return await route.fulfill(replay);
    } catch (error) {
      // React can abort superseded read requests during routing/filter changes.
      // Only record a fetch failure while its page remains alive.
      if (!page.isClosed() && !/closed|cancelled|aborted/i.test(String(error)))
        report.apiFailures.push({ ...entry, reason: sanitize(error.message) });
      await route.abort().catch(() => {});
    } finally {
      pending.delete(request);
    }
  });

  async function settle() {
    await page.waitForTimeout(180);
    await expect.poll(() => pending.size, { timeout: 35000 }).toBe(0);
    await expect(
      page.locator(
        '.mgmt-shell__main [aria-busy="true"], .mgmt-shell__main [data-route-loading="true"]',
      ),
    ).toHaveCount(0, { timeout: 25000 });
    await page.waitForTimeout(100);
  }
  async function visit(routePath, locale) {
    state = { ...state, routePath, locale };
    const response = await page.goto(
      `${base}/${locale}/admin${routePath ? `/${routePath}` : ""}`,
      { waitUntil: "domcontentloaded", timeout: 45000 },
    );
    assert.ok(response?.ok(), `Page HTTP ${response?.status()}`);
    assert.ok(
      new URL(page.url()).pathname.includes("/admin"),
      "Unexpected auth redirect",
    );
    await expect(page.locator(".mgmt-shell-root")).toBeVisible();
    await expect(page.locator(".mgmt-shell__main h1").first()).toBeVisible();
    await expect(page.locator(".mgmt-shell-root")).toHaveAttribute(
      "dir",
      locale === "he" ? "rtl" : "ltr",
    );
    await settle();
    const errors = await page
      .locator(".mgmt-error-state, .users-management__error")
      .count();
    assert.equal(errors, 0, "Data error surface is visible");
  }
  async function inspect() {
    const entry = {
      ...state,
      route: name(state.routePath),
      routePath: undefined,
      failures: [],
      reads: { live: 0, replay: 0 },
    };
    try {
      await page.setViewportSize({
        width: state.width,
        height: state.width > 500 ? 1000 : 844,
      });
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
        window.dispatchEvent(new Event("miro-theme-change"));
      }, state.theme);
      await page.waitForTimeout(70);
      const layout = await page.evaluate(() => ({
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        headings: document.querySelectorAll(".mgmt-shell__main h1").length,
        direction: document
          .querySelector(".mgmt-shell-root")
          ?.getAttribute("dir"),
        theme: document.documentElement.dataset.theme,
        overflowing: [...document.querySelectorAll(".mgmt-shell__main *")]
          .filter((node) => {
            const rect = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return (
              style.position !== "fixed" &&
              rect.width &&
              (rect.right > innerWidth + 2 || rect.left < -2)
            );
          })
          .slice(0, 8)
          .map((node) => ({ tag: node.tagName, className: node.className })),
      }));
      entry.layout = layout;
      if (layout.documentWidth > layout.viewport + 2)
        entry.failures.push(
          `Document overflow ${layout.documentWidth}/${layout.viewport}`,
        );
      if (layout.headings !== 1)
        entry.failures.push(
          `Expected one page heading, found ${layout.headings}`,
        );
      const axe = await new AxeBuilder({ page })
        .include(".mgmt-shell-root")
        .analyze();
      entry.axe = axe.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => ({
          target: node.target.map(sanitize),
          summary: sanitize(node.failureSummary),
        })),
      }));
      entry.axeIncomplete = axe.incomplete.length;
      if (entry.axe.length)
        entry.failures.push(
          `Accessibility: ${entry.axe.map((v) => v.id).join(", ")}`,
        );
      if (
        entry.failures.length ||
        (state.width === 1440 &&
          state.theme === "dark" &&
          state.locale === "en")
      ) {
        const filename = `${caseName(state).replaceAll("/", "-")}.png`;
        await page.screenshot({
          path: path.join(output, filename),
          fullPage: true,
          timeout: 15000,
        });
        entry.screenshot = filename;
      }
    } catch (error) {
      entry.failures.push(sanitize(error.message));
    }
    for (const read of report.apiReads.filter(
      (read) => read.case === caseName(state),
    ))
      entry.reads[read.source]++;
    report.cases.push(entry);
    if (entry.failures.length) {
      report.failures.push({ case: caseName(state), failures: entry.failures });
      console.log(`FAIL ${caseName(state)}: ${entry.failures.join("; ")}`);
    }
  }
  async function interaction(label, callback) {
    const result = { role, route: name(state.routePath), label };
    try {
      result.result = await callback();
      await settle();
      result.status = "pass";
    } catch (error) {
      result.status = "fail";
      result.reason = sanitize(error.message);
      report.failures.push({
        case: caseName(state),
        interaction: label,
        reason: result.reason,
      });
      await page.keyboard.press("Escape").catch(() => {});
    }
    report.interactions.push(result);
  }
  async function interactions(routePath) {
    const main = page.locator(".mgmt-shell__main");
    const listPages = [
      "products",
      "categories",
      "services",
      "inventory",
      "suppliers",
      "sales",
      "customers",
      "users",
      "requests",
      "audit",
      "accounts",
      "documents",
      "expenses",
      "recurring",
    ];
    if (listPages.includes(routePath)) {
      const search = main
        .locator(
          'input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]',
        )
        .filter({ visible: true })
        .first();
      if (await search.count()) {
        await interaction("search and clear", async () => {
          await search.fill("MIRO-AUDIT-NO-MATCH-20261022");
          await page.waitForTimeout(500);
          await settle();
          await expect(search).toHaveValue("MIRO-AUDIT-NO-MATCH-20261022");
          await search.fill("");
          await page.waitForTimeout(500);
          return "Search input retained query and cleared; reads settled";
        });
      }
      const select = main.locator("select").filter({ visible: true }).first();
      if (await select.count()) {
        const choices = await select
          .locator("option")
          .evaluateAll((options) =>
            options
              .filter((option) => !option.disabled)
              .map((option) => option.value),
          );
        const original = await select.inputValue();
        const choice = choices.find((value) => value !== original);
        if (choice !== undefined)
          await interaction("filter change and reset", async () => {
            await select.selectOption(choice);
            await settle();
            await expect(select).toHaveValue(choice);
            await select.selectOption(original);
            return "Filter selection changed and restored; reads settled";
          });
      }
      const next = main
        .getByRole("button", { name: /^(Next|Next page)$/ })
        .filter({ visible: true })
        .first();
      if ((await next.count()) && (await next.isEnabled())) {
        await interaction("next and previous page", async () => {
          await next.click();
          await settle();
          const previous = main
            .getByRole("button", { name: /^(Previous|Previous page)$/ })
            .filter({ visible: true })
            .first();
          await expect(previous).toBeEnabled();
          await previous.click();
          return "Pagination advanced and returned";
        });
      } else
        report.interactions.push({
          role,
          route: name(routePath),
          label: "pagination",
          status: "unavailable",
          reason: "No enabled next-page control in current dataset",
        });
    }
    for (const label of ["Last 7 days", "7 days"]) {
      const preset = main
        .getByRole("button", { name: label, exact: true })
        .filter({ visible: true })
        .first();
      if (await preset.count()) {
        await interaction("date preset", async () => {
          await preset.click();
          return "Date preset selected; reads settled";
        });
        break;
      }
    }
    const opens = {
      categories: ["Add category"],
      services: ["Add service"],
      suppliers: ["Add Supplier"],
      inventory: ["Receive", "Adjust", "Out"],
    };
    for (const label of opens[routePath] || []) {
      const trigger = main
        .getByRole("button", { name: label, exact: true })
        .filter({ visible: true })
        .first();
      if (!(await trigger.count())) continue;
      await interaction(`open/close ${label} without saving`, async () => {
        await trigger.click();
        const dialog = page.getByRole("dialog").last();
        await expect(dialog).toBeVisible();
        const axe = await new AxeBuilder({ page })
          .include('[role="dialog"]')
          .analyze();
        assert.equal(
          axe.violations.length,
          0,
          `Dialog accessibility: ${axe.violations.map((entry) => entry.id).join(", ")}`,
        );
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(trigger).toBeFocused();
        return "Named dialog opened, axe checked, Escape restored focus; no save";
      });
    }
    const drawerTrigger = main
      .getByRole("button", {
        name: /^(View details(?: for .+)?|Open request details|Details|View order|View request|Stock history)$/,
      })
      .filter({ visible: true })
      .first();
    if (await drawerTrigger.count())
      await interaction("detail drawer read only", async () => {
        await drawerTrigger.click();
        await expect(page.getByRole("dialog").last()).toBeVisible();
        await settle();
        const axe = await new AxeBuilder({ page })
          .include('[role="dialog"]')
          .analyze();
        assert.equal(
          axe.violations.length,
          0,
          `Drawer accessibility: ${axe.violations.map((entry) => entry.id).join(", ")}`,
        );
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        return "Detail opened and dismissed without writes";
      });
    if (role === "admin" && ["settings", "store-design"].includes(routePath)) {
      await interaction("admin editable configuration absent", async () => {
        assert.equal(
          await main
            .locator("input:enabled, select:enabled, textarea:enabled")
            .count(),
          0,
          "Admin must not edit CEO configuration",
        );
        return "Admin configuration fields disabled or absent";
      });
    }
    if (role === "admin" && routePath === "users")
      await interaction("admin role editing absent", async () => {
        assert.equal(
          await main.getByLabel("Change role", { exact: true }).count(),
          0,
        );
        return "Admin role editor absent";
      });
  }

  try {
    await page.goto(`${base}/en/login`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.locator('input[name="email"]').fill(actor.email);
    await page.locator('input[name="password"]').fill(actor.password);
    await page.locator('input[name="password"]').press("Enter");
    await page.waitForURL((url) => url.pathname !== "/en/login", {
      timeout: 45000,
    });
    console.log(`PASS ${role} disposable actor login`);
    const product = await service
      .from("products")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (product.error) throw product.error;
    const rolePaths = [...paths];
    if (product.data?.id) rolePaths.push(`products/${product.data.id}`);
    else
      report.failures.push({
        role,
        route: "products/edit",
        reason: "No product available for read-only editor verification",
      });
    for (const routePath of rolePaths.filter(
      (value) => !requestedPaths || requestedPaths.includes(name(value)),
    )) {
      if (stopRequested) break;
      for (const locale of ["en", "he"]) {
        if (stopRequested) break;
        try {
          state = {
            role,
            locale,
            routePath,
            width:
              locale === "he" && (role === "admin" || smokeOnly) ? 390 : 1440,
            theme:
              locale === "he" && (role === "admin" || smokeOnly)
                ? "light"
                : "dark",
          };
          await visit(routePath, locale);
          const widths =
            role === "ceo" && !smokeOnly ? [1440, 390] : [state.width];
          const themes =
            role === "ceo" && !smokeOnly
              ? ["dark", "medium", "light"]
              : [state.theme];
          for (const width of widths)
            for (const theme of themes) {
              if (stopRequested) break;
              state = { ...state, width, theme };
              await inspect();
            }
          if (role === "ceo" && !smokeOnly && !stopRequested) {
            state = { ...state, width: 320, theme: "light" };
            await inspect();
          }
          if (locale === "en" && !stopRequested) {
            await page.setViewportSize({ width: 1440, height: 1000 });
            state = { ...state, width: 1440, theme: "dark" };
            await interactions(routePath);
          }
        } catch (error) {
          const failure = {
            case: caseName(state),
            reason: sanitize(error.message),
          };
          report.failures.push(failure);
          console.log(`FAIL ${failure.case}: ${failure.reason}`);
        }
      }
      console.log(`CHECKED ${role}/${name(routePath)}`);
      await persist();
    }
  } finally {
    await context.close();
  }
}

try {
  browser = await { chromium, firefox }[browserName].launch({ headless: true });
  // One browser page at a time bounds server/database pressure. Reads for a page
  // still run concurrently exactly as the application requests them.
  for (const role of roles) {
    if (stopRequested) break;
    try {
      await runRole(role);
    } catch (error) {
      report.failures.push({ role, reason: sanitize(error.message) });
      console.log(`FAIL ${role}: ${sanitize(error.message)}`);
    }
  }
} finally {
  await browser?.close();
  for (const id of actorIds) {
    const result = await service.auth.admin.deleteUser(id);
    report.cleanup.push({ actor: ":disposable", deleted: !result.error });
    if (result.error)
      report.failures.push({ cleanup: sanitize(result.error.message) });
  }
  await persist();
}
report.interrupted = stopRequested;
await persist();
console.log(JSON.stringify(report.summary));
console.log(
  `Private evidence: ${path.join(output, "data-pages-results.json")}`,
);
if (stopRequested) process.exitCode = 2;
else if (
  report.failures.length ||
  report.apiFailures.length ||
  report.runtimeErrors.length ||
  report.consoleErrors.length
)
  process.exitCode = 1;
