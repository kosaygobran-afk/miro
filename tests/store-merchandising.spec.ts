import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Storefront merchandising interactions", () => {
  test("card presses before its in-place 3D expansion, stays in the viewport, and closes", async ({
    page,
  }) => {
    await page.goto("/en/store");
    const card = page.locator(".sf-product-card").first();
    const media = page.locator(".sf-product-media").first();
    await expect(media).toBeVisible();

    await media.hover();
    await expect(card).toHaveAttribute("data-preview-intent", "true");
    await page.waitForTimeout(800);
    await expect(page.locator(".sf-hover-preview")).toHaveCount(0);

    await expect(page.locator(".sf-hover-preview")).toBeVisible({
      timeout: 700,
    });
    const bounds = await page.locator(".sf-hover-preview").boundingBox();
    const mediaBounds = await media.boundingBox();
    const viewport = page.viewportSize();
    expect(bounds).not.toBeNull();
    expect(mediaBounds).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport!.height);
    expect(bounds!.y).toBeLessThan(mediaBounds!.y + mediaBounds!.height);
    expect(bounds!.y + bounds!.height).toBeGreaterThan(mediaBounds!.y);
    expect(bounds!.x).toBeLessThan(mediaBounds!.x + mediaBounds!.width);
    expect(bounds!.x + bounds!.width).toBeGreaterThan(mediaBounds!.x);

    const thumbnails = page.locator(".sf-hover-preview-thumbnail");
    const thumbnailCount = await thumbnails.count();
    if (thumbnailCount > 1) {
      await page.locator(".sf-hover-preview-arrow-next").click();
      await expect(thumbnails.nth(1)).toHaveAttribute("aria-current", "true");
    }

    await page.keyboard.press("Escape");
    await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
  });

  test("configured moving rail uses a stable seamless track and inaccessible clone", async ({
    page,
  }) => {
    await page.goto("/en/store");
    const rail = page.locator(".sf-moving-rail-section");
    if ((await rail.count()) === 0) {
      await expect(page.locator(".sf-product-card").first()).toBeVisible();
      return;
    }
    await expect(rail).toBeVisible();
    const segmentCount = await rail.locator(".sf-moving-rail-segment").count();
    expect(segmentCount).toBeGreaterThanOrEqual(1);
    if (segmentCount === 1) return;
    await expect(
      rail.locator('.sf-moving-rail-segment[aria-hidden="true"]'),
    ).toHaveCount(1);
    await expect(
      rail.locator(
        '.sf-moving-rail-segment[aria-hidden="true"] a[tabindex="-1"]',
      ),
    ).not.toHaveCount(0);
    await expect(
      rail.locator(
        '.sf-moving-rail-segment[aria-hidden="true"] [tabindex="0"]',
      ),
    ).toHaveCount(0);

    const track = rail.locator(".sf-moving-rail-track");
    const before = await track.evaluate(
      (element) => getComputedStyle(element).animationDuration,
    );
    await rail.locator(".sf-moving-rail-toggle").click();
    await expect(rail.locator(".sf-moving-rail-viewport")).toHaveAttribute(
      "data-paused",
      "true",
    );
    const after = await track.evaluate(
      (element) => getComputedStyle(element).animationDuration,
    );
    expect(after).toBe(before);

    const firstRailCard = rail
      .locator('.sf-moving-rail-segment:not([aria-hidden="true"])')
      .locator(".sf-moving-rail-card")
      .first();
    await firstRailCard.hover();
    await expect(firstRailCard.locator("..")).toHaveAttribute(
      "data-preview-intent",
      "true",
    );
    await expect(page.locator(".sf-hover-preview")).toBeVisible({
      timeout: 1_500,
    });
  });

  test("touch-sized layout exposes quick preview without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/he/store");
    const quickPreview = page.locator(".sf-product-quick-preview").first();
    await expect(quickPreview).toBeVisible();
    await quickPreview.click();
    await expect(page.locator(".sf-hover-preview")).toBeVisible();

    const widths = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
  });

  test("product page gallery exposes side thumbnails and circular arrow navigation", async ({
    page,
  }) => {
    const response = await page.goto("/en/store/cameras/miro-4k-pro");
    expect(response?.status()).toBe(200);
    await expect(page.locator(".sf-main-image")).toBeVisible();
    const thumbnails = page.locator(".sf-thumbnail");
    const thumbnailCount = await thumbnails.count();
    if (thumbnailCount < 2) {
      await expect(page.locator(".sf-gallery-arrow-next")).toHaveCount(0);
      return;
    }
    await expect(thumbnails.first()).toHaveAttribute("aria-current", "true");
    await page.locator(".sf-gallery-arrow-next").click();
    await expect(thumbnails.nth(1)).toHaveAttribute("aria-current", "true");
    await page.locator(".sf-gallery-arrow-previous").click();
    await expect(thumbnails.first()).toHaveAttribute("aria-current", "true");
  });

  test("reduced motion renders a static scroll rail", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/en/store");
    if ((await page.locator(".sf-moving-rail-section").count()) === 0) {
      await expect(page.locator(".sf-product-card").first()).toBeVisible();
      return;
    }
    const viewport = page.locator(".sf-moving-rail-viewport");
    await expect(viewport).toHaveAttribute("data-static", "true");
    await expect(page.locator(".sf-moving-rail-segment")).toHaveCount(1);
  });

  test("enhanced storefront has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/en/store");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
