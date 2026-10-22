// Read-only live storefront QA. Never changes catalog, settings or business data.
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const base = process.env.RELATED_BASE_URL || "http://127.0.0.1:3000";
const output = process.env.RELATED_OUTPUT_DIR || "/tmp/miro-related-products";
const exports = {};
runInNewContext(
  ts.transpileModule(await readFile("src/lib/animation-settings.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { exports, require: createRequire(import.meta.url) },
);
const settings = { ...exports.DEFAULT_ANIMATION_SETTINGS, enabled: false };
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const reports = [];
const motionReports = [];
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/track", (r) => r.fulfill({ status: 204 }));
  for (const locale of ["en", "he"]) {
    await page.goto(`${base}/${locale}`, { waitUntil: "domcontentloaded" });
    const link = page.locator(".sf-product-card .sf-product-media").first();
    await expect(link).toBeVisible({ timeout: 20000 });
    const href = await link.getAttribute("href");
    await page.goto(base + href, { waitUntil: "domcontentloaded" });
    const rail = page.locator("[data-related-products]");
    await expect(rail).toBeVisible({ timeout: 20000 });
    await expect(page.locator("html")).toHaveAttribute(
      "data-motion-ready",
      "true",
    );
    await page.evaluate(
      (settings) =>
        window.dispatchEvent(
          new CustomEvent("miro-animation-settings-change", {
            detail: settings,
          }),
        ),
      settings,
    );
    const links = await rail
      .locator(".sf-moving-rail-card")
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href")));
    assert.ok(links.length > 0);
    assert.ok(!links.includes(href));
    assert.equal(new Set(links).size, links.length);
    for (const width of [1920, 1440, 1280, 1024, 390, 320])
      for (const theme of ["dark", "medium", "light"]) {
        await page.setViewportSize({ width, height: 1080 });
        await page.evaluate(
          (theme) => (document.documentElement.dataset.theme = theme),
          theme,
        );
        const geometry = await page.evaluate(() => {
          const g = document.querySelector(".sf-product-gallery"),
            i = document.querySelector(".sf-product-info"),
            r = document.querySelector("[data-related-products]");
          const b = (n) => {
            const x = n.getBoundingClientRect();
            return {
              top: x.top,
              bottom: x.bottom,
              left: x.left,
              right: x.right,
              height: x.height,
            };
          };
          return {
            overflow: document.documentElement.scrollWidth > innerWidth,
            gallery: b(g),
            info: b(i),
            rail: b(r),
            galleryRatio: getComputedStyle(g).aspectRatio,
          };
        });
        assert.equal(
          geometry.overflow,
          false,
          JSON.stringify({ width, theme, geometry }),
        );
        if (width >= 1280) {
          assert.ok(geometry.gallery.height <= 610, JSON.stringify(geometry));
          assert.ok(Math.abs(geometry.gallery.top - geometry.info.top) < 2);
        } else if (width <= 1100) {
          assert.ok(geometry.info.top >= geometry.gallery.bottom - 2);
        }
        assert.ok(
          geometry.rail.top >=
            Math.max(geometry.gallery.bottom, geometry.info.bottom) - 2,
        );
        reports.push({ locale, width, theme, ...geometry });
        if (theme === "dark" && (width === 1920 || width === 390)) {
          await page.screenshot({
            path: `${output}/${locale}-${width}-top.png`,
          });
          await rail.scrollIntoViewIfNeeded();
          await page.screenshot({
            path: `${output}/${locale}-${width}-rail.png`,
          });
        }
      }
    await page.setViewportSize({ width: 390, height: 844 });
    await rail.scrollIntoViewIfNeeded();
    const next = rail.getByRole("button", {
      name: locale === "he" ? "מוצרים הבאים" : "Next products",
      exact: true,
    });
    const previous = rail.getByRole("button", {
      name: locale === "he" ? "מוצרים קודמים" : "Previous products",
      exact: true,
    });
    const id = await next.getAttribute("aria-controls");
    const read = () =>
      page.evaluate(
        (id) => Math.abs(document.getElementById(id).scrollLeft),
        id,
      );
    await expect(next).toBeEnabled();
    await next.click();
    await expect.poll(read).toBeGreaterThan(30);
    await previous.click();
    await expect.poll(read).toBeLessThan(2);
    const axe = await new AxeBuilder({ page })
      .include("[data-related-products]")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      axe.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      [],
    );
    // Verify gradual controls and automatic movement respect the actual shared settings.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(
      (s) =>
        window.dispatchEvent(
          new CustomEvent("miro-animation-settings-change", {
            detail: { ...s, enabled: true },
          }),
        ),
      settings,
    );
    await next.click();
    await page.waitForTimeout(150);
    const intermediate = await read();
    assert.ok(
      intermediate > 0 && intermediate < 200,
      `step must be gradual: ${intermediate}`,
    );
    await page.waitForTimeout(1000);
    assert.ok((await read()) > intermediate);
    await previous.click();
    await page.waitForTimeout(150);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(50);
    const reducedOffset = await read();
    await page.waitForTimeout(200);
    assert.ok(
      Math.abs((await read()) - reducedOffset) < 2,
      "Reduced motion must cancel a running step",
    );
    await previous.click();
    await expect.poll(read).toBeLessThan(2);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const play = rail.getByRole("button", {
      name: locale === "he" ? "הפעלת תנועת המוצרים" : "Play related products",
      exact: true,
    });
    if (await play.isVisible()) await play.click();
    await page.mouse.move(0, 0);
    await expect.poll(read).toBeGreaterThan(4);
    const samples = await rail.locator("ul").evaluate(
      (node) =>
        new Promise((resolve) => {
          const frames = [];
          const sample = () => {
            frames.push(node.getBoundingClientRect().left);
            if (frames.length < 45) requestAnimationFrame(sample);
            else resolve(frames);
          };
          requestAnimationFrame(sample);
        }),
    );
    const deltas = samples
      .slice(1)
      .map((value, index) => Math.abs(value - samples[index]));
    assert.ok(
      deltas.filter((value) => value > 0.03).length > deltas.length * 0.8,
      "Slow travel must move between frames instead of whole-pixel jumps",
    );
    assert.ok(Math.max(...deltas) < 2, "Slow travel must not jump or shake");
    motionReports.push({
      locale,
      frames: samples.length,
      movingFrames: deltas.filter((value) => value > 0.03).length,
      minDelta: Math.min(...deltas),
      maxDelta: Math.max(...deltas),
    });
    const card = rail.locator(".sf-moving-rail-card").first();
    // Native pointer movement avoids locator auto-scrolling a partially visible card.
    const hoverCard = async () => {
      const box = await card.boundingBox();
      const viewportBox = await rail.locator("ul").evaluate((node) => {
        const r = node.parentElement.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top };
      });
      const left = Math.max(box.x, viewportBox.left);
      const right = Math.min(box.x + box.width, viewportBox.right);
      await page.mouse.move(
        (left + right) / 2,
        Math.min(800, Math.max(box.y + 40, viewportBox.top + 20)),
      );
    };
    for (let cycle = 0; cycle < 2; cycle++) {
      await hoverCard();
      await page.waitForTimeout(80);
      const hovered = await read();
      await page.waitForTimeout(250);
      assert.ok(
        Math.abs((await read()) - hovered) < 2,
        "Hover must pause the rail",
      );
      await page.mouse.move(0, 0);
      await expect.poll(read).toBeGreaterThan(hovered + 3);
    }
    await hoverCard();
    await page.mouse.wheel(0, 8);
    await page.mouse.move(0, 0);
    const wheeled = await read();
    await expect.poll(read).toBeGreaterThan(wheeled + 3);
    await hoverCard();
    await rail
      .locator(".sf-moving-rail-card-shell")
      .first()
      .locator(".sf-moving-rail-actions .sf-moving-rail-preview-button")
      .click();
    const popup = page.locator('.sf-hover-preview[data-state="open"]');
    await expect(popup).toBeVisible();
    const previewStopped = await read();
    await page.waitForTimeout(200);
    assert.ok(
      Math.abs((await read()) - previewStopped) < 2,
      "Open previews must pause the rail",
    );
    await popup.locator(".sf-hover-preview-close").click();
    await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
    await page.mouse.move(0, 0);
    await expect.poll(read).toBeGreaterThan(previewStopped + 3);
    await rail
      .getByRole("button", {
        name:
          locale === "he" ? "עצירת תנועת המוצרים" : "Pause related products",
        exact: true,
      })
      .click();
    const stopped = await read();
    await page.waitForTimeout(200);
    assert.ok(Math.abs((await read()) - stopped) < 2);
    await hoverCard();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(750);
    assert.ok(
      Math.abs((await read()) - stopped) < 2,
      "Explicit Pause must survive hover exit",
    );
    await play.click();
    await page.mouse.move(0, 0);
    await expect.poll(read).toBeGreaterThan(stopped + 3);
    await page.emulateMedia({ reducedMotion: "reduce" });
  }
  assert.deepEqual(errors, []);
  console.log(
    `PASS ${reports.length} responsive layouts, bilingual navigation, slow steps, reduced motion, scoped axe`,
  );
} finally {
  await browser.close();
  await writeFile(
    `${output}/report.json`,
    JSON.stringify({ layouts: reports, motion: motionReports }, null, 2),
  );
}
