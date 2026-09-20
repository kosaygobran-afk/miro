import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const baseURL = process.env.DESIGN_BASE_URL || "http://localhost:3000";
const output = "/tmp/miro-design-review";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const errors = [];
try {
  for (const width of [360, 768, 1440]) {
    for (const locale of ["he", "en"]) {
      for (const theme of ["dark", "light"]) {
        const context = await browser.newContext({
          viewport: { width, height: 960 },
        });
        const page = await context.newPage();
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });
        await page.goto(`${baseURL}/${locale}`);
        await page.evaluate((value) => {
          localStorage.setItem("miro-theme", value);
          document.documentElement.dataset.theme = value;
        }, theme);
        await page.reload();
        await page.evaluate(() => document.fonts.ready);
        await page.locator(".miro-hero-copy").evaluate(async (element) => {
          await Promise.all(
            element.getAnimations().map((animation) => animation.finished),
          );
        });
        assert.equal(
          await page.locator("html").getAttribute("dir"),
          locale === "he" ? "rtl" : "ltr",
        );
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        assert(
          await page
            .locator(".miro-hero-image")
            .evaluate((image) => image.complete && image.naturalWidth > 0),
        );
        const axe = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa"])
          .analyze();
        console.log(
          JSON.stringify({
            width,
            locale,
            theme,
            violations: axe.violations.map((v) => ({
              id: v.id,
              targets: v.nodes.map((n) => n.target),
            })),
          }),
        );
        assert.equal(axe.violations.length, 0);
        await page.screenshot({
          path: `${output}/${width}-${locale}-${theme}.png`,
          fullPage: true,
        });
        await page
          .locator("button")
          .filter({ has: page.locator(".theme-icon-sun") })
          .click();
        const next = theme === "dark" ? "light" : "dark";
        assert.equal(
          await page.locator("html").getAttribute("data-theme"),
          next,
        );
        await page.reload();
        assert.equal(
          await page.locator("html").getAttribute("data-theme"),
          next,
        );
        await page.keyboard.press("Tab");
        assert(
          await page.evaluate(() => document.activeElement !== document.body),
        );
        if (width < 1024) {
          await page
            .locator('button[aria-controls="mobile-navigation"]')
            .click();
          assert(await page.locator("#mobile-navigation").isVisible());
          await page.keyboard.press("Escape");
          assert.equal(await page.locator("#mobile-navigation").count(), 0);
        }
        await page.emulateMedia({ reducedMotion: "reduce" });
        assert(
          parseFloat(
            await page
              .locator(".miro-hero-copy")
              .evaluate((e) => getComputedStyle(e).animationDuration),
          ) < 0.001,
        );
        await context.close();
      }
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    `PASS: 12 viewport/language/theme combinations; screenshots: ${output}`,
  );
} finally {
  await browser.close();
}
