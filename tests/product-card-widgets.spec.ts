import { expect, test } from "@playwright/test";
import { DEFAULT_ANIMATION_SETTINGS } from "../src/lib/animation-settings";

for (const locale of ["en", "he"] as const) {
  for (const width of [320, 360, 380, 390, 655, 1024, 1440]) {
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
        { timeout: 15000 },
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
          const geometry = await preview.evaluate((element) => {
            const media = element.querySelector(".sf-hover-preview-media")!;
            const image = media
              .querySelector(".sf-product-image-fit, .sf-product-visual")!
              .getBoundingClientRect();
            const arrows = Array.from(
              media.querySelectorAll(".sf-hover-preview-arrow"),
              (node) => node.getBoundingClientRect(),
            );
            const counter = media
              .querySelector(".sf-hover-preview-count")!
              .getBoundingClientRect();
            const gallery = element
              .querySelector(".sf-hover-preview-gallery")!
              .getBoundingClientRect();
            const close = element
              .querySelector(".sf-hover-preview-close")!
              .getBoundingClientRect();
            const picker = element.querySelector<HTMLElement>(
              ".sf-hover-preview-thumbnails",
            )!;
            return {
              centered: arrows.every(
                (box) =>
                  Math.abs(
                    box.top + box.height / 2 - image.top - image.height / 2,
                  ) < 1,
              ),
              separate: arrows.every(
                (box) =>
                  box.right <= image.left + 1 || box.left >= image.right - 1,
              ),
              counterBelow: counter.top >= image.bottom - 1,
              closeSeparate: close.bottom + 4 <= gallery.top,
              pickerFits: Array.from(picker.children).every(
                (child) =>
                  child.getBoundingClientRect().width <= picker.clientWidth + 1,
              ),
            };
          });
          expect(geometry).toEqual({
            centered: true,
            separate: true,
            counterBelow: true,
            closeSeparate: true,
            pickerFits: true,
          });
          const next = preview.locator(".sf-hover-preview-arrow-next");
          expect(
            Math.round((await next.boundingBox())!.width),
          ).toBeGreaterThanOrEqual(44);
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
        await preview.locator(".sf-hover-preview-close").click();
        await expect(preview).toHaveCount(0);
        await expect(card.locator(".sf-product-quick-preview")).toBeFocused();
      }
    });
  }
}

for (const locale of ["en", "he"] as const) {
  test(`${locale}: selected thumbnail survives open-preview resizing without document scrolling`, async ({
    page,
  }) => {
    await page.route("**/api/track", (route) => route.fulfill({ status: 204 }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${locale}${process.env.PRODUCT_WIDGETS_PATH || ""}`);
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
      { ...DEFAULT_ANIMATION_SETTINGS, enabled: false },
    );
    const trigger = page
      .locator(".sf-product-card")
      .first()
      .locator(".sf-product-quick-preview");
    await trigger.focus();
    await page.keyboard.press("Enter");
    const preview = page.locator(".sf-hover-preview");
    await expect(preview.locator(".sf-hover-preview-close")).toBeFocused();
    const thumbs = preview.locator(".sf-hover-preview-thumbnail");
    expect(await thumbs.count()).toBeGreaterThan(1);
    await thumbs.first().focus();
    await page.keyboard.press("End");
    for (const width of [320, 390, 380, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() =>
          preview
            .locator(".sf-hover-preview-thumbnail[data-active]")
            .evaluate((selected) => {
              const strip = selected.parentElement!;
              const rect = strip.getBoundingClientRect();
              const item = selected.getBoundingClientRect();
              const left = rect.left + strip.clientLeft;
              const top = rect.top + strip.clientTop;
              return (
                item.left >= left - 1 &&
                item.right <= left + strip.clientWidth + 1 &&
                item.top >= top - 1 &&
                item.bottom <= top + strip.clientHeight + 1
              );
            }),
        )
        .toBe(true);
      const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
      await page.keyboard.press("Home");
      await page.keyboard.press("End");
      expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(
        scroll,
      );
    }
    await page.keyboard.press("Escape");
    await expect(preview).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}
