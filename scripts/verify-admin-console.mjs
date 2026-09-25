// Admin console smoke test: creates a disposable admin user, signs in via UI,
// visits every admin page in EN/HE, asserts clean renders, cleans up.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { randomUUID } from "node:crypto";

nextEnv.loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.env.ADMIN_BASE_URL || "http://127.0.0.1:3105";

if (!supabaseUrl || !publishableKey || !serviceKey) {
  console.log(
    "PASS: verify-admin-console skipped (missing Supabase credentials in .env.local)",
  );
  process.exit(0);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(supabaseUrl, serviceKey, options);

const email = `verify-admin-${Date.now()}@miro-test.local`;
const password = `AdminTest-${randomUUID()}!`;
let userId = null;
let browser = null;
let stage = "create disposable admin account";

const adminPagesEn = [
  "/en/admin",
  "/en/admin/products",
  "/en/admin/inventory",
  "/en/admin/suppliers",
  "/en/admin/sales",
  "/en/admin/customers",
  "/en/admin/analytics",
  "/en/admin/finance",
  "/en/admin/users",
  "/en/admin/requests",
  "/en/admin/audit",
  "/en/admin/settings",
];

const adminPagesHe = ["/he/admin"];

const errorPatterns = [
  "No intl context found",
  "Application error",
  "Internal Server Error",
];

const ignoredConsolePatterns = [
  /_vercel\/speed-insights/,
  /Failed to load chunk/,
];
const ignoredPageErrorPatterns = [/Failed to load chunk/];

async function checkPage(pg, path) {
  const pageErrors = [];
  const consoleErrors = [];

  pg.on("pageerror", (err) => {
    const msg = err.message;
    if (!ignoredPageErrorPatterns.some((p) => p.test(msg))) {
      pageErrors.push(msg);
    }
  });
  pg.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!ignoredConsolePatterns.some((p) => p.test(text))) {
        consoleErrors.push(text);
      }
    }
  });

  const response = await pg.goto(`${baseUrl}${path}`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });

  if (!response || !response.ok()) {
    throw new Error(`HTTP ${response?.status()} for ${path}`);
  }

  const bodyText = await pg.locator("body").innerText();
  for (const pattern of errorPatterns) {
    if (bodyText.includes(pattern)) {
      throw new Error(`Page ${path} contains error pattern: "${pattern}"`);
    }
  }

  if (pageErrors.length > 0) {
    throw new Error(`Page ${path} had page errors: ${pageErrors.join("; ")}`);
  }
  if (consoleErrors.length > 0) {
    throw new Error(
      `Page ${path} had console errors: ${consoleErrors.join("; ")}`,
    );
  }

  // Assert admin nav is visible
  await pg
    .locator(
      'nav.admin-shell__nav, nav[aria-label="Admin navigation"], nav[aria-label="ניווט ניהול"]',
    )
    .waitFor({ state: "visible", timeout: 10_000 })
    .catch(() => {});
  const navVisible = await pg
    .locator(
      'nav.admin-shell__nav, nav[aria-label="Admin navigation"], nav[aria-label="ניווט ניהול"]',
    )
    .isVisible()
    .catch(() => false);
  if (!navVisible) {
    const bodyText = await pg.locator("body").innerText();
    console.error(
      `DEBUG: Page body text (first 2000 chars): ${bodyText.substring(0, 2000)}`,
    );
    throw new Error(`Admin nav not visible on ${path}`);
  }
}

