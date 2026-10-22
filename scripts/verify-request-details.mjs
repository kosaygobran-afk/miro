// Authenticated request-details review using browser-only request/staff fixtures.
// No owner request, product, or customer data is read or changed. The disposable
// admin is deleted in finally. Screenshots and results default to /tmp.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import ts from "typescript";
import { z } from "zod";

// Load the real settings defaults/schema without maintaining a second contract.
const animationContract = {};
const animationSource = await readFile(
  new URL("../src/lib/animation-settings.ts", import.meta.url),
  "utf8",
);
runInNewContext(
  ts.transpileModule(animationSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  {
    exports: animationContract,
    structuredClone,
    require: (name) => {
      assert.equal(name, "zod");
      return { z };
    },
  },
);
const { DEFAULT_ANIMATION_SETTINGS, animationSettingsSchema } =
  animationContract;

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.REQUEST_DETAILS_BASE_URL || "http://127.0.0.1:3000";
const output =
  process.env.REQUEST_DETAILS_OUTPUT_DIR || "/tmp/miro-request-details-review";
const widths = (process.env.REQUEST_DETAILS_WIDTHS || "1440,1024,390,320")
  .split(",")
  .map(Number);
const locales = (process.env.REQUEST_DETAILS_LOCALES || "en,he").split(",");
const themes = (
  process.env.REQUEST_DETAILS_THEMES || "dark,medium,light"
).split(",");
assert.ok(widths.every((width) => Number.isFinite(width) && width >= 320));
assert.ok(locales.every((locale) => ["en", "he"].includes(locale)));
assert.ok(themes.every((theme) => ["dark", "medium", "light"].includes(theme)));
assert.ok(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY,
  "Configured database auth is required; request data remains browser-only",
);
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }),
    },
  },
);
const workerId = randomUUID();
const productId = randomUUID();
const checks = [];
const geometries = [];
const browserErrors = [];
const blockedWrites = [];
const patches = [];
let userId;
let browser;
let context;
let page;
let stage = "authenticate";
let patchFailure = false;
const pass = (description) => {
  checks.push(description);
  console.log(`PASS ${description}`);
};
const labels = {
  en: {
    open: "Open request details",
    close: "Close",
    details: "Request details",
    inProgress: "In progress",
    saved: "Update saved",
    board: "Work board",
    table: "Table",
  },
  he: {
    open: "פתיחת פרטי פנייה",
    close: "סגירה",
    details: "פרטי הפנייה",
    inProgress: "בטיפול",
    saved: "העדכון נשמר",
    board: "לוח עבודה",
    table: "טבלה",
  },
};
function fixture(name, overrides = {}) {
  return {
    id: randomUUID(),
    customer: {
      id: null,
      name,
      email: "request-details@example.test",
      phone: "0501234567",
    },
    source: "store",
    locale: "en",
    created_at: "2026-10-22T08:00:00Z",
    message: "Please help choose a security camera for our office.",
    status: "new",
    metadata: {},
    product: {
      id: productId,
      name_en: "Synthetic security camera for request-details QA",
      name_he: "מצלמת אבטחה לבדיקת פרטי פנייה בלבד",
    },
    variant: {
      id: randomUUID(),
      sku: "QA-REQUEST-DETAILS-001",
      color_en: "Black",
      color_he: "שחור",
      color_hex: "#111111",
    },
    assignedTo: null,
    ...overrides,
  };
}
const shortRow = fixture("Synthetic request customer");
const longRow = fixture(
  "Synthetic customer with a very long company name לבדיקת פרטי פנייה בעברית ובאנגלית that must remain readable on a narrow phone",
  {
    customer: {
      id: randomUUID(),
      name: "Synthetic customer with a very long company name לבדיקת פרטי פנייה בעברית ובאנגלית that must remain readable on a narrow phone",
      email: `${"very-long-customer-email-".repeat(5)}@example.test`,
      phone: "+972501234567",
    },
    message: Array.from(
      { length: 24 },
      (_, index) =>
        `${index + 1}. Synthetic office installation request. נא לשמור על קריאות ההודעה המלאה גם במסך צר. ${"UNBROKEN".repeat(24)}`,
    ).join("\n\n"),
    variant: {
      id: randomUUID(),
      sku: `QA-${"VERY-LONG-SKU-".repeat(10)}`,
      color_en: "A very long synthetic color label for narrow phone layout",
      color_he: "תיאור צבע ארוך לבדיקת תצוגת פרטי פנייה במסך צר",
      color_hex: null,
    },
  },
);
const missingRow = fixture("Synthetic request with missing optional details", {
  customer: {
    id: null,
    name: "Synthetic request with missing optional details",
    email: "",
    phone: null,
  },
  source: "contact",
  locale: null,
  message: "",
  product: null,
  variant: null,
});
const rows = [shortRow, longRow, missingRow];

