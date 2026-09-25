// Opt-in integration check: creates and deletes one disposable Supabase user.
// Generates recovery links without sending email. Requires the local dev server
// and the private service key in ignored local configuration.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { randomUUID } from "node:crypto";

nextEnv.loadEnvConfig(process.cwd());
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  options,
);
const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  options,
);
const email = `miro-recovery-check-${randomUUID()}@example.com`;
let password = `Initial-${randomUUID()}!`;
let id;
let browser;
let stage = "create disposable account";

try {
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  id = created.data.user.id;
  browser = await chromium.launch();

  for (const origin of ["http://localhost:3000", "http://127.0.0.1:3000"]) {
    for (const locale of ["he", "en"]) {
      stage = `verify ${origin} ${locale} redirect acceptance`;
      const redirect = new URL("/auth/callback", origin);
      redirect.searchParams.set("next", `/${locale}/reset-password`);
      const generated = await service.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: redirect.toString() },
      });
      if (generated.error) throw generated.error;
      const link = generated.data.properties.action_link;
      if (
        new URL(link).searchParams.get("redirect_to") !== redirect.toString()
      ) {
        throw new Error("Supabase rejected the requested callback");
      }

      const context = await browser.newContext();
      const page = await context.newPage();
      stage = `open ${origin} ${locale} reset form`;
      await page.goto(link);
      await page.locator('main input[name="password"]').waitFor({
        state: "visible",
        timeout: 20_000,
      });
      const destination = new URL(page.url());
      if (
        destination.origin !== origin ||
        destination.pathname !== `/${locale}/reset-password` ||
        destination.hash
      ) {
        throw new Error("Unexpected recovery destination or uncleared tokens");
      }

      stage = `update ${origin} ${locale} password and verify sign-in`;
      const newPassword = `Updated-${randomUUID()}!`;
      await page.locator('input[name="password"]').fill(newPassword);
      await page.locator('input[name="confirmPassword"]').fill(newPassword);
      await page.locator('main button[type="submit"]').click();
      await page.waitForURL((url) => url.pathname === `/${locale}/login`, {
        timeout: 20_000,
      });
      const login = await client.auth.signInWithPassword({
        email,
        password: newPassword,
      });
      if (login.error) throw login.error;
      await client.auth.signOut();
      const oldLogin = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (!oldLogin.error) throw new Error("Old password still accepted");
      password = newPassword;
      await context.close();
      console.log(
        `PASS: ${origin} ${locale}: real recovery, password update, new login, old password rejected`,
      );
    }
  }
} catch {
  // Never print raw SDK/browser errors: they can include recovery credentials.
  console.error(`FAIL: ${stage}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (id) {
    const removed = await service.auth.admin.deleteUser(id);
    if (removed.error) {
      console.error(`FAIL: delete disposable account ${id}`);
      process.exitCode = 1;
    } else {
      console.log("PASS: disposable account deleted; no emails sent");
    }
  }
}
