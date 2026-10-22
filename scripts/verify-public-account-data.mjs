// Read-only public/account/worker QA with disposable identities, saved records and
// request fixtures. Never submits enquiries, checkout, payments or owner changes.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

nextEnv.loadEnvConfig(process.cwd());
const base = new URL(
  process.env.PUBLIC_ACCOUNT_BASE_URL || "http://127.0.0.1:3105",
).origin;
const output =
  process.env.PUBLIC_ACCOUNT_OUTPUT_DIR ||
  "/tmp/miro-data-audit-20261022/public-account";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert.ok(
  url && key && process.env.SUPABASE_SECRET_KEY,
  "Required local Supabase environment is configured",
);
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }),
  },
};
const service = createClient(url, process.env.SUPABASE_SECRET_KEY, options);
const actors = [];
const requestIds = [];
const report = {
  checkedAt: new Date().toISOString(),
  base,
  checks: [],
  layouts: [],
  findings: [],
  runtimeErrors: [],
  failedReads: [],
  blockedWrites: [],
  cleanup: false,
  scope:
    "Real catalog/service reads; disposable customer/worker accounts, saved rows and requests only. No owner catalog/settings/order/stock/payment changes or enquiries. Screenshots private.",
};
let browser;
let stage = "setup";
const pass = (label) => {
  report.checks.push(label);
  console.log("PASS", label);
};
const issue = (data) => {
  report.findings.push(data);
  console.log("FINDING", JSON.stringify(data));
};
const ensure = (result, label) => {
  if (result.error)
    throw new Error(`${label}: ${result.error.code || "database_failure"}`);
  return result.data;
};
const token = randomUUID().slice(0, 8);

async function actor(label, role) {
  const email = `data-audit-${label}-${token}@miro-test.local`;
  const password = `QA-${randomUUID()}Aa!`;
  const user = ensure(
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    }),
    "create disposable actor",
  ).user;
  const account = {
    id: user.id,
    label,
    role,
    email,
    name: `QA ${label} ${token}`,
  };
  actors.push(account);
  ensure(
    await service
      .from("user_roles")
      .upsert({ user_id: account.id, role }, { onConflict: "user_id" }),
    "assign disposable role",
  );
  ensure(
    await service
      .from("profiles")
      .update({ role, account_status: "active", full_name: account.name })
      .eq("id", account.id),
    "activate disposable profile",
  );
  account.client = createClient(url, key, options);
  const signed = ensure(
    await account.client.auth.signInWithPassword({ email, password }),
    "authenticate disposable actor",
  );
  account.cookie = {
    name: `sb-${new URL(url).hostname.split(".")[0]}-auth-token`,
    value: `base64-${Buffer.from(JSON.stringify(signed.session)).toString("base64url")}`,
    url: base,
    httpOnly: true,
    sameSite: "Lax",
  };
  return account;
}

async function context(account) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  if (account) await ctx.addCookies([account.cookie]);
  await ctx.route("**/*", async (route) => {
    const request = route.request();
    const address = new URL(request.url());
    if (address.origin !== base) return route.continue();
    if (address.pathname === "/api/track")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"ok":true}',
      });
    if (
      !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
      address.pathname !== "/api/commerce/eligibility"
    ) {
      report.blockedWrites.push({
        path: address.pathname,
        method: request.method(),
      });
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: '{"error":"QA blocked business writes"}',
      });
    }
    return route.continue();
  });
  return ctx;
}

function observe(page, role) {
  page.on("pageerror", (error) =>
    report.runtimeErrors.push({
      role,
      path: new URL(page.url()).pathname,
      message: error.message.slice(0, 250),
    }),
  );
  page.on("response", (response) => {
    const address = new URL(response.url());
    if (
      address.origin === base &&
      address.pathname.startsWith("/api/") &&
      response.status() >= 400
    )
      report.failedReads.push({
        role,
        path: address.pathname,
        status: response.status(),
      });
  });
}

