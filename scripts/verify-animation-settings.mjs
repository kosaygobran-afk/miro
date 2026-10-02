// Uses a disposable authenticated actor. Every valid settings save is mocked;
// real mutation requests contain invalid input only. No business setting changes.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import ts from "typescript";
import { z } from "zod";

const contract = {};
const source = await readFile(
  new URL("../src/lib/animation-settings.ts", import.meta.url),
  "utf8",
);
runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  {
    exports: contract,
    structuredClone,
    require: (name) => {
      assert.equal(name, "zod");
      return { z };
    },
  },
);
const {
  ANIMATION_FEATURES,
  ANIMATION_DURATIONS,
  DEFAULT_ANIMATION_SETTINGS,
  animationSettingsSchema,
} = contract;
const presetContract = {};
const presetSource = await readFile(
  new URL("../src/lib/appearance-presets.ts", import.meta.url),
  "utf8",
);
runInNewContext(
  ts.transpileModule(presetSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  {
    exports: presetContract,
    structuredClone,
    require: (name) => {
      if (name === "zod") return { z };
      assert.equal(name, "./animation-settings");
      return contract;
    },
  },
);
const { VERSION_ONE_APPEARANCE, appearancePresetSchema } = presetContract;

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.ANIMATION_BASE_URL || "http://127.0.0.1:3000";
assert.ok(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY,
  "Local Supabase configuration is required",
);
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const anonymous = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const checks = [];
const errors = [];
const pass = (label) => {
  checks.push(label);
  console.log("PASS", label);
};
const endpoint = `${base}/api/management/settings/animation`;
let browser;
let userId;
let stage = "public projection";
let mode = "success";
let actorRole = "ceo";
let getFailure = false;
let mockSettings = structuredClone(DEFAULT_ANIMATION_SETTINGS);
let revision = Date.parse("2026-10-02T06:00:00.000Z");
let mutationCount = 0;
let lastPayload;

try {
  const projection = await anonymous.rpc("get_public_animation_settings");
  assert.equal(projection.error, null);
  assert.equal(
    animationSettingsSchema.safeParse(projection.data).success,
    true,
  );
  assert.deepEqual(Object.keys(projection.data).sort(), [
    "appearanceVersion",
    "durations",
    "easing",
    "enabled",
    "features",
    "pageStyle",
    "themeStyle",
  ]);
  pass("live public RPC exposes only the animation presentation contract");

  browser = await chromium.launch();
  const anonymousContext = await browser.newContext();
  const anonymousWrite = await anonymousContext.request.put(endpoint, {
    headers: { Origin: base },
    data: {},
  });
  assert.equal(anonymousWrite.status(), 403);
  await anonymousContext.close();
  pass("anonymous animation writes return 403");

  stage = "create disposable CEO";
  const email = `motion-qa-${Date.now()}@miro-test.local`;
  const password = `MotionTest-${randomUUID()}!`;
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
        .update({ role, account_status: "active", full_name: "MIRO Motion QA" })
        .eq("id", userId),
    ]);
    for (const result of results) if (result.error) throw result.error;
    actorRole = role;
  }
  await assignRole("ceo");
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/en/login`, { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="password"]').press("Enter");
  await page.waitForURL((value) => value.pathname !== "/en/login", {
    timeout: 30000,
  });
  pass("real disposable CEO login");

  const actualGet = await context.request.get(endpoint);
  assert.equal(actualGet.status(), 200);
  const actualSettings = await actualGet.json();
  assert.equal(actualSettings.editable, true);
  assert.equal(
    appearancePresetSchema.safeParse(actualSettings.versionOneBackup).success,
    true,
  );
  assert.equal(
    animationSettingsSchema.safeParse(actualSettings.settings).success,
    true,
  );
  const invalidCeoWrite = await context.request.put(endpoint, {
    headers: { Origin: base },
    data: {},
  });
  assert.equal(invalidCeoWrite.status(), 400);
  const crossOriginWrite = await context.request.put(endpoint, {
    headers: { Origin: "https://example.invalid" },
    data: {},
  });
  assert.equal(crossOriginWrite.status(), 403);
  pass(
    "real CEO GET, invalid-input 400 and cross-origin 403 without valid database writes",
  );

  await context.route("**/api/management/settings/animation", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      return route.fulfill({
        status: getFailure ? 503 : 200,
        json: getFailure
          ? { error: "unavailable" }
          : {
              settings: mockSettings,
              revision: new Date(revision).toISOString(),
              editable: actorRole === "ceo",
              versionOneBackup: VERSION_ONE_APPEARANCE,
            },
      });
    }
    assert.equal(request.method(), "PUT", "unexpected settings mutation");
    assert.equal(actorRole, "ceo", "admin browser attempted to submit a draft");
    mutationCount += 1;
    lastPayload = request.postDataJSON();
    if (mode === "failure")
      return route.fulfill({ status: 500, json: { error: "failed" } });
    if (mode === "conflict") {
      revision += 1000;
      return route.fulfill({ status: 409, json: { error: "conflict" } });
    }
    if (mode === "delay")
      await new Promise((resolve) => setTimeout(resolve, 650));
    assert.equal(lastPayload.revision, new Date(revision).toISOString());
    mockSettings = animationSettingsSchema.parse(lastPayload.settings);
    revision += 1000;
    return route.fulfill({
      json: {
        settings: mockSettings,
        revision: new Date(revision).toISOString(),
        editable: true,
      },
    });
  });

  const section = page.locator("#settings-animation");
  async function visit(locale = "en", width = 1440) {
    stage = `settings ${locale} ${width}`;
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/${locale}/admin/settings`, {
      waitUntil: "networkidle",
      timeout: 45000,
    });
    await expect(section.getByRole("switch")).toHaveCount(15);
  }
  await visit();
  for (const toggle of await section.getByRole("switch").all()) {
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    const note = (await toggle.getAttribute("aria-describedby"))
      ?.split(" ")
      .find((id) => id.startsWith("animation-"));
    assert.ok(note);
    assert.ok(
      (await page.locator(`#${note}`).textContent()).trim().length > 30,
    );
  }
  pass(
    "all 15 appearance/animation switches are enabled and describe exactly what they control",
  );

  for (const { key, en } of ANIMATION_FEATURES) {
    const toggle = section.getByRole("switch", { name: en, exact: true });
    await toggle.focus();
    await toggle.press("Space");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    assert.ok(key);
  }
  const master = section.getByRole("switch", {
    name: "Enable animation system",
    exact: true,
  });
  await master.click();
  await expect(master).toHaveAttribute("aria-checked", "false");
  for (const entry of ANIMATION_DURATIONS) {
    const input = section.getByRole("spinbutton", {
      name: entry.en,
      exact: true,
    });
    await expect(input).toHaveAttribute("min", String(entry.min));
    await expect(input).toHaveAttribute("max", String(entry.max));
  }
  await section
    .getByRole("spinbutton", { name: "Theme reveal", exact: true })
    .fill("350");
  await section
    .getByLabel("Theme transition", { exact: true })
    .selectOption("fade");
  await section
    .getByLabel("Page reveal style", { exact: true })
    .selectOption("fade");
  await section
    .getByLabel("Motion easing", { exact: true })
    .selectOption("snappy");
  mode = "delay";
  await page.evaluate(() => {
    const save = [
      ...document.querySelectorAll("#settings-animation button"),
    ].find((button) => button.textContent.includes("Save and apply settings"));
    save.click();
    save.click();
  });
  await expect(
    section.getByText("Animation settings saved and applied.", { exact: true }),
  ).toBeVisible();
  assert.equal(mutationCount, 1, "duplicate save must make one request");
  assert.equal(lastPayload.settings.enabled, false);
  assert.ok(
    Object.values(lastPayload.settings.features).every(
      (value) => value === false,
    ),
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-motion-enabled",
    "false",
  );
  assert.equal(
    await page
      .locator("html")
      .evaluate((node) =>
        node.style.getPropertyValue("--motion-theme-duration"),
      ),
    "350ms",
  );
  pass(
    "keyboard switches, timing/styles, runtime event and rapid duplicate-save guard",
  );

  mode = "failure";
  await master.click();
  await section
    .getByRole("button", { name: "Save and apply settings", exact: true })
    .click();
  await expect(
    section.getByText(/Saving failed\. Your draft is preserved/),
  ).toBeVisible();
  await expect(master).toHaveAttribute("aria-checked", "true");
  mode = "success";
  await section
    .getByRole("button", { name: "Retry save", exact: true })
    .click();
  await expect(
    section.getByText("Animation settings saved and applied.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-motion-enabled",
    "true",
  );
  pass("failed save preserves draft and explicit retry applies settings");

  mode = "conflict";
  await master.click();
  await section
    .getByRole("button", { name: "Save and apply settings", exact: true })
    .click();
  await expect(
    section.getByText(/Another CEO changed these settings/),
  ).toBeVisible();
  await expect(master).toHaveAttribute("aria-checked", "false");
  await expect(
    section.getByRole("button", {
      name: "Save and apply settings",
      exact: true,
    }),
  ).toBeDisabled();
  await section
    .getByRole("button", {
      name: "Reload saved version and discard draft",
      exact: true,
    })
    .click();
  await expect(master).toHaveAttribute("aria-checked", "true");
  await expect(
    section.getByText(/Another CEO changed these settings/),
  ).toHaveCount(0);
  pass(
    "revision conflict retains draft and requires explicit reload before saving",
  );

  await master.click();
  getFailure = true;
  await section
    .getByRole("button", {
      name: "Reload saved settings and discard draft",
      exact: true,
    })
    .click();
  await expect(
    section.getByText(/Reloading failed\. Your existing draft was preserved/),
  ).toBeVisible();
  await expect(master).toHaveAttribute("aria-checked", "false");
  getFailure = false;
  await section
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(master).toHaveAttribute("aria-checked", "true");
  pass("failed reload preserves draft and discard restores saved settings");

  await section
    .getByRole("button", { name: "Use defaults in draft", exact: true })
    .click();
  await section
    .getByRole("spinbutton", { name: "Theme reveal", exact: true })
    .fill("999");
  await expect(
    section.getByRole("button", {
      name: "Save and apply settings",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    section.getByText(/Enter a whole number within the range/),
  ).toBeVisible();
  await section
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  pass("invalid timing blocks save; defaults stay a draft until saved");

  mode = "success";
  const beforeRestoreRequests = mutationCount;
  const currentTheme = await page.locator("html").getAttribute("data-theme");
  await section
    .getByRole("button", {
      name: "Prepare Version1 restore in draft",
      exact: true,
    })
    .click();
  await expect(
    section.getByText(/The Version1 backup is prepared in the draft/),
  ).toBeVisible();
  assert.equal(
    mutationCount,
    beforeRestoreRequests,
    "preparing backup must not submit or publish",
  );
  const appearanceToggle = section.getByRole("switch", {
    name: "Enhanced appearance — Version2",
    exact: true,
  });
  await expect(appearanceToggle).toHaveAttribute("aria-checked", "false");
  await expect(master).toHaveAttribute("aria-checked", "true");
  await section
    .getByRole("button", { name: "Save and apply settings", exact: true })
    .click();
  await expect(
    section.getByText("Animation settings saved and applied.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-appearance-version",
    "1",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    currentTheme,
  );
  assert.deepEqual(
    lastPayload.settings,
    structuredClone(VERSION_ONE_APPEARANCE.animationSettings),
  );
  await appearanceToggle.click();
  await section
    .getByRole("button", { name: "Save and apply settings", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-appearance-version",
    "2",
  );
  assert.ok(
    Object.values(lastPayload.settings.features).every(Boolean),
    "Version2 selection preserves restored animation choices",
  );
  pass(
    "Version1 restore stays a draft until Save and apply, restores original motion and preserves personal theme; Version2 can be re-enabled",
  );

  getFailure = true;
  await page.reload({ waitUntil: "networkidle" });
  await expect(
    section.getByText("Animation settings are unavailable", { exact: true }),
  ).toBeVisible();
  getFailure = false;
  await section.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(section.getByRole("switch")).toHaveCount(15);
  pass(
    "initial unavailable settings settle into an error and recover through retry",
  );

  for (const locale of ["en", "he"]) {
    for (const width of [1440, 390, 320]) {
      await visit(locale, width);
      for (const theme of ["dark", "medium", "light"]) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
          window.dispatchEvent(new Event("miro-theme-change"));
        }, theme);
        // These direct theme assignments are layout fixtures. Allow existing
        // short input color transitions to settle before contrast measurement.
        await page.waitForTimeout(250);
        await section.scrollIntoViewIfNeeded();
        await expect(section.getByRole("switch")).toHaveCount(15);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 2,
          ),
          true,
          `${locale}/${width}/${theme} overflow`,
        );
        const result = await new AxeBuilder({ page })
          .include("#settings-animation")
          .analyze();
        assert.deepEqual(
          result.violations.map((violation) => violation.id),
          [],
          `${locale}/${width}/${theme} accessibility: ${JSON.stringify(result.violations.flatMap((violation) => violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary }))))}`,
        );
        if (width === 390 && theme === "light") {
          await page.mouse.move(0, 0);
          await section.evaluate((element) =>
            window.scrollTo({
              top: element.getBoundingClientRect().top + scrollY - 116,
              behavior: "instant",
            }),
          );
          await page.waitForTimeout(250);
          await page.screenshot({
            path: `/tmp/miro-animation-settings-${locale}-light-390.png`,
          });
        }
      }
    }
  }
  pass(
    "18 bilingual/theme/desktop/narrow-phone settings layouts with zero axe violations",
  );

  stage = "admin read-only";
  await assignRole("admin");
  const adminGet = await context.request.get(endpoint);
  assert.equal(adminGet.status(), 200);
  assert.equal((await adminGet.json()).editable, false);
  const adminWrite = await context.request.put(endpoint, {
    headers: { Origin: base },
    data: {},
  });
  assert.equal(adminWrite.status(), 403);
  await visit("en", 390);
  for (const toggle of await section.getByRole("switch").all())
    await expect(toggle).toBeDisabled();
  for (const field of await section.locator("input,select").all())
    await expect(field).toBeDisabled();
  await expect(
    section.getByRole("button", {
      name: "Save and apply settings",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(section.getByText(/Read only\. Only a CEO/)).toBeVisible();
  pass("real admin GET/read-only UI and API write denial");

  assert.deepEqual(errors, [], "browser runtime errors");
  pass("zero browser runtime errors and no live business settings mutations");
  console.log(JSON.stringify({ checks: checks.length, result: "passed" }));
} catch (error) {
  console.error(`FAILED during ${stage}: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (userId) {
    const removed = await service.auth.admin.deleteUser(userId);
    if (removed.error) {
      console.error("Disposable QA account cleanup failed");
      process.exitCode = 1;
    } else console.log("PASS disposable QA account cleaned up");
  }
}
