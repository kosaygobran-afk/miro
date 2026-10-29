import { test, expect, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { DEFAULT_ANIMATION_SETTINGS } from "../src/lib/animation-settings";

test.use({ reducedMotion: "reduce" });

async function expectInViewport(panel: Locator) {
  await expect(panel).toBeVisible();
  await expect
    .poll(() =>
      panel.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return (
          box.left >= 15 &&
          box.right <= innerWidth - 15 &&
          box.top >= 0 &&
          box.bottom <= innerHeight - 15
        );
      }),
    )
    .toBe(true);
}

for (const locale of ["he", "en"] as const) {
  test(`${locale}: category panel handles long labels, short windows, motion and collapse`, async ({
    page,
  }) => {
    await page.route("**/api/track", (route) => route.fulfill({ status: 204 }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${locale}`);
    await expect(page.locator("html")).toHaveAttribute(
      "data-motion-ready",
      "true",
    );
    const setSettings = async (version: "1" | "2", micro = true) => {
      await page.evaluate(
        (detail) =>
          window.dispatchEvent(
            new CustomEvent("miro-animation-settings-change", { detail }),
          ),
        {
          ...DEFAULT_ANIMATION_SETTINGS,
          appearanceVersion: version,
          features: {
            ...DEFAULT_ANIMATION_SETTINGS.features,
            microInteractions: micro,
          },
        },
      );
    };
    await setSettings("2");
    const trigger = page.locator(
      ".premium-desktop-nav .premium-disclosure-button",
    );
    const panel = page.locator("#store-navigation");
    for (const viewport of [
      { width: 1200, height: 900 },
      { width: 1440, height: 480 },
      { width: 1920, height: 280 },
      { width: 2560, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await trigger.click();
      await expectInViewport(panel);
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      const disclosureFrame = await trigger.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          border: parseFloat(style.borderTopWidth),
          width: node.getBoundingClientRect().width,
          height: node.getBoundingClientRect().height,
          gap: parseFloat(getComputedStyle(node.parentElement!).columnGap),
        };
      });
      expect(disclosureFrame.border).toBeGreaterThan(0);
      expect(disclosureFrame.width).toBeGreaterThanOrEqual(32);
      expect(disclosureFrame.height).toBeGreaterThanOrEqual(44);
      expect(disclosureFrame.gap).toBeGreaterThanOrEqual(4);
      const links = panel.locator(".premium-category-menu__link");
      expect(await links.count()).toBeGreaterThan(0);
      await links.last().focus();
      await expect(links.last()).toBeInViewport();
      await page.keyboard.press("Home");
      await expect(links.first()).toBeFocused();
      await page.keyboard.press("End");
      await expect(links.last()).toBeFocused();
      await expect
        .poll(() =>
          panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
        )
        .toBe(true);
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await trigger.press("ArrowDown");
    const first = panel.locator(".premium-category-menu__link").first();
    await expect(first).toBeFocused();
    await first.locator(".premium-category-menu__label").evaluate((node) => {
      node.textContent = "Long owner category / קטגוריה ארוכה מאוד ".repeat(8);
    });
    await expect
      .poll(() =>
        panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      )
      .toBe(true);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await first.hover();
    const arrow = first.locator("svg");
    await expect
      .poll(() => arrow.evaluate((node) => getComputedStyle(node).transform))
      .not.toBe("none");
    await expect
      .poll(async () => {
        const travel = await arrow.evaluate(
          (node) => new DOMMatrix(getComputedStyle(node).transform).m41,
        );
        return locale === "he" ? -travel : travel;
      })
      .toBeGreaterThan(0);
    await setSettings("2", false);
    await expect
      .poll(() => arrow.evaluate((node) => getComputedStyle(node).transform))
      .toBe("none");
    await setSettings("2");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect
      .poll(() => arrow.evaluate((node) => getComputedStyle(node).transform))
      .toBe("none");
    const axe = await new AxeBuilder({ page })
      .include("#store-navigation")
      .analyze();
    expect(axe.violations).toEqual([]);
    await setSettings("1");
    await expect(panel.locator(".premium-category-menu__heading")).toHaveCount(
      0,
    );
    await expect(panel.locator(".miro-centered-control").first()).toBeVisible();
    await setSettings("2");
    await panel.locator(".premium-category-menu__link").first().focus();
    await page.setViewportSize({ width: 390, height: 700 });
    await expect(panel).toHaveCount(0);
    await expect(page.locator(".premium-mobile-toggle")).toBeFocused();
  });

  test(`${locale}: mobile navigation has icon cues and recovers focus across breakpoints`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${locale}`);
    await expect(page.locator("html")).toHaveAttribute(
      "data-motion-ready",
      "true",
    );
    const toggle = page.locator(".premium-mobile-toggle");
    const panel = page.locator("#mobile-navigation");
    await toggle.click();
    await expect(panel.locator(".premium-nav-icon")).toHaveCount(5);
    await toggle.press("Tab");
    await expect(panel.getByRole("searchbox")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(toggle).toBeFocused();
    await toggle.press("Tab");
    await expect(panel.getByRole("searchbox")).toBeFocused();
    await expect(panel.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(
      panel.locator("nav .premium-nav-link").first(),
    ).toHaveAccessibleName(
      (
        await page
          .locator(".premium-desktop-nav .premium-nav-link")
          .first()
          .innerText()
      ).trim(),
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(panel).toHaveCount(0);
    await expect(
      page.locator(".premium-desktop-nav .premium-nav-link").first(),
    ).toBeFocused();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await page.locator("#main-content").click({ position: { x: 5, y: 650 } });
    await expect(panel).toHaveCount(0);
    await toggle.click();
    await page.keyboard.press("Escape");
    await expect(toggle).toBeFocused();
  });

  test(`${locale}: account panel contains long identity, supports keyboard and preserves logout`, async ({
    page,
  }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        json: {
          authenticated: true,
          role: "ceo",
          name: "Synthetic premium account שם ארוך לבדיקת פריסה ".repeat(3),
        },
      }),
    );
    await page.route("**/api/track", (route) => route.fulfill({ status: 204 }));
    await page.goto(`/${locale}`);
    const trigger = page.locator(
      ".premium-header-actions .premium-account-trigger",
    );
    const panel = page.locator(".premium-account-dropdown");
    for (const viewport of [
      { width: 320, height: 700 },
      { width: 390, height: 280 },
      { width: 1200, height: 320 },
      { width: 1920, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      for (const theme of ["dark", "medium", "light"]) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        await trigger.click();
        await expectInViewport(panel);
        await expect
          .poll(() =>
            panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
          )
          .toBe(true);
        await page.keyboard.press("End");
        await expect(panel.locator(".premium-account-logout")).toBeFocused();
        await expect(panel.locator(".premium-account-logout")).toBeInViewport();
        await page.keyboard.press("Home");
        await expect(panel.getByRole("menuitem").first()).toBeFocused();
        if (viewport.width === 1920) {
          const axe = await new AxeBuilder({ page })
            .include(".premium-account-dropdown")
            .analyze();
          expect(axe.violations).toEqual([]);
        }
        await page.keyboard.press("Escape");
        await expect(panel).toHaveCount(0);
        await expect(trigger).toBeFocused();
      }
    }
    await trigger.click();
    await page.keyboard.press("Tab");
    await expect(panel).toHaveCount(0);
    let logoutPayload: unknown;
    await page.route("**/api/auth/logout", (route) => {
      expect(route.request().method()).toBe("POST");
      logoutPayload = route.request().postDataJSON();
      return route.fulfill({ json: { success: true } });
    });
    await trigger.click();
    await panel.locator(".premium-account-logout").click();
    await expect.poll(() => logoutPayload).toEqual({ locale });
    await expect(panel).toHaveCount(0);
  });
}

test("language round trip retains a query and one anchor fragment", async ({
  page,
}) => {
  await page.goto("/en/about?navigation=review#main-content");
  for (const locale of ["he", "en"]) {
    await page.locator(".premium-language").click();
    await page.waitForURL(
      (url) =>
        url.pathname === `/${locale}/about` &&
        url.search === "?navigation=review" &&
        url.hash === "#main-content",
    );
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
  }
});
