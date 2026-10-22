// Read-only layout audit for the management console.
// Creates a disposable CEO, blocks non-GET management writes, captures geometry
// findings + screenshots at expanded/collapsed sidebar states and many viewports.
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3000";
const output = process.env.AUDIT_OUTPUT_DIR || "/tmp/miro-mgmt-layout-audit";
const onlyPaths = process.env.AUDIT_PATHS
  ? process.env.AUDIT_PATHS.split(",")
  : null;
const locales = (process.env.AUDIT_LOCALES || "en,he").split(",");
const withScreens = process.env.AUDIT_SCREENSHOTS !== "0";
const shotViewports = new Set(
  (
    process.env.AUDIT_SCREENSHOT_VIEWPORTS ||
    "1440x900-expanded,1440x900-collapsed,1199x800-expanded,1024x768-expanded,1024x768-collapsed,768x1024-expanded,390x844-expanded,320x568-expanded,1440x600-expanded,1024x500-collapsed"
  ).split(","),
);

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

const pages = [
  "",
  "products",
  "categories",
  "services",
  "inventory",
  "suppliers",
  "sales",
  "accounts",
  "customers",
  "users",
  "audit",
  "requests",
  "settings",
  "store-design",
  "storefront-merchandising",
  "finance",
  "analytics",
  "expenses",
  "documents",
  "cash",
  "recurring",
  "integrations",
  "commerce-reports",
  "pos",
];
const selectedPages = onlyPaths
  ? pages.filter((p) => onlyPaths.includes(p === "" ? "overview" : p))
  : pages;

// width x height viewports. Sidebar state is set per width group.
const viewports = [
  { width: 1920, height: 1080, sidebar: "expanded" },
  { width: 1600, height: 1000, sidebar: "expanded" },
  { width: 1440, height: 900, sidebar: "expanded" },
  { width: 1440, height: 900, sidebar: "collapsed" },
  { width: 1440, height: 600, sidebar: "expanded" },
  { width: 1280, height: 800, sidebar: "expanded" },
  { width: 1280, height: 800, sidebar: "collapsed" },
  { width: 1200, height: 800, sidebar: "expanded" },
  { width: 1100, height: 800, sidebar: "expanded" },
  { width: 1024, height: 768, sidebar: "expanded" },
  { width: 1024, height: 768, sidebar: "collapsed" },
  { width: 1024, height: 500, sidebar: "collapsed" },
  { width: 900, height: 700, sidebar: "expanded" },
  { width: 768, height: 1024, sidebar: "expanded" },
  { width: 768, height: 500, sidebar: "expanded" },
  { width: 640, height: 900, sidebar: "expanded" },
  { width: 480, height: 800, sidebar: "expanded" },
  { width: 390, height: 844, sidebar: "expanded" },
  { width: 320, height: 568, sidebar: "expanded" },
];

