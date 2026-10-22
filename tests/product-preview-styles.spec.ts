import { expect, test, type Page } from "@playwright/test";
import {
  DEFAULT_ANIMATION_SETTINGS,
  type AnimationSettings,
} from "../src/lib/animation-settings";
import { PRODUCT_PREVIEW_HOVER_ENABLED } from "../src/features/catalog/product-preview-triggers";

async function configure(
  page: Page,
  style: AnimationSettings["productPreviewStyle"],
  enabled = true,
) {
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
    { ...DEFAULT_ANIMATION_SETTINGS, productPreviewStyle: style, enabled },
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-product-preview-style",
    style,
  );
}

for (const locale of ["en", "he"]) {
  for (const style of [
    "soft-reveal",
    "3d-pop-up",
    "3d-pop-up-smooth",
  ] as const) {
    test(`${locale}: ${style} preview, image fit, keyboard recovery and reduced motion`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 850 });
      await page.goto(`/${locale}`);
      await configure(page, style);
      const trigger = page.locator(".sf-product-quick-preview").first();
      await trigger.click();
      const preview = page.locator(".sf-hover-preview");
      await expect(preview).toBeVisible();
      const motion = await preview.evaluate((element) => {
        const animation = element.getAnimations()[0];
        return {
          name: getComputedStyle(element).animationName,
          frames:
            animation?.effect instanceof KeyframeEffect
              ? animation.effect.getKeyframes()
              : [],
        };
      });
      await expect(preview).toHaveCSS(
        "animation-duration",
        style === "soft-reveal"
          ? "0.3s"
          : style === "3d-pop-up-smooth"
            ? "0.32s"
            : "0.2s",
      );
      expect(motion.name).toBe(
        style === "soft-reveal"
          ? "sf-preview-soft-enter"
          : style === "3d-pop-up-smooth"
            ? "sf-preview-3d-smooth-enter"
            : "sf-preview-enter",
      );
      if (style === "soft-reveal") {
        expect(motion.frames[0]?.transform).toBe(
          "translateY(8px) scale(0.975)",
        );
      }
      const image = preview.locator(
        ".sf-hover-preview-media .sf-product-image-fit > img",
      );
      await expect(image).toHaveAttribute("data-image-ready", "true");
      const fit = await image.evaluate((element: HTMLImageElement) => {
        const box = element.getBoundingClientRect();
        const frame = element.parentElement!.getBoundingClientRect();
        return {
          ratio: box.width / box.height,
          natural: element.naturalWidth / element.naturalHeight,
          bounded:
            box.width <= frame.width + 1 && box.height <= frame.height + 1,
          radius: parseFloat(getComputedStyle(element).borderRadius),
        };
      });
      expect(fit.ratio).toBeCloseTo(fit.natural, 1);
      expect(fit.bounded).toBe(true);
      expect(fit.radius).toBeGreaterThan(0);
      await expect(preview.locator(".sf-hover-preview-close")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(preview).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await trigger.click();
      await expect(preview).toBeVisible();
      await expect(preview).toHaveCSS("animation-name", "none");
      await page.keyboard.press("Escape");
      await expect(preview).toHaveCount(0);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await configure(page, style, false);
      await trigger.click();
      await expect(preview).toBeVisible();
      await expect(preview).toHaveCSS("animation-name", "none");
    });
  }
}

for (const style of ["soft-reveal", "3d-pop-up-smooth"] as const) {
  test(`${style}: hovering the bottom action edge never starts preview intent`, async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Touch uses the explicit preview control");
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto("/en");
    await configure(page, style);
    const card = page.locator(".sf-product-card").first();
    await card.scrollIntoViewIfNeeded();
    const box = (await card.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 0.5);
    await page.waitForTimeout(400);
    await expect(card).not.toHaveAttribute("data-preview-intent", "true");
    await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
  });
}

test("hover after an explicit close keeps focus on the source and Escape stays closed", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Desktop hover requires a fine pointer");
  test.skip(
    !PRODUCT_PREVIEW_HOVER_ENABLED,
    "Hover-to-preview is temporarily disabled",
  );
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto("/en");
  await configure(page, "3d-pop-up-smooth");
  const card = page.locator(".sf-product-card").first();
  const trigger = card.locator(".sf-product-quick-preview");
  await trigger.click();
  const preview = page.locator(".sf-hover-preview");
  await expect(preview.locator(".sf-hover-preview-close")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.mouse.move(0, 0);
  await card.locator(".sf-product-body h3").hover();
  await expect(preview).toBeVisible();
  await expect(preview.locator(".sf-hover-preview-close")).not.toBeFocused();
  await preview.locator(".sf-hover-preview-title").hover();
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("rail portal focus preserves explicit dismissal and source focus recovery", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto("/en");
  await configure(page, "3d-pop-up-smooth");
  const trigger = page.locator(".sf-moving-rail-preview-button").first();
  await trigger.click();
  const preview = page.locator(".sf-hover-preview");
  await expect(preview.locator(".sf-hover-preview-close")).toBeFocused();
  await preview.getByRole("region").focus();
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("soft preview stays inside a 320px phone and every theme", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/he");
  await configure(page, "soft-reveal");
  for (const theme of ["dark", "medium", "light"]) {
    await page.evaluate(
      (value) => (document.documentElement.dataset.theme = value),
      theme,
    );
    await page.locator(".sf-product-quick-preview").first().click();
    const preview = page.locator(".sf-hover-preview");
    await expect(preview).toBeVisible();
    await expect(preview.locator(".sf-hover-preview-close")).toBeFocused();
    const box = await preview.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(15);
    expect(box!.x + box!.width).toBeLessThanOrEqual(305);
    await page.keyboard.press("Escape");
    await expect(preview).toHaveCount(0);
  }
});

test("desktop hover opens Soft Reveal without pressing the source card down", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Hover applies only to fine-pointer desktop profiles");
  test.skip(
    !PRODUCT_PREVIEW_HOVER_ENABLED,
    "Hover-to-preview is temporarily disabled",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/en");
  await configure(page, "soft-reveal");
  const card = page.locator(".sf-product-card").first();
  await card.locator(".sf-product-media").hover();
  await expect(page.locator(".sf-hover-preview")).toBeVisible();
  await expect(card.locator('[data-preview-source="true"]')).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 0, -2)",
  );
  await expect(card).toHaveCSS("transform", "none");
  await expect(page.locator(".sf-hover-preview")).toHaveCSS(
    "animation-name",
    "sf-preview-soft-enter",
  );
});