async function visit(page, path) {
  stage = path;
  const response = await page.goto(`${base}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  assert.ok(response, `${path} returned a response`);
  await page.locator("h1").first().waitFor({ timeout: 25_000 });
  await page.waitForFunction(
    () => document.documentElement.dataset.motionReady === "true",
    null,
    { timeout: 20_000 },
  );
  return response;
}

async function layouts(page, path, role, options = {}) {
  const response = await visit(page, path);
  if (response.status() !== 200)
    issue({ kind: "route_status", path, role, status: response.status() });
  await page.locator(".premium-skip-link").focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page
      .locator("#main-content")
      .evaluate((element) => document.activeElement === element),
    true,
    `${path} keyboard skip link reaches main`,
  );
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["dark", "medium", "light"]) {
      await page.evaluate(
        (theme) =>
          document.querySelector(`[data-theme-option="${theme}"]`).click(),
        theme,
      );
      await page.waitForFunction(
        (theme) => document.documentElement.dataset.theme === theme,
        theme,
      );
      const geometry = await page.evaluate(() => ({
        viewport: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        direction: document.documentElement.dir,
        hiddenPage: getComputedStyle(document.body).display === "none",
      }));
      assert.equal(
        geometry.direction,
        path.startsWith("/he") ? "rtl" : "ltr",
        `${path} reading direction`,
      );
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const violations = axe.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        targets: v.nodes.map((n) => n.target),
      }));
      report.layouts.push({
        path,
        role,
        width,
        theme,
        state: options.state || "default",
        ...geometry,
        violations,
      });
      if (geometry.scrollWidth > width + 1 || geometry.hiddenPage)
        issue({ kind: "layout", path, role, width, theme, geometry });
      if (violations.length)
        issue({ kind: "accessibility", path, role, width, theme, violations });
      if (
        width === 320 &&
        theme === "light" &&
        (options.screenshot ||
          path.endsWith("/account") ||
          path.endsWith("/worker"))
      )
        await page.screenshot({
          path: `${output}/${role}-${path.replaceAll("/", "_")}-320-light.png`,
          fullPage: true,
        });
    }
  }
  pass(
    `${role} ${path}: bilingual direction, desktop/mobile and three-theme axe/layout recorded`,
  );
}

try {
  await mkdir(output, { recursive: true, mode: 0o700 });
  const products = ensure(
    await service
      .from("products")
      .select("id,slug,name_en,name_he,category_id,status,out_of_stock_policy")
      .eq("status", "active")
      .order("created_at")
      .limit(100),
    "read current catalog",
  );
  const categories = ensure(
    await service
      .from("categories")
      .select("id,slug,parent_id,name_en,name_he"),
    "read current categories",
  );
  const services = ensure(
    await service
      .from("services")
      .select("slug,name_en,name_he")
      .eq("is_active", true)
      .order("sort_order"),
    "read current published services",
  );
  const product = products.find(
    (row) =>
      row.out_of_stock_policy !== "hide_from_public" &&
      categories.some(
        (cat) => cat.id === row.category_id && cat.parent_id === null,
      ),
  );
  assert.ok(
    product && services.length,
    "Current visible catalog and published services exist",
  );
  const root = categories.find((row) => row.id === product.category_id);
  const routeAliases = {
    cameras: "cameras",
    "security-cameras": "cameras",
    alarms: "alarms",
    "alarm-systems": "alarms",
    intercom: "intercom",
    "intercom-access": "intercom",
    networking: "networking",
    "network-wifi": "networking",
  };
  const category = routeAliases[root.slug] || root.slug;
  const customerA = await actor("customer-a", "customer");
  const customerB = await actor("customer-b", "customer");
  const worker = await actor("worker", "worker");
  for (const account of [customerA, customerB])
    ensure(
      await service
        .from("saved_products")
        .insert({ user_id: account.id, product_id: product.id }),
      "seed disposable saved product",
    );
  const fixtureRows = [
    {
      id: randomUUID(),
      customer_id: customerA.id,
      name: customerA.name,
      email: customerA.email,
      message: `QA assigned ${token}`,
      assigned_to: worker.id,
      status: "waiting_customer",
    },
    {
      id: randomUUID(),
      customer_id: customerB.id,
      name: customerB.name,
      email: customerB.email,
      message: `QA unassigned ${token}`,
      assigned_to: null,
      status: "new",
    },
  ];
  requestIds.push(...fixtureRows.map((row) => row.id));
  ensure(
    await service.from("service_requests").insert(fixtureRows),
    "seed disposable request fixtures without intake/outbound notifications",
  );
  browser = await chromium.launch();
  const visitor = await context();
  const publicPage = await visitor.newPage();
  observe(publicPage, "visitor");
  for (const locale of ["en", "he"]) {
    for (const path of [
      "",
      "/home",
      `/store/${category}`,
      `/store/${category}/${product.slug}`,
      "/services",
      `/services/${services[0].slug}`,
      "/contact",
      "/about",
      "/cart",
      "/checkout",
    ])
      await layouts(publicPage, `/${locale}${path}`, "visitor", {
        screenshot: path.includes(product.slug),
      });
    await visit(publicPage, `/${locale}`);
    assert.ok(
      await publicPage.locator(".sf-product-card").count(),
      "Current real public products render",
    );
    await visit(publicPage, `/${locale}/services`);
    assert.equal(
      await publicPage.locator("#expertise .experience-category-card").count(),
      services.length,
      "Published service count matches current database",
    );
    await visit(publicPage, `/${locale}/store/${category}/${product.slug}`);
    assert.equal(
      await publicPage.locator("#product-title").innerText(),
      locale === "he" ? product.name_he : product.name_en,
      "Current localized product title matches the database",
    );
    await publicPage.evaluate(
      (item) => localStorage.setItem("miro-cart-v1", JSON.stringify([item])),
      {
        productId: product.id,
        variantId: null,
        slug: product.slug,
        category,
        name: "QA cached cart item",
        imageUrl: null,
        unitPrice: 123.45,
        quantity: 2,
      },
    );
    await layouts(publicPage, `/${locale}/cart`, "visitor", {
      state: "populated-local-fixture",
    });
    assert.equal(
      await publicPage.locator(".sf-cart-stepper output").innerText(),
      "2",
    );
    assert.equal(
      (await publicPage.locator(".sf-cart-line-total").innerText()).replace(
        /[^0-9]/g,
        "",
      ),
      "24690",
    );
    await publicPage.locator(".sf-cart-stepper button").last().focus();
    await publicPage.keyboard.press("Enter");
    assert.equal(
      await publicPage.locator(".sf-cart-stepper output").innerText(),
      "3",
    );
    assert.equal(
      (await publicPage.locator(".sf-cart-line-total").innerText()).replace(
        /[^0-9]/g,
        "",
      ),
      "37035",
    );
    await layouts(publicPage, `/${locale}/checkout`, "visitor", {
      state: "populated-local-fixture",
    });
    await publicPage.locator(".sf-checkout-submit").focus();
    await publicPage.keyboard.press("Enter");
    await publicPage.locator(".sf-checkout-error").waitFor();
    assert.equal(
      await publicPage
        .locator(".sf-checkout-error")
        .evaluate((element) => element === document.activeElement),
      true,
      "Missing-field validation focuses the message without making a business write",
    );
    await publicPage.evaluate(() => localStorage.removeItem("miro-cart-v1"));
    pass(
      `${locale} populated cart quantity/total, keyboard increment and checkout validation without submission`,
    );
    for (const privatePath of ["account", "worker", "admin"]) {
      await publicPage.goto(`${base}/${locale}/${privatePath}`, {
        waitUntil: "domcontentloaded",
      });
      await publicPage.waitForURL(`${base}/${locale}/login`, {
        timeout: 30_000,
      });
      assert.equal(
        new URL(publicPage.url()).pathname,
        `/${locale}/login`,
        `Visitor cannot load ${privatePath}`,
      );
    }
  }
  for (const path of [
    "/api/account/saved-products",
    "/api/management/requests",
    "/api/management/inventory",
  ]) {
    const response = await visitor.request.get(`${base}${path}`);
    assert.ok([401, 403].includes(response.status()), `Visitor denied ${path}`);
  }
  pass("visitor public data counts and authenticated page/API separation");

  for (const account of [customerA, customerB, worker]) {
    const ctx = await context(account);
    const page = await ctx.newPage();
    observe(page, account.role);
    const own = ensure(
      await account.client
        .from("service_requests")
        .select("id,customer_id,assigned_to")
        .in("id", requestIds),
      "request row-level read",
    );
    const expected =
      account.role === "worker"
        ? [fixtureRows[0].id]
        : [fixtureRows[account === customerA ? 0 : 1].id];
    assert.deepEqual(
      own.map((row) => row.id).sort(),
      expected.sort(),
      `${account.label} reads only own/assigned fixture`,
    );
    const otherSaved = ensure(
      await account.client
        .from("saved_products")
        .select("user_id")
        .eq("user_id", account === customerA ? customerB.id : customerA.id),
      "cross-customer saved read",
    );
    assert.equal(otherSaved.length, 0);
    const visibleProfiles = ensure(
      await account.client
        .from("profiles")
        .select("id")
        .in(
          "id",
          actors.map((item) => item.id),
        ),
      "profile row-level read",
    );
    assert.deepEqual(
      visibleProfiles.map((item) => item.id),
      [account.id],
      `${account.label} cannot read another fixture profile`,
    );
    for (const locale of ["en", "he"]) {
      if (account !== customerB)
        await layouts(
          page,
          `/${locale}/${account.role === "worker" ? "worker" : "account"}`,
          account.role,
        );
      await visit(page, `/${locale}/account`);
      assert.equal(
        await page.locator(".account-profile-identity h1").innerText(),
        account.name,
      );
      assert.equal(
        await page.locator(".account-saved-card").count(),
        account.role === "customer" ? 1 : 0,
      );
      assert.equal(
        await page.locator(".account-history-row").count(),
        account.role === "customer" ? 1 : 0,
      );
      if (account.role === "worker") {
        await visit(page, `/${locale}/worker`);
        const text = await page.locator("main").innerText();
        assert.ok(text.includes(fixtureRows[0].message));
        assert.ok(
          !text.includes(fixtureRows[1].message) &&
            !text.includes(customerB.name),
        );
        const status = await page.locator('select[name="status"]').inputValue();
        if (status !== fixtureRows[0].status)
          issue({
            kind: "incorrect_worker_status",
            path: `/${locale}/worker`,
            expected: fixtureRows[0].status,
            actual: status,
            explanation:
              "Waiting-customer request renders another status; worker update could change current state without an intentional selection.",
          });
      } else {
        await page.goto(`${base}/${locale}/worker`, {
          waitUntil: "domcontentloaded",
        });
        await page.waitForURL(`${base}/${locale}/account`, { timeout: 30_000 });
        assert.equal(new URL(page.url()).pathname, `/${locale}/account`);
      }
      await page.goto(`${base}/${locale}/admin`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForURL(
        (address) => address.pathname !== `/${locale}/admin`,
        { timeout: 30_000 },
      );
      assert.notEqual(new URL(page.url()).pathname, `/${locale}/admin`);
    }
    const saved = await ctx.request.get(`${base}/api/account/saved-products`);
    assert.equal(saved.status(), 200);
    assert.equal(
      (await saved.json()).savedProducts.length,
      account.role === "customer" ? 1 : 0,
    );
    for (const route of [
      "requests",
      "inventory",
      "customers",
      "commerce/expenses",
    ]) {
      const response = await ctx.request.get(`${base}/api/management/${route}`);
      assert.equal(
        response.status(),
        403,
        `${account.role} denied management/${route}`,
      );
    }
    pass(
      `${account.label}: current own profile/saved/request data, RLS cross-user isolation and management denial`,
    );
    await ctx.close();
  }
  await visitor.close();
  assert.deepEqual(
    report.blockedWrites,
    [],
    "No business writes attempted by browsing",
  );
  assert.deepEqual(report.runtimeErrors, [], "No browser runtime errors");
  pass("no browser runtime errors or business write attempts");
} catch (error) {
  report.fatal = { stage, message: String(error.message).slice(0, 500) };
  console.error("FAIL", JSON.stringify(report.fatal));
  process.exitCode = 1;
} finally {
  await browser?.close();
  let clean = true;
  if (requestIds.length) {
    const removed = await service
      .from("service_requests")
      .delete()
      .in("id", requestIds);
    clean &&= !removed.error;
  }
  if (actors.length) {
    const removed = await service
      .from("saved_products")
      .delete()
      .in(
        "user_id",
        actors.map((account) => account.id),
      );
    clean &&= !removed.error;
  }
  for (const account of actors) {
    const removed = await service.auth.admin.deleteUser(account.id);
    clean &&= !removed.error;
  }
  if (requestIds.length) {
    const remaining = await service
      .from("service_requests")
      .select("id")
      .in("id", requestIds);
    clean &&= !remaining.error && remaining.data.length === 0;
  }
  if (actors.length) {
    for (const [table, column] of [
      ["saved_products", "user_id"],
      ["profiles", "id"],
    ]) {
      const remaining = await service
        .from(table)
        .select(column)
        .in(
          column,
          actors.map((account) => account.id),
        );
      clean &&= !remaining.error && remaining.data.length === 0;
    }
  }
  report.cleanup = clean;
  await mkdir(output, { recursive: true, mode: 0o700 });
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  if (!clean) {
    console.error("FAIL disposable fixture cleanup");
    process.exitCode = 1;
  }
  console.log(
    `Completed ${report.layouts.length} layouts, ${report.checks.length} checks, ${report.findings.length} findings; cleanup ${clean}; ${output}`,
  );
}
