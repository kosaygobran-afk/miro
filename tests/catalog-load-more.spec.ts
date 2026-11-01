import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_ANIMATION_SETTINGS } from "../src/lib/animation-settings";

async function ready(page: Page, locale: "he" | "en") {
  await page.route("**/api/track", (route) => route.fulfill({ status: 204 }));
  await page.goto(`/${locale}`);
  await expect(page.locator("html")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );
  await page.evaluate(
    (detail) =>
      window.dispatchEvent(
        new CustomEvent("miro-animation-settings-change", { detail }),
      ),
    { ...DEFAULT_ANIMATION_SETTINGS, enabled: false },
  );
  const catalog = page.locator('.sf-catalog[data-catalog-scope="all"]');
  const cards = catalog.locator(".sf-catalog-grid > .sf-product-card");
  const button = catalog.locator(".sf-load-more button");
  await expect(cards).toHaveCount(12);
  await expect(button).toBeVisible();
  const remaining = Number(
    (await button.locator("span").innerText()).replace(/\D/g, ""),
  );
  return { cards, button, total: 12 + remaining };
}

for (const locale of ["he", "en"] as const) {
  test(`${locale}: mouse hover loads one batch and works again after re-entry`, async ({
    page,
  }) => {
    const { cards, button, total } = await ready(page, locale);
    await button.hover();
    await expect(cards).toHaveCount(Math.min(total, 24));
    await page.waitForTimeout(450);
    await expect(cards).toHaveCount(Math.min(total, 24));
    if (total > 24) {
      await button.hover();
      await expect(cards).toHaveCount(Math.min(total, 36));
    }
    if (total > 36) {
      // Clicking during the next hover intent must not add a second batch later.
      await button.click();
      await expect(cards).toHaveCount(Math.min(total, 48));
      await page.waitForTimeout(350);
      await expect(cards).toHaveCount(Math.min(total, 48));
    }
  });

  test(`${locale}: a passing pointer cancels hover and keyboard activation remains explicit`, async ({
    page,
  }) => {
    const { cards, button, total } = await ready(page, locale);
    await button.hover();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(350);
    await expect(cards).toHaveCount(12);
    await button.focus();
    await page.waitForTimeout(250);
    await expect(cards).toHaveCount(12);
    await page.keyboard.press("Enter");
    await expect(cards).toHaveCount(Math.min(total, 24));
    if (total > 24) {
      await button.focus();
      await page.keyboard.press("Space");
      await expect(cards).toHaveCount(Math.min(total, 36));
    }
  });
}

test("touch tap loads one batch without synthetic hover activation", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 900 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const page = await context.newPage();
    const { cards, button, total } = await ready(page, "en");
    await button.tap();
    await expect(cards).toHaveCount(Math.min(total, 24));
    await page.waitForTimeout(350);
    await expect(cards).toHaveCount(Math.min(total, 24));
  } finally {
    await context.close();
  }
});
