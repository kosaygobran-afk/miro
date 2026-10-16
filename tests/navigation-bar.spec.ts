import { test, expect } from "@playwright/test";
import { DEFAULT_ANIMATION_SETTINGS } from "../src/lib/animation-settings";

for (const locale of ["en", "he"] as const) {
  test(`${locale}: switching appearance restores original category arrows and account chevron`, async ({
    page,
  }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        json: {
          authenticated: true,
          role: "customer",
          name: "Synthetic session",
        },
      }),
    );
    await page.goto(`/${locale}`);
    await expect(page.locator("html")).toHaveAttribute(
      "data-motion-ready",
      "true",
    );
    for (const version of ["2", "1", "2"] as const) {
      await page.evaluate(
        (detail) =>
          window.dispatchEvent(
            new CustomEvent("miro-animation-settings-change", { detail }),
          ),
        { ...DEFAULT_ANIMATION_SETTINGS, appearanceVersion: version },
      );
      await expect(page.locator("html")).toHaveAttribute(
        "data-appearance-version",
        version,
      );
      const arrow = page.locator(".sf-department-arrow").first();
      await expect(arrow).toHaveClass(
        new RegExp(
          `lucide-${version === "2" ? "corner-down-" : "arrow-"}${locale === "he" ? "left" : "right"}`,
        ),
      );
      const chevron = page.locator(
        ".premium-header-actions .premium-account-chevron",
      );
      if (version === "1") await expect(chevron).toBeVisible();
      else await expect(chevron).toBeHidden();
    }
  });
  for (const width of [320, 360, 390, 655, 768, 1024, 1440, 1920]) {
    test(`${locale}: navbar/category controls stay contained at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.route("**/api/track", (route) =>
        route.fulfill({ status: 204 }),
      );
      await page.goto(`/${locale}`);
      await expect(page.locator("html")).toHaveAttribute(
        "data-motion-ready",
        "true",
        { timeout: 15000 },
      );
      await expect(
        page.locator('.premium-header-actions a[href$="/login"]'),
      ).toBeVisible();
      for (const theme of ["dark", "medium", "light"]) {
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        const result = await page.evaluate(() => {
          const header = document
            .querySelector(".premium-header-inner")!
            .getBoundingClientRect();
          const visible = (node: Element) => node.getClientRects().length > 0;
          const controls = Array.from(
            document.querySelectorAll(
              ".premium-header-actions > *, .premium-header-actions .premium-account-action",
            ),
          ).filter(visible);
          return {
            bounded: controls.every((node) => {
              const box = node.getBoundingClientRect();
              return (
                box.left >= -1 &&
                box.right <= innerWidth + 1 &&
                box.top >= header.top - 1 &&
                box.bottom <= header.bottom + 1
              );
            }),
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            categories: Array.from(
              document.querySelectorAll(".sf-department"),
            ).every((card) => {
              const bounds = card.getBoundingClientRect();
              const arrow = card
                .querySelector(".sf-department-arrow")!
                .getBoundingClientRect();
              return (
                arrow.left >= bounds.left &&
                arrow.right <= bounds.right &&
                arrow.top >= bounds.top &&
                arrow.bottom <= bounds.bottom
              );
            }),
          };
        });
        expect(result).toEqual({
          bounded: true,
          overflow: false,
          categories: true,
        });
        if (width === 655)
          await page
            .locator(".sf-department > span")
            .first()
            .evaluate((node) => {
              node.textContent =
                "Owner supplied long category name / שם קטגוריה ארוך במיוחד";
            });
        const card = page.locator(".sf-department").first();
        await card.hover();
        const arrow = card.locator(".sf-department-arrow");
        expect(
          await arrow.evaluate(
            (node) =>
              node.getBoundingClientRect().right <=
              node.parentElement!.getBoundingClientRect().right + 1,
          ),
        ).toBe(true);
        expect(
          await card
            .locator(".sf-department-arrow")
            .evaluate((node) => getComputedStyle(node).transform),
        ).toBe("none");
      }
    });
  }
  for (const role of ["customer", "worker", "admin", "ceo"] as const) {
    test(`${locale}: ${role} menu identifies storefront separately from destinations`, async ({
      page,
    }) => {
      await page.route("**/api/auth/session", (route) =>
        route.fulfill({
          json: { authenticated: true, role, name: "Synthetic session" },
        }),
      );
      await page.goto(`/${locale}`);
      const trigger = page.locator(
        ".premium-header-actions .premium-account-trigger",
      );
      await trigger.click();
      const menu = page.getByRole("menu");
      await expect(menu.locator(".premium-account-current-area")).toContainText(
        locale === "he" ? "החנות" : "Storefront",
      );
      await expect(
        menu.locator(".premium-account-secondary-action"),
      ).toHaveCount(0);
      const destination =
        role === "worker"
          ? "worker"
          : role === "customer"
            ? "account"
            : "admin";
      await expect(
        menu.locator(`a[href="/${locale}/${destination}"]`),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  }
}
