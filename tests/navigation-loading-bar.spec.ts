import { test, expect } from "@playwright/test";
import { DEFAULT_ANIMATION_SETTINGS } from "../src/lib/animation-settings";

for (const locale of ["en", "he"] as const) {
  for (const path of ["", "/login", "/contact", "/services"]) {
    for (const width of [320, 768, 1440]) {
      test(`${locale}${path}: progress follows header edge at ${width}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.route("**/api/track", (route) =>
          route.fulfill({ status: 204 }),
        );
        await page.goto(`/${locale}${path}`);
        await expect(page.locator("html")).toHaveAttribute(
          "data-motion-ready",
          "true",
          { timeout: 15000 },
        );
        await page.evaluate(
          (detail) =>
            window.dispatchEvent(
              new CustomEvent("miro-animation-settings-change", { detail }),
            ),
          DEFAULT_ANIMATION_SETTINGS,
        );
        for (const theme of ["dark", "medium", "light"]) {
          await page.evaluate((theme) => {
            document.documentElement.dataset.theme = theme;
          }, theme);
          for (const scroll of [0, 15, 150]) {
            await page.evaluate((y) => window.scrollTo(0, y), scroll);
            await expect
              .poll(() =>
                page.evaluate(() =>
                  Math.abs(
                    document
                      .querySelector(".motion-navigation-progress")!
                      .getBoundingClientRect().top -
                      document
                        .querySelector(".premium-header")!
                        .getBoundingClientRect().bottom,
                  ),
                ),
              )
              .toBeLessThan(1);
          }
        }
        if (!path) {
          for (const resized of [320, 390, 768, 1024, 1920]) {
            await page.setViewportSize({ width: resized, height: 800 });
            await expect
              .poll(() =>
                page.evaluate(() =>
                  Math.abs(
                    document
                      .querySelector(".motion-navigation-progress")!
                      .getBoundingClientRect().top -
                      document
                        .querySelector(".premium-header")!
                        .getBoundingClientRect().bottom,
                  ),
                ),
              )
              .toBeLessThan(1);
          }
          await page.evaluate(() => {
            const banner =
              document.querySelector<HTMLElement>(".premium-topbar")!;
            banner.style.minHeight = "120px";
            window.scrollTo(0, 0);
          });
          await expect
            .poll(() =>
              page.evaluate(() =>
                Math.abs(
                  document
                    .querySelector(".motion-navigation-progress")!
                    .getBoundingClientRect().top -
                    document
                      .querySelector(".premium-header")!
                      .getBoundingClientRect().bottom,
                ),
              ),
            )
            .toBeLessThan(1);
        }
      });
    }
  }
}
