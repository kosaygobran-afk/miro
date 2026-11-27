import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ reducedMotion: "reduce" });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/track", (route) => route.fulfill({ status: 204 }));
});

for (const locale of ["en", "he"] as const) {
  test(`${locale}: collection intro keeps its left edge and locale direction`, async ({
    page,
  }) => {
    await page.goto(`/${locale}`);
    const heading = page.locator("#store-items .sf-section-heading");
    await expect(heading).toBeVisible();
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await heading.evaluate((element) => ({
        headingLeft: element.getBoundingClientRect().left,
        children: Array.from(
          element.querySelectorAll(":scope .sf-eyebrow, :scope h2, :scope > p"),
          (node) => ({
            left: node.getBoundingClientRect().left,
            alignment: getComputedStyle(node).textAlign,
            direction: getComputedStyle(node).direction,
          }),
        ),
      }));
      expect(layout.children).toHaveLength(3);
      for (const child of layout.children) {
        expect(Math.abs(child.left - layout.headingLeft)).toBeLessThan(1);
        expect(child.alignment).toBe("left");
        expect(child.direction).toBe(locale === "he" ? "rtl" : "ltr");
      }
    }
  });

  test(`${locale}: storefront headlines use an underline for hover and current page`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(`/${locale}`);
    await expect(page.locator("html")).toHaveAttribute(
      "data-motion-ready",
      "true",
    );
    const nav = page.locator(".premium-desktop-nav");
    const catalog = nav.locator(`a[href="/${locale}"]`);
    const services = nav.locator(`a[href="/${locale}/services"]`);
    const contact = nav.locator(`a[href="/${locale}/contact"]`);
    await expect(catalog).toHaveAttribute("aria-current", "page");
    await expect(services).not.toHaveAttribute("aria-current", "page");

    async function expectUnderline(link: typeof services) {
      await expect
        .poll(() =>
          link.evaluate((element) => {
            const frame = getComputedStyle(element);
            const label = getComputedStyle(
              element.querySelector(".navbar-text-label > span")!,
            );
            return {
              underlined: [frame, label].some((style) =>
                style.textDecorationLine.includes("underline"),
              ),
              bold: Number(label.fontWeight) >= 700,
              shadow: label.textShadow !== "none",
              unfilled: frame.backgroundColor === "rgba(0, 0, 0, 0)",
              noFrame:
                [frame.borderTopColor, frame.borderBottomColor].every(
                  (color) => color === "rgba(0, 0, 0, 0)",
                ) ||
                (frame.borderTopWidth === "0px" &&
                  frame.borderBottomWidth === "0px"),
            };
          }),
        )
        .toEqual({
          underlined: true,
          bold: true,
          shadow: true,
          unfilled: true,
          noFrame: true,
        });
    }

    const headlineDividers = await nav
      .locator(":scope > div")
      .evaluateAll(
        (nodes) =>
          nodes.filter(
            (node) => getComputedStyle(node, "::before").content !== "none",
          ).length,
      );
    expect(headlineDividers).toBe(0);

    const field = page.locator(".premium-header-search");
    const wishlist = page.locator(".premium-wishlist-link");
    for (const width of [1200, 1440, 1600, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      const [searchBox, contactBox, wishlistBox] = await Promise.all(
        [field, contact, wishlist].map((locator) => locator.boundingBox()),
      );
      expect(searchBox).toBeTruthy();
      const [left, right] = [contactBox!, wishlistBox!].sort(
        (a, b) => a.x - b.x,
      );
      const gaps = [
        searchBox!.x - (left.x + left.width),
        right.x - (searchBox!.x + searchBox!.width),
      ];
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(0);
      expect(Math.abs(gaps[0] - gaps[1])).toBeLessThan(1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
    }

    await expectUnderline(catalog);
    await services.hover();
    await expectUnderline(services);
    await services.click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/services$`));
    await page.mouse.move(3, 130);
    await expect(services).toHaveAttribute("aria-current", "page");
    await expectUnderline(services);
    await page.keyboard.press("Tab");
    await contact.focus();
    await expect(contact).toBeFocused();
    await expectUnderline(contact);
    await expect(services).toBeVisible();

    const axe = await new AxeBuilder({ page })
      .include(".premium-header")
      .analyze();
    expect(axe.violations).toEqual([]);
  });

  test(`${locale}: navbar utilities use glyphs and a selected underline without frames`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${locale}`);
    await expect(page.locator("html")).toHaveAttribute(
      "data-motion-ready",
      "true",
    );

    const header = page.locator(".premium-header");
    const cart = header.locator(".premium-cart-link");
    const wishlist = header.locator(".premium-wishlist-link");
    const quote = header.locator(".premium-quote-action");
    const theme = header.locator(".premium-theme-selector");
    const buttons = theme.locator("button");
    const frame = (node: Element) => {
      const style = getComputedStyle(node);
      return {
        border: parseFloat(style.borderTopWidth),
        background: style.backgroundColor,
        shadow: style.boxShadow,
      };
    };
    for (const locator of [wishlist, cart, quote, theme, buttons.first()]) {
      expect(await locator.evaluate(frame)).toEqual({
        border: 0,
        background: "rgba(0, 0, 0, 0)",
        shadow: "none",
      });
    }
    for (const option of ["dark", "medium", "light"]) {
      const control = theme.locator(`[data-theme-option="${option}"]`);
      await control.click();
      await expect(control).toHaveAttribute("aria-pressed", "true");
      await page.mouse.move(6, 155);
      expect(
        await control.evaluate(
          (node) => getComputedStyle(node, "::after").opacity,
        ),
      ).toBe("1");
    }

    await cart.hover();
    await expect
      .poll(() =>
        cart.evaluate((node) => getComputedStyle(node, "::after").opacity),
      )
      .toBe("1");
    await cart.click();
    await expect(cart).toHaveAttribute("aria-current", "page");
    await page.mouse.move(6, 155);
    expect(
      await cart.evaluate((node) => getComputedStyle(node, "::after").opacity),
    ).toBe("1");

    await page.setViewportSize({ width: 320, height: 800 });
    const menu = header.locator(".premium-mobile-toggle");
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(
      await page
        .locator("#mobile-navigation nav > div")
        .evaluateAll(
          (nodes) =>
            nodes.filter(
              (node) => getComputedStyle(node, "::before").content !== "none",
            ).length,
        ),
    ).toBe(0);
    expect(await menu.evaluate(frame)).toEqual({
      border: 0,
      background: "rgba(0, 0, 0, 0)",
      shadow: "none",
    });
    expect(
      await page
        .locator(".premium-mobile-shortcuts .miro-control-label")
        .evaluateAll((labels) =>
          labels.map((label) => {
            const range = document.createRange();
            range.selectNodeContents(label);
            return range.getClientRects().length;
          }),
        ),
    ).toEqual([1]);
    await expect(
      page.locator('#mobile-navigation a[href*="/services/"]'),
    ).toHaveCount(0);
  });

  test(`${locale}: navbar suggestions page forward and back in physical order`, async ({
    page,
  }) => {
    const he = locale === "he";
    const firstTitle = he ? "מוצר לדוגמה 1" : "Example product 1";
    const sixthTitle = he ? "מוצר לדוגמה 6" : "Example product 6";
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.route("**/api/catalog/product-search?**", async (route) => {
      const params = new URL(route.request().url()).searchParams;
      expect(params.get("locale")).toBe(locale);
      const pageIndex = Number(params.get("page")) - 1;
      if (pageIndex === 1) expect(params.get("cursor")).toBe("partial:5");
      const results =
        params.get("q") === "Example" ? (pageIndex === 0 ? 5 : 1) : 0;
      await route.fulfill({
        json: {
          results: Array.from({ length: results }, (_, index) => {
            const number = pageIndex * 5 + index + 1;
            return {
              id: String(number),
              href: `/${locale}/store/product-${number}`,
              name: he ? `מוצר לדוגמה ${number}` : `Example product ${number}`,
              brand: "Example",
              model: null,
              sku: `SKU-${number}`,
              barcode: null,
              imageUrl: null,
            };
          }),
          hasMore: results === 5,
          nextCursor: results === 5 ? "partial:5" : null,
        },
      });
    });
    await page.goto(`/${locale}`);
    await expect(page.locator("html")).toHaveAttribute(
      "data-motion-ready",
      "true",
    );
    const search = page
      .locator(".premium-header-search")
      .getByRole("searchbox");
    const popup = page.getByRole("region", {
      name: he ? /תוצאות/ : "Product search results",
    });
    const previous = popup.getByRole("button", {
      name: he ? /קודמ/ : "Previous products",
    });
    const next = popup.getByRole("button", {
      name: he ? "מוצרים נוספים" : "Next products",
    });
    const links = popup.getByRole("link");

    async function expectSearchBorder(input: typeof search) {
      expect(
        await input.evaluate((element) => {
          const style = getComputedStyle(element.closest("form")!);
          return ["top", "right", "bottom", "left"].every(
            (side) =>
              style.getPropertyValue(`border-${side}-width`) === "1px" &&
              style.getPropertyValue(`border-${side}-style`) === "solid",
          );
        }),
      ).toBe(true);
    }

    await expectSearchBorder(search);
    await search.fill("Example");
    await expect(links).toHaveCount(5);
    await expect(links.first()).toContainText(firstTitle);
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();
    expect((await previous.boundingBox())!.x).toBeLessThan(
      (await next.boundingBox())!.x,
    );
    const fieldBox = (await search.boundingBox())!;
    const popupBox = (await popup.boundingBox())!;
    expect(popupBox.y).toBeGreaterThanOrEqual(fieldBox.y + fieldBox.height - 1);

    await search.press("ArrowDown");
    await expect(links.first()).toBeFocused();
    await next.click();
    await expect(links).toHaveCount(1);
    await expect(links.first()).toContainText(sixthTitle);
    await expect(next).toBeDisabled();
    await previous.click();
    await expect(links).toHaveCount(5);
    await expect(links.first()).toContainText(firstTitle);
    await search.fill("NoMatch");
    await expect(links).toHaveCount(0);
    await expect(popup).toContainText(
      he ? "לא נמצאו מוצרים מתאימים." : "No matching products.",
    );
    await search.press("Escape");
    await expect(popup).toBeHidden();
    await expect(search).toBeFocused();

    await page.setViewportSize({ width: 320, height: 800 });
    const menu = page.locator(".premium-mobile-toggle");
    await menu.click();
    const mobileSearch = page
      .locator("#mobile-navigation")
      .getByRole("searchbox");
    await expectSearchBorder(mobileSearch);
    await mobileSearch.fill("Example");
    await expect(links).toHaveCount(5);
    const mobilePopup = (await popup.boundingBox())!;
    expect(mobilePopup.x).toBeGreaterThanOrEqual(0);
    expect(mobilePopup.x + mobilePopup.width).toBeLessThanOrEqual(320);
    await mobileSearch.press("Escape");
    await expect(popup).toBeHidden();
    await expect(mobileSearch).toBeFocused();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await mobileSearch.press("Escape");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toBeFocused();
  });
}
