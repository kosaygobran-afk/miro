import { expect, test, type Locator } from "@playwright/test";

// Session fixtures expose each public menu without changing real accounts.
// Actual CEO/admin authorization and publishing use verify-customer-design.mjs.
async function expectUncovered(panel: Locator) {
  await expect(panel).toBeVisible();
  await expect
    .poll(() =>
      panel.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return [0.2, 0.5, 0.8].every((x) =>
          [0.2, 0.5, 0.8].every((y) => {
            const hit = document.elementFromPoint(
              bounds.left + bounds.width * x,
              bounds.top + bounds.height * y,
            );
            return hit !== null && element.contains(hit);
          }),
        );
      }),
    )
    .toBe(true);
}

for (const locale of ["he", "en"] as const) {
  for (const theme of ["dark", "medium", "light"] as const) {
    test(`desktop overlays stay above imagery: ${locale}/${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.route("**/api/auth/session", (route) =>
        route.fulfill({
          json: { authenticated: true, role: "ceo", name: "Kosay Gorban" },
        }),
      );
      await page.goto(`/${locale}`);
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      const trigger = page.locator(
        ".premium-header-actions .premium-account-trigger",
      );
      await trigger.click();
      const account = page.locator(".premium-account-dropdown");
      await expectUncovered(account);
      await expect(account.locator(".premium-account-display-name")).toHaveText(
        "Kosay Gorban",
      );
      // Reproduce the reported opening frame, rather than waiting out a fade.
      const entrance = await account.evaluate((element) => {
        element.getAnimations().forEach((animation) => {
          animation.pause();
          animation.currentTime = 80;
        });
        const style = getComputedStyle(element);
        return { opacity: style.opacity, glass: style.backdropFilter };
      });
      expect(entrance.opacity).toBe("1");
      expect(entrance.glass).toContain("blur(");
      await page.keyboard.press("ArrowDown");
      await expect(account.getByRole("menuitem").nth(1)).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(account).toHaveCount(0);
      await expect(trigger).toBeFocused();

      const categoriesTrigger = page.locator(
        ".premium-desktop-nav .premium-disclosure-button",
      );
      await categoriesTrigger.click();
      const categories = page.locator("#store-navigation");
      await expectUncovered(categories);
      await expect(categories.locator("a")).toHaveCount(9);
      expect(
        await categories.evaluate(
          (element) => getComputedStyle(element).opacity,
        ),
      ).toBe("1");
      await page.keyboard.press("Escape");
      await expect(categories).toHaveCount(0);
      await expect(categoriesTrigger).toBeFocused();
    });

    for (const width of [320, 390]) {
      test(`mobile glass navigation uses only page scrolling: ${locale}/${theme}/${width}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 700 });
        await page.route("**/api/auth/session", (route) =>
          route.fulfill({
            json: { authenticated: true, role: "ceo", name: "Kosay Gorban" },
          }),
        );
        await page.goto(`/${locale}`);
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        const navigationTrigger = page.locator(".premium-mobile-toggle");
        const initialHeaderHeight = await page
          .locator("header")
          .evaluate((element) => element.getBoundingClientRect().height);
        await navigationTrigger.click();
        const navigation = page.locator("#mobile-navigation");
        await expectUncovered(navigation);
        const entranceOpacity = await navigation.evaluate((element) => {
          element.getAnimations().forEach((animation) => {
            animation.pause();
            animation.currentTime = 80;
          });
          const opacity = getComputedStyle(element).opacity;
          element.getAnimations().forEach((animation) => animation.finish());
          return opacity;
        });
        expect(entranceOpacity).toBe("1");
        const geometry = await navigation.evaluate((element) => {
          const style = getComputedStyle(element),
            bounds = element.getBoundingClientRect();
          return {
            overflow: style.overflowY,
            scrollTop: element.scrollTop,
            x: bounds.x,
            right: bounds.right,
            glass: style.backdropFilter,
          };
        });
        expect(geometry.overflow).toBe("visible");
        expect(geometry.glass).toContain("blur(");
        expect(geometry.x).toBeGreaterThanOrEqual(0);
        expect(geometry.right).toBeLessThanOrEqual(width + 1);
        expect(
          await page
            .locator("header")
            .evaluate((element) => element.getBoundingClientRect().height),
        ).toBe(initialHeaderHeight);

        // The role popup opened from inside the hamburger must escape its parent.
        const accountTrigger = navigation.locator(".premium-account-trigger");
        await accountTrigger.click();
        const account = page.locator(".premium-account-dropdown");
        await expectUncovered(account);
        const bounds = await account.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(15);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width - 15);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(685);
        expect(
          await account.evaluate(
            (element) => element.scrollHeight <= element.clientHeight + 1,
          ),
        ).toBe(true);
        const controls = await page
          .locator(".premium-account-trigger")
          .evaluateAll((nodes) =>
            nodes
              .map((node) => node.getAttribute("aria-controls"))
              .filter(Boolean),
          );
        expect(new Set(controls).size).toBe(controls.length);
        await page.keyboard.press("Escape");
        await expect(account).toHaveCount(0);
        await expect(navigation).toBeVisible();
        await expect(accountTrigger).toBeFocused();

        await navigation.locator("nav").hover();
        await page.mouse.wheel(0, 180);
        await expect
          .poll(() => page.evaluate(() => window.scrollY))
          .toBeGreaterThan(0);
        expect(await navigation.evaluate((element) => element.scrollTop)).toBe(
          0,
        );
        await page.keyboard.press("Escape");
        await expect(navigation).toHaveCount(0);
        await expect(navigationTrigger).toBeFocused();

        // The compact header's menu must also stay inside a narrow phone.
        await page
          .locator(".premium-header-actions .premium-account-trigger")
          .click();
        await expectUncovered(account);
        const compact = await account.boundingBox();
        expect(compact!.x).toBeGreaterThanOrEqual(15);
        expect(compact!.x + compact!.width).toBeLessThanOrEqual(width - 15);
        await account.locator(".premium-account-secondary-action").click();
        await expect(account).toHaveCount(0);
        await expect(page).toHaveURL(new RegExp(`/${locale}$`));
      });
    }
  }

  test(`3D preview and gallery controls remain above product images: ${locale}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto(`/${locale}`);
    await page.locator(".sf-product-quick-preview").first().click();
    const preview = page.locator(".sf-hover-preview");
    await expectUncovered(preview);
    const close = preview.locator(".sf-hover-preview-close");
    await expectUncovered(close);
    await close.click();
    await expect(preview).toHaveCount(0);
    await page.goto(`/${locale}/store/cameras/ubiquiti-uvc-g5-bullet`);
    const next = page.locator(".sf-gallery-arrow-next");
    await expectUncovered(next);
    const original = await page
      .locator(".sf-product-main-image")
      .getAttribute("src");
    await next.click();
    await expect(page.locator(".sf-product-main-image")).not.toHaveAttribute(
      "src",
      original!,
    );
  });
}