async function inspect(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (r.width <= 0 || r.height <= 0) return false;
      if (s.visibility === "hidden" || s.display === "none") return false;
      if (s.opacity === "0") return false;
      if (el.closest('[aria-hidden="true"],[hidden],.sr-only')) return false;
      if (r.width <= 2 && r.height <= 2) return false;
      return true;
    };
    const identify = (el) => ({
      tag: el.tagName.toLowerCase(),
      cls:
        (typeof el.className === "string" ? el.className : "")
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 3)
          .join(".") || null,
      id: el.id || null,
      text: (el.getAttribute("aria-label") || el.textContent || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 90),
    });
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return {
        x: +r.left.toFixed(1),
        y: +r.top.toFixed(1),
        w: +r.width.toFixed(1),
        h: +r.height.toFixed(1),
      };
    };
    const inScroller = (el) => {
      for (
        let p = el.parentElement;
        p && p !== document.body;
        p = p.parentElement
      ) {
        const s = getComputedStyle(p);
        if (
          s.overflowX !== "visible" ||
          s.overflowY !== "visible" ||
          s.overflow !== "visible"
        )
          return true;
      }
      return false;
    };
    const floating = (el) => {
      for (let p = el; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.position === "fixed" || s.position === "absolute") return true;
      }
      return false;
    };
    const directText = (el) =>
      [...el.childNodes].some(
        (n) => n.nodeType === 3 && n.textContent.trim().length > 0,
      );

    const findings = [];

    // 1. Document overflow.
    const overflow = document.documentElement.scrollWidth - innerWidth;
    if (overflow > 1)
      findings.push({ kind: "page-overflow", overflow: +overflow.toFixed(1) });

    // 2. Row/flex overflow without a scroll region.
    for (const el of document.querySelectorAll(
      ".mgmt-shell__main div, .mgmt-shell__main section, .mgmt-shell__main header, .mgmt-shell__main nav, .mgmt-shell__main form, .mgmt-shell__main ul",
    )) {
      if (!visible(el) || inScroller(el) || floating(el)) continue;
      const s = getComputedStyle(el);
      if (s.overflowX !== "visible") continue;
      if (el.scrollWidth - el.clientWidth > 4 && el.clientWidth > 0) {
        // Only report when children actually paint outside the parent.
        const parentRect = el.getBoundingClientRect();
        const escapes = [...el.children].filter((child) => {
          if (!visible(child) || floating(child)) return false;
          const r = child.getBoundingClientRect();
          return r.right > parentRect.right + 4 || r.left < parentRect.left - 4;
        });
        if (escapes.length)
          findings.push({
            kind: "row-overflow",
            parent: identify(el),
            overflow: el.scrollWidth - el.clientWidth,
            escaping: escapes.slice(0, 2).map(identify),
            box: box(el),
          });
      }
    }

    // 3. Block text/element overlaps (ignore inline and intentional overlays).
    const blocks = [
      ...document.querySelectorAll(
        ".mgmt-shell__main h1, .mgmt-shell__main h2, .mgmt-shell__main h3, .mgmt-shell__main h4, .mgmt-shell__main p, .mgmt-shell__main li, .mgmt-shell__main label, .mgmt-shell__main button, .mgmt-shell__main a, .mgmt-shell__main td, .mgmt-shell__main th, .mgmt-shell__main article, .mgmt-shell__main .mgmt-card",
      ),
    ].filter((el) => {
      if (!visible(el) || floating(el) || inScroller(el)) return false;
      const d = getComputedStyle(el).display;
      return d !== "inline" && d !== "inline-flex" && d !== "inline-block";
    });
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i],
          b = blocks[j];
        if (a.contains(b) || b.contains(a)) continue;
        if (
          a.closest('[role="dialog"], .mgmt-drawer, [data-floating-tool]') !==
          b.closest('[role="dialog"], .mgmt-drawer, [data-floating-tool]')
        )
          continue;
        const ar = a.getBoundingClientRect(),
          br = b.getBoundingClientRect();
        const x = Math.min(ar.right, br.right) - Math.max(ar.left, br.left);
        const y = Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top);
        if (x > 6 && y > 8) {
          const area = x * y;
          const smaller = Math.min(ar.width * ar.height, br.width * br.height);
          if (smaller > 0 && area / smaller > 0.35)
            findings.push({
              kind: "block-overlap",
              a: identify(a),
              b: identify(b),
              area: Math.round(area),
              aBox: box(a),
              bBox: box(b),
            });
        }
      }
    }

    // 4. Content escaping a padded, bordered container.
    for (const parent of document.querySelectorAll(
      ".mgmt-shell__main .mgmt-card, .mgmt-shell__main .mgmt-form-section, .mgmt-shell__main .mgmt-metric-card, .mgmt-shell__main .mgmt-panel, .mgmt-shell__main .mgmt-toolbar, .mgmt-shell__main .mgmt-page-header, .mgmt-shell__main .mgmt-workspace-header",
    )) {
      if (!visible(parent) || inScroller(parent)) continue;
      const ps = getComputedStyle(parent);
      const pr = parent.getBoundingClientRect();
      const padL = parseFloat(ps.paddingLeft),
        padR = parseFloat(ps.paddingRight);
      if (padL < 4 && padR < 4) continue;
      const escapes = [];
      for (const child of parent.children) {
        if (!visible(child) || floating(child)) continue;
        const cs = getComputedStyle(child);
        if (cs.position === "fixed" || cs.position === "absolute") continue;
        const cr = child.getBoundingClientRect();
        const leftEscape = pr.left + padL - cr.left;
        const rightEscape = cr.right - (pr.right - padR);
        const bottomEscape =
          cr.bottom - (pr.bottom - parseFloat(ps.paddingBottom));
        if (leftEscape > 3 || rightEscape > 3 || bottomEscape > 3)
          escapes.push({
            child: identify(child),
            leftEscape: +leftEscape.toFixed(1),
            rightEscape: +rightEscape.toFixed(1),
            bottomEscape: +bottomEscape.toFixed(1),
            childBox: box(child),
          });
      }
      if (escapes.length)
        findings.push({
          kind: "container-escape",
          parent: identify(parent),
          escapes: escapes.slice(0, 3),
          parentBox: box(parent),
        });
    }

    // 5. Horizontal text clipping without an ellipsis or line clamp.
    for (const el of document.querySelectorAll(
      ".mgmt-shell__main h1, .mgmt-shell__main h2, .mgmt-shell__main h3, .mgmt-shell__main h4, .mgmt-shell__main p, .mgmt-shell__main span, .mgmt-shell__main label, .mgmt-shell__main button, .mgmt-shell__main a, .mgmt-shell__main td, .mgmt-shell__main th",
    )) {
      if (!visible(el) || inScroller(el)) continue;
      if (!directText(el)) continue;
      const s = getComputedStyle(el);
      if (s.overflowX !== "hidden" && s.overflowX !== "clip") continue;
      if (s.textOverflow === "ellipsis") continue;
      if (s.webkitLineClamp && s.webkitLineClamp !== "none") continue;
      if (el.scrollWidth - el.clientWidth > 4)
        findings.push({
          kind: "text-clip",
          el: identify(el),
          overflow: el.scrollWidth - el.clientWidth,
          box: box(el),
        });
    }

    // 6. Content hidden under the sticky topbar at scroll top.
    const topbar = document.querySelector(".mgmt-topbar");
    if (topbar) {
      const tr = topbar.getBoundingClientRect();
      const ts = getComputedStyle(topbar);
      if (ts.position === "sticky" || ts.position === "fixed") {
        for (const el of document.querySelectorAll(
          ".mgmt-shell__main > * > *, .mgmt-shell__main .mgmt-page-header, .mgmt-shell__main .mgmt-sticky-bar",
        )) {
          if (!visible(el) || topbar.contains(el) || floating(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.top < tr.bottom - 2 && r.bottom > tr.top + 2 && r.height > 8)
            findings.push({
              kind: "under-topbar",
              el: identify(el),
              overlap: +(tr.bottom - r.top).toFixed(1),
              box: box(el),
            });
        }
      }
    }

    // 7. Primary content padding / centering summary.
    const main = document.querySelector(".mgmt-shell__main");
    const mainBox = main ? main.getBoundingClientRect() : null;
    const firstChild = main?.firstElementChild?.getBoundingClientRect();
    return {
      findings,
      overflow: +overflow.toFixed(1),
      main: main
        ? {
            left: +mainBox.left.toFixed(1),
            right: +(innerWidth - mainBox.right).toFixed(1),
            contentLeft: firstChild ? +firstChild.left.toFixed(1) : null,
            contentRight: firstChild
              ? +(innerWidth - firstChild.right).toFixed(1)
              : null,
            scrollW: main.scrollWidth,
            clientW: main.clientWidth,
          }
        : null,
      topbarHeight: topbar
        ? +topbar.getBoundingClientRect().height.toFixed(1)
        : null,
    };
  });
}

