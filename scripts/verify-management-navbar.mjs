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
const roles = (process.env.NAVBAR_ROLES || "ceo,admin").split(",");
const locales = (process.env.NAVBAR_LOCALES || "en,he").split(",");
const iconsOnly = process.env.NAVBAR_ICONS_ONLY === "1";
const widths = (
  process.env.NAVBAR_WIDTHS ||
  "320,390,768,1024,1199,1200,1440,1599,1600,1920,2560"
)
  .split(",")
  .map(Number);
assert.ok(roles.every((role) => ["ceo", "admin"].includes(role)));
assert.ok(locales.every((locale) => ["en", "he"].includes(locale)));
assert.ok(widths.every((width) => Number.isInteger(width) && width >= 320));
const actorIds = [];
const checks = [];
const errors = [];
const beamOffset = (page) =>
  page.evaluate(() => {
    const header = document
      .querySelector(".mgmt-topbar")
      .getBoundingClientRect();
    const beam = document
      .querySelector(".motion-navigation-progress")
      .getBoundingClientRect();
    return Math.max(
      Math.abs(beam.left - header.left),
      Math.abs(beam.right - header.right),
      Math.abs(beam.top - header.bottom),
    );
  });
const sidebarIconContrast = (link) =>
  link.locator(".mgmt-nav__icon").evaluate((icon) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d");
    const sample = (color) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const luminance = (rgb) =>
      rgb
        .map((value) => {
          const c = value / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        })
        .reduce(
          (sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index],
          0,
        );
    const style = getComputedStyle(icon);
    const foreground = luminance(sample(style.color));
    const background = luminance(sample(style.backgroundColor));
    return (
      (Math.max(foreground, background) + 0.05) /
      (Math.min(foreground, background) + 0.05)
    );
  });
