import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = [
  { path: "/he", locale: "he", dir: "rtl", title: /מירו/ },
  { path: "/en", locale: "en", dir: "ltr", title: /MIRO/ },
  { path: "/he/store", locale: "he", dir: "rtl", title: /חנות/ },
  { path: "/en/contact", locale: "en", dir: "ltr", title: /Contact/ },
] as const;

async function waitForAnimations(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
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
  });

  test("old product URLs redirect to the Store section", async ({ page }) => {
    const response = await page.goto("/he/products/cameras");

    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/he\/store\/cameras$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
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
