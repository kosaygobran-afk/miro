// Protected global glass QA. Disposable auth only; every settings PUT is mocked
// or intentionally denied. Successful owner settings/commerce writes never run.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.ADMIN_BASE_URL || "http://127.0.0.1:3000";
const output =
  process.env.GLASS_OUTPUT_DIR || join(tmpdir(), "miro-glass-management");
assert.ok(process.env.NEXT_PUBLIC_SUPABASE_URL, "Supabase URL required");
assert.ok(process.env.SUPABASE_SECRET_KEY, "Server auth key required");
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
const runtimeErrors = [];
const blockedWrites = [];
const cleanupErrors = [];
const routingErrors = [];
const rasterComparisons = [];
let closing = false;
let browser;
let activePage;
let failure;

// Playwright request call logs can contain synthetic authentication cookies.
// Keep private evidence useful without retaining headers or multi-line dumps.
const errorSummary = (error) =>
  String(error?.message ?? error).split(/\r?\n/, 1)[0];

// Playwright can finish an in-flight RSC fixture after its context closes.
// Swallow only that teardown case; every other routing failure is evidence.
async function guardedRoute(route, handler) {
  try {
    await handler(route);
  } catch (error) {
    let pageClosed = false;
    try {
      pageClosed = route.request().frame().page().isClosed();
    } catch {
      /* worker request */
    }
    if (!(closing || pageClosed)) routingErrors.push(errorSummary(error));
    await route.abort().catch(() => {});
  }
}

