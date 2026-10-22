import { expect, test } from "@playwright/test";

test("catalog links avoid speculative reads while product navigation still settles", async ({
  page,
}) => {
  const catalogRequests: Array<{ path: string; prefetch: boolean }> = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      request.headers()["rsc"] === "1" &&
      /^\/en\/store\/[^/]+(?:\/[^/]+)?$/.test(path)
    ) {
      catalogRequests.push({
        path,
        prefetch: Boolean(request.headers()["next-router-prefetch"]),
      });
    }
  });
  await page.goto("/en", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );
  const categoriesTrigger = page.locator(
    ".premium-desktop-nav .premium-disclosure-button",
  );
  if (await categoriesTrigger.isVisible()) {
    await categoriesTrigger.click();
    await expect(page.locator("#store-navigation")).toBeVisible();
    await page.waitForTimeout(500);
    expect(catalogRequests).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(page.locator("#store-navigation")).toHaveCount(0);
  } else {
    // Mobile navigation has no category submenu; its existing portal still opens normally.
    const menu = page.locator(".premium-mobile-toggle");
    await menu.click();
    await expect(page.locator("#mobile-navigation")).toBeVisible();
    await page.waitForTimeout(500);
    expect(catalogRequests).toEqual([]);
    await menu.click();
    await expect(page.locator("#mobile-navigation")).toHaveCount(0);
  }
  await page.locator(".sf-moving-rail-card").first().scrollIntoViewIfNeeded();
  // Let the production viewport-prefetch scheduler run for each product surface.
  await page.waitForTimeout(500);
  const link = page.locator(".sf-product-card .sf-product-action").first();
  await link.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  expect(catalogRequests).toEqual([]);

  const productHref = await link.getAttribute("href");
  expect(productHref).toBeTruthy();
  const productPath = new URL(productHref!, page.url()).pathname;
  await link.click();
  await expect(page).toHaveURL((url) => url.pathname === productPath);
  await expect(page.locator(".sf-product-detail")).toBeVisible();
  await expect(page.locator('[data-route-loading="true"]')).toHaveCount(0);
  expect(
    catalogRequests.some(
      (request) => request.path === productPath && !request.prefetch,
    ),
  ).toBe(true);
});

test("unchanged catalog checks keep the open preview and avoid page renders", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Desktop preview requires a fine pointer");
  await page.setViewportSize({ width: 1440, height: 1100 });
  let version = 100;
  let checks = 0;
  let renders = 0;
  await page.route("**/rest/v1/store_catalog_version*", (route) => {
    checks++;
    return route.fulfill({ json: { version } });
  });
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (socket) =>
    socket.close(),
  );
  await page.clock.install();
  await page.goto("/en");
  await expect(page.locator("html")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );
  await expect.poll(() => checks).toBeGreaterThan(0);
  await page.locator(".sf-product-quick-preview").first().click();
  const preview = page.locator('.sf-hover-preview[data-state="open"]');
  await expect(preview).toBeVisible();
  page.on("request", (request) => {
    if (
      request.headers()["rsc"] === "1" &&
      new URL(request.url()).pathname === "/en" &&
      !request.headers()["next-router-prefetch"]
    )
      renders++;
  });
  const baseline = checks;
  await page.clock.fastForward(15_500);
  await expect.poll(() => checks).toBeGreaterThan(baseline);
  expect(renders).toBe(0);
  await expect(preview).toBeVisible();

  version++;
  await page.clock.fastForward(15_000);
  await expect.poll(() => checks).toBeGreaterThan(baseline + 1);
  await page.clock.fastForward(300);
  await expect.poll(() => renders).toBe(1);
  await expect(preview).toBeVisible();
  await page.clock.fastForward(15_000);
  await expect.poll(() => checks).toBeGreaterThan(baseline + 2);
  expect(renders).toBe(1);

  // Scheduled promotions/private role pricing still reconcile when idle, but
  // even the reconciliation deadline must not interrupt an open popup.
  await page.clock.fastForward(120_000);
  await expect.poll(() => checks).toBeGreaterThan(baseline + 3);
  await page.clock.fastForward(300);
  expect(renders).toBe(1);
  await expect(preview).toBeVisible();
  await page.keyboard.press("Escape");
  await page.clock.fastForward(500);
  await expect(preview).toHaveCount(0);
  await page.clock.fastForward(15_000);
  await expect.poll(() => checks).toBeGreaterThan(baseline + 4);
  await page.clock.fastForward(300);
  await expect.poll(() => renders).toBe(2);
});

test("a stalled preview image settles to an illustration and Escape still works", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await page.clock.install();
  const heldImages = new Set<import("@playwright/test").Route>();
  await page.route("**/*", (route) => {
    const request = route.request();
    if (
      request.resourceType() === "image" &&
      /catalog|\/_next\/image/.test(request.url())
    ) {
      heldImages.add(route);
      return;
    }
    return route.continue();
  });
  await page.goto("/en", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );
  await page.locator(".sf-product-quick-preview").first().click();
  const preview = page.locator(".sf-hover-preview");
  await expect(preview).toBeVisible();
  await expect(preview.locator(".sf-hover-preview-close")).toBeFocused();
  await expect(preview.locator(".sf-hover-preview-media img")).toHaveAttribute(
    "loading",
    "eager",
  );
  await page.clock.fastForward(8_500);
  await expect(preview.locator(".sf-hover-preview-media > svg")).toBeVisible();
  await expect(preview.locator(".sf-hover-preview-title")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.clock.fastForward(500);
  await expect(preview).toHaveCount(0);
  await expect(page.locator(".sf-product-quick-preview").first()).toBeFocused();
  for (const route of heldImages) await route.abort();
});