let browser;
let activePage;
try {
  browser = await browserType.launch();
  await mkdir(output, { recursive: true });
  for (const role of roles) {
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
          full_name:
            "Synthetic navbar account with a deliberately long name / שם ארוך לבדיקת תפריט",
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
    activePage = page;
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
        return route.fulfill({
          json: { products: [], categories: [], totalCount: 0 },
        });
      return route.continue();
    });
    for (const locale of locales) {
      await page.goto(`${base}/${locale}`, { waitUntil: "networkidle" });
      const publicHeights = {};
      for (const width of widths) {
        await page.setViewportSize({ width, height: 1000 });
        publicHeights[width] = await page
          .locator(".premium-header")
          .evaluate((node) => node.getBoundingClientRect().height);
      }
      await page.goto(`${base}/${locale}/admin/products`, {
        waitUntil: "networkidle",
      });
      await expect(page.locator(".mgmt-topbar")).toBeVisible();
      await page.evaluate(() => {
        document.documentElement.dataset.appearanceVersion = "2";
      });
      // The sidebar has its own scroll rail between the fixed brand and
      // identity. Check actual content bounds rather than assuming that
      // native scrollbars consume space (overlay scrollbars do not).
      await page.setViewportSize({ width: 1440, height: 600 });
      await page.evaluate(() => {
        document.documentElement.dataset.theme = "dark";
      });
      for (const sidebar of ["expanded", "collapsed"]) {
        const shell = page.locator(".mgmt-shell");
        if ((await shell.getAttribute("data-sidebar")) !== sidebar)
          await page.locator(".mgmt-sidebar__collapse").click();
        const rail = page.locator(".mgmt-sidebar__nav");
        const links = rail.locator(".mgmt-nav__link");
        await page.mouse.move(0, 0);
        await rail.evaluate((node) => {
          node.scrollTop = 0;
        });
        const topGeometry = await rail.evaluate((node) => {
          const brand = document.querySelector(".mgmt-sidebar__brand");
          const first = node.querySelector(".mgmt-nav__link");
          const navBox = node.getBoundingClientRect();
          const clientLeft = navBox.left + node.clientLeft;
          const clientRight = clientLeft + node.clientWidth;
          const boxes = [...node.querySelectorAll(".mgmt-nav__link")].map(
            (link) => link.getBoundingClientRect(),
          );
          return {
            scrollable: node.scrollHeight > node.clientHeight,
            topGap:
              first.getBoundingClientRect().top -
              brand.getBoundingClientRect().bottom,
            leftGap: Math.min(...boxes.map((box) => box.left - clientLeft)),
            rightGap: Math.min(...boxes.map((box) => clientRight - box.right)),
            minWidth: Math.min(...boxes.map((box) => box.width)),
            minHeight: Math.min(...boxes.map((box) => box.height)),
          };
        });
        assert.ok(
          topGeometry.scrollable,
          `${role}/${locale}/${sidebar}: rail must overflow`,
        );
        assert.ok(
          topGeometry.topGap >= 16,
          `${role}/${locale}/${sidebar}: brand clearance ${topGeometry.topGap}px`,
        );
        assert.ok(
          topGeometry.leftGap >= 4 && topGeometry.rightGap >= 4,
          `${role}/${locale}/${sidebar}: content/scrollbar clearance ${JSON.stringify(topGeometry)}`,
        );
        assert.ok(
          topGeometry.minHeight >= 46 &&
            (sidebar !== "collapsed" || topGeometry.minWidth >= 46),
          `${role}/${locale}/${sidebar}: link target size ${JSON.stringify(topGeometry)}`,
        );
        await rail.hover();
        await page.mouse.wheel(0, 10000);
        await expect
          .poll(() => rail.evaluate((node) => node.scrollTop))
          .toBeGreaterThan(0);
        await links.last().focus();
        await expect(links.last()).toBeFocused();
        const bottomGeometry = await rail.evaluate((node) => {
          const railBox = node.getBoundingClientRect();
          const links = node.querySelectorAll(".mgmt-nav__link");
          const lastBox = links[links.length - 1].getBoundingClientRect();
          const footerBox = document
            .querySelector(".mgmt-sidebar__footer")
            .getBoundingClientRect();
          return {
            lastVisible:
              lastBox.top >= railBox.top && lastBox.bottom <= railBox.bottom,
            footerGap: footerBox.top - lastBox.bottom,
          };
        });
        assert.ok(
          bottomGeometry.lastVisible,
          `${role}/${locale}/${sidebar}: final link reachable`,
        );
        assert.ok(
          bottomGeometry.footerGap >= 16,
          `${role}/${locale}/${sidebar}: footer clearance ${bottomGeometry.footerGap}px`,
        );
        await page.locator(".mgmt-sidebar").screenshot({
          path: join(output, `${role}-${locale}-sidebar-${sidebar}.png`),
        });
        checks.push(
          `${role}/${locale}/${sidebar}: sidebar scroll, clearance and 46px targets`,
        );
      }
      for (const width of widths) {
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
          if (width === 390) {
            await page.locator(".mgmt-topbar__menu-button").click();
            const drawer = page.locator(".mgmt-drawer--nav");
            const link = drawer.locator(".mgmt-nav__link").first();
            await expect(link).toBeVisible();
            assert.ok(
              (await sidebarIconContrast(link)) >= 4.5,
              `${role}/${locale}/${theme}: mobile navigation icon contrast`,
            );
            await page.keyboard.press("Escape");
            await expect(drawer).toBeHidden();
            checks.push(
              `${role}/${locale}/${theme}: mobile navigation icon contrast`,
            );
          }
          // Exercise the real beam lifecycle and sidebar toggle, including RTL.
          for (const sidebar of ["expanded", "collapsed"]) {
            if (sidebar === "collapsed" && width < 1024) continue;
            if (width >= 1024) {
              const shell = page.locator(".mgmt-shell");
              if ((await shell.getAttribute("data-sidebar")) !== sidebar)
                await page.locator(".mgmt-sidebar__collapse").click();
              if (width === 1440) {
                const targets = [
                  page.locator(
                    ".mgmt-sidebar .mgmt-nav__link[aria-current='page']",
                  ),
                  page
                    .locator(
                      ".mgmt-sidebar .mgmt-nav__link:not([aria-current]):not(.mgmt-nav__link--restricted)",
                    )
                    .first(),
                ];
                if (role === "admin")
                  targets.push(
                    page
                      .locator(".mgmt-sidebar .mgmt-nav__link--restricted")
                      .first(),
                  );
                for (const link of targets) {
                  await link.scrollIntoViewIfNeeded();
                  await page.mouse.move(0, 0);
                  await link.blur();
                  for (const state of ["rest", "hover", "focus"]) {
                    if (state === "hover") await link.hover();
                    if (
                      state === "hover" &&
                      role === "ceo" &&
                      locale === "he" &&
                      !(await link.getAttribute("aria-current"))
                    ) {
                      await page.locator(".mgmt-sidebar").screenshot({
                        path: join(
                          output,
                          `sidebar-${theme}-${sidebar}-hover.png`,
                        ),
                      });
                    }
                    if (state === "focus") {
                      await page.mouse.move(0, 0);
                      await page.keyboard.press("Tab");
                      await link.focus();
                      await expect(link).toHaveCSS("outline-style", "solid");
                    }
                    const contrast = await sidebarIconContrast(link);
                    assert.ok(
                      contrast >= 4.5,
                      `${role}/${locale}/${theme}/${sidebar}/${state}: sidebar icon contrast ${contrast.toFixed(2)}`,
                    );
                  }
                  await link.blur();
                }
                checks.push(
                  `${role}/${locale}/${theme}/${sidebar}: sidebar icon rest, hover and focus contrast`,
                );
              }
            }
            if (iconsOnly) continue;
            await page.evaluate(() => {
              window.dispatchEvent(
                new CustomEvent("miro-navigation-start", {
                  detail: { href: `${location.pathname}?navbar-qa=loading` },
                }),
              );
            });
            await expect(
              page.locator(".motion-navigation-progress"),
            ).toHaveAttribute("data-state", "loading");
            await expect
              .poll(() => beamOffset(page), {
                message: `${role}/${locale}/${width}/${theme}/${sidebar}: beam follows workspace`,
              })
              .toBeLessThan(1);
            if (width >= 1024) {
              const alignment = await page.evaluate(() => {
                const center = (selector) => {
                  const box = document
                    .querySelector(selector)
                    .getBoundingClientRect();
                  return box.top + box.height / 2;
                };
                const header = center(".mgmt-topbar");
                return {
                  mark: Math.abs(center(".mgmt-sidebar__brand-mark") - header),
                  text:
                    document.querySelector(".mgmt-shell").dataset.sidebar ===
                    "expanded"
                      ? Math.abs(center(".mgmt-sidebar__brand-text") - header)
                      : 0,
                };
              });
              assert.ok(
                alignment.mark < 1 && alignment.text < 1,
                `${role}/${locale}/${width}/${theme}/${sidebar}: brand centered with navbar ${JSON.stringify(alignment)}`,
              );
              if (width === 1440 && theme === "dark")
                await page.screenshot({
                  path: join(
                    output,
                    `${role}-${locale}-${sidebar}-loading.png`,
                  ),
                });
            }
            await page.evaluate(() =>
              window.dispatchEvent(new Event("miro-navigation-end")),
            );
            await expect(
              page.locator(".motion-navigation-progress"),
            ).toHaveAttribute("data-state", "idle");
          }
          if (iconsOnly) continue;
          if (width >= 1024)
            await page.locator(".mgmt-sidebar__collapse").click();
          const controls = page.locator(".mgmt-topbar__controls");
          const checkControlLayout = async () => {
            const geometry = await page
              .locator(".mgmt-topbar__end")
              .evaluate((end) => {
                const visible = (node) => !!node.getClientRects().length;
                // The role badge is not a control, but it must still stay in
                // its group and clear the account trigger at tight widths.
                const controlsNodes = [
                  ...end.querySelectorAll("button, a, .mgmt-role-badge"),
                ].filter(visible);
                const name = (node) =>
                  node.getAttribute("aria-label") ||
                  node.textContent?.trim().slice(0, 40) ||
                  node.className;
                const findings = [];
                for (let i = 0; i < controlsNodes.length; i++) {
                  const button = controlsNodes[i];
                  const box = button.getBoundingClientRect();
                  if (box.left < -1 || box.right > innerWidth + 1)
                    findings.push(`outside viewport: ${name(button)}`);
                  const icon = button.querySelector?.("svg");
                  if (
                    icon &&
                    !button.matches(
                      ".mgmt-workspace-search, .mgmt-account__trigger",
                    )
                  ) {
                    const glyph = icon.getBoundingClientRect();
                    if (
                      Math.abs(
                        glyph.x + glyph.width / 2 - box.x - box.width / 2,
                      ) > 1 ||
                      Math.abs(
                        glyph.y + glyph.height / 2 - box.y - box.height / 2,
                      ) > 1
                    )
                      findings.push(`off-center icon: ${name(button)}`);
                  }
                  for (const next of controlsNodes.slice(i + 1)) {
                    const other = next.getBoundingClientRect();
                    const overlapX =
                      Math.min(box.right, other.right) -
                      Math.max(box.left, other.left);
                    const overlapY =
                      Math.min(box.bottom, other.bottom) -
                      Math.max(box.top, other.top);
                    if (overlapX > 1 && overlapY > 1)
                      findings.push(
                        `overlapping controls: ${name(button)} / ${name(next)}`,
                      );
                  }
                }
                const groups = [
                  ...end.querySelectorAll(".mgmt-topbar__control-group"),
                ];
                for (const group of groups) {
                  const box = group.getBoundingClientRect();
                  const members = [
                    ...group.querySelectorAll("button, a, .mgmt-role-badge"),
                  ].filter(visible);
                  for (let i = 0; i < members.length; i++) {
                    const child = members[i].getBoundingClientRect();
                    if (
                      child.left < box.left - 1 ||
                      child.right > box.right + 1
                    )
                      findings.push(
                        `control escapes group: ${group.getAttribute("aria-label")}`,
                      );
                    // Preserve the compact identity trio; wide work/display actions get 12px.
                    const next = members[i + 1];
                    if (!next) continue;
                    const other = next.getBoundingClientRect();
                    if (Math.abs(child.y - other.y) < 2) {
                      const gap = Math.max(
                        other.left - child.right,
                        child.left - other.right,
                      );
                      const segment =
                        members[i].matches(".mgmt-topbar__theme-btn") &&
                        next.matches(".mgmt-topbar__theme-btn");
                      const actionGap =
                        innerWidth >= 1440 &&
                        !group.classList.contains(
                          "mgmt-topbar__control-group--identity",
                        )
                          ? 12
                          : 8;
                      if (gap < (segment ? 2 : actionGap) - 0.5)
                        findings.push(`tight adjacent controls: ${gap}px`);
                    }
                  }
                }
                if (innerWidth >= 1200) {
                  const controlsBox = end
                    .querySelector(".mgmt-topbar__controls")
                    .getBoundingClientRect();
                  for (const group of groups) {
                    const box = group.getBoundingClientRect();
                    if (
                      box.left < controlsBox.left - 1.5 ||
                      box.right > controlsBox.right + 1.5
                    )
                      findings.push(
                        `group escapes controls: ${group.getAttribute("aria-label")}`,
                      );
                  }
                  for (let i = 0; i < groups.length - 1; i++) {
                    const first = groups[i].getBoundingClientRect();
                    const next = groups[i + 1].getBoundingClientRect();
                    const gap = Math.max(
                      first.left - next.right,
                      next.left - first.right,
                    );
                    if (gap < 12.5) findings.push(`tight sections: ${gap}px`);
                  }
                  const badge = end.querySelector(".mgmt-role-badge");
                  const account = end.querySelector(".mgmt-account__trigger");
                  if (badge && account) {
                    const badgeBox = badge.getBoundingClientRect();
                    const accountBox = account.getBoundingClientRect();
                    const badgeGap = Math.max(
                      badgeBox.left - accountBox.right,
                      accountBox.left - badgeBox.right,
                    );
                    if (badgeGap < 6)
                      findings.push(
                        `role badge too close to account: ${badgeGap}px`,
                      );
                  }
                  const header = document
                    .querySelector(".mgmt-topbar")
                    .getBoundingClientRect();
                  const endBox = end.getBoundingClientRect();
                  if (innerWidth >= 1600 && endBox.width < header.width * 0.65)
                    findings.push("sections still clustered at the edge");
                  const start = document
                    .querySelector(".mgmt-topbar__start")
                    .getBoundingClientRect();
                  if (
                    Math.min(start.right, endBox.right) -
                      Math.max(start.left, endBox.left) >
                    1
                  )
                    findings.push("title overlaps toolbar");
                  const title = document
                    .querySelector(".mgmt-topbar__title")
                    .getBoundingClientRect();
                  if (
                    Math.abs(
                      title.left +
                        title.width / 2 -
                        start.left -
                        start.width / 2,
                    ) > 1
                  )
                    findings.push("page context is not centered in its track");
                  if (
                    title.top < header.top - 1 ||
                    title.bottom > header.bottom + 1
                  )
                    findings.push("page context escapes navbar height");
                  if (innerWidth >= 1600) {
                    const search = document
                      .querySelector(".mgmt-workspace-search")
                      .getBoundingClientRect();
                    const cluster = groups
                      .map((group) => group.getBoundingClientRect())
                      .reduce(
                        (bounds, box) => ({
                          left: Math.min(bounds.left, box.left),
                          right: Math.max(bounds.right, box.right),
                        }),
                        { left: Infinity, right: -Infinity },
                      );
                    const controlsBox = end
                      .querySelector(".mgmt-topbar__controls")
                      .getBoundingClientRect();
                    if (
                      Math.abs(
                        cluster.left -
                          controlsBox.left -
                          (controlsBox.right - cluster.right),
                      ) > 1
                    )
                      findings.push("control cluster is not centered");
                    if (search.width < 208)
                      findings.push("wide workspace search remains collapsed");
                  }
                }
                return findings;
              });
            assert.deepEqual(
              geometry,
              [],
              `${role}/${locale}/${width}/${theme}: control layout`,
            );
            assert.equal(
              await controls.locator("svg.lucide-sliders-horizontal").count(),
              1,
              "Exactly one display-preferences icon",
            );
            assert.equal(
              await page
                .locator(".mgmt-topbar__controls-toggle svg.lucide-ellipsis")
                .count(),
              1,
              "Compact overflow has a distinct icon",
            );
            assert.deepEqual(
              await controls
                .locator(
                  ".mgmt-topbar__control-group--work > button, .mgmt-topbar__control-group--work > a",
                )
                .evaluateAll((nodes) =>
                  nodes.map((node) => node.querySelector("svg").classList[1]),
                ),
              [
                "lucide-search",
                "lucide-receipt-text",
                "lucide-calculator",
                "lucide-store",
              ],
              "Navigation/work actions follow reading and keyboard order",
            );
          };
          if (width < 1200) {
            const toggle = page.locator(".mgmt-topbar__controls-toggle");
            if (!(await controls.isVisible())) await toggle.click();
            await expect(controls).toBeVisible();
            await expect(
              controls.locator(".mgmt-workspace-search > span"),
            ).toBeVisible();
            const box = await controls.boundingBox();
            assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
            await expect(
              controls.locator(".mgmt-topbar__theme-selector"),
            ).toBeVisible();
            await checkControlLayout();
            await page.keyboard.press("Escape");
            await expect(controls).toBeHidden();
            await expect(toggle).toBeFocused();
          } else {
            await expect(controls).toBeVisible();
            await expect(
              page.locator(".mgmt-topbar__controls-toggle"),
            ).toBeHidden();
            await checkControlLayout();
            if (width === 1920 && theme === "medium")
              await page.locator(".mgmt-topbar").screenshot({
                path: join(output, `${role}-${locale}-1920-navbar.png`),
              });
          }
          checks.push(
            `${role}/${locale}/${width}/${theme}: aligned brand, bounded loading beam, equal navbar heights, distinct controls, reading order, centered icons, separated groups and contained controls`,
          );
        }
      }
      if (iconsOnly) continue;
      await page.setViewportSize({ width: 390, height: 280 });
      const compactToggle = page.locator(".mgmt-topbar__controls-toggle");
      const compactControls = page.locator(".mgmt-topbar__controls");
      await compactToggle.click();
      await expect(compactControls).toBeVisible();
      const compactBounds = await compactControls.boundingBox();
      assert.ok(
        compactBounds.y >= 0 && compactBounds.y + compactBounds.height <= 281,
        `Compact tools panel must fit a short viewport: ${JSON.stringify(compactBounds)}`,
      );
      const language = compactControls.locator(".mgmt-topbar__lang-btn");
      await language.focus();
      await expect(language).toBeInViewport();
      await page.keyboard.press("Escape");
      await expect(compactControls).toBeHidden();
      await expect(compactToggle).toBeFocused();
      checks.push(
        `${role}/${locale}: short tools panel is bounded and keyboard reachable`,
      );

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
      await dialog.locator('input[value="compact"]').check();
      await expect(page.locator(".mgmt-shell")).toHaveAttribute(
        "data-density",
        "compact",
      );
      await dialog.locator('input[value="comfortable"]').check();
      await expect(page.locator(".mgmt-shell")).toHaveAttribute(
        "data-density",
        "comfortable",
      );
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(page.locator(".mgmt-topbar__controls")).toBeVisible();
      for (const theme of ["medium", "dark", "light"]) {
        const themeButton = page.locator(
          `.mgmt-topbar__theme-btn[data-theme-option="${theme}"]`,
        );
        await themeButton.click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(themeButton).toHaveAttribute("aria-pressed", "true");
      }
      const motion = page.locator(
        ".mgmt-topbar__control-group--display .mgmt-icon-action[aria-pressed]",
      );
      await motion.click();
      await expect(motion).toHaveAttribute("aria-pressed", "true");
      await motion.click();
      await expect(motion).toHaveAttribute("aria-pressed", "false");
      await page.locator(".mgmt-workspace-search").click();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("searchbox")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(page.locator(".mgmt-topbar__controls")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator(".mgmt-topbar__controls")).toBeHidden();
      // Keyboard entry and tab exit should not strand focus in hidden tools.
      const toolsToggle = page.locator(".mgmt-topbar__controls-toggle");
      await toolsToggle.focus();
      await toolsToggle.press("ArrowDown");
      await expect(page.locator(".mgmt-workspace-search")).toBeFocused();
      await page.locator(".mgmt-shell__main").evaluate((node) => {
        node.tabIndex = -1;
        node.focus();
      });
      await expect(page.locator(".mgmt-topbar__controls")).toBeHidden();
      checks.push(
        `${role}/${locale}: keyboard tools entry and focus-leave dismissal`,
      );
      // The account panel is independent of sticky-header/sidebar containing blocks.
      for (const viewport of [
        { width: 320, height: 700 },
        { width: 390, height: 280 },
        { width: 1200, height: 320 },
        { width: 1920, height: 900 },
      ]) {
        await page.setViewportSize(viewport);
        for (const theme of ["dark", "medium", "light"]) {
          await page.evaluate((theme) => {
            document.documentElement.dataset.theme = theme;
          }, theme);
          for (const sidebar of viewport.width >= 1024
            ? ["expanded", "collapsed"]
            : ["compact"]) {
            if (
              sidebar !== "compact" &&
              (await page
                .locator(".mgmt-shell")
                .getAttribute("data-sidebar")) !== sidebar
            )
              await page.locator(".mgmt-sidebar__collapse").click();
            const accountTrigger = page.locator(".mgmt-account__trigger");
            await accountTrigger.click();
            const panel = page.locator(".mgmt-account__popover");
            await expect(panel).toBeVisible();
            assert.equal(
              await panel.evaluate((node) => node.parentElement.id),
              "mgmt-overlay-portal-host",
            );
            await expect
              .poll(() =>
                panel.evaluate((node) => {
                  const box = node.getBoundingClientRect();
                  return (
                    box.left >= 15 &&
                    box.right <= innerWidth - 15 &&
                    box.top >= 15 &&
                    box.bottom <= innerHeight - 15 &&
                    node.scrollWidth <= node.clientWidth + 1
                  );
                }),
              )
              .toBe(true);
            await page.keyboard.press("End");
            await expect(
              panel.locator(".mgmt-account__item--logout"),
            ).toBeFocused();
            await expect(
              panel.locator(".mgmt-account__item--logout"),
            ).toBeInViewport();
            await page.keyboard.press("Home");
            await expect(panel.getByRole("menuitem").first()).toBeFocused();
            const hit = await panel.evaluate((node) => {
              const box = node.getBoundingClientRect();
              return [0.2, 0.5, 0.8].every((x) =>
                [0.2, 0.5, 0.8].every((y) =>
                  node.contains(
                    document.elementFromPoint(
                      box.left + box.width * x,
                      box.top + box.height * y,
                    ),
                  ),
                ),
              );
            });
            assert.ok(
              hit,
              `${role}/${locale}/${viewport.width}/${viewport.height}/${theme}/${sidebar}: account hit testing`,
            );
            if (viewport.width === 1920 && sidebar === "expanded") {
              const accountAxe = await new AxeBuilder({ page })
                .include(".mgmt-account__popover")
                .analyze();
              assert.deepEqual(
                accountAxe.violations.map((v) => v.id),
                [],
              );
              if (theme === "dark")
                await panel.screenshot({
                  path: join(output, `${role}-${locale}-account-desktop.png`),
                });
            }
            if (viewport.height === 280 && theme === "light")
              await panel.screenshot({
                path: join(output, `${role}-${locale}-account-short.png`),
              });
            await page.keyboard.press("Tab");
            await expect(panel).toHaveCount(0);
          }
          checks.push(
            `${role}/${locale}/${viewport.width}x${viewport.height}/${theme}: portaled account bounds, long identity, keyboard, Tab, sidebar states and hit testing`,
          );
        }
      }
      await page.setViewportSize({ width: 390, height: 900 });
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
      for (const version of ["1", "2"]) {
        await page.evaluate((version) => {
          document.documentElement.dataset.appearanceVersion = version;
        }, version);
        for (const reducedMotion of ["no-preference", "reduce"]) {
          await page.emulateMedia({ reducedMotion });
          for (const width of [1440, 390]) {
            await page.setViewportSize({ width, height: 1000 });
            await page.evaluate(() =>
              window.dispatchEvent(
                new CustomEvent("miro-navigation-start", {
                  detail: { href: `${location.pathname}?navbar-qa=motion` },
                }),
              ),
            );
            await expect(
              page.locator(".motion-navigation-progress"),
            ).toHaveAttribute("data-state", "loading");
            await expect.poll(() => beamOffset(page)).toBeLessThan(1);
            await page.evaluate(() =>
              window.dispatchEvent(new Event("miro-navigation-end")),
            );
            await expect(
              page.locator(".motion-navigation-progress"),
            ).toHaveAttribute("data-state", "idle");
            checks.push(
              `${role}/${locale}/v${version}/${reducedMotion}/${width}: bounded beam lifecycle`,
            );
          }
        }
      }
      // Storage changes from another tab must override the in-memory preference.
      const previousSidebar = await page
        .locator(".mgmt-shell")
        .getAttribute("data-sidebar");
      for (const collapsed of [
        previousSidebar !== "collapsed",
        previousSidebar === "collapsed",
      ]) {
        await page.evaluate((collapsed) => {
          const key = "miro.mgmt.sidebar-collapsed";
          localStorage.setItem(key, collapsed ? "1" : "0");
          window.dispatchEvent(
            new StorageEvent("storage", {
              key,
              newValue: collapsed ? "1" : "0",
              storageArea: localStorage,
            }),
          );
        }, collapsed);
        await expect(page.locator(".mgmt-shell")).toHaveAttribute(
          "data-sidebar",
          collapsed ? "collapsed" : "expanded",
        );
      }
      checks.push(
        `${role}/${locale}: sidebar cross-tab preference synchronization`,
      );
      // POS chrome only: synthetic empty catalog, no sale or payment writes.
      await context.route("**/api/management/pos/catalog?**", (route) =>
        route.fulfill({
          json: { products: [], categories: [], totalPages: 1, total: 0 },
        }),
      );
      await page.setViewportSize({ width: 1440, height: 900 });
      await page
        .getByRole("button", {
          name: locale === "he" ? "פתיחת קופה" : "Open POS",
          exact: true,
        })
        .click();
      const pos = page.locator('[data-pos-shell="true"]');
      await expect(pos).toBeVisible();
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const header = pos.locator("header").first();
        const actions = header.locator("button");
        await expect(actions).toHaveCount(2);
        const boxes = await actions.evaluateAll((nodes) =>
          nodes.map((node) => node.getBoundingClientRect().toJSON()),
        );
        assert.ok(
          boxes.every(
            (box) =>
              box.width >= 44 &&
              box.height >= 44 &&
              box.x >= 0 &&
              box.right <= width + 1,
          ),
          "POS header actions stay reachable",
        );
        const menu = header.getByRole("button", {
          name: locale === "he" ? "תפריט הקופה" : "POS menu",
          exact: true,
        });
        await menu.click();
        await expect(menu).toHaveAttribute("aria-pressed", "true");
        await expect(pos.getByRole("navigation")).toBeVisible();
        await menu.click();
        await expect(menu).toHaveAttribute("aria-pressed", "false");
        if (width === 320)
          await header.screenshot({
            path: join(output, `${role}-${locale}-pos-phone.png`),
          });
        checks.push(
          `${role}/${locale}/${width}: POS header targets and menu state`,
        );
      }
      await page
        .getByRole("button", {
          name: locale === "he" ? "סגירת קופה" : "Close POS",
          exact: true,
        })
        .click();
      await expect(pos).toHaveCount(0);
      // Locale round trips preserve exactly one fragment in the installed router.
      await page.evaluate(() =>
        history.replaceState(
          history.state,
          "",
          `${location.pathname}?navbar-qa=locale#main-content`,
        ),
      );
      for (const target of [locale === "he" ? "en" : "he", locale]) {
        await page.locator(".mgmt-topbar__lang-btn").click();
        await page.waitForURL(
          (url) =>
            url.pathname === `/${target}/admin/products` &&
            url.search === "?navbar-qa=locale" &&
            url.hash === "#main-content",
        );
        await expect(page.locator("html")).toHaveAttribute("lang", target);
      }
      checks.push(
        `${role}/${locale}: language round trip retains query and one anchor`,
      );
      console.log(`PASS ${role}/${locale} chrome checks`);
    }
    if (iconsOnly) {
      await context.close();
      continue;
    }
    let logoutRequests = 0;
    await page.route("**/api/auth/logout**", (route) => {
      assert.equal(route.request().method(), "POST");
      assert.equal(
        new URL(route.request().url()).searchParams.get("locale"),
        locales.at(-1),
      );
      logoutRequests++;
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<title>Mocked sign out</title>",
      });
    });
    await page.evaluate(() => {
      sessionStorage.setItem("miro.management.tools.draft.qa", "synthetic");
      sessionStorage.setItem("miro.payment.keys.qa", "synthetic");
      sessionStorage.setItem("navbar.unrelated.qa", "retained");
    });
    await page.locator(".mgmt-account__trigger").click();
    await page.locator(".mgmt-account__item--logout").click();
    await page.waitForURL((url) => url.pathname === "/api/auth/logout");
    assert.equal(logoutRequests, 1);
    assert.deepEqual(
      await page.evaluate(() => [
        sessionStorage.getItem("miro.management.tools.draft.qa"),
        sessionStorage.getItem("miro.payment.keys.qa"),
        sessionStorage.getItem("navbar.unrelated.qa"),
      ]),
      [null, null, "retained"],
    );
    checks.push(
      `${role}: mocked logout preserves POST/locale and clears only protected session drafts`,
    );
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
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    const geometry = await activePage.evaluate(() => ({
      viewport: innerWidth,
      direction: getComputedStyle(document.documentElement).direction,
      variables: document.documentElement.getAttribute("style"),
      elements: [
        ".mgmt-topbar",
        ".mgmt-sidebar__brand",
        ".motion-navigation-progress",
      ].map((selector) => {
        const node = document.querySelector(selector);
        return {
          selector,
          bounds: node?.getBoundingClientRect().toJSON(),
          left: node && getComputedStyle(node).left,
          right: node && getComputedStyle(node).right,
        };
      }),
    }));
    await writeFile(
      join(output, "failure-geometry.json"),
      JSON.stringify(geometry, null, 2),
    );
    await activePage.screenshot({ path: join(output, "failure.png") });
  }
  throw error;
} finally {
  await browser?.close();
  for (const id of actorIds) {
    const result = await service.auth.admin.deleteUser(id);
    if (result.error) throw result.error;
  }
  console.log(`Removed ${actorIds.length} disposable navbar actors`);
}