for (const locale of ["he", "en"]) {
  test(`${locale}: different products and long details keep the same balanced frame`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 850 });
    await page.goto(`/${locale}`);
    await configure(page, "soft-reveal");
    const measurements = [];
    for (let index = 0; index < 3; index++) {
      await page.locator(".sf-product-quick-preview").nth(index).click();
      const preview = page.locator(".sf-hover-preview");
      await expect(preview.locator(".sf-hover-preview-close")).toBeFocused();
      measurements.push(
        await preview.evaluate((element) => {
          const panel = element.querySelector<HTMLElement>(
            ".sf-hover-preview-inner",
          )!;
          const gallery = element.querySelector<HTMLElement>(
            ".sf-hover-preview-media",
          )!;
          const footer = element.querySelector<HTMLElement>(
            ".sf-hover-preview-footer",
          )!;
          return {
            width: panel.offsetWidth,
            height: panel.offsetHeight,
            imageWidth: gallery.offsetWidth,
            imageHeight: gallery.offsetHeight,
            footerHeight: footer.offsetHeight,
          };
        }),
      );
      await page.keyboard.press("Escape");
      await expect(preview).toHaveCount(0);
    }
    expect(measurements[1]).toEqual(measurements[0]);
    expect(measurements[2]).toEqual(measurements[0]);
    await page.setViewportSize({ width: 320, height: 480 });
    await page.locator(".sf-product-quick-preview").first().click();
    const preview = page.locator(".sf-hover-preview");
    await expect(preview.locator(".sf-hover-preview-close")).toBeFocused();
    // Adversarial display-only copy fixture; never writes to the catalog.
    await preview
      .locator(".sf-hover-preview-description")
      .evaluate((element) => {
        element.textContent =
          "Long product specifications and compatibility details. ".repeat(100);
      });
    const details = preview.getByRole("region");
    await details.focus();
    await details.press("End");
    await expect
      .poll(() => details.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    const bounds = await preview.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(15);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(465);
    const action = preview.locator(".sf-hover-preview-link");
    await expect(action).toBeInViewport();
    expect(
      await action.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        );
        return hit !== null && element.contains(hit);
      }),
    ).toBe(true);
  });
}

for (const target of [".sf-product-body h3", ".sf-product-price"]) {
  test(`smooth 3D eye preview keeps ${target} hover styling and source growth`, async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Touch uses the explicit preview control");
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto("/en");
    await configure(page, "3d-pop-up-smooth");
    const card = page.locator(".sf-product-card").first();
    await card.locator(target).hover();
    await expect(card.locator('[data-preview-source="true"]')).toHaveCSS(
      "transform",
      "matrix(1, 0, 0, 1, 0, -3)",
    );
    await card.locator(".sf-product-quick-preview").click();
    const preview = page.locator(".sf-hover-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toHaveCSS(
      "animation-name",
      "sf-preview-3d-smooth-enter",
    );
    await expect(card).toHaveCSS("transform", "none");
    const image = card.locator(".sf-product-visual");
    await expect(image).toHaveCSS("transform", "none");
    const growth = await preview.evaluate((element) => {
      const animation = element.getAnimations()[0];
      const duration = Number(animation.effect!.getTiming().duration);
      animation.pause();
      animation.currentTime = 0;
      const start = element.getBoundingClientRect();
      const startOpacity = getComputedStyle(element).opacity;
      animation.currentTime = duration / 2;
      const middle = element.getBoundingClientRect();
      animation.currentTime = duration;
      const end = element.getBoundingClientRect();
      const frames = (animation.effect as KeyframeEffect).getKeyframes();
      const source = document
        .querySelector(".sf-product-card")!
        .getBoundingClientRect();
      const transform = new DOMMatrix(String(frames[0].transform));
      return {
        startWidth: start.width,
        sourceWidth: source.width,
        startTop: start.top,
        sourceTop: source.top,
        startCenter: start.left + start.width / 2,
        sourceCenter: source.left + source.width / 2,
        middleWidth: middle.width,
        endWidth: end.width,
        scaleX: transform.a,
        scaleY: transform.d,
        duration,
        startOpacity,
      };
    });
    expect(growth.duration).toBe(320);
    expect(growth.startOpacity).toBe("1");
    expect(growth.scaleX).toBeCloseTo(growth.scaleY, 5);
    expect(Math.abs(growth.startWidth - growth.sourceWidth)).toBeLessThan(2);
    expect(Math.abs(growth.startCenter - growth.sourceCenter)).toBeLessThan(2);
    expect(Math.abs(growth.startTop - growth.sourceTop)).toBeLessThan(2);
    expect(growth.middleWidth).toBeGreaterThan(growth.startWidth + 20);
    expect(growth.middleWidth).toBeLessThan(growth.endWidth - 5);
  });
}
