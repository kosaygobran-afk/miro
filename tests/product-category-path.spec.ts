import { expect, test } from "@playwright/test";

for (const locale of ["he", "en"] as const) {
  test(`${locale}: category hierarchy appears on cards, preview and product page`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.route("**/api/track", (route) => route.fulfill({ status: 204 }));
    await page.goto(`/${locale}`);
    await expect(page.locator("html")).toHaveAttribute(
      "data-motion-ready",
      "true",
    );

    const rootOnly = page
      .locator(".sf-catalog-grid .sf-category-path")
      .filter({
        hasNot: page.locator("bdi:nth-of-type(2)"),
      })
      .first();
    if (await rootOnly.count()) {
      await expect(rootOnly.locator("bdi")).toHaveCount(1);
      await expect(rootOnly).not.toContainText(" / ");
    }

    const card = page
      .locator(".sf-catalog-grid .sf-reference-card")
      .filter({
        has: page.locator(".sf-category-path bdi:nth-of-type(2)"),
      })
      .first();
    test.skip(
      !(await card.count()),
      "No public product with a subcategory is available",
    );
    const path = card.locator(".sf-product-category .sf-category-path");
    const root = (await path.locator("bdi").nth(0).textContent())!.trim();
    const child = (await path.locator("bdi").nth(1).textContent())!.trim();
    await expect(path).toContainText(root);
    await expect(path).toContainText(child);
    expect(await path.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(
      true,
    );
    await path
      .locator("bdi")
      .nth(1)
      .evaluate((element) => {
        element.textContent = "LongSyntheticCategoryName".repeat(5);
      });
    expect(await path.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(
      true,
    );
    await path
      .locator("bdi")
      .nth(1)
      .evaluate((element, text) => {
        element.textContent = text;
      }, child);
    const detailHref = await card
      .locator(".sf-card-details-action")
      .getAttribute("href");

    await card.locator(".sf-product-quick-preview").click();
    const previewPath = page.locator(
      ".sf-hover-preview-category .sf-category-path",
    );
    await expect(previewPath).toContainText(child);
    await page.keyboard.press("Escape");
    await page.goto(detailHref!);
    const breadcrumb = page.locator(".sf-breadcrumb");
    const childLink = breadcrumb.getByRole("link", {
      name: child,
      exact: true,
    });
    await expect(childLink).toBeVisible();
    const childHref = await childLink.getAttribute("href");
    expect(
      new URL(childHref!, page.url()).searchParams.get("subcategory"),
    ).toBeTruthy();
    await expect(
      page.locator(".sf-product-info .sf-category-path"),
    ).toContainText(root);
    await expect(
      page.locator(".sf-product-info .sf-category-path"),
    ).toContainText(child);
    await childLink.click();
    await expect(page).toHaveURL(new URL(childHref!, page.url()).href);
  });
}
