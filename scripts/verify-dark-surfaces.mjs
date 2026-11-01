// Read-only UI QA with disposable identities; never submit business forms.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.BASE_URL || "http://127.0.0.1:3000";
const output = process.env.DARK_OUTPUT_DIR || "/tmp/miro-black-completion";
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
const actors = [];
const results = [];
let browser;
let failure;
async function paint(page) {
  return page.evaluate(() => {
    const properties = [
      "background-color",
      "background-image",
      "color",
      "border-color",
      "box-shadow",
      "backdrop-filter",
    ];
    return Array.from(
      document.querySelectorAll(
        "html, body, header, main *, .account-dashboard *, [data-worker-surface] *",
      ),
    )
      .filter((el) => el.checkVisibility())
      .map((el) =>
        properties.map((name) => getComputedStyle(el).getPropertyValue(name)),
      );
  });
}
try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
  for (const role of ["customer", "worker"]) {
    const email = `dark-qa-${randomUUID()}@miro-test.local`;
    const password = `Dark-${randomUUID()}!`;
    const created = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    const id = created.data.user.id;
    actors.push(id);
    for (const result of await Promise.all([
      service
        .from("user_roles")
        .upsert({ user_id: id, role }, { onConflict: "user_id" }),
      service
        .from("profiles")
        .update({
          role,
          account_status: "active",
          full_name: "Dark appearance QA / בדיקת תצוגה",
        })
        .eq("id", id),
    ]))
      if (result.error) throw result.error;
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem("miro-theme", "dark"));
    await page.route("**/api/track", (route) => route.fulfill({ status: 204 }));
    await page.goto(`${base}/en/login`);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('input[name="password"]').press("Enter");
    await page.waitForURL((url) => !url.pathname.endsWith("/login"));
    for (const locale of ["en", "he"])
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(
          `${base}/${locale}/${role === "worker" ? "worker" : "account"}`,
        );
        await expect(
          page.locator(
            role === "worker"
              ? '[data-worker-surface="true"]'
              : ".account-dashboard",
          ),
        ).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute(
          "data-motion-ready",
          "true",
        );
        await expect(page.locator("html")).toHaveAttribute("data-glass", "on");
        for (const theme of ["dark", "medium", "light"]) {
          await page
            .locator(`[data-theme-option="${theme}"]`)
            .filter({ visible: true })
            .first()
            .click();
          await page.evaluate(() => document.fonts.ready);
          await page.evaluate(
            () =>
              new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              ),
          );
          const tokens = await page.evaluate(() => {
            const s = getComputedStyle(document.documentElement);
            return Object.fromEntries(
              [
                "--background",
                "--surface",
                "--surface-muted",
                "--surface-hover",
                "--primary",
                "--success-text",
                "--error-text",
              ].map((k) => [k, s.getPropertyValue(k).trim()]),
            );
          });
          if (theme === "dark") {
            assert.equal(tokens["--background"], "#050505");
            assert.equal(tokens["--surface"], "#0c0c0c");
            assert.equal(tokens["--surface-muted"], "#171717");
            assert.equal(tokens["--surface-hover"], "#242424");
          } else {
            const on = await paint(page);
            await page.evaluate(() => {
              document.documentElement.dataset.glass = "off";
            });
            assert.deepEqual(
              await paint(page),
              on,
              `${role}/${locale}/${width}/${theme} unchanged`,
            );
            await page.evaluate(() => {
              document.documentElement.dataset.glass = "on";
            });
          }
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            "No horizontal overflow",
          );
          const axe = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
          const name = `${role}-${locale}-${width}-${theme}`;
          if (axe.violations.length)
            await writeFile(
              `${output}/${name}-axe.json`,
              JSON.stringify(axe.violations, null, 2),
            );
          assert.deepEqual(
            axe.violations.map((v) => v.id),
            [],
            `${name} axe`,
          );
          if (theme === "dark")
            await page.screenshot({
              path: `${output}/${name}.png`,
              fullPage: true,
            });
          results.push({ name, tokens, axe: 0 });
          console.log(`PASS ${name}`);
        }
      }
    await context.close();
  }
} catch (error) {
  failure = String(error?.message ?? error).split(/\r?\n/, 1)[0];
} finally {
  await browser?.close();
  for (const id of actors) {
    const removed = await service.auth.admin.deleteUser(id);
    if (removed.error) {
      failure =
        "Disposable identity cleanup failed; engineering must clean up the recorded ID";
      console.error("Cleanup needed:", id);
    }
  }
  await writeFile(
    `${output}/protected-results.json`,
    JSON.stringify({ results, failure, actorsRemoved: actors.length }, null, 2),
  );
}
if (failure) {
  console.error(failure);
  process.exitCode = 1;
}
