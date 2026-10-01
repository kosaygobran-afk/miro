// Opt-in live smoke check. Creates and removes disposable customer and worker
// accounts in the configured Supabase project.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { randomUUID } from "node:crypto";

nextEnv.loadEnvConfig(process.cwd());

const baseUrl = process.env.ROLE_BASE_URL || "http://127.0.0.1:3105";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const privateKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !privateKey) {
  console.error("Missing Supabase URL or private server key");
  process.exit(1);
}

const service = createClient(supabaseUrl, privateKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const accounts = [];
let browser;
let stage = "setup";

async function createAccount(role) {
  const email = `verify-${role}-${randomUUID()}@miro-test.local`;
  const password = `RoleTest-${randomUUID()}!`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const userId = created.data.user.id;
  accounts.push(userId);
  const assigned = await service
    .from("user_roles")
    .upsert({ user_id: userId, role }, { onConflict: "user_id" });
  if (assigned.error) throw assigned.error;
  const profile = await service
    .from("profiles")
    .update({ account_status: "active", role })
    .eq("id", userId);
  if (profile.error) throw profile.error;
  return { email, password };
}

async function checkRole(role, account) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    stage = `${role} login`;
    await page.goto(`${baseUrl}/en/login`, { waitUntil: "networkidle" });
    await page.locator('input[name="email"]').fill(account.email);
    await page.locator('input[name="password"]').fill(account.password);
    await page.locator('input[name="password"]').press("Enter");
    await page.waitForURL((url) => url.pathname !== "/en/login", {
      timeout: 20_000,
    });

    const allowedPath = role === "worker" ? "/en/worker" : "/en/account";
    stage = `${role} allowed page`;
    const allowed = await page.goto(`${baseUrl}${allowedPath}`, {
      waitUntil: "networkidle",
    });
    if (!allowed?.ok() || page.url().endsWith("/en/login")) {
      throw new Error(`${allowedPath} did not load for ${role}`);
    }

    stage = `${role} management isolation`;
    const inventory = await context.request.get(
      `${baseUrl}/api/management/inventory`,
    );
    if (inventory.status() !== 403) {
      throw new Error(`${role} inventory API returned ${inventory.status()}`);
    }
    const admin = await page.goto(`${baseUrl}/en/admin`, {
      waitUntil: "networkidle",
    });
    if (admin?.ok() && new URL(page.url()).pathname === "/en/admin") {
      throw new Error(`${role} reached the Admin page`);
    }
    console.log(`PASS: ${role} allowed page and Admin/API isolation`);
  } finally {
    await context.close();
  }
}

try {
  const customer = await createAccount("customer");
  const worker = await createAccount("worker");
  browser = await chromium.launch();
  await checkRole("customer", customer);
  await checkRole("worker", worker);
} catch (error) {
  console.error(`FAIL: ${stage}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  for (const userId of accounts) {
    const removed = await service.auth.admin.deleteUser(userId);
    if (removed.error) {
      console.error("FAIL: disposable account cleanup", removed.error.message);
      process.exitCode = 1;
    }
  }
  console.log(`Disposable account cleanup attempted: ${accounts.length}`);
}
