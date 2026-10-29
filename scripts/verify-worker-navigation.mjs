// Disposable worker; presentation checks never mutate requests or business data.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.ADMIN_BASE_URL || "http://127.0.0.1:3000";
const output = process.env.NAVBAR_OUTPUT_DIR || "/tmp/miro-worker-navigation";
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
let actorId;
let browser;
const checks = [];
const errors = [];
try {
  const email = `worker-navigation-${randomUUID()}@miro-test.local`;
  const password = `Navigation-${randomUUID()}!`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  actorId = data.user.id;
  for (const result of await Promise.all([
    service
      .from("user_roles")
      .upsert({ user_id: actorId, role: "worker" }, { onConflict: "user_id" }),
    service
      .from("profiles")
      .update({
        role: "worker",
        account_status: "active",
        full_name: "Synthetic worker / עובד בדיקה",
      })
      .eq("id", actorId),
  ]))
    if (result.error) throw result.error;
  browser = await chromium.launch();
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("**/api/track", (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.goto(`${base}/en/login`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="password"]').press("Enter");
  await page.waitForURL((url) => url.pathname.endsWith("/worker"), {
    timeout: 30000,
  });
  await mkdir(output, { recursive: true });
  for (const locale of ["he", "en"]) {
    await page.goto(`${base}/${locale}/worker?navigation=review#main-content`);
    const header = page.locator('[data-worker-navigation="true"]');
    await expect(header).toBeVisible();
    await expect(header.locator('nav a[aria-current="page"]')).toHaveAttribute(
      "href",
      `/${locale}/worker`,
    );
    assert.deepEqual(
      await header
        .locator("nav a")
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href"))),
      [`/${locale}/worker`, `/${locale}/account`, `/${locale}`],
    );
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ["dark", "medium", "light"]) {
        await header.locator(`[data-theme-option="${theme}"]`).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(
          header.locator(`[data-theme-option="${theme}"]`),
        ).toHaveAttribute("aria-pressed", "true");
        const findings = await header.evaluate((node) => {
          const boxes = [...node.querySelectorAll("a, button")]
            .filter((control) => control.getClientRects().length)
            .map((control) => control.getBoundingClientRect());
          return {
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            bounded: boxes.every(
              (box) =>
                box.left >= -1 &&
                box.right <= innerWidth + 1 &&
                box.height >= 32,
            ),
            overlap: boxes.some((box, index) =>
              boxes
                .slice(index + 1)
                .some(
                  (other) =>
                    Math.min(box.right, other.right) -
                      Math.max(box.left, other.left) >
                      1 &&
                    Math.min(box.bottom, other.bottom) -
                      Math.max(box.top, other.top) >
                      1,
                ),
            ),
          };
        });
        assert.deepEqual(
          findings,
          { overflow: false, bounded: true, overlap: false },
          `${locale}/${width}/${theme}`,
        );
        if ([320, 1440].includes(width)) {
          const axe = await new AxeBuilder({ page })
            .include('[data-worker-navigation="true"]')
            .analyze();
          assert.deepEqual(
            axe.violations.map((item) => item.id),
            [],
            `${locale}/${width}/${theme}: axe`,
          );
          if (theme !== "medium")
            await header.screenshot({
              path: `${output}/${locale}-${width}-${theme}.png`,
            });
        }
        checks.push(
          `${locale}/${width}/${theme}: order, theme, bounds and hit areas`,
        );
      }
    }
    await header.locator(".premium-account-trigger").click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.locator(".premium-account-current-area")).toContainText(
      await header.locator("a").first().getAttribute("aria-label"),
    );
    await page.keyboard.press("Escape");
    await expect(header.locator(".premium-account-trigger")).toBeFocused();
    await header
      .getByRole("button", {
        name: locale === "he" ? "Switch to English" : "מעבר לעברית",
        exact: true,
      })
      .click();
    const target = locale === "he" ? "en" : "he";
    await page.waitForURL(
      (url) =>
        url.pathname === `/${target}/worker` &&
        url.search === "?navigation=review" &&
        url.hash === "#main-content",
    );
    checks.push(
      `${locale}: account keyboard and language preserve route/query/hash`,
    );
  }
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/report.json`,
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(
    `PASS ${checks.length} worker navigation checks; evidence: ${output}`,
  );
} finally {
  await browser?.close();
  if (actorId) {
    const { error } = await service.auth.admin.deleteUser(actorId);
    if (error) throw error;
    console.log("Disposable worker deleted");
  }
}
