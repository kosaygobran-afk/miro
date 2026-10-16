// Protected chrome QA: disposable actors, synthetic catalog reads, no business writes.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium, webkit } from "@playwright/test";
import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

nextEnv.loadEnvConfig(process.cwd());
const engine = process.env.NAVBAR_BROWSER || "chromium";
const browserType = { chromium, webkit }[engine];
assert.ok(browserType, "Supported local engines: chromium or webkit");
const base = process.env.ADMIN_BASE_URL || "http://127.0.0.1:3226";
const output =
  process.env.NAVBAR_OUTPUT_DIR || join(tmpdir(), `miro-navbar-${engine}`);
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
const actorIds = [];
const checks = [];
const errors = [];
let browser;
try {
  browser = await browserType.launch();
  await mkdir(output, { recursive: true });
  for (const role of ["ceo", "admin"]) {
    const email = `navbar-${randomUUID()}@miro-test.local`;
    const password = `Navbar-${randomUUID()}!`;
    const result = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (result.error) throw result.error;
    const id = result.data.user.id;
    actorIds.push(id);
    for (const mutation of await Promise.all([
      service
        .from("user_roles")
        .upsert({ user_id: id, role }, { onConflict: "user_id" }),
      service
        .from("profiles")
        .update({
          role,
          account_status: "active",
          full_name: "Synthetic navbar QA",
        })
        .eq("id", id),
    ]))
      if (mutation.error) throw mutation.error;
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await context.route("**/api/track", (route) =>
      route.fulfill({ status: 204 }),
    );
    // Do not exercise speculative protected routes in a navbar-only harness.
    // Direct page visits and selected-page API authorization remain real.
    await context.route("**/*", (route) => {
      const headers = route.request().headers();
      if (
        headers["next-router-prefetch"] ||
        headers["next-router-segment-prefetch"] ||
        headers.purpose === "prefetch"
      ) {
        return route.fulfill({ status: 204 });
      }
      return route.fallback();
    });
    await page.goto(`${base}/en/login`, { waitUntil: "networkidle" });
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('input[name="password"]').press("Enter");
    await page.waitForURL((url) => !url.pathname.endsWith("/login"), {
      timeout: 30000,
    });
    await context.route("**/api/management/**", (route) => {
      assert.equal(
        route.request().method(),
        "GET",
        "Navbar QA must not write business data",
      );
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/products"))
        return route.fulfill({ json: { products: [], totalCount: 0 } });
      return route.continue();
    });
    for (const locale of ["en", "he"]) {
      await page.goto(`${base}/${locale}`, { waitUntil: "networkidle" });
      const publicHeights = {};
      for (const width of [320, 390, 768, 1024, 1200, 1440, 1920]) {
        await page.setViewportSize({ width, height: 1000 });
        publicHeights[width] = await page
          .locator(".premium-header")
          .evaluate((node) => node.getBoundingClientRect().height);
      }
      await page.goto(`${base}/${locale}/admin/products`, {
        waitUntil: "networkidle",
      });
      await expect(page.locator(".mgmt-topbar")).toBeVisible();
      for (const width of [320, 390, 768, 1024, 1200, 1440, 1920]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const theme of ["dark", "medium", "light"]) {
          await page.evaluate((theme) => {
            document.documentElement.dataset.theme = theme;
          }, theme);
          await expect
            .poll(() =>
              page
                .locator(".mgmt-topbar")
                .evaluate((node) => node.getBoundingClientRect().height),
            )
            .toBe(publicHeights[width]);
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            `${role}/${locale}/${width}/${theme} overflow`,
          );
          const controls = page.locator(".mgmt-topbar__controls");
          if (width < 1200) {
            const toggle = page.locator(".mgmt-topbar__controls-toggle");
            if (!(await controls.isVisible())) await toggle.click();
            await expect(controls).toBeVisible();
            const box = await controls.boundingBox();
            assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
            await expect(
              controls.locator(".mgmt-topbar__theme-selector"),
            ).toBeVisible();
            await page.keyboard.press("Escape");
            await expect(controls).toBeHidden();
            await expect(toggle).toBeFocused();
          } else {
            await expect(controls).toBeVisible();
            await expect(
              page.locator(".mgmt-topbar__controls-toggle"),
            ).toBeHidden();
          }
          checks.push(
            `${role}/${locale}/${width}/${theme}: equal navbar heights and reachable contained controls`,
          );
        }
      }
      await page.setViewportSize({ width: 390, height: 900 });
      await page.locator(".mgmt-topbar__controls-toggle").click();
      await page
        .getByRole("button", {
          name: locale === "he" ? "תצוגת סביבת העבודה" : "Workspace display",
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(page.locator(".mgmt-topbar__controls")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator(".mgmt-topbar__controls")).toBeHidden();
      await page.locator(".mgmt-account__trigger").click();
      await expect(page.locator(".mgmt-account__current-area")).toContainText(
        locale === "he" ? "סביבת הניהול" : "Management console",
      );
      const account = await page
        .locator(".mgmt-account__popover")
        .boundingBox();
      assert.ok(account.x >= 0 && account.x + account.width <= 391);
      await page.keyboard.press("Escape");
      await expect(page.locator(".mgmt-account__trigger")).toBeFocused();
      await page.locator(".mgmt-topbar__controls-toggle").click();
      const axe = await new AxeBuilder({ page })
        .include(".mgmt-topbar")
        .analyze();
      if (axe.violations.length)
        await writeFile(
          join(output, `axe-${role}-${locale}.json`),
          JSON.stringify(axe.violations, null, 2),
        );
      assert.deepEqual(
        axe.violations.map((item) => item.id),
        [],
      );
      await page.screenshot({
        path: join(output, `${role}-${locale}-390.png`),
      });
      await page.keyboard.press("Escape");
      // The same mounted dialog survives a layout change; Escape restores a visible opener.
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page
        .getByRole("button", {
          name: locale === "he" ? "תצוגת סביבת העבודה" : "Workspace display",
          exact: true,
        })
        .click();
      await expect(dialog).toBeVisible();
      await page.setViewportSize({ width: 390, height: 900 });
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(page.locator(".mgmt-topbar__controls")).toBeVisible();
      checks.push(
        `${role}/${locale}: nested Escape, focus, account context/bounds, resize preservation and navbar axe`,
      );
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    join(output, "results.json"),
    JSON.stringify({ engine, checks, errors }, null, 2),
  );
  console.log(
    `PASS ${checks.length} navbar checks in ${engine}; evidence ${output}`,
  );
} finally {
  await browser?.close();
  for (const id of actorIds) {
    const result = await service.auth.admin.deleteUser(id);
    if (result.error) throw result.error;
  }
  console.log(`Removed ${actorIds.length} disposable navbar actors`);
}
