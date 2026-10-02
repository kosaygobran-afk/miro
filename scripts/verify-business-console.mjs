// Production QA with disposable auth. Live protected reads are cached in memory
// for repeat visual checks. No existing business record is written; screenshots
// stay in the local temporary directory because management data is private.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.ADMIN_BASE_URL || "http://127.0.0.1:3107";
assert.ok(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY,
);
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
const output =
  process.env.CONSOLE_OUTPUT_DIR || "docs/reporting-evidence-2026-10-02";
const temporary = "/tmp/miro-console-2026-10-02";
const checks = [];
const violations = [];
const runtimeErrors = [];
const liveFailures = [];
const cache = new Map();
const pass = (label) => {
  checks.push(label);
  console.log(`PASS ${label}`);
};
let userId;
let browser;
let stage = "create disposable CEO";

try {
  const email = `console-qa-${Date.now()}@miro-test.local`;
  const password = `ConsoleTest-${randomUUID()}!`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  async function assignRole(role) {
    const results = await Promise.all([
      service
        .from("user_roles")
        .upsert({ user_id: userId, role }, { onConflict: "user_id" }),
      service
        .from("profiles")
        .update({ account_status: "active", role, full_name: "MIRO QA" })
        .eq("id", userId),
    ]);
    for (const result of results) if (result.error) throw result.error;
  }
  await assignRole("ceo");
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await page.goto(`${base}/en/login`, { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="password"]').press("Enter");
  await page.waitForURL((value) => value.pathname !== "/en/login", {
    timeout: 30000,
  });
  pass("real CEO login");

  // Only repeat GETs are replayed. Never send a mutation during visual checks.
  await context.route("**/api/management/**", async (route) => {
    const request = route.request();
    assert.equal(
      request.method(),
      "GET",
      "visual QA must not mutate business data",
    );
    const key = new URL(request.url()).pathname + new URL(request.url()).search;
    if (cache.has(key)) return route.fulfill({ json: cache.get(key) });
    const response = await route.fetch();
    if (!response.ok())
      liveFailures.push({
        path: new URL(request.url()).pathname,
        status: response.status(),
      });
    else cache.set(key, await response.json());
    return route.fulfill({ response });
  });
  await mkdir(temporary, { recursive: true });
  const paths = [
    "",
    "products",
    "categories",
    "services",
    "inventory",
    "suppliers",
    "sales",
    "customers",
    "users",
    "audit",
    "settings",
    "storefront-merchandising",
    "products/new",
  ];
  let productId;
  async function visit(path, locale = "en") {
    stage = `visit ${locale}/${path || "overview"}`;
    const response = await page.goto(
      `${base}/${locale}/admin${path ? `/${path}` : ""}`,
      { waitUntil: "networkidle", timeout: 35000 },
    );
    assert.ok(response?.ok(), `${stage}: HTTP ${response?.status()}`);
    assert.ok(
      new URL(page.url()).pathname.includes("/admin"),
      `${stage}: unexpected redirect`,
    );
    await expect(page.locator(".mgmt-shell__main h1").first()).toBeVisible();
    assert.equal(
      await page.locator(".mgmt-shell__main h1").count(),
      1,
      `${stage}: one page heading`,
    );
    await expect(page.locator(".mgmt-shell-root")).toHaveAttribute(
      "dir",
      locale === "he" ? "rtl" : "ltr",
    );
  }
  async function audit(label) {
    const results = await new AxeBuilder({ page })
      .include(".mgmt-shell-root")
      .analyze();
    for (const result of results.violations)
      violations.push({
        page: label,
        rule: result.id,
        nodes: result.nodes.map((node) => ({
          target: node.target,
          summary: node.failureSummary,
        })),
      });
  }
  async function bounded(label) {
    const result = await page.evaluate(() => ({
      width: innerWidth,
      pageWidth: document.documentElement.scrollWidth,
    }));
    assert.ok(
      result.pageWidth <= result.width + 2,
      `${label}: page overflow ${result.pageWidth}/${result.width}`,
    );
  }
  for (const path of paths) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await visit(path);
    if (path === "") {
      const versions = await page.evaluate(() => {
        const root = document.documentElement;
        const theme = root.dataset.theme;
        const version = root.dataset.appearanceVersion;
        root.dataset.theme = "dark";
        const read = () => ({
          areas: getComputedStyle(document.querySelector(".mgmt-metric-card"))
            .gridTemplateAreas,
          background: getComputedStyle(
            document.querySelector(".mgmt-shell-root"),
          )
            .getPropertyValue("--background")
            .trim(),
          foreground: getComputedStyle(
            document.querySelector(".mgmt-shell-root"),
          )
            .getPropertyValue("--foreground")
            .trim(),
        });
        root.dataset.appearanceVersion = "1";
        const original = read();
        root.dataset.appearanceVersion = "2";
        const enhanced = read();
        root.dataset.theme = theme;
        root.dataset.appearanceVersion = version;
        return { original, enhanced };
      });
      assert.equal(versions.original.areas, '"content icon" "footer footer"');
      assert.equal(versions.enhanced.areas, '"icon" "content" "footer"');
      assert.equal(versions.original.background, versions.enhanced.background);
      assert.equal(versions.original.foreground, versions.enhanced.foreground);
      pass(
        "Version1 restores original shared metric geometry; Version2 keeps CEO Dark colors unchanged",
      );
    }
    if (path === "products") {
      const data = [...cache.entries()].find(([key]) =>
        key.startsWith("/api/management/products?"),
      )?.[1];
      productId = data?.products?.[0]?.id;
    }
    for (const theme of ["dark", "medium", "light"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
        window.dispatchEvent(new Event("miro-theme-change"));
      }, theme);
      await page.waitForTimeout(250);
      await bounded(`${path}/${theme}/1440`);
      await audit(`${path || "overview"}/${theme}/1440`);
    }
    if (
      [
        "",
        "products",
        "sales",
        "settings",
        "storefront-merchandising",
      ].includes(path)
    ) {
      await page.evaluate(
        () => (document.documentElement.dataset.theme = "dark"),
      );
      await page.screenshot({
        path: `${temporary}/${path || "overview"}-en-desktop.png`,
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await bounded(`${path}/390`);
    await audit(`${path || "overview"}/light/390`);
    pass(`${path || "overview"}: live reads, 3 themes, desktop/mobile layout`);
  }
  if (productId) {
    paths.push(`products/${productId}`);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await visit(`products/${productId}`);
    await audit("product editor/desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await bounded("product editor/390");
    await audit("product editor/mobile");
    await page.getByRole("button", { name: "Variants", exact: true }).click();
    const add = page
      .getByRole("button", { name: /Add (first )?variant/i })
      .first();
    await add.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByLabel(/^SKU/)).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include("#mgmt-overlay-portal-host")
      .analyze();
    for (const result of results.violations)
      violations.push({
        page: "variant dialog",
        rule: result.id,
        nodes: result.nodes.map((node) => ({
          target: node.target,
          summary: node.failureSummary,
        })),
      });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    pass(
      "product editor and variant dialog: protected detail endpoint, mobile, named controls, Escape",
    );
  } else {
    throw new Error("Product editor verification requires an existing product");
  }
  for (const path of paths) {
    await visit(path, "he");
    await bounded(`${path}/he/390`);
    pass(
      `${path.startsWith("products/") && path !== "products/new" ? "product editor" : path || "overview"}: Hebrew mobile RTL`,
    );
  }

  stage = "operational dialogs";
  await visit("inventory");
  for (const name of ["Receive Stock", "Adjust Stock", "Manual Out"]) {
    const trigger = page
      .getByRole("button", { name, exact: true })
      .filter({ visible: true })
      .first();
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include("#mgmt-overlay-portal-host")
      .analyze();
    for (const result of results.violations)
      violations.push({
        page: `inventory ${name} dialog`,
        rule: result.id,
        nodes: result.nodes.map((node) => ({
          target: node.target,
          summary: node.failureSummary,
        })),
      });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  for (const [path, name] of [
    ["categories", "Add category"],
    ["services", "Add service"],
    ["suppliers", "Add Supplier"],
  ]) {
    await visit(path);
    const trigger = page.getByRole("button", { name, exact: true }).first();
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  pass(
    "inventory receipt/adjustment/out dialogs and category/service/supplier editors open and restore focus without writes",
  );

  stage = "workspace tools";
  await visit("");
  await page
    .getByRole("button", { name: "Workspace display", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#main-content")).toHaveAttribute("inert", "");
  await page.getByRole("radio", { name: /^Compact/ }).check();
  await expect(page.locator(".mgmt-shell")).toHaveAttribute(
    "data-density",
    "compact",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Workspace display", exact: true }),
  ).toBeFocused();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".mgmt-shell")).toHaveAttribute(
    "data-density",
    "compact",
  );
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search pages" }).fill("inventory");
  await expect(page.locator(".mgmt-workspace-finder__link")).toHaveCount(1);
  await page.locator(".mgmt-workspace-finder__link").click();
  await expect(page).toHaveURL(/\/en\/admin\/inventory$/);
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open navigation", exact: true }),
  ).toBeFocused();
  pass(
    "page finder, keyboard shortcut, persisted density, modal background, mobile navigation/focus",
  );

  stage = "drill-down routing and draft preservation";
  await visit("requests?status=new&stale=true");
  assert.ok(
    [...cache.keys()].some(
      (key) =>
        key.includes("/requests?") &&
        key.includes("status=new") &&
        key.includes("stale=true"),
    ),
  );
  await visit("inventory?status=low");
  await expect(
    page.getByRole("button", { name: "Low stock", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await visit("inventory?status=out_of_stock");
  await expect(
    page.getByRole("button", { name: "Out of stock", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await visit("products?status=draft");
  await expect(
    page.getByRole("combobox", { name: "Status", exact: true }),
  ).toHaveValue("draft");
  await visit("sales?view=record");
  await expect(page.locator("#sale-customer-name")).toBeVisible();
  await page
    .locator("#sale-customer-name")
    .fill("Disposable draft for display verification");
  await page
    .getByRole("button", { name: "Sales history", exact: true })
    .click();
  await expect(page.locator("#sale-customer-name")).toBeHidden();
  await page
    .getByRole("button", { name: "Record a sale", exact: true })
    .click();
  await expect(page.locator("#sale-customer-name")).toHaveValue(
    "Disposable draft for display verification",
  );
  await page.locator("#sale-customer-name").fill("");
  pass(
    "validated overview drill-downs and sale draft survives switching views",
  );

  stage = "CEO/admin permission boundary";
  await visit("settings");
  const taxTrigger = page.getByRole("button", {
    name: "Add Tax Rate",
    exact: true,
  });
  await taxTrigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(taxTrigger).toBeFocused();
  assert.ok(
    (await page.locator("input:enabled").count()) > 0,
    "CEO editable settings available",
  );
  await context.unroute("**/api/management/**");
  const invalidCeoWrite = await context.request.post(
    `${base}/api/management/settings`,
    {
      headers: { Origin: new URL(base).origin },
      data: {},
    },
  );
  assert.equal(
    invalidCeoWrite.status(),
    400,
    "CEO passes role/origin checks; invalid payload prevents any write",
  );
  await assignRole("admin");
  await visit("settings");
  const editable = await page
    .locator(
      ".mgmt-shell__main input:enabled, .mgmt-shell__main select:enabled, .mgmt-shell__main textarea:enabled",
    )
    .count();
  assert.equal(editable, 0, "admin settings read-only");
  // Auth is checked before body validation; empty JSON cannot change settings.
  const denied = await context.request.post(`${base}/api/management/settings`, {
    headers: { Origin: new URL(base).origin },
    data: {},
  });
  assert.equal(denied.status(), 403, "admin settings writes denied at API");
  await visit("users");
  assert.equal(
    await page.getByLabel("Change role", { exact: true }).count(),
    0,
    "admin account management read-only",
  );
  pass(
    "CEO controls render; admin users/settings are read-only; unauthorized settings POST denied",
  );
  await page
    .getByRole("link", { name: "Switch to storefront", exact: true })
    .click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator("#store-title")).toBeVisible();
  assert.equal(await page.locator(".mgmt-shell-root").count(), 0);
  pass(
    "management storefront link reaches real public store and clears management shell",
  );

  await mkdir(output, { recursive: true });
  await writeFile(
    `${output}/console-results.json`,
    JSON.stringify(
      {
        date: "2026-10-02",
        checks,
        liveGetContracts: [...cache.keys()].map((key) =>
          key.split("?")[0].replace(/\/[0-9a-f-]{36}$/, "/:id"),
        ),
        liveFailures,
        runtimeErrors,
        violations,
        privacy:
          "No existing business mutations; repeat API reads replayed from memory. Screenshots remain only under /tmp for local visual review.",
      },
      null,
      2,
    ),
  );
  assert.deepEqual(liveFailures, [], "live protected reads");
  assert.deepEqual(runtimeErrors, [], "runtime errors");
  assert.deepEqual(
    violations,
    [],
    "console accessibility (see console-results.json)",
  );
  pass(
    "full management console has no recorded API/runtime/accessibility failures",
  );
} catch (error) {
  await mkdir(output, { recursive: true });
  await writeFile(
    `${output}/console-results.json`,
    JSON.stringify(
      {
        date: "2026-10-02",
        checks,
        stage: stage.replace(/[0-9a-f-]{36}/g, ":id"),
        liveFailures,
        runtimeErrors,
        violations,
      },
      null,
      2,
    ),
  );
  console.error(`FAILED stage: ${stage}`);
  throw error;
} finally {
  if (browser) await browser.close();
  if (userId) {
    const result = await service.auth.admin.deleteUser(userId);
    if (result.error)
      throw new Error(
        `Disposable CEO/admin cleanup failed: ${result.error.code || result.error.status}`,
      );
    console.log("PASS disposable CEO/admin deleted");
  }
}
