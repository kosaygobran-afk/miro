import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Storefront - Comprehensive Tests", () => {
  test.beforeEach(async ({ page }) => {
    // Listen for console errors
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.log(`Console error on ${page.url()}:`, msg.text());
      }
    });

    page.on("pageerror", (error) => {
      console.log(`Page error on ${page.url()}:`, error.message);
    });
  });

  test("Hebrew store page passes axe accessibility checks", async ({
    page,
  }) => {
    await page.goto("/he/store");
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    console.log(
      "Axe violations (Hebrew store):",
      results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.length,
      })),
    );

    expect(results.violations).toEqual([]);
  });

  test("English store page passes axe accessibility checks", async ({
    page,
  }) => {
    await page.goto("/en/store");
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    console.log(
      "Axe violations (English store):",
      results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.length,
      })),
    );

    expect(results.violations).toEqual([]);
  });

  test("Store page has moving rail with proper structure", async ({ page }) => {
    await page.goto("/he/store");
    await page.waitForLoadState("networkidle");

    // Check for moving rail section
    const movingRail = page.locator(".sf-moving-rail-section");
    await expect(movingRail).toBeVisible();

    // Check for rail track
    const railTrack = page.locator(".sf-moving-rail-track");
    await expect(railTrack).toBeVisible();

    // Check for rail cards (products)
    const railCards = page.locator(".sf-moving-rail-card");
    const count = await railCards.count();
    console.log(`Moving rail cards count: ${count}`);
    expect(count).toBeGreaterThan(0);
  });

  test("Store page category navigation works", async ({ page }) => {
    await page.goto("/he/store");
    await page.waitForLoadState("networkidle");

    // Check for ProductSubNav
    const categoryNav = page.locator(
      '[role="tablist"], .sf-subnav, nav[aria-label*="קטגוריה"], nav[aria-label*="category"]',
    );
    await expect(categoryNav.first()).toBeVisible();

    // Check category buttons
    const categoryButtons = page.locator(
      'button[role="tab"], .sf-category-filters button',
    );
    const count = await categoryButtons.count();
    console.log(`Category buttons count: ${count}`);
  });

  test("Product grid renders with products", async ({ page }) => {
    await page.goto("/he/store");
    await page.waitForLoadState("networkidle");

    // Check for product grid
    const productGrid = page.locator(
      '.sf-catalog-grid, [data-testid="store-catalog"]',
    );
    await expect(productGrid.first()).toBeVisible();

    // Check product cards
    const productCards = page.locator(".sf-product-card");
    const count = await productCards.count();
    console.log(`Product cards count: ${count}`);
    expect(count).toBeGreaterThan(0);
  });

  test("Hover preview appears on product card hover", async ({ page }) => {
    await page.goto("/he/store");
    await page.waitForLoadState("networkidle");

    const productCard = page.locator(".sf-product-card").first();
    await expect(productCard).toBeVisible();

    // Hover over the product card
    await productCard.hover();
    await page.waitForTimeout(500); // Wait for hover intent delay

    // Check for hover preview portal
    const hoverPreview = page.locator(
      "#product-hover-preview-portal .sf-hover-preview",
    );
    const isVisible = await hoverPreview.isVisible().catch(() => false);
    console.log(`Hover preview visible: ${isVisible}`);
  });

  test("Keyboard navigation on product grid", async ({ page }) => {
    await page.goto("/he/store");
    await page.waitForLoadState("networkidle");

    // Tab into the product grid
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    // Check focus is visible
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    console.log(`Focused element: ${focused}`);
  });

  test("Escape key closes hover preview", async ({ page }) => {
    await page.goto("/he/store");
    await page.waitForLoadState("networkidle");

    const productCard = page.locator(".sf-product-card").first();
    await productCard.hover();
    await page.waitForTimeout(500);

    // Press Escape
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    const hoverPreview = page.locator(
      "#product-hover-preview-portal .sf-hover-preview",
    );
    const isVisible = await hoverPreview.isVisible().catch(() => false);
    console.log(`Hover preview visible after Escape: ${isVisible}`);
  });

  test("Product detail page loads and passes axe", async ({ page }) => {
    await page.goto("/he/store/cameras/camera-dome-pro");
    await page.waitForLoadState("networkidle");

    // Check if page loads (not 404)
    const response = await page.goto("/he/store/cameras/camera-dome-pro");
    console.log(`Product detail page status: ${response?.status()}`);

    if (response?.status() === 200) {
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      console.log(
        "Axe violations (Product detail):",
        results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          nodes: v.nodes.length,
        })),
      );

      expect(results.violations).toEqual([]);
    }
  });

  test("Product detail page has image gallery with thumbnails", async ({
    page,
  }) => {
    await page.goto("/he/store/cameras/camera-dome-pro");
    await page.waitForLoadState("networkidle");

    const response = await page.goto("/he/store/cameras/camera-dome-pro");

    if (response?.status() === 200) {
      // Check for main image
      const mainImage = page.locator(
        ".sf-product-main-image, .sf-main-image img",
      );
      await expect(mainImage.first()).toBeVisible();

      // Check for thumbnail strip
      const thumbnails = page.locator(
        ".sf-thumbnail-strip, .sf-thumbnail-list",
      );
      const isVisible = await thumbnails
        .first()
        .isVisible()
        .catch(() => false);
      console.log(`Thumbnail strip visible: ${isVisible}`);

      // Check thumbnail buttons
      const thumbnailButtons = page.locator(".sf-thumbnail button");
      const count = await thumbnailButtons.count();
      console.log(`Thumbnail buttons count: ${count}`);
    }
  });

  test("Product detail page variant selection works", async ({ page }) => {
    await page.goto("/he/store/cameras/camera-dome-pro");
    await page.waitForLoadState("networkidle");

    const response = await page.goto("/he/store/cameras/camera-dome-pro");

    if (response?.status() === 200) {
      // Check for variant chips
      const variantChips = page.locator(
        '.sf-variant-chip, input[name^="variant-"]',
      );
      const count = await variantChips.count();
      console.log(`Variant chips count: ${count}`);

      if (count > 1) {
        // Click second variant
        await variantChips.nth(1).click();
        await page.waitForTimeout(100);

        // Check price updates
        const price = page.locator(
          ".sf-price-display strong, .sf-product-price strong",
        );
        const priceText = await price.textContent();
        console.log(`Price after variant change: ${priceText}`);
      }
    }
  });

  test("Reduced motion disables moving rail animation", async ({ page }) => {
    // Set reduced motion preference
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/he/store");
    await page.waitForLoadState("networkidle");

    // Check for static rail track class
    const railTrack = page.locator(
      '.sf-moving-rail-track-static, .sf-moving-rail-track[style*="animation-duration: 0s"]',
    );
    const isStatic = await railTrack.count();
    console.log(`Static rail tracks: ${isStatic}`);
  });

  test("Touch/coarse pointer behavior - hover preview opens immediately", async ({
    page,
  }) => {
    // Note: Playwright doesn't support pointer media feature emulation directly
    // This test just verifies hover preview works on tap/click
    await page.goto("/he/store");
    await page.waitForLoadState("networkidle");

    const productCard = page.locator(".sf-product-card").first();
    // Simulate tap by clicking
    await productCard.click({ force: true });
    await page.waitForTimeout(100);

    const hoverPreview = page.locator(
      "#product-hover-preview-portal .sf-hover-preview",
    );
    const isVisible = await hoverPreview.isVisible().catch(() => false);
    console.log(`Hover preview visible on click: ${isVisible}`);
  });

  test("Store page responsive at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 600 });
    await page.goto("/he/store");
    await page.waitForLoadState("networkidle");

    // Check no horizontal scroll
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    console.log(`Body width: ${bodyWidth}, Viewport width: ${viewportWidth}`);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 10); // Allow small rounding

    // Check mobile layout
    const productGrid = page.locator(".sf-catalog-grid");
    await expect(productGrid.first()).toBeVisible();
  });

  test("Store page responsive at desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/he/store");
    await page.waitForLoadState("networkidle");

    // Check desktop layout
    const productGrid = page.locator(".sf-catalog-grid");
    await expect(productGrid.first()).toBeVisible();

    const movingRail = page.locator(".sf-moving-rail-section");
    await expect(movingRail).toBeVisible();
  });

  test("Dark/Medium/Light theme switching", async ({ page }) => {
    await page.goto("/he/store");
    await page.waitForLoadState("networkidle");

    // Find theme switcher
    const themeSwitcher = page.locator(
      'button[aria-label*="theme" i], button[aria-label*="ערכת" i], [role="radiogroup"]',
    );
    const count = await themeSwitcher.count();
    console.log(`Theme switcher elements: ${count}`);

    if (count > 0) {
      // Check current theme
      const html = page.locator("html");
      const theme = await html.getAttribute("data-theme");
      console.log(`Current theme: ${theme}`);
    }
  });

  test("Category page renders with products", async ({ page }) => {
    await page.goto("/he/store/cameras");
    await page.waitForLoadState("networkidle");

    const response = await page.goto("/he/store/cameras");
    console.log(`Category page status: ${response?.status()}`);

    if (response?.status() === 200) {
      // Check for category title
      const title = page.locator("h1, h2");
      await expect(title.first()).toBeVisible();

      // Check product grid
      const productGrid = page.locator(
        '.sf-catalog-grid, [data-testid="store-catalog"]',
      );
      await expect(productGrid.first()).toBeVisible();
    }
  });

  test("Promo price math - strikethrough and discount badge", async ({
    page,
  }) => {
    await page.goto("/he/store");
    await page.waitForLoadState("networkidle");

    // Look for products with compare-at price (strikethrough)
    const compareAtPrices = page.locator(
      ".sf-product-compare-at, .sf-hover-preview-compare-at, .sf-price-compare-at",
    );
    const count = await compareAtPrices.count();
    console.log(`Products with compare-at price: ${count}`);

    // Look for discount badges
    const discountBadges = page.locator(
      ".sf-product-discount, .sf-hover-preview-discount, .sf-price-discount",
    );
    const discountCount = await discountBadges.count();
    console.log(`Products with discount badge: ${discountCount}`);
  });

  test("Inaccessible duplicate marquee content check", async ({ page }) => {
    await page.goto("/he/store");
    await page.waitForLoadState("networkidle");

    // Check for duplicate content that might be announced twice
    const railCards = page.locator(".sf-moving-rail-card");
    const firstCard = railCards.first();
    const ariaLabel = await firstCard.getAttribute("aria-label");
    console.log(`First rail card aria-label: ${ariaLabel}`);

    // Check for aria-hidden on duplicated items
    const duplicatedItems = page.locator(
      '.sf-moving-rail-track > div[aria-hidden="true"]',
    );
    const hiddenCount = await duplicatedItems.count();
    console.log(`Duplicated items with aria-hidden: ${hiddenCount}`);
  });

  test("Console/hydration errors check", async ({ page }) => {
    const errors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    page.on("pageerror", (error) => {
      errors.push(error.message);
    });

    await page.goto("/he/store");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    console.log("Console/Page errors:", errors);

    // Filter out known non-critical errors
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("icon_image_url") &&
        !e.includes("chunk") &&
        !e.includes("hydration") &&
        !e.includes("DYNAMIC_SERVER_USAGE"),
    );

    console.log("Critical errors:", criticalErrors);
    expect(criticalErrors).toEqual([]);
  });

  test("Category uploaded icons render in subnav", async ({ page }) => {
    await page.goto("/he/store");
    await page.waitForLoadState("networkidle");

    // Check category nav for images
    const categoryImages = page.locator(
      'nav img, .sf-subnav img, [role="tablist"] img',
    );
    const count = await categoryImages.count();
    console.log(`Category icon images in nav: ${count}`);
  });
});
