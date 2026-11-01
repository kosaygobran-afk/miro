import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ reducedMotion: "reduce" });
for (const locale of ["he", "en"] as const) {
  for (const width of [320, 390, 768, 1440]) {
    test(`${locale} ${width}: vector identity is readable, contained and never mirrored`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.route("**/api/track", (route) =>
        route.fulfill({ status: 204 }),
      );
      await page.goto(`/${locale}`);
      await expect(page.locator("html")).toHaveAttribute(
        "data-motion-ready",
        "true",
      );
      await page.evaluate(() => document.fonts.ready);
      for (const theme of ["dark", "medium", "light"]) {
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        const logos = page.locator('svg[data-brand="miro-group"]');
        expect(await logos.count()).toBeGreaterThanOrEqual(2);
        for (const logo of await logos.all()) {
          await expect(logo.locator("text, image, foreignObject")).toHaveCount(
            0,
          );
          await expect(logo.locator("[data-brand-accent]")).toHaveCount(2);
          await expect(logo.locator('[data-brand-accent="י"]')).toHaveAttribute(
            "fill",
            "#e5b526",
          );
          await expect(logo.locator('[data-brand-accent="."]')).toHaveAttribute(
            "fill",
            "#e5b526",
          );
          if (await logo.isVisible()) {
            await expect(logo).toHaveCSS("transform", "none");
            const box = await logo.boundingBox();
            expect(box!.x).toBeGreaterThanOrEqual(-1);
            expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
          }
        }
        if (width < 1200) {
          const menu = page.locator(".premium-mobile-toggle");
          await expect(menu).toBeInViewport();
        }
        // Measure visible ink rather than only the SVG's padded CSS box.
        const verticalOffset = await page
          .locator(".premium-logo-link")
          .evaluate((link) => {
            const logo = Array.from(link.querySelectorAll("svg")).find((svg) =>
              svg.checkVisibility(),
            )!;
            const ink = logo.getBBox();
            const matrix = logo.getScreenCTM()!;
            const inkCenter = new DOMPoint(
              ink.x + ink.width / 2,
              ink.y + ink.height / 2,
            ).matrixTransform(matrix);
            const header = link
              .closest(".premium-header-inner")!
              .getBoundingClientRect();
            return Math.abs(inkCenter.y - (header.top + header.height / 2));
          });
        expect(verticalOffset, "visible logo centered in navbar").toBeLessThan(
          1,
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        const axe = await new AxeBuilder({ page })
          .include(".premium-header")
          .include(".sf-hero")
          .include(".premium-footer")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        expect(axe.violations).toEqual([]);
      }
      // Public logo exports are real outlines with no fonts or embedded bitmap.
      const svg = await (
        await page.request.get("/images/brand/miro-group.svg")
      ).text();
      expect(svg).toContain("מירו גרופ.");
      expect(svg).not.toMatch(
        /<text|<image|<foreignObject|data:image|font-family/,
      );
    });
  }
}
