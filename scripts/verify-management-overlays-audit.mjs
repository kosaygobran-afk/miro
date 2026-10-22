// Focused read-only overlay audit: topbar tools/account mutual exclusion, mobile
// navigation drawer, dialog fit at short viewports and sidebar active visibility.
// Creates a disposable CEO, blocks non-GET management writes and asserts results.
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3000";
const output = process.env.AUDIT_OUTPUT_DIR || "/tmp/miro-mgmt-overlay-audit";
const auditLocale = process.env.AUDIT_LOCALE || "en";
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(20000) }),
    },
  },
);

const reports = [];
const checks = [];
let browser, context, page, userId;
let stage = "start";

function check(label, ok, details) {
  checks.push({ label, ok: Boolean(ok), ...(details ? { details } : {}) });
}

try {
  await mkdir(output, { recursive: true });
  const email = `overlay-audit-${Date.now()}-${randomUUID().slice(0, 8)}@miro-test.local`;
  const password = `Audit-${randomUUID()}!`;
  const actor = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (actor.error) throw actor.error;
  userId = actor.data.user.id;
  for (const r of await Promise.all([
    service
      .from("user_roles")
      .upsert({ user_id: userId, role: "ceo" }, { onConflict: "user_id" }),
    service
      .from("profiles")
      .update({
        role: "ceo",
        account_status: "active",
        full_name: "Overlay QA",
      })
      .eq("id", userId),
  ]))
    if (r.error) throw r.error;

  browser = await chromium.launch();
  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  page = await context.newPage();

  async function signIn() {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.goto(`${base}/en/login`, { waitUntil: "networkidle" });
      await page.locator('input[name="email"]').fill(email);
      await page.locator('input[name="password"]').fill(password);
      await page.locator('input[name="password"]').press("Enter");
      try {
        await page.waitForURL((url) => !url.pathname.endsWith("/login"), {
          timeout: 45000,
        });
        return;
      } catch (error) {
        lastError = error;
        // Transport breaker cooldown; let the upstream recover before retrying.
        await page.waitForTimeout(35000);
      }
    }
    throw lastError;
  }

  await signIn();
  await context.route("**/api/management/**", async (route) => {
    if (route.request().method() !== "GET")
      return route.fulfill({ status: 403, json: { error: "read_only_qa" } });
    try {
      const response = await route.fetch({ timeout: 20000 });
      return route.fulfill({ response });
    } catch {
      return route.abort().catch(() => {});
    }
  });

  async function goto(path, locale = "en") {
    stage = `goto ${locale}/${path || "overview"}`;
    const url = `${base}/${locale}/admin${path ? `/${path}` : ""}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    if (new URL(page.url()).pathname.endsWith("/login")) {
      await page.waitForTimeout(35000);
      await signIn();
      await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    }
    await page.locator(".mgmt-shell__main h1").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
  }

  async function measure(label) {
    const data = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return {
          x: +r.left.toFixed(1),
          y: +r.top.toFixed(1),
          w: +r.width.toFixed(1),
          h: +r.height.toFixed(1),
          bottom: +r.bottom.toFixed(1),
          right: +r.right.toFixed(1),
          display: s.display,
          visibility: s.visibility,
          overflowY: s.overflowY,
        };
      };
      const intersects = (a, b) =>
        a && b
          ? Math.min(a.right, b.right) - Math.max(a.x, b.x) > 2 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 2
          : false;
      const controls = box(q(".mgmt-topbar__controls"));
      const account = box(q(".mgmt-account__popover"));
      const dialogs = [...document.querySelectorAll('[role="dialog"]')]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .map((el) => ({
          label: el.getAttribute("aria-label"),
          box: box(el),
          body: box(el.querySelector(".mgmt-dialog__body")),
          footer: box(el.querySelector(".mgmt-dialog__footer")),
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
        }));
      return {
        inner: { w: innerWidth, h: innerHeight },
        topbar: box(q(".mgmt-topbar")),
        end: box(q(".mgmt-topbar__end")),
        controls,
        controlsOpen: q(".mgmt-topbar__controls")?.dataset.open,
        controlsHidden:
          q(".mgmt-topbar__controls")?.getAttribute("data-open") === "false",
        account,
        accountOpen: Boolean(q(".mgmt-account__popover")),
        controlsAccountOverlap: intersects(controls, account),
        drawer: box(q(".mgmt-drawer")),
        sidebarNav: box(q(".mgmt-sidebar__nav")),
        sidebarNavScroll: q(".mgmt-sidebar__nav")
          ? {
              top: q(".mgmt-sidebar__nav").scrollTop,
              scrollHeight: q(".mgmt-sidebar__nav").scrollHeight,
              clientHeight: q(".mgmt-sidebar__nav").clientHeight,
            }
          : null,
        sidebarFooter: box(q(".mgmt-sidebar__footer")),
        sidebarFooterDisplay: q(".mgmt-sidebar__footer")
          ? getComputedStyle(q(".mgmt-sidebar__footer")).display
          : null,
        activeNav: box(q('.mgmt-nav__link[aria-current="page"]')),
        dialogs,
        pageOverflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    reports.push({ label, ...data });
    await page.screenshot({
      path: `${output}/${label.replaceAll(/[^a-z0-9-]+/gi, "_")}.png`,
      fullPage: false,
    });
    return data;
  }

  // Topbar controls + account menu at narrow widths.
  for (const [w, h] of [
    [768, 1024],
    [390, 844],
    [320, 568],
  ]) {
    await goto("", auditLocale);
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(200);
    const toggle = page.getByRole("button", {
      name: /Tools and display|כלים ותצוגה/,
    });
    await toggle.click();
    await page.waitForTimeout(250);
    const tools = await measure(`tools-${w}x${h}`);
    check(
      `tools-${w}x${h}: popup opens`,
      tools.controlsOpen === "true" && tools.controls?.h > 0,
      { controlsOpen: tools.controlsOpen, box: tools.controls },
    );

    // Pointer path: account trigger must close the tools popup.
    await page.locator(".mgmt-account__trigger").click();
    await page.waitForTimeout(200);
    const account = await measure(`account-${w}x${h}`);
    check(`account-${w}x${h}: tools closed`, account.controlsOpen !== "true", {
      controlsOpen: account.controlsOpen,
    });
    check(
      `account-${w}x${h}: account opened`,
      account.accountOpen && account.account?.h > 0,
      { account: account.account },
    );
    check(
      `account-${w}x${h}: overlays do not overlap`,
      !account.controlsAccountOverlap,
      {
        controls: account.controls,
        account: account.account,
      },
    );
    check(
      `account-${w}x${h}: account inside viewport`,
      account.account &&
        account.account.x >= -1 &&
        account.account.right <= w + 1 &&
        account.account.y >= -1 &&
        account.account.bottom <= h + 1,
      { account: account.account, viewport: [w, h] },
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);

    // Keyboard path: Enter on the account trigger cannot leave tools open.
    await toggle.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    await page.locator(".mgmt-account__trigger").focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    const keyboardAccount = await measure(`account-keyboard-${w}x${h}`);
    check(
      `account-keyboard-${w}x${h}: tools closed and account opened`,
      keyboardAccount.controlsOpen !== "true" && keyboardAccount.accountOpen,
      {
        controlsOpen: keyboardAccount.controlsOpen,
        accountOpen: keyboardAccount.accountOpen,
      },
    );
    check(
      `account-keyboard-${w}x${h}: overlays do not overlap`,
      !keyboardAccount.controlsAccountOverlap,
      {
        controls: keyboardAccount.controls,
        account: keyboardAccount.account,
      },
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);

    // Reciprocal keyboard path: with the account menu open, focusing the tools
    // trigger must close it before the tools popup opens.
    await page.locator(".mgmt-account__trigger").focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    await toggle.focus();
    await page.waitForTimeout(150);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    const reciprocal = await measure(`tools-keyboard-after-account-${w}x${h}`);
    check(
      `tools-keyboard-after-account-${w}x${h}: account closed and tools opened`,
      !reciprocal.accountOpen && reciprocal.controlsOpen === "true",
      {
        accountOpen: reciprocal.accountOpen,
        controlsOpen: reciprocal.controlsOpen,
      },
    );
    check(
      `tools-keyboard-after-account-${w}x${h}: overlays do not overlap`,
      !reciprocal.controlsAccountOverlap,
      {
        controls: reciprocal.controls,
        account: reciprocal.account,
      },
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);

    const nav = page.getByRole("button", {
      name: /Open navigation|פתיחת ניווט/,
    });
    if (await nav.isVisible()) {
      await nav.click();
      await page.waitForTimeout(250);
      const drawer = await measure(`drawer-${w}x${h}`);
      check(
        `drawer-${w}x${h}: visible inside viewport`,
        drawer.drawer &&
          drawer.drawer.w > 0 &&
          drawer.drawer.x >= -1 &&
          drawer.drawer.right <= w + 1 &&
          drawer.drawer.y >= -1 &&
          drawer.drawer.bottom <= h + 1,
        { drawer: drawer.drawer, viewport: [w, h] },
      );
      check(
        `drawer-${w}x${h}: active nav visible in drawer scrollport`,
        drawer.activeNav &&
          drawer.drawer &&
          drawer.activeNav.y >= drawer.drawer.y - 1 &&
          drawer.activeNav.bottom <= drawer.drawer.bottom + 1,
        { activeNav: drawer.activeNav, drawer: drawer.drawer },
      );
      await page.keyboard.press("Escape");
    }
    const closed = await measure(`closed-${w}x${h}`);
    check(`closed-${w}x${h}: no page overflow`, closed.pageOverflow <= 1, {
      pageOverflow: closed.pageOverflow,
    });
  }

  // Dialog fit at short/narrow viewports on a form dialog.
  for (const [w, h] of [
    [1440, 900],
    [1440, 600],
    [1024, 500],
    [390, 568],
    [320, 568],
  ]) {
    await goto("categories", auditLocale);
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(150);
    await page
      .getByRole("button", {
        name: /Add main category|הוספת קטגוריה ראשית/,
      })
      .click();
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(200);
    const dialog = await measure(`dialog-${w}x${h}`);
    const first = dialog.dialogs[0];
    check(
      `dialog-${w}x${h}: inside viewport`,
      first &&
        first.box.y >= -1 &&
        first.box.bottom <= h + 1 &&
        first.box.x >= -1 &&
        first.box.right <= w + 1,
      { dialog: first?.box, viewport: [w, h] },
    );
    const last = page
      .locator('[role="dialog"] .mgmt-dialog__footer button')
      .last();
    if (await last.count()) {
      await last.scrollIntoViewIfNeeded();
      const visible = await last.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          inViewport: r.top >= 0 && r.bottom <= innerHeight,
        };
      });
      reports.push({ label: `dialog-last-action-${w}x${h}`, ...visible });
      check(
        `dialog-${w}x${h}: last action reachable`,
        visible.inViewport,
        visible,
      );
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
  }

  // Sidebar active-item visibility on deep pages (expanded and collapsed).
  for (const [path, collapsed] of [
    ["requests", false],
    ["finance", false],
    ["settings", false],
    ["commerce-reports", false],
    ["finance", true],
  ]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate((isCollapsed) => {
      localStorage.setItem(
        "miro.mgmt.sidebar-collapsed",
        isCollapsed ? "1" : "0",
      );
      window.dispatchEvent(new Event("miro:mgmt-sidebar-collapse"));
    }, collapsed);
    await goto(path, auditLocale);
    await page.waitForTimeout(300);
    const label = `sidebar-${path}-${collapsed ? "collapsed" : "expanded"}`;
    const data = await measure(label);
    check(
      `${label}: active item inside sidebar scrollport`,
      data.activeNav &&
        data.sidebarNav &&
        data.activeNav.y >= data.sidebarNav.y - 1 &&
        data.activeNav.bottom <= data.sidebarNav.bottom + 1,
      {
        activeNav: data.activeNav,
        sidebarNav: data.sidebarNav,
        scroll: data.sidebarNavScroll,
      },
    );
    if (collapsed) {
      check(
        `${label}: sidebar footer removed`,
        data.sidebarFooter === null || data.sidebarFooterDisplay === "none",
        {
          footer: data.sidebarFooter,
          display: data.sidebarFooterDisplay,
        },
      );
    }
    check(`${label}: no page overflow`, data.pageOverflow <= 1, {
      pageOverflow: data.pageOverflow,
    });
  }

  // Expanding the sidebar on a deep page must not push the active entry out
  // of the shrunken nav scrollport (the footer reappears).
  await page.evaluate(() => {
    localStorage.setItem("miro.mgmt.sidebar-collapsed", "0");
    window.dispatchEvent(new Event("miro:mgmt-sidebar-collapse"));
  });
  await page.waitForTimeout(350);
  const reexpanded = await measure("sidebar-finance-reexpanded");
  check(
    "sidebar-finance-reexpanded: active item stays inside sidebar scrollport",
    reexpanded.activeNav &&
      reexpanded.sidebarNav &&
      reexpanded.activeNav.y >= reexpanded.sidebarNav.y - 1 &&
      reexpanded.activeNav.bottom <= reexpanded.sidebarNav.bottom + 1,
    {
      activeNav: reexpanded.activeNav,
      sidebarNav: reexpanded.sidebarNav,
      scroll: reexpanded.sidebarNavScroll,
    },
  );
  check(
    "sidebar-finance-reexpanded: footer returns",
    reexpanded.sidebarFooter && reexpanded.sidebarFooterDisplay !== "none",
    {
      footer: reexpanded.sidebarFooter,
      display: reexpanded.sidebarFooterDisplay,
    },
  );

  const failed = checks.filter((c) => !c.ok);
  const summary = {
    checks: checks.length,
    failed: failed.length,
    failures: failed,
    errors: [],
  };
  await writeFile(
    `${output}/audit.json`,
    JSON.stringify({ summary, checks, reports }, null, 2),
  );
  console.log(JSON.stringify(summary));
  if (failed.length) process.exitCode = 1;
} catch (error) {
  console.error(stage, String(error.message || error).split("\n")[0]);
  await page
    ?.screenshot({ path: `${output}/failure.png`, fullPage: false })
    .catch(() => {});
  process.exitCode = 1;
} finally {
  try {
    await context?.unrouteAll({ behavior: "ignoreErrors" });
    await browser?.close();
  } finally {
    if (userId) await service.auth.admin.deleteUser(userId).catch(() => {});
  }
}