async function setAppearance(theme, version = "2") {
  const settings = animationSettingsSchema.parse({
    ...structuredClone(DEFAULT_ANIMATION_SETTINGS),
    appearanceVersion: version,
  });
  await expect(page.locator("html")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );
  await page.evaluate(
    ({ theme, settings }) => {
      document.documentElement.dataset.theme = theme;
      if (
        document.documentElement.dataset.appearanceVersion !==
        settings.appearanceVersion
      ) {
        // Exercise React context and its DOM attributes together, entirely in
        // this disposable browser; no settings API/database save is performed.
        window.dispatchEvent(
          new CustomEvent("miro-animation-settings-change", {
            detail: settings,
          }),
        );
      }
    },
    { theme, settings },
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-appearance-version",
    version,
  );
  // Wait for the shared surface/color transition before contrast measurements.
  await page.waitForTimeout(300);
}
async function openDetails(locale, index = 1) {
  const opener = page
    .getByRole("button", { name: labels[locale].open, exact: true })
    .nth(index);
  await opener.click();
  const dialog = page.getByRole("dialog").filter({
    has: page.locator("[data-request-workspace]"),
  });
  await expect(dialog).toBeVisible();
  await dialog.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  await expect
    .poll(() =>
      dialog.evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
  return { opener, dialog };
}
async function closeAndRestore(locale, opener, method = "escape") {
  if (method === "button") {
    await page
      .getByRole("dialog")
      .getByRole("button", { name: labels[locale].close, exact: true })
      .click();
  } else {
    await page.keyboard.press("Escape");
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .not.toBe("hidden");
}
async function geometry(dialog, label, full = true) {
  const result = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const body = element.querySelector(".mgmt-drawer__body");
    const workspace = element.querySelector("[data-request-workspace]");
    const header = element.querySelector(".mgmt-drawer__header");
    const close = element.querySelector(".mgmt-drawer__close");
    const closeRect = close.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      dialogOverflow: element.scrollWidth - element.clientWidth,
      bodyOverflow: body.scrollWidth - body.clientWidth,
      workspaceOverflow: workspace.scrollWidth - workspace.clientWidth,
      documentOverflow:
        document.documentElement.scrollWidth - window.innerWidth,
      headerTop: header.getBoundingClientRect().top,
      close: {
        x: closeRect.x,
        y: closeRect.y,
        right: closeRect.right,
        bottom: closeRect.bottom,
      },
      scrollLocked: document.body.style.overflow === "hidden",
      overflowingElements: [...body.querySelectorAll("*")]
        .map((node) => ({
          className: String(node.className),
          tag: node.tagName,
          rect: node.getBoundingClientRect(),
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
        }))
        .filter(
          (node) =>
            node.rect.right > rect.right + 1 || node.rect.left < rect.left - 1,
        )
        .map((node) => ({
          tag: node.tag,
          className: node.className,
          x: node.rect.x,
          right: node.rect.right,
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
        }))
        .slice(0, 20),
    };
  });
  geometries.push({ label, ...result });
  if (full) {
    assert.ok(Math.abs(result.x) <= 1, `${label}: full-width left edge`);
    assert.ok(Math.abs(result.y) <= 1, `${label}: full-height top edge`);
    assert.ok(
      Math.abs(result.width - result.viewportWidth) <= 1,
      `${label}: full viewport width (${result.width}/${result.viewportWidth})`,
    );
    assert.ok(
      Math.abs(result.height - result.viewportHeight) <= 1,
      `${label}: full viewport height (${result.height}/${result.viewportHeight})`,
    );
  }
  for (const field of [
    "dialogOverflow",
    "bodyOverflow",
    "workspaceOverflow",
    "documentOverflow",
  ]) {
    assert.ok(result[field] <= 1, `${label}: ${field} (${result[field]})`);
  }
  assert.ok(result.scrollLocked, `${label}: background scrolling is locked`);
  assert.ok(
    result.close.x >= 0 &&
      result.close.y >= 0 &&
      result.close.right <= result.viewportWidth + 1 &&
      result.close.bottom <= result.viewportHeight + 1,
    `${label}: close button stays inside the viewport`,
  );
  return result;
}
async function checkScrollHeader(dialog, label) {
  const before = await dialog.locator(".mgmt-drawer__header").boundingBox();
  const scrolled = await dialog
    .locator(".mgmt-drawer__body")
    .evaluate((body) => {
      body.scrollTop = body.scrollHeight;
      return body.scrollTop;
    });
  assert.ok(scrolled > 0, `${label}: long message must remain scrollable`);
  const after = await dialog.locator(".mgmt-drawer__header").boundingBox();
  assert.ok(
    Math.abs(before.y - after.y) <= 1,
    `${label}: header stays visible`,
  );
  await expect(dialog.locator(".mgmt-drawer__close")).toBeInViewport();
  await dialog.locator(".mgmt-drawer__body").evaluate((body) => {
    body.scrollTop = 0;
  });
}
async function checkFocusTrap(dialog, label) {
  await dialog.locator(".mgmt-drawer__close").focus();
  await page.keyboard.press("Shift+Tab");
  assert.ok(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
    `${label}: reverse Tab stays in the dialog`,
  );
  await page.keyboard.press("Tab");
  await expect(dialog.locator(".mgmt-drawer__close")).toBeFocused();
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press("Tab");
    assert.ok(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
      `${label}: forward Tab stays in the dialog`,
    );
  }
}
async function checkContactFocus(dialog, label) {
  const email = dialog
    .locator(`a[href="mailto:${longRow.customer.email}"]`)
    .first();
  await email.focus();
  const rail = email.locator(".mgmt-overflow-text__content");
  const motion = await rail.evaluate((element) => {
    const style = getComputedStyle(element);
    return { name: style.animationName, state: style.animationPlayState };
  });
  assert.ok(
    motion.name === "none" || motion.state === "paused",
    `${label}: contact text must pause while its link has keyboard focus`,
  );
}
async function checkAxe(dialog, label) {
  const id = await dialog.getAttribute("aria-labelledby");
  const result = await new AxeBuilder({ page })
    .include(`[role="dialog"][aria-labelledby="${id}"]`)
    .analyze();
  assert.deepEqual(
    result.violations.map((violation) => ({
      rule: violation.id,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        summary: node.failureSummary,
      })),
    })),
    [],
    `${label}: dialog accessibility`,
  );
}

