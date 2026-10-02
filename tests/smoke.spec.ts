import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = [
  { path: "/he", locale: "he", dir: "rtl", title: /מירו/ },
  { path: "/en", locale: "en", dir: "ltr", title: /MIRO/ },
  { path: "/he/home", locale: "he", dir: "rtl", title: /מירו/ },
  { path: "/en/contact", locale: "en", dir: "ltr", title: /Contact/ },
] as const;

async function waitForAnimations(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        // Company/product/text rails intentionally loop forever. Wait for
        // finite entrance transitions, not an infinite animation's promise.
        .filter(
          (animation) =>
            animation.playState !== "paused" &&
            Number.isFinite(animation.effect?.getComputedTiming().endTime),
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}

test.describe("deployment smoke", () => {
  for (const pageInfo of pages) {
    test(`${pageInfo.path} renders with locale metadata`, async ({ page }) => {
      const response = await page.goto(pageInfo.path);

      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle(pageInfo.title);
      await expect(page.locator("html")).toHaveAttribute(
        "lang",
        pageInfo.locale,
      );
      await expect(page.locator("html")).toHaveAttribute("dir", pageInfo.dir);
      await expect(page.locator("body")).toBeVisible();
    });
  }

  test("root redirects to the Hebrew default locale", async ({ page }) => {
    const response = await page.goto("/");

    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/he$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
    await expect(page.locator("#store-title")).toBeVisible();
  });

  test("store is canonical and appears before Services and Home", async ({
    page,
  }) => {
    for (const locale of ["he", "en"] as const) {
      await page.goto(`/${locale}`);
      await expect(page.locator("#store-title")).toBeVisible();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new RegExp(`/${locale}$`),
      );
      const links = page.locator(".premium-desktop-nav .premium-nav-link");
      await expect(links.nth(0)).toHaveAttribute("href", `/${locale}`);
      await expect(links.nth(1)).toHaveAttribute("href", `/${locale}/services`);
      await expect(links.nth(2)).toHaveAttribute("href", `/${locale}/home`);

      await page.goto(`/${locale}/store`);
      await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    }
  });

  test("old product URLs redirect to the Store section", async ({ page }) => {
    const response = await page.goto("/he/products/cameras");

    // With a seeded database the category renders (200); without credentials
    // the production build shows notFound (404, no mock fallback by design),
    // which uses the root error document without a locale html element.
    expect([200, 404]).toContain(response?.status());
    await expect(page).toHaveURL(/\/he\/store\/cameras$/);
    if (response?.status() === 200) {
      await expect(page.locator("html")).toHaveAttribute("lang", "he");
    }
  });

  test("service detail route does not switch from static to dynamic at runtime", async ({
    page,
  }) => {
    const response = await page.goto("/he/services/security-cameras");
    // An unseeded environment may have no published service; it must still
    // render a normal not-found response rather than a server error.
    expect([200, 404]).toContain(response?.status());
  });

  test("home pages pass automated accessibility smoke checks", async ({
    page,
  }) => {
    for (const path of ["/he", "/en"]) {
      await page.goto(path);
      await waitForAnimations(page);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      expect(results.violations).toEqual([]);
    }
  });
});
