import { expect, test, type Locator } from "@playwright/test";
import { DEFAULT_ANIMATION_SETTINGS } from "../src/lib/animation-settings";

async function expectTextAtReadingEdge(field: Locator, rtl: boolean) {
  const offset = await field.evaluate((node, rtl) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const text = range.getBoundingClientRect();
    const block = node.getBoundingClientRect();
    return rtl ? block.right - text.right : text.left - block.left;
  }, rtl);
  expect(Math.abs(offset)).toBeLessThan(1);
}

for (const locale of ["en", "he"] as const) {
  for (const appearanceVersion of ["1", "2"] as const) {
    test(`${locale}: popup details follow the reading direction in Version ${appearanceVersion}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: appearanceVersion === "2" ? 320 : 1440,
        height: 900,
      });
      await page.route("**/api/track", (route) =>
        route.fulfill({ status: 204 }),
      );
      await page.goto(`/${locale}`);
      const html = page.locator("html");
      await expect(html).toHaveAttribute("data-motion-ready", "true");
      await page.evaluate(
        (detail) => {
          window.dispatchEvent(
            new CustomEvent("miro-animation-settings-change", { detail }),
          );
        },
        { ...DEFAULT_ANIMATION_SETTINGS, appearanceVersion, enabled: false },
      );
      await expect(html).toHaveAttribute(
        "data-appearance-version",
        appearanceVersion,
      );
      const trigger = page
        .locator(".sf-product-card[data-product-price]")
        .first()
        .locator(".sf-product-quick-preview");
      await trigger.click();
      const popup = page.locator('.sf-hover-preview[data-state="open"]');
      const rtl = locale === "he";
      const direction = rtl ? "rtl" : "ltr";
      const textDirection = rtl ? "ltr" : "rtl";
      const fallbackText = rtl ? "Camera A-12" : "מצלמה A-12";
      await expect(popup).toHaveAttribute("dir", direction);

      const specs = popup.locator(".sf-hover-preview-specs > div").first();
      const fields = [
        popup.locator(".sf-hover-preview-title"),
        popup.locator(".sf-hover-preview-description"),
      ];
      if (await specs.count()) fields.push(specs.locator("dt"));

      for (const field of fields) {
        // Simulate catalog content available only in the opposite language.
        await field.evaluate((node, text) => {
          (node.querySelector("bdi") ?? node).textContent = text;
        }, fallbackText);
        await expect(field).toHaveCSS("direction", direction);
        await expect(field.locator("bdi")).toHaveCSS(
          "direction",
          textDirection,
        );
        await expectTextAtReadingEdge(field, rtl);
      }

      if (await specs.count()) {
        const value = specs.locator("dd");
        await expect(value).toHaveCSS("direction", direction);
        await expect(value.locator("bdi")).toHaveAttribute("dir", "auto");
      }

      const vat = popup
        .locator("small")
        .filter({ hasText: rtl ? "ללא מע״מ" : "excl. VAT" });
      await expect(vat).toHaveCSS("direction", direction);
      await expect(vat.locator("bdi")).toHaveCSS("direction", "ltr");
      const code = popup.locator(".product-identifier-value").first();
      if (appearanceVersion === "2" && (await code.count())) {
        await expect(code).toHaveCSS("direction", "ltr");
        await expectTextAtReadingEdge(code, rtl);
      }

      await page.keyboard.press("Escape");
      await expect(popup).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  }

  for (const width of [1440, 390, 320]) {
    test(`${locale}: responsive popup and real identifiers at ${width}px`, async ({
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
        expect((await rail.boundingBox())!.width).toBeLessThanOrEqual(264.1);
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
                value: node
                  .querySelector(".sf-label-copy")!
                  .textContent!.trim(),
              })),
            );
          const trigger = card.locator(".sf-product-quick-preview");
          await trigger.click();
          const popup = page.locator('.sf-hover-preview[data-state="open"]');
          await expect(popup).toBeVisible();
          const inner = popup.locator(".sf-hover-preview-inner");
          if (index === 0) {
            const toolbar = popup.locator(".sf-hover-preview-toolbar");
            const close = toolbar.locator(".sf-hover-preview-close");
            const toolbarBox = (await toolbar.boundingBox())!;
            const closeBox = (await close.boundingBox())!;
            expect(closeBox.y - toolbarBox.y).toBeCloseTo(
              toolbarBox.y + toolbarBox.height - closeBox.y - closeBox.height,
              0,
            );
            const icons = await popup
              .locator(
                ":is(.sf-hover-preview-close, .sf-hover-preview-arrow, .sf-image-magnifier-toggle):visible > svg",
              )
              .evaluateAll((elements) =>
                elements.map((icon) => {
                  const bounds = icon.getBoundingClientRect();
                  return [bounds.width, bounds.height];
                }),
              );
            expect(icons.length).toBeGreaterThan(0);
            for (const [iconWidth, iconHeight] of icons) {
              expect(iconWidth).toBeCloseTo(18, 0);
              expect(iconHeight).toBeCloseTo(18, 0);
            }
          }
          const gallery = (await popup
            .locator(".sf-hover-preview-gallery")
            .boundingBox())!;
          const information = (await popup
            .locator(".sf-preview-information")
            .boundingBox())!;
          if (width >= 900) {
            expect(Math.abs(gallery.y - information.y)).toBeLessThan(2);
            if (locale === "he") {
              expect(information.x + information.width).toBeLessThanOrEqual(
                gallery.x,
              );
            } else {
              expect(gallery.x + gallery.width).toBeLessThanOrEqual(
                information.x,
              );
            }
          } else {
            expect(gallery.y + gallery.height).toBeLessThanOrEqual(
              information.y,
            );
          }
          const box = (await popup.boundingBox())!;
          expect(box.width).toBeCloseTo(
            Math.min(width >= 900 ? 736 : 416, width - 32),
            0,
          );
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
          const brand = popup.locator('[data-product-field="brand"] dd');
          if (await brand.count()) {
            await expect(brand.locator("bdi")).toHaveAttribute("dir", "auto");
            expect(
              await brand.evaluate((node) => getComputedStyle(node).textAlign),
            ).toBe("start");
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
