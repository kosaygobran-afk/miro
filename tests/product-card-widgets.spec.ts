import { expect, test } from "@playwright/test";
import { DEFAULT_ANIMATION_SETTINGS } from "../src/lib/animation-settings";

for (const locale of ["en", "he"] as const) {
  for (const width of [320, 390, 1440]) {
    test(`${locale}: card widgets and gallery fit at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 320 ? 480 : 900 });
      await page.route("**/api/track", (route) =>
        route.fulfill({ status: 204 }),
      );
      await page.goto(`/${locale}${process.env.PRODUCT_WIDGETS_PATH || ""}`);
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
        { ...DEFAULT_ANIMATION_SETTINGS, enabled: false },
      );
      for (const theme of ["dark", "medium", "light"]) {
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        const card = page.locator(".sf-product-card").first();
        await card.locator(".sf-product-quick-preview").click();
        const preview = page.locator(".sf-hover-preview");
        await expect(preview.locator(".sf-hover-preview-close")).toBeFocused();
        const fit = await preview.evaluate((element) => {
          const frame = element.getBoundingClientRect();
          const media = element
            .querySelector(".sf-hover-preview-media")!
            .getBoundingClientRect();
          const strip = element
            .querySelector(".sf-hover-preview-thumbnails")
            ?.getBoundingClientRect();
          const details = element.querySelector(".sf-hover-preview-details")!;
          return {
            bounded:
              frame.left >= 15 &&
              frame.right <= innerWidth - 15 &&
              frame.top >= 15 &&
              frame.bottom <= innerHeight - 15,
            separate:
              !strip ||
              strip.right <= media.left ||
              strip.left >= media.right ||
              strip.top >= media.bottom,
            detailsReachable:
              details.clientHeight > 40 &&
              getComputedStyle(details).overflowY === "auto",
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        expect(fit).toEqual({
          bounded: true,
          separate: true,
          detailsReachable: true,
          overflow: false,
        });
        const thumbnails = preview.locator(".sf-hover-preview-thumbnail");
        const count = await thumbnails.count();
        const mainImage = preview.locator(
          ".sf-hover-preview-media .sf-product-image-fit > img",
        );
        await expect(mainImage).toHaveAttribute("data-image-ready", "true");
        const imageBox = (await mainImage.boundingBox())!;
        expect(imageBox.width).toBeGreaterThan(40);
        expect(imageBox.height).toBeGreaterThan(40);
        if (process.env.PRODUCT_WIDGETS_PATH) expect(count).toBeGreaterThan(1);
        if (count > 1) {
          await expect(thumbnails.first()).toHaveAttribute(
            "aria-current",
            "true",
          );
          const next = preview.locator(".sf-hover-preview-arrow-next");
          expect((await next.boundingBox())!.width).toBeGreaterThanOrEqual(44);
          const counterBox = (await preview
            .locator(".sf-hover-preview-count")
            .boundingBox())!;
          const nextBox = (await next.boundingBox())!;
          expect(
            counterBox.x + counterBox.width <= nextBox.x ||
              nextBox.x + nextBox.width <= counterBox.x,
          ).toBe(true);
          await next.click();
          await expect(thumbnails.nth(1)).toHaveAttribute(
            "aria-current",
            "true",
          );
          await next.focus();
          await page.keyboard.press(
            locale === "he" ? "ArrowLeft" : "ArrowRight",
          );
          await expect(thumbnails.nth(2 % count)).toHaveAttribute(
            "aria-current",
            "true",
          );
          await page.keyboard.press("End");
          await expect(thumbnails.last()).toHaveAttribute(
            "aria-current",
            "true",
          );
          await expect(thumbnails.last()).toBeInViewport();
          await thumbnails.first().click();
          await expect(thumbnails.first()).toHaveAttribute(
            "aria-current",
            "true",
          );
          await preview.locator(".sf-hover-preview-arrow-previous").click();
          await expect(thumbnails.last()).toHaveAttribute(
            "aria-current",
            "true",
          );
        } else {
          test.info().annotations.push({
            type: "catalog",
            description:
              "Current sampled product has one image; use PRODUCT_WIDGETS_PATH with a disposable multi-image fixture to exercise gallery navigation.",
          });
        }
        if (process.env.PRODUCT_WIDGETS_SCREENSHOTS) {
          await page.screenshot({
            path: `${process.env.PRODUCT_WIDGETS_SCREENSHOTS}/${locale}-${width}-${theme}.png`,
          });
        }
        await page.keyboard.press("Escape");
        await expect(preview).toHaveCount(0);
        await expect(card.locator(".sf-product-quick-preview")).toBeFocused();
      }
    });
  }
}
