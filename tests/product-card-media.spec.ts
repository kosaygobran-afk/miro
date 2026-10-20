import { expect, test } from "@playwright/test";
import sharp from "sharp";

// A computed radius can pass while visible bitmap pixels remain square.
// Use an opaque browser-only image and inspect the actual painted corners.
for (const width of [1440, 390, 320]) {
  test(`card bitmap stays rounded at rest and after preview at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/track", (route) => route.fulfill({ status: 204 }));
    let png: Buffer;
    for (const pattern of [
      "**/_next/image?*",
      "**/storage/v1/object/public/product-media/**",
    ])
      await page.route(pattern, (route) =>
        route.fulfill({ contentType: "image/png", body: png }),
      );
    const card = page.locator(".sf-product-card").first();
    const image = card.locator("img").first();
    for (const [imageWidth, imageHeight] of [
      [256, 256],
      [320, 180],
      [180, 320],
    ]) {
      png = await sharp({
        create: {
          width: imageWidth,
          height: imageHeight,
          channels: 3,
          background: "#ffffff",
        },
      })
        .png()
        .toBuffer();
      await page.goto("/en");
      await expect(card).toBeVisible();
      await page.evaluate(() => {
        document.documentElement.dataset.appearanceVersion = "2";
        document.documentElement.dataset.theme = "dark";
      });
      await page.addStyleTag({
        content:
          ".sf-product-media > :not(.sf-product-image-fit) { visibility: hidden; }",
      });
      await card.scrollIntoViewIfNeeded();
      await expect(image).toBeVisible();
      await expect
        .poll(() =>
          image.evaluate((e) => {
            const image = e as HTMLImageElement;
            return image.complete && image.naturalWidth > 0;
          }),
        )
        .toBe(true);
      await expect(image).toHaveAttribute("data-image-ready", "true");
      // Responsive srcset density adjusts naturalWidth; the aspect ratio stays
      // invariant and the screenshot below verifies the supplied opaque pixels.
      expect(
        await image.evaluate((e) => {
          const r = e.getBoundingClientRect();
          return r.width / r.height;
        }),
      ).toBeCloseTo(imageWidth / imageHeight, 1);
      await card.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      const assertPaintedCorners = async () => {
        const { data, info } = await sharp(await image.screenshot())
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const rgb = (x: number, y: number) =>
          Array.from(
            data.subarray(
              (y * info.width + x) * 3,
              (y * info.width + x) * 3 + 3,
            ),
          );
        expect(
          rgb(Math.floor(info.width / 2), Math.floor(info.height / 2)),
        ).toEqual([255, 255, 255]);
        for (const [x, y] of [
          [1, 1],
          [info.width - 2, 1],
          [1, info.height - 2],
          [info.width - 2, info.height - 2],
        ])
          expect(
            rgb(x, y).some((channel) => channel < 240),
            "opaque square corner must reveal the card surface",
          ).toBe(true);
      };
      await assertPaintedCorners();
      await card.locator(".sf-product-quick-preview").click();
      await expect(page.locator(".sf-hover-preview")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
      await page.mouse.move(0, 0);
      await assertPaintedCorners();
    }
    await page.evaluate(
      () => (document.documentElement.dataset.appearanceVersion = "1"),
    );
    await expect(image).toHaveCSS("clip-path", "none");
  });
}
