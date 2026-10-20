import { expect, test } from "@playwright/test";
import { DEFAULT_ANIMATION_SETTINGS } from "../src/lib/animation-settings";

for (const locale of ["en", "he"] as const) {
  for (const width of [1440, 390, 320]) {
    test(`${locale}: smaller popup and real identifiers at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.route("**/api/track", (route) =>
        route.fulfill({ status: 204 }),
      );
      await page.goto(`/${locale}`);
      await expect(page.locator("html")).toHaveAttribute(
        "data-motion-ready",
        "true",
      );
      await page.evaluate(
        (detail) => {
          window.dispatchEvent(
            new CustomEvent("miro-animation-settings-change", { detail }),
          );
        },
        {
          ...DEFAULT_ANIMATION_SETTINGS,
          appearanceVersion: "2",
          enabled: false,
        },
      );

      const cards = page.locator(".sf-product-card");
      await expect(cards.first()).toBeVisible();
      const grid = page
        .locator(".sf-catalog-grid, .sf-product-grid")
        .filter({ has: cards.first() });
      expect(
        await grid.evaluate((node) => getComputedStyle(node).display),
      ).toBe("grid");
      const staticWidth = (await cards.first().boundingBox())!.width;
      // The native cards retain their responsive width, rather than the abandoned 248px frame.
      expect(staticWidth).toBeGreaterThan(250);
      const rail = page
        .locator(
          '.sf-moving-rail-segment:not([aria-hidden="true"]) .sf-moving-rail-card-shell',
        )
        .first();
      if (await rail.count()) {
        expect((await rail.boundingBox())!.width).toBeLessThanOrEqual(232.1);
      }

      for (const theme of ["dark", "medium", "light"]) {
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        for (let index = 0; index < Math.min(3, await cards.count()); index++) {
          const card = cards.nth(index);
          const expectedCodes = await card
            .locator("[data-product-identifier]")
            .evaluateAll((nodes) =>
              nodes.map((node) => ({
                kind: node.getAttribute("data-product-identifier"),
                value: node.querySelector("dd")!.textContent!.trim(),
              })),
            );
          const trigger = card.locator(".sf-product-quick-preview");
          await trigger.click();
          const popup = page.locator('.sf-hover-preview[data-state="open"]');
          await expect(popup).toBeVisible();
          const inner = popup.locator(".sf-hover-preview-inner");
          const box = (await popup.boundingBox())!;
          expect(box.width).toBeCloseTo(Math.min(416, width - 32), 0);
          // 592px = the 37rem inner cap shared with product-hover-preview.tsx
          expect((await inner.boundingBox())!.height).toBeCloseTo(592, 0);
          expect(box.x).toBeGreaterThanOrEqual(15);
          expect(box.x + box.width).toBeLessThanOrEqual(width - 15);
          expect(box.y).toBeGreaterThanOrEqual(15);
          expect(box.y + box.height).toBeLessThanOrEqual(885);
          for (const { kind, value } of expectedCodes) {
            const number = popup.locator(
              `[data-product-identifier="${kind}"] dd`,
            );
            await expect(number).toHaveText(value);
            const style = await number.evaluate((node) => {
              const css = getComputedStyle(node);
              return {
                weight: Number(css.fontWeight),
                size: Number.parseFloat(css.fontSize),
              };
            });
            // The unified 2026-10-18 card typography renders identifier values
            // at 0.74rem/650; the former 17px/700 emphasis no longer applies.
            expect(style.weight).toBeGreaterThanOrEqual(620);
            expect(style.size).toBeGreaterThanOrEqual(11);
          }
          const before = await inner.boundingBox();
          await popup
            .locator(".sf-hover-preview-description")
            .evaluate((node) => {
              node.textContent =
                "Long product specification used only inside this browser test. ".repeat(
                  100,
                );
            });
          const details = popup.locator(".sf-hover-preview-details");
          await details.focus();
          await details.press("End");
          await expect
            .poll(() => details.evaluate((node) => node.scrollTop))
            .toBeGreaterThan(0);
          expect((await inner.boundingBox())!.height).toBeCloseTo(
            before!.height,
            0,
          );
          const footer = (await popup
            .locator(".sf-hover-preview-footer")
            .boundingBox())!;
          expect(footer.y + footer.height).toBeLessThanOrEqual(
            box.y + box.height + 1,
          );
          await popup.locator(".sf-hover-preview-close").click();
          await expect(popup).toHaveCount(0);
          await expect(trigger).toBeFocused();
        }
      }
      expect((await cards.first().boundingBox())!.width).toBeCloseTo(
        staticWidth,
        1,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    });
  }
}