async function settlePaint(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

async function snapshot(page) {
  return page.evaluate(() => {
    const tokens = (node) => {
      if (!node) return null;
      const style = getComputedStyle(node);
      return Object.fromEntries(
        [...style]
          .filter((key) => key.startsWith("--") && !key.startsWith("--glass-"))
          .sort()
          .map((key) => [key, style.getPropertyValue(key).trim()]),
      );
    };
    const paint = (node) => {
      if (!node) return null;
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return {
        background: style.background,
        color: style.color,
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        backdropFilter: style.backdropFilter,
        opacity: style.opacity,
        geometry: [box.x, box.y, box.width, box.height],
      };
    };
    return {
      rootTokens: tokens(document.documentElement),
      protectedTokens: tokens(document.querySelector(".mgmt-shell")),
      topbar: paint(document.querySelector(".mgmt-topbar")),
      drawer: paint(
        document.querySelector(".mgmt-drawer-root--open .mgmt-drawer"),
      ),
      topbarChildren: Array.from(
        document.querySelectorAll(".mgmt-topbar *"),
      ).map(paint),
      settingsSurface: paint(document.querySelector("#settings-glass")),
    };
  });
}

async function parkChrome(page) {
  // Element screenshots scroll their target into view. Do that before recording
  // any geometry or translucent underlay, then use the same viewport throughout.
  await page.locator(".mgmt-topbar").scrollIntoViewIfNeeded();
  await settlePaint(page);
}

async function assertRaster(actual, expected, name, tolerance = 2) {
  const a = await sharp(actual)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const b = await sharp(expected)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.deepEqual(a.info, b.info, `${name}: identical raster dimensions`);
  let maxDelta = 0;
  let changedPixels = 0;
  for (let pixel = 0; pixel < a.info.width * a.info.height; pixel++) {
    let changed = false;
    for (let channel = 0; channel < a.info.channels; channel++) {
      const offset = pixel * a.info.channels + channel;
      const delta = Math.abs(a.data[offset] - b.data[offset]);
      maxDelta = Math.max(maxDelta, delta);
      changed ||= delta !== 0;
    }
    if (changed) changedPixels++;
  }
  rasterComparisons.push({
    name,
    maxDelta,
    changedPixels,
    pixels: a.info.width * a.info.height,
  });
  // CSSOM invalidation can re-rasterize translucent control shadows by 1–2
  // channel levels in Chromium. All paint/geometry properties remain exact;
  // only this decoded-raster rounding tolerance is allowed and reported.
  assert.ok(
    maxDelta <= tolerance,
    `${name}: raster channel delta ${maxDelta} exceeds ${tolerance}`,
  );
}

async function disableGlassRules(page) {
  return page.evaluate(() => {
    const changes = [];
    const visit = (rules) => {
      for (const rule of rules) {
        if (rule.selectorText?.includes("data-glass")) {
          changes.push([rule, rule.selectorText]);
          rule.selectorText = rule.selectorText.replaceAll(
            "data-glass",
            "data-glass-qa-disabled",
          );
        }
        if (rule.cssRules) visit(rule.cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        visit(sheet.cssRules);
      } catch {
        // External sheets are irrelevant; the enhancement is bundled locally.
      }
    }
    window.__miroGlassRuleChanges = changes;
    document.documentElement.dataset.glass = "on";
    return changes.length;
  });
}

async function restoreGlassRules(page) {
  await page.evaluate(() => {
    document.documentElement.dataset.glass = "off";
    for (const [rule, selector] of window.__miroGlassRuleChanges || [])
      rule.selectorText = selector;
    delete window.__miroGlassRuleChanges;
  });
}

async function axe(page, selector, name) {
  const result = await new AxeBuilder({ page })
    .include(selector)
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  if (result.violations.length)
    await writeFile(
      join(output, `${name}-axe.json`),
      JSON.stringify(result.violations, null, 2),
    );
  assert.deepEqual(
    result.violations.map((item) => item.id),
    [],
    `${name}: scoped accessibility`,
  );
}

async function createActor(role) {
  const email = `glass-${randomUUID()}@miro-test.local`;
  const password = `Glass-${randomUUID()}!`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const id = created.data.user.id;
  actorIds.push(id);
  const writes = await Promise.all([
    service
      .from("user_roles")
      .upsert({ user_id: id, role }, { onConflict: "user_id" }),
    service
      .from("profiles")
      .update({
        role,
        account_status: "active",
        full_name: "Global glass QA / בדיקת תצוגה",
      })
      .eq("id", id),
  ]);
  for (const result of writes) if (result.error) throw result.error;
  return { email, password };
}

async function login(context, actor) {
  const page = await context.newPage();
  activePage = page;
  page.on("pageerror", (error) => runtimeErrors.push(errorSummary(error)));
  await page.goto(`${base}/en/login`, { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill(actor.email);
  await page.locator('input[name="password"]').fill(actor.password);
  await page.locator('input[name="password"]').press("Enter");
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), {
    timeout: 30000,
  });
  return page;
}

function validSaved(data) {
  return (
    typeof data?.settings?.enabled === "boolean" &&
    typeof data.revision === "string" &&
    Number.isFinite(Date.parse(data.revision)) &&
    data.editable === true
  );
}

try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
  const anonymous = await browser.newContext({ reducedMotion: "reduce" });
  for (const method of ["get", "put"]) {
    const response = await anonymous.request[method](
      `${base}/api/management/settings/glass`,
      {
        headers: { Origin: new URL(base).origin },
        ...(method === "put"
          ? {
              data: {
                settings: { enabled: false },
                revision: "2026-10-29T00:00:00.000Z",
              },
            }
          : {}),
      },
    );
    assert.equal(response.status(), 403, `Anonymous ${method}: denied`);
  }
  const anonymousPage = await anonymous.newPage();
  await anonymousPage.route("**/en/services", (route) =>
    guardedRoute(route, async (route) => {
      const response = await route.fetch();
      const original = await response.text();
      const body = original
        .replace(/data-glass="(?:on|off)"/g, 'data-glass="off"')
        .replaceAll('\\"data-glass\\":\\"on\\"', '\\"data-glass\\":\\"off\\"');
      return route.fulfill({ response, body });
    }),
  );
  await anonymousPage.goto(`${base}/en/services`);
  await expect(anonymousPage.locator("html")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );
  await expect(anonymousPage.locator("html")).toHaveAttribute(
    "data-glass",
    "off",
  );
  await expect(anonymousPage.locator("[data-glass-toggle]")).toHaveCount(0);
  await anonymousPage.reload();
  await expect(anonymousPage.locator("html")).toHaveAttribute(
    "data-glass",
    "off",
  );
  checks.push({
    name: "anonymous",
    status: "passed",
    scope:
      "real GET/PUT auth denials; server-HTML off fixture survives hydration/reload without a visitor switch",
  });
  await anonymous.close();

  for (const role of ["ceo", "admin"]) {
    const actor = await createActor(role);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
      ignoreHTTPSErrors: true,
    });
    const fixture = {
      settings: { enabled: true },
      revision: "2026-10-29T12:00:00.000Z",
      editable: true,
    };
    let revisionCounter = 0;
    let putMode = "success";
    const fixtureWrites = [];
    let rscFixturePatches = 0;
    await context.route("**/api/track", (route) =>
      route.fulfill({ status: 204 }),
    );
    await context.route("**/*", (route) =>
      guardedRoute(route, async (route) => {
        const headers = route.request().headers();
        if (
          headers["next-router-prefetch"] ||
          headers["next-router-segment-prefetch"] ||
          headers.purpose === "prefetch"
        ) {
          return route.fulfill({ status: 204 });
        }
        if (
          headers.rsc === "1" &&
          new URL(route.request().url()).pathname.includes("/admin/settings")
        ) {
          // The successful PUT is a browser fixture, so its layout refresh must
          // carry that same fixture value instead of the untouched owner value.
          const response = await route.fetch();
          const body = (await response.text()).replace(
            /"data-glass":"(?:on|off)"/g,
            () => {
              rscFixturePatches += 1;
              return `"data-glass":"${fixture.settings.enabled ? "on" : "off"}"`;
            },
          );
          return route.fulfill({ response, body });
        }
        return route.fallback();
      }),
    );
    const page = await login(context, actor);
    const live = await context.request.get(
      `${base}/api/management/settings/glass`,
    );
    assert.equal(live.status(), 200, `${role}: live read authorized`);
    const liveSaved = await live.json();
    assert.ok(validSaved(liveSaved), `${role}: live saved setting schema`);
    const originDenied = await context.request.put(
      `${base}/api/management/settings/glass`,
      {
        headers: { Origin: "https://untrusted.example" },
        data: {
          settings: { enabled: !liveSaved.settings.enabled },
          revision: liveSaved.revision,
        },
      },
    );
    assert.equal(
      originDenied.status(),
      403,
      `${role}: cross-origin save denied`,
    );
    await context.route("**/api/management/**", (route) => {
      if (route.request().method() !== "GET") {
        blockedWrites.push(
          `${route.request().method()} ${new URL(route.request().url()).pathname}`,
        );
        return route.abort();
      }
      return route.continue();
    });
    await context.route("**/api/management/settings/glass", (route) =>
      guardedRoute(route, async (route) => {
        const request = route.request();
        if (request.method() === "GET") return route.fulfill({ json: fixture });
        if (request.method() !== "PUT") {
          blockedWrites.push(request.method());
          return route.abort();
        }
        const body = request.postDataJSON();
        fixtureWrites.push({ body, mode: putMode });
        assert.equal(
          body.revision,
          fixture.revision,
          "Save carries current revision",
        );
        assert.equal(
          typeof body.settings.enabled,
          "boolean",
          "Save carries a boolean only",
        );
        assert.deepEqual(Object.keys(body).sort(), ["revision", "settings"]);
        assert.deepEqual(Object.keys(body.settings), ["enabled"]);
        if (putMode === "conflict")
          return route.fulfill({ status: 409, json: { error: "conflict" } });
        if (putMode === "unknown") return route.abort("failed");
        fixture.settings = { enabled: body.settings.enabled };
        fixture.revision = new Date(
          Date.parse("2026-10-29T12:00:00Z") + ++revisionCounter * 1000,
        ).toISOString();
        return route.fulfill({ json: fixture });
      }),
    );

    for (const locale of ["en", "he"]) {
      fixture.settings = { enabled: true };
      await page.goto(`${base}/${locale}/admin/settings#settings-glass`, {
        waitUntil: "networkidle",
      });
      await page.addStyleTag({
        content:
          "*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}",
      });
      const section = page.locator("#settings-glass");
      const toggle = section.locator("[data-glass-toggle]");
      const save = section.locator("[data-glass-save]");
      const refresh = section.locator("[data-glass-refresh]");
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await expect(toggle).toBeEnabled();
      await expect(page.locator("[data-glass-toggle]")).toHaveCount(1);
      await expect(section).toContainText(
        locale === "he" ? "כל המבקרים" : "all visitors",
      );
      await page.evaluate(() => {
        document.documentElement.dataset.appearanceVersion = "2";
      });
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const theme of ["dark", "medium", "light"]) {
          const name = `${role}-${locale}-${width}-${theme}`;
          await page.evaluate((theme) => {
            document.documentElement.dataset.theme = theme;
            localStorage.setItem("miro-theme", theme);
            // Match the real theme helper so the mounted (including compact,
            // hidden) selector settles before a paint comparison or refresh.
            window.dispatchEvent(new Event("miro-theme-change"));
          }, theme);
          await expect(
            page.locator(
              `.mgmt-topbar__theme-btn[data-theme-option="${theme}"]`,
            ),
          ).toHaveAttribute("aria-pressed", "true");
          await expect(page.locator("html")).toHaveAttribute(
            "data-glass",
            "on",
          );
          await parkChrome(page);
          const enhanced = await snapshot(page);
          if (theme === "dark")
            assert.notEqual(
              enhanced.topbar.backdropFilter,
              "none",
              `${name}: enhanced backdrop`,
            );
          if (theme !== "dark") {
            const unchangedPixels = await page
              .locator(".mgmt-topbar")
              .screenshot({ animations: "disabled", caret: "hide" });
            const unchangedState = await snapshot(page);
            try {
              assert.ok((await disableGlassRules(page)) > 0);
              await settlePaint(page);
              assert.deepEqual(
                await snapshot(page),
                unchangedState,
                `${name}: Dark rules never alter this theme`,
              );
              await assertRaster(
                await page
                  .locator(".mgmt-topbar")
                  .screenshot({ animations: "disabled", caret: "hide" }),
                unchangedPixels,
                `${name}-bright-inert`,
                0,
              );
            } finally {
              await restoreGlassRules(page);
              await page.evaluate(() => {
                document.documentElement.dataset.glass = "on";
              });
            }
          }
          assert.equal(
            enhanced.topbar.opacity,
            "1",
            `${name}: opaque text container`,
          );
          await axe(page, "#settings-glass", `${name}-settings-on`);
          const beforeDraft = fixtureWrites.length;
          await toggle.focus();
          await toggle.press("Space");
          await expect(toggle).toHaveAttribute("aria-checked", "false");
          await expect(page.locator("html")).toHaveAttribute(
            "data-glass",
            "on",
          );
          assert.equal(
            fixtureWrites.length,
            beforeDraft,
            `${name}: switch is an unsaved draft`,
          );
          await expect(save).toBeEnabled();
          await save.click();
          await page.waitForLoadState("networkidle");
          await expect(save).toBeDisabled();
          await expect(toggle).toBeEnabled();
          await expect(page.locator("html")).toHaveAttribute(
            "data-glass",
            "off",
          );
          await parkChrome(page);
          let baseline = await snapshot(page);
          assert.deepEqual(
            baseline.rootTokens,
            enhanced.rootTokens,
            `${name}: root palette unchanged`,
          );
          assert.deepEqual(
            baseline.protectedTokens,
            enhanced.protectedTokens,
            `${name}: protected palette unchanged`,
          );
          assert.deepEqual(
            baseline.topbar.geometry,
            enhanced.topbar.geometry,
            `${name}: chrome geometry unchanged`,
          );
          if (theme === "dark") {
            assert.notEqual(
              baseline.topbar.boxShadow,
              enhanced.topbar.boxShadow,
              `${name}: off restores original depth`,
            );
          } else {
            assert.deepEqual(
              baseline.topbar,
              enhanced.topbar,
              `${name}: bright chrome unchanged by shared flag`,
            );
            assert.deepEqual(
              baseline.topbarChildren,
              enhanced.topbarChildren,
              `${name}: bright controls unchanged by shared flag`,
            );
          }
          const offTopbarPng = await page.locator(".mgmt-topbar").screenshot({
            path: join(output, `${name}-topbar-off.png`),
            animations: "disabled",
            caret: "hide",
          });
          // The capture may normalize a scroll ancestor; record the resulting
          // viewport before mutating CSS so the compared geometry is identical.
          baseline = await snapshot(page);
          try {
            assert.ok(
              (await disableGlassRules(page)) > 0,
              `${name}: enhancement rules found`,
            );
            await settlePaint(page);
            assert.deepEqual(
              await snapshot(page),
              baseline,
              `${name}: off matches disabled enhancement styles`,
            );
            await assertRaster(
              await page.locator(".mgmt-topbar").screenshot({
                path: join(output, `${name}-topbar-disabled.png`),
                animations: "disabled",
                caret: "hide",
              }),
              offTopbarPng,
              name,
              theme === "dark" ? 2 : 0,
            );
          } finally {
            await restoreGlassRules(page);
          }
          await axe(page, "#settings-glass", `${name}-settings-off`);
          await axe(page, ".mgmt-topbar", `${name}-topbar-off`);
          await section.screenshot({
            path: join(output, `${name}-settings-off.png`),
          });
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            `${name}: no page overflow`,
          );
          await toggle.focus();
          await toggle.press("Enter");
          await save.click();
          await page.waitForLoadState("networkidle");
          await expect(save).toBeDisabled();
          await expect(toggle).toBeEnabled();
          await expect(page.locator("html")).toHaveAttribute(
            "data-glass",
            "on",
          );
          await axe(page, ".mgmt-topbar", `${name}-topbar-on`);
          await page
            .locator(".mgmt-topbar")
            .screenshot({ path: join(output, `${name}-topbar-on.png`) });
          checks.push({
            name,
            status: "passed",
            scope:
              "CEO/admin global draft+explicit revision save with browser-only acknowledgement, unchanged protected tokens/geometry, exact off paint/geometry and decoded pixels within reported 2-level raster rounding, settings/topbar axe",
          });
          console.log(`PASS ${name}`);
        }
      }
      for (const mode of ["conflict", "unknown"]) {
        putMode = mode;
        await toggle.click();
        const before = fixtureWrites.length;
        await save.click();
        await expect(toggle).toBeDisabled();
        await expect(save).toBeDisabled();
        await expect(section.getByRole("alert")).toContainText(
          locale === "he" ? "הערך השמור" : "saved value",
        );
        assert.equal(
          fixtureWrites.length,
          before + 1,
          `${role}/${locale}/${mode}: one attempt only`,
        );
        await refresh.click();
        await expect(toggle).toBeEnabled();
        await expect(toggle).toHaveAttribute("aria-checked", "true");
        await expect(save).toBeDisabled();
        checks.push({
          name: `${role}-${locale}-${mode}`,
          status: "passed",
          scope:
            "write locked until explicit authoritative refresh; no automatic retry",
        });
      }
      putMode = "success";
      await page.evaluate(() => {
        document.documentElement.dataset.appearanceVersion = "1";
      });
      await expect(toggle).toBeVisible();
      await page.evaluate(() => {
        document.documentElement.dataset.appearanceVersion = "2";
      });
    }
    const unchanged = await context.request.get(
      `${base}/api/management/settings/glass`,
    );
    assert.deepEqual(
      await unchanged.json(),
      liveSaved,
      `${role}: shared owner setting untouched`,
    );
    checks.push({
      name: `${role}-live-contract`,
      status: "passed",
      scope:
        "real role GET schema and cross-origin PUT denial; live setting unchanged",
      fixtureWrites: fixtureWrites.length,
      rscFixturePatches,
    });
    await context.close();
  }
  const workerContext = await browser.newContext({ reducedMotion: "reduce" });
  await login(workerContext, await createActor("worker"));
  for (const method of ["get", "put"]) {
    const response = await workerContext.request[method](
      `${base}/api/management/settings/glass`,
      {
        headers: { Origin: new URL(base).origin },
        ...(method === "put"
          ? {
              data: {
                settings: { enabled: false },
                revision: "2026-10-29T00:00:00.000Z",
              },
            }
          : {}),
      },
    );
    assert.equal(response.status(), 403, `Worker ${method}: denied`);
  }
  checks.push({
    name: "worker",
    status: "passed",
    scope: "real protected GET/PUT denied",
  });
  await workerContext.close();
  assert.deepEqual(routingErrors, [], "No fixture routing errors");
  assert.deepEqual(blockedWrites, [], "No browser business-write attempts");
  assert.deepEqual(runtimeErrors, [], "No browser runtime errors");
} catch (error) {
  failure = error;
  if (activePage && !activePage.isClosed()) {
    await activePage
      .screenshot({ path: join(output, "failure.png") })
      .catch(() => {});
    const state = await snapshot(activePage).catch(() => null);
    await writeFile(
      join(output, "failure-state.json"),
      JSON.stringify(state, null, 2),
    );
  }
} finally {
  closing = true;
  await browser
    ?.close()
    .catch((error) => cleanupErrors.push(errorSummary(error)));
  for (const id of actorIds) {
    try {
      const result = await service.auth.admin.deleteUser(id);
      if (result.error) throw result.error;
    } catch (error) {
      cleanupErrors.push(`Disposable auth cleanup: ${errorSummary(error)}`);
    }
  }
  await mkdir(output, { recursive: true });
  await writeFile(
    join(output, "results.json"),
    JSON.stringify(
      {
        base,
        checks,
        runtimeErrors,
        blockedWrites,
        routingErrors,
        rasterComparisons,
        createdActors: actorIds.length,
        removedActors: actorIds.length - cleanupErrors.length,
        cleanupErrors,
        failure: failure ? errorSummary(failure) : null,
      },
      null,
      2,
    ),
  );
  console.log(
    `Removed ${actorIds.length - cleanupErrors.length}/${actorIds.length} disposable glass actors; evidence ${output}`,
  );
}
if (failure) throw new Error(errorSummary(failure));
assert.deepEqual(cleanupErrors, [], "Disposable auth cleanup completed");
console.log(`PASS ${checks.length} protected glass combinations`);