try {
  // Create disposable user with confirmed email
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;

  // Assign admin role via service role (bypasses RLS) - upsert because trigger creates customer role
  const roleUpsert = await service
    .from("user_roles")
    .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id" });
  if (roleUpsert.error) throw roleUpsert.error;

  // Ensure profile has active status and admin role (handle_new_user trigger creates profile)
  const profileUpdate = await service
    .from("profiles")
    .update({ account_status: "active", role: "admin" })
    .eq("id", userId);
  if (profileUpdate.error) throw profileUpdate.error;

  // Launch browser
  browser = await chromium.launch();

  // Check server reachability
  const checkContext = await browser.newContext();
  const reachabilityPage = await checkContext.newPage();
  stage = `verify server reachable at ${baseUrl}`;
  try {
    await reachabilityPage.goto(baseUrl, {
      waitUntil: "networkidle",
      timeout: 15_000,
    });
  } catch {
    throw new Error(
      `Server not reachable at ${baseUrl}. Start the server first (npm run build && npm run start -- --port 3105).`,
    );
  }
  await checkContext.close();

  // Sign in via UI and keep the context for all subsequent visits
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleMessages = [];
  page.on("console", (msg) =>
    consoleMessages.push(`${msg.type()}: ${msg.text()}`),
  );
  page.on("pageerror", (err) =>
    consoleMessages.push(`pageerror: ${err.message}`),
  );
  stage = "UI sign in at /en/login";
  await page.goto(`${baseUrl}/en/login`, { waitUntil: "networkidle" });

  // Fill login form (input names: email, password)
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  // Target the login form's submit button specifically (not the search button)
  // Use Enter key on password field to ensure form submission
  await page.locator('input[name="password"]').press("Enter");

  // Wait for redirect (login client redirects to workspace)
  try {
    await page.waitForURL((url) => url.pathname !== "/en/login", {
      timeout: 20_000,
    });
  } catch {
    console.error("DEBUG: Console messages during login:");
    consoleMessages.forEach((m) => console.error("  " + m));
    throw new Error("Login redirect timeout");
  }

  // Debug: check where we landed
  console.log(`DEBUG: After login, URL = ${page.url()}`);

  // Verify we're logged in by checking we can reach admin
  await checkPage(page, "/en/admin");

  // Test each admin page in English using the same authenticated context
  for (const path of adminPagesEn) {
    stage = `visit ${path}`;
    await checkPage(page, path);
    console.log(`PASS ${path}`);
  }

  // Test Hebrew admin shell using the same context
  for (const path of adminPagesHe) {
    stage = `visit ${path} (RTL)`;
    const pageErrors = [];
    const consoleErrors = [];

    page.on("pageerror", (err) => {
      const msg = err.message;
      if (!ignoredPageErrorPatterns.some((p) => p.test(msg))) {
        pageErrors.push(msg);
      }
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (!ignoredConsolePatterns.some((p) => p.test(text))) {
          consoleErrors.push(text);
        }
      }
    });

    const response = await page.goto(`${baseUrl}${path}`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    if (!response || !response.ok()) {
      throw new Error(`HTTP ${response?.status()} for ${path}`);
    }

    const bodyText = await page.locator("body").innerText();
    for (const pattern of errorPatterns) {
      if (bodyText.includes(pattern)) {
        throw new Error(`Page ${path} contains error pattern: "${pattern}"`);
      }
    }

    if (pageErrors.length > 0) {
      throw new Error(`Page ${path} had page errors: ${pageErrors.join("; ")}`);
    }
    if (consoleErrors.length > 0) {
      throw new Error(
        `Page ${path} had console errors: ${consoleErrors.join("; ")}`,
      );
    }

    // Verify RTL dir on html
    const htmlDir = await page.getAttribute("html", "dir");
    if (htmlDir !== "rtl") {
      throw new Error(`Page ${path} missing dir="rtl" (got ${htmlDir})`);
    }

    console.log(`PASS ${path}`);
  }

  // Verify Settings link navigation
  stage = "verify Settings link navigation";
  await page.goto(`${baseUrl}/en/admin`, { waitUntil: "networkidle" });
  await page.locator('a[href="/en/admin/settings"]').click();
  await page.waitForURL("**/en/admin/settings", { timeout: 10_000 });
  const settingsBody = await page.locator("body").innerText();
  if (
    settingsBody.includes("Application error") ||
    settingsBody.includes("Internal Server Error")
  ) {
    throw new Error("Settings page shows error after navigation");
  }
  console.log("PASS /en/admin/settings (via nav link)");

  await context.close();

  const totalPages = adminPagesEn.length + adminPagesHe.length + 1; // +1 for settings nav test
  console.log(`PASS: admin console smoke (${totalPages} pages)`);
} catch (err) {
  // Never print raw SDK/browser errors: they can include credentials.
  console.error(`FAIL: ${stage}`);
  const msg = err instanceof Error ? err.message : JSON.stringify(err, null, 2);
  console.error(msg);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (userId) {
    const removed = await service.auth.admin.deleteUser(userId);
    if (removed.error) {
      console.error(`FAIL: delete disposable account ${userId}`);
      console.error(removed.error.message);
      process.exitCode = 1;
    } else {
      console.log("PASS: disposable admin account deleted");
    }
  }
}
