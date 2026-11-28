import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("all three palettes carry across both public appearance versions", async ({
  page,
}) => {
  await page.goto("/en/contact", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );
  for (const theme of ["dark", "medium", "light"]) {
    const { shared, v1, v2 } = await page.evaluate((theme) => {
      const root = document.documentElement;
      const tokens = [
        "--background",
        "--surface",
        "--foreground",
        "--primary",
        "--focus-ring",
      ];
      const read = (names: string[]) => {
        const css = getComputedStyle(root);
        return names.map((token) => css.getPropertyValue(token).trim());
      };
      root.dataset.theme = theme;
      const shared = read([
        "--miro-canvas",
        "--miro-surface",
        "--miro-text",
        "--miro-gold",
        "--miro-focus",
      ]);
      root.dataset.appearanceVersion = "1";
      const v1 = read(tokens);
      root.dataset.appearanceVersion = "2";
      return { shared, v1, v2: read(tokens) };
    }, theme);
    expect(shared.every(Boolean)).toBe(true);
    expect(v1).toEqual(shared);
    expect(v2).toEqual(shared);
  }
});

for (const { path, width } of [
  { path: "/en/services", width: 1280 },
  { path: "/en/login", width: 390 },
  { path: "/he", width: 320 },
  { path: "/he/store/:product", width: 390 },
]) {
  test(`enhanced Light stays readable and fits ${path} at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.setItem("miro-theme", "light"));
    if (path === "/he/store/:product") {
      // Owner-editable catalog entries can replace the original seed model.
      await page.goto("/he", { waitUntil: "domcontentloaded" });
      const product = page.locator(".sf-product-title-link").first();
      await expect(product).toBeVisible();
      const href = await product.getAttribute("href");
      expect(href).toMatch(/^\/he\/store\/[^/]+\/[^/]+$/);
      await page.goto(href!, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".sf-product-detail-layout")).toBeVisible();
    } else {
      await page.goto(path, { waitUntil: "domcontentloaded" });
    }
    await expect(page.locator("html")).toHaveAttribute(
      "data-motion-ready",
      "true",
    );
    await page.evaluate(
      () => (document.documentElement.dataset.appearanceVersion = "2"),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const violations = await new AxeBuilder({ page })
      .withRules(["color-contrast"])
      .analyze();
    expect(violations.violations).toEqual([]);
  });
}
