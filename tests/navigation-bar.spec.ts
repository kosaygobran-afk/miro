import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { DEFAULT_ANIMATION_SETTINGS } from "../src/lib/animation-settings";

// Geometry/contrast scans must observe settled themes, not an intermediate fade.
test.use({ reducedMotion: "reduce" });

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
          `lucide-${
            version === "2"
              ? `corner-down-${locale === "he" ? "right" : "left"}`
              : `arrow-${locale === "he" ? "left" : "right"}`
          }`,
        ),
      );
      const chevron = page.locator(
        ".premium-header-actions .premium-account-chevron",
      );
      if (version === "1") await expect(chevron).toBeVisible();
      else await expect(chevron).toBeHidden();
    }
  });
  for (const width of [
    320, 360, 390, 481, 655, 768, 1024, 1199, 1200, 1440, 1599, 1600, 1920,
    2560,
  ]) {
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
              ".premium-header-actions a, .premium-header-actions button",
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
        const separation = await page.evaluate(() => {
          const visible = (node: Element) => node.getClientRects().length > 0;
          const pieces = Array.from(
            document.querySelectorAll(
              ".premium-header-inner > .premium-logo-link, .premium-header-inner > .premium-desktop-nav, .premium-header-inner > .premium-header-search, .premium-header-inner > .premium-header-actions",
            ),
          )
            .filter(visible)
            .map((node) => node.getBoundingClientRect());
          const noOverlap = pieces.every((box, i) =>
            pieces
              .slice(i + 1)
              .every(
                (other) =>
                  Math.min(box.right, other.right) -
                    Math.max(box.left, other.left) <
                  1,
              ),
          );
          const actions = document.querySelector(".premium-header-actions")!;
          const shoppingGroup = actions.querySelector(
            ".premium-header-action-group--shopping",
          )!;
          const personalGroup = actions.querySelector(
            ".premium-header-action-group--personal",
          )!;
          const shopping = shoppingGroup.getBoundingClientRect();
          const personal = personalGroup.getBoundingClientRect();
          const search = document.querySelector(".premium-header-search")!;
          return {
            noOverlap,
            sectionGap:
              innerWidth >= 1200
                ? Math.max(
                    shopping.left - personal.right,
                    personal.left - shopping.right,
                  )
                : null,
            actionGap: parseFloat(getComputedStyle(actions).columnGap),
            shoppingGap:
              innerWidth >= 1200
                ? parseFloat(getComputedStyle(shoppingGroup).columnGap)
                : null,
            personalGap:
              innerWidth >= 1200
                ? parseFloat(getComputedStyle(personalGroup).columnGap)
                : null,
            personalStartPadding:
              innerWidth >= 1200
                ? parseFloat(getComputedStyle(personalGroup).paddingInlineStart)
                : null,
            controlHeights: [
              ...shoppingGroup.children,
              ...personalGroup.children,
            ]
              .filter(visible)
              .map((node) => node.getBoundingClientRect().height),
            themeCellHeights: [
              ...personalGroup.querySelectorAll(
                ".premium-theme-selector > button",
              ),
            ].map((node) => node.getBoundingClientRect().height),
            searchHeight: visible(search)
              ? search.getBoundingClientRect().height
              : null,
          };
        });
        expect(separation.noOverlap).toBe(true);
        if (width >= 1200) {
          expect(separation.sectionGap).toBeGreaterThanOrEqual(24);
          expect(separation.shoppingGap).toBe(12);
          expect(separation.personalGap).toBe(12);
          expect(separation.personalStartPadding).toBe(24);
          for (const height of separation.controlHeights)
            expect(Math.abs(height - 44)).toBeLessThan(0.5);
          for (const height of separation.themeCellHeights)
            expect(Math.abs(height - 36)).toBeLessThan(0.5);
          if (width >= 1600)
            expect(Math.abs(separation.searchHeight! - 44)).toBeLessThan(0.5);
          const navigationCenter = await page.evaluate(() => {
            const brand = document
              .querySelector(".premium-logo-link")!
              .getBoundingClientRect();
            const search = document.querySelector(".premium-header-search")!;
            const neighbor = (
              search.getClientRects().length
                ? search
                : document.querySelector(".premium-header-actions")!
            ).getBoundingClientRect();
            const boxes = Array.from(
              document.querySelectorAll(".premium-desktop-nav > div"),
            ).map((node) => node.getBoundingClientRect());
            const center =
              (Math.min(...boxes.map((box) => box.left)) +
                Math.max(...boxes.map((box) => box.right))) /
              2;
            const slotCenter =
              brand.left > neighbor.left
                ? (neighbor.right + brand.left) / 2
                : (brand.right + neighbor.left) / 2;
            return Math.abs(center - slotCenter);
          });
          expect(navigationCenter).toBeLessThan(1);
          const labelPadding = await page
            .locator(".premium-desktop-nav .premium-nav-link")
            .evaluateAll((nodes) =>
              nodes.map((node) => {
                const style = getComputedStyle(node);
                return [
                  style.paddingTop,
                  style.paddingRight,
                  style.paddingBottom,
                  style.paddingLeft,
                ].map(parseFloat);
              }),
            );
          if (width >= 1600) {
            const searchGaps = await page.evaluate(() => {
              const search = document
                .querySelector(".premium-header-search")!
                .getBoundingClientRect();
              const nav = document
                .querySelector(".premium-desktop-nav")!
                .getBoundingClientRect();
              const cart = document
                .querySelector(".premium-cart-link")!
                .getBoundingClientRect();
              const gap = (a: DOMRect, b: DOMRect) =>
                Math.max(a.left - b.right, b.left - a.right);
              return [gap(search, nav), gap(search, cart)];
            });
            expect(Math.abs(searchGaps[0] - searchGaps[1])).toBeLessThan(1);
            expect(
              await page
                .locator(".premium-header-search")
                .evaluate((node) => node.getBoundingClientRect().width),
            ).toBeGreaterThanOrEqual(280);
          }
          for (const [top, right, bottom, left] of labelPadding) {
            expect(top).toBeGreaterThanOrEqual(14);
            expect(bottom).toBe(top);
            expect(left).toBeGreaterThanOrEqual(16);
            expect(right).toBe(left);
          }
        } else expect(separation.actionGap).toBeGreaterThanOrEqual(6);
        if (width === 1920) {
          const axe = await new AxeBuilder({ page })
            .include(".premium-header")
            .analyze();
          expect(axe.violations).toEqual([]);
        }
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
