import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const locale of ["en", "he"] as const) {
  test(`${locale}: unmatched paths use the localized recovery page`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(`/${locale}/missing-audit-route/nested`);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      locale === "he" ? "rtl" : "ltr",
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      locale === "he" ? "העמוד לא נמצא" : "Page not found",
    );
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute(
      "content",
      /noindex/,
    );
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test(`${locale}: missing product has a localized, accessible recovery page`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(`/${locale}/store/cameras/miro-nonexistent-audit-product`);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      locale === "he" ? "העמוד לא נמצא" : "Page not found",
    );
    const back = page.getByRole("link", {
      name: locale === "he" ? "חזרה לחנות" : "Back to the store",
    });
    await expect(back).toHaveAttribute("href", `/${locale}`);
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute(
      "content",
      /noindex/,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
    await back.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
  });
}