try {
  await mkdir(output, { recursive: true });
  const email = `request-details-qa-${Date.now()}@miro-test.local`;
  const password = `RequestDetails-${randomUUID()}!`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error)
    throw new Error(`Disposable auth creation failed: ${created.error.code}`);
  userId = created.data.user.id;
  const role = await admin
    .from("user_roles")
    .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id" });
  if (role.error) throw new Error(`Disposable role failed: ${role.error.code}`);
  const profile = await admin
    .from("profiles")
    .update({ account_status: "active", role: "admin" })
    .eq("id", userId);
  if (profile.error)
    throw new Error(`Disposable profile failed: ${profile.error.code}`);
  browser = await chromium.launch();
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Asia/Jerusalem",
  });
  page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(error.message));
  // Intercept before login/navigation so queue data never reads owner records.
  await context.route("**/api/management/**", async (route) => {
    const request = route.request();
    const parsed = new URL(request.url());
    if (parsed.pathname === "/api/management/requests") {
      if (request.method() === "GET")
        return route.fulfill({
          json: { rows, totalCount: rows.length, limit: 25, offset: 0 },
        });
      if (request.method() === "PATCH") {
        const patch = request.postDataJSON();
        patches.push(patch);
        if (patchFailure)
          return route.fulfill({
            status: 500,
            json: { error: "Synthetic assignment failure" },
          });
        const row = rows.find((entry) => entry.id === patch.id);
        assert.ok(row, "Only synthetic requests can be patched");
        row.status = patch.status;
        row.assignedTo = patch.assignedTo
          ? { id: patch.assignedTo, displayName: "Synthetic QA worker" }
          : null;
        return route.fulfill({ json: { ok: true } });
      }
    }
    if (
      parsed.pathname === "/api/management/users" &&
      request.method() === "GET"
    ) {
      const users = [
        { id: userId, full_name: "Synthetic QA admin", email, role: "admin" },
        {
          id: workerId,
          full_name: "Synthetic QA worker",
          email: "synthetic-worker@example.test",
          role: "worker",
        },
      ].filter((user) => user.role === parsed.searchParams.get("role"));
      return route.fulfill({ json: { users, totalCount: users.length } });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      blockedWrites.push({ path: parsed.pathname, method: request.method() });
      return route.fulfill({
        status: 409,
        json: { error: "QA write blocked" },
      });
    }
    return route.continue();
  });
  await page.goto(`${base}/en/login`, { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="password"]').press("Enter");
  await page.waitForURL((url) => url.pathname !== "/en/login", {
    timeout: 30_000,
  });
  pass(
    "real disposable admin login; all request/staff responses are synthetic",
  );
  for (const locale of locales) {
    stage = `navigate ${locale}`;
    await page.goto(`${base}/${locale}/admin/requests`, {
      waitUntil: "networkidle",
    });
    await expect(
      page.getByRole("button", { name: labels[locale].open, exact: true }),
    ).toHaveCount(rows.length);
    for (const theme of themes) {
      for (const width of widths) {
        const label = `${locale}/${theme}/${width}`;
        stage = `layout ${label}`;
        await page.setViewportSize({ width, height: 1000 });
        await setAppearance(theme);
        const { opener, dialog } = await openDetails(locale);
        await expect(dialog).toHaveAccessibleName(labels[locale].details);
        await geometry(dialog, label);
        await checkScrollHeader(dialog, label);
        await checkFocusTrap(dialog, label);
        await checkContactFocus(dialog, label);
        await geometry(dialog, `${label}/focused-contact`);
        await dialog.locator(".mgmt-drawer__body").evaluate((body) => {
          body.scrollTop = 0;
        });
        if (width === 1440 || width === 320) {
          await checkAxe(dialog, label);
          await dialog.screenshot({
            path: `${output}/${locale}-${theme}-${width}.png`,
          });
        }
        await closeAndRestore(locale, opener);
        pass(`${label}: viewport, long content, scrolling, keyboard and focus`);
      }
    }
    stage = `short and missing content ${locale}`;
    await page.setViewportSize({ width: 320, height: 568 });
    await setAppearance(themes[0]);
    for (const index of [0, 2]) {
      const { opener, dialog } = await openDetails(locale, index);
      await geometry(dialog, `${locale}/fixture-${index}/320x568`);
      if (index === 0) {
        await expect(
          dialog.locator('a[href="tel:0501234567"]').first(),
        ).toBeVisible();
        await expect(
          dialog.locator('a[href="https://wa.me/972501234567"]'),
        ).toBeVisible();
        await expect(
          dialog.locator(`a[href="/${locale}/admin/products/${productId}"]`),
        ).toHaveCount(1);
      } else {
        await expect(
          dialog.locator('a[href^="tel:"],a[href^="https://wa.me/"]'),
        ).toHaveCount(0);
        await expect(dialog.locator('a[href="mailto:"]')).toHaveCount(0);
        await expect(dialog.locator('a[href*="/admin/products/"]')).toHaveCount(
          0,
        );
      }
      await checkAxe(dialog, `${locale}/fixture-${index}`);
      await closeAndRestore(locale, opener, "button");
    }
    pass(
      `${locale}: short-height screen, contact/product links and missing optional details`,
    );
    stage = `short-height long message ${locale}`;
    const { opener, dialog } = await openDetails(locale);
    await geometry(dialog, `${locale}/long/320x568`);
    await checkScrollHeader(dialog, `${locale}/long/320x568`);
    await closeAndRestore(locale, opener);
    stage = `version 1 ${locale}`;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await setAppearance(themes[0], "1");
    const original = await openDetails(locale, 0);
    await expect(
      original.dialog.locator("[data-request-workspace]"),
    ).toHaveAttribute("data-request-appearance", "1");
    await expect(original.dialog).toHaveAccessibleName(shortRow.customer.name);
    const rect = await original.dialog.boundingBox();
    assert.ok(
      rect.width <= 321,
      `${locale}: Version 1 retains the 20rem drawer`,
    );
    assert.ok(
      rect.height >= 999,
      `${locale}: Version 1 retains full drawer height`,
    );
    await original.dialog.screenshot({
      path: `${output}/${locale}-version-1.png`,
    });
    await closeAndRestore(locale, original.opener);
    pass(
      `${locale}: original Version 1 content, customer title and drawer dimensions retained`,
    );
  }
  stage = "normal request visual review";
  for (const visual of [
    { locale: "en", theme: "dark", width: 1440, height: 1000 },
    { locale: "he", theme: "light", width: 390, height: 844 },
  ]) {
    await page.goto(`${base}/${visual.locale}/admin/requests`, {
      waitUntil: "networkidle",
    });
    await page.setViewportSize({ width: visual.width, height: visual.height });
    await setAppearance(visual.theme);
    const normal = await openDetails(visual.locale, 0);
    await geometry(normal.dialog, `normal/${visual.locale}/${visual.theme}`);
    await checkAxe(normal.dialog, `normal/${visual.locale}/${visual.theme}`);
    await normal.dialog.screenshot({
      path: `${output}/normal-${visual.locale}-${visual.theme}-${visual.width}.png`,
    });
    await closeAndRestore(visual.locale, normal.opener);
  }
  pass("normal request desktop dark and mobile Hebrew light visual evidence");
  stage = "mocked request updates";
  await page.goto(`${base}/en/admin/requests`, { waitUntil: "networkidle" });
  await page.setViewportSize({ width: 1024, height: 768 });
  await setAppearance("dark");
  let opened = await openDetails("en", 0);
  const assignee = opened.dialog.locator("#request-assignee");
  patchFailure = true;
  await assignee.selectOption(workerId);
  await expect(
    opened.dialog.getByText("Synthetic assignment failure", { exact: true }),
  ).toBeVisible();
  await expect(assignee).toHaveValue("");
  assert.equal(shortRow.assignedTo, null);
  patchFailure = false;
  await opened.dialog
    .getByRole("button", { name: "In progress", exact: true })
    .click();
  await expect(
    opened.dialog.getByText("Update saved", { exact: true }),
  ).toBeVisible();
  assert.equal(
    patches.at(-1).assignedTo,
    null,
    "Failed assignment cannot leak into a status update",
  );
  assert.equal(shortRow.status, "in_progress");
  await assignee.selectOption(workerId);
  await expect(assignee).toHaveValue(workerId);
  await expect(
    opened.dialog.getByText("Update saved", { exact: true }),
  ).toBeVisible();
  assert.equal(shortRow.assignedTo.id, workerId);
  await closeAndRestore("en", opened.opener);
  opened = await openDetails("en", 0);
  await expect(opened.dialog.locator("#request-assignee")).toHaveValue(
    workerId,
  );
  await closeAndRestore("en", opened.opener);
  pass(
    "mocked assignment failure rollback, status update, assignment success and reopen",
  );
  stage = "board entry and reduced motion";
  await page
    .getByRole("button", { name: labels.en.board, exact: true })
    .click();
  const boardOpener = page.getByRole("button", {
    name: /Synthetic request customer/,
  });
  await boardOpener.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await closeAndRestore("en", boardOpener);
  await page
    .getByRole("button", { name: labels.en.table, exact: true })
    .click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  opened = await openDetails("en");
  await geometry(opened.dialog, "reduced-motion");
  const infiniteAnimations = await opened.dialog.evaluate(
    (element) =>
      element
        .getAnimations({ subtree: true })
        .filter(
          (animation) =>
            animation.effect?.getTiming().iterations === Infinity &&
            animation.playState === "running",
        ).length,
  );
  assert.equal(
    infiniteAnimations,
    0,
    "Reduced motion stops looping text animation",
  );
  await closeAndRestore("en", opened.opener);
  pass("board/table entry, reopened details and reduced motion");
  assert.deepEqual(
    blockedWrites,
    [],
    "No unrelated management writes attempted",
  );
  assert.deepEqual(browserErrors, [], "No browser runtime errors");
  pass("no browser runtime errors or unrelated writes");
} catch (error) {
  // Avoid printing browser request logs because they can contain auth cookies.
  console.error(`FAIL request-details review at ${stage}`);
  if (page)
    await page
      .screenshot({ path: `${output}/failure.png`, fullPage: true })
      .catch(() => {});
  throw error;
} finally {
  if (browser) await browser.close();
  if (userId) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error)
      throw new Error(`Disposable admin cleanup failed: ${deleted.error.code}`);
    pass("disposable admin deleted");
  }
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        date: "2026-10-22",
        stage,
        checks,
        geometries,
        browserErrors,
        blockedWrites,
        mockedPatchCount: patches.length,
        fixtureNote:
          "Real disposable admin authentication; requests, directory and PATCH responses are browser-only synthetic fixtures. This review does not certify backend writes or production data.",
      },
      null,
      2,
    ),
  );
}