let browser, context, page, userId;
let stage = "start";
const results = [];
const errors = [];
try {
  await mkdir(output, { recursive: true });
  const email = `layout-audit-${Date.now()}-${randomUUID().slice(0, 8)}@miro-test.local`;
  const password = `Audit-${randomUUID()}!`;
  const actor = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (actor.error) throw actor.error;
  userId = actor.data.user.id;
  for (const result of await Promise.all([
    service
      .from("user_roles")
      .upsert({ user_id: userId, role: "ceo" }, { onConflict: "user_id" }),
    service
      .from("profiles")
      .update({ role: "ceo", account_status: "active", full_name: "Layout QA" })
      .eq("id", userId),
  ]))
    if (result.error) throw result.error;

  browser = await chromium.launch();
  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));

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
        // A slow upstream opens the process-local Supabase breaker for 30s;
        // wait it out before trying the credential exchange again.
        await page.waitForTimeout(35000);
      }
    }
    throw lastError;
  }

  await signIn();

  await context.route("**/api/management/**", async (route) => {
    const request = route.request();
    if (request.method() !== "GET")
      return route.fulfill({ status: 403, json: { error: "read_only_qa" } });
    try {
      const response = await route.fetch({ timeout: 20000 });
      return route.fulfill({ response });
    } catch {
      return route.abort().catch(() => {});
    }
  });

  for (const locale of locales) {
    for (const path of selectedPages) {
      stage = `visit ${locale}/${path || "overview"}`;
      const target = `${base}/${locale}/admin${path ? `/${path}` : ""}`;
      let response;
      for (let attempt = 0; attempt < 3; attempt++) {
        response = await page.goto(target, {
          waitUntil: "networkidle",
          timeout: 60000,
        });
        if (new URL(page.url()).pathname.endsWith("/login")) {
          // Long audits can lose the derived session cookie between
          // navigations; wait out the transport breaker and sign back in.
          await page.waitForTimeout(35000);
          await signIn();
          continue;
        }
        if (response.status() >= 500) {
          // Upstream Supabase slowness can surface as a server error boundary.
          if (attempt === 2) throw new Error(`status ${response.status()}`);
          await page.waitForTimeout(5000);
          continue;
        }
        try {
          await page
            .locator(".mgmt-shell__main h1")
            .first()
            .waitFor({ timeout: attempt === 2 ? 15000 : 25000 });
          break;
        } catch (error) {
          if (attempt === 2) throw error;
          await page.waitForTimeout(2000);
        }
      }
      if (response.status() !== 200)
        throw new Error(`status ${response.status()}`);
      await page.evaluate(() => document.fonts.ready);

      for (const viewport of viewports) {
        stage = `review ${locale}/${path || "overview"} ${viewport.width}x${viewport.height} ${viewport.sidebar}`;
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await page.evaluate((collapsed) => {
          try {
            localStorage.setItem(
              "miro.mgmt.sidebar-collapsed",
              collapsed ? "1" : "0",
            );
            window.dispatchEvent(new Event("miro:mgmt-sidebar-collapse"));
          } catch {}
        }, viewport.sidebar === "collapsed");
        await page.waitForTimeout(220);
        const result = await inspect(page);
        const entry = {
          locale,
          path: path || "overview",
          ...viewport,
          ...result,
          findings: result.findings,
        };
        results.push(entry);
        const shotKey = `${viewport.width}x${viewport.height}-${viewport.sidebar}`;
        if (withScreens && shotViewports.has(shotKey)) {
          await page.screenshot({
            path: `${output}/${locale}-${(path || "overview").replaceAll("/", "-")}-${shotKey}.png`,
            fullPage: false,
          });
        }
        if (result.findings.length) {
          await page.screenshot({
            path: `${output}/${locale}-${(path || "overview").replaceAll("/", "-")}-${shotKey}-findings.png`,
            fullPage: true,
          });
        }
      }
    }
  }

  await writeFile(
    `${output}/audit.json`,
    JSON.stringify({ results, errors }, null, 2),
  );
  const total = results.reduce((n, r) => n + r.findings.length, 0);
  console.log(
    JSON.stringify({
      combinations: results.length,
      findings: total,
      byKind: results
        .flatMap((r) => r.findings)
        .reduce((acc, f) => ((acc[f.kind] = (acc[f.kind] || 0) + 1), acc), {}),
      pagesWithFindings: [
        ...new Set(
          results
            .filter((r) => r.findings.length)
            .map((r) => `${r.locale}/${r.path}`),
        ),
      ],
      errors,
    }),
  );
} catch (error) {
  console.error(stage, String(error.message || error).split("\n")[0]);
  await page
    ?.screenshot({ path: `${output}/failure.png`, fullPage: true })
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
