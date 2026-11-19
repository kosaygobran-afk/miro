import { expect, test } from "@playwright/test";
import { DEFAULT_ANIMATION_SETTINGS } from "../src/lib/animation-settings";

for (const locale of ["en", "he"] as const) {
  test(`${locale}: list view fits its catalog and keeps product controls usable`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
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
      { ...DEFAULT_ANIMATION_SETTINGS, enabled: false, appearanceVersion: "2" },
    );

    const catalog = page.locator('.sf-catalog[data-catalog-scope="all"]');
    const grid = catalog.locator(".sf-catalog-grid");
    const cards = grid.locator(":scope > .sf-reference-card");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(2);
    const firstNames = await cards.evaluateAll((elements) =>
      elements
        .slice(0, 4)
        .map((element) => element.getAttribute("data-product-name")),
    );
    const listButton = catalog.getByRole("button", {
      name: locale === "he" ? "תצוגת רשימה" : "List view",
      exact: true,
    });
    const gridButton = catalog.getByRole("button", {
      name: locale === "he" ? "תצוגת רשת" : "Grid view",
      exact: true,
    });
    await listButton.click();
    await expect(listButton).toHaveAttribute("aria-pressed", "true");
    await expect(catalog).toHaveAttribute("data-catalog-view", "list");
    expect(
      await cards.evaluateAll((elements) =>
        elements
          .slice(0, 4)
          .map((element) => element.getAttribute("data-product-name")),
      ),
    ).toEqual(firstNames);

    const filters = catalog.locator(".sf-category-filters");
    const toolbar = catalog.locator(".sf-catalog-toolbar");
    await page.setViewportSize({ width: 1279, height: 900 });
    const filtersBefore = (await filters.boundingBox())!;
    await page.setViewportSize({ width: 1280, height: 900 });
    const filtersAfter = (await filters.boundingBox())!;
    expect(filtersAfter.width).toBeGreaterThanOrEqual(filtersBefore.width - 2);
    expect((await toolbar.boundingBox())!.y).toBeGreaterThanOrEqual(
      filtersAfter.y + filtersAfter.height - 1,
    );
    const searchSpace = await toolbar
      .locator("input")
      .evaluate(async (element) => {
        await document.fonts.ready;
        const input = element as HTMLInputElement;
        const style = getComputedStyle(input);
        const placeholder = getComputedStyle(input, "::placeholder");
        const context = document.createElement("canvas").getContext("2d")!;
        context.font = `${placeholder.fontWeight} ${placeholder.fontSize} ${placeholder.fontFamily}`;
        return (
          input.clientWidth -
          parseFloat(style.paddingInlineStart) -
          parseFloat(style.paddingInlineEnd) -
          context.measureText(input.placeholder).width
        );
      });
    expect(searchSpace).toBeGreaterThanOrEqual(0);

    for (const width of [320, 390, 480, 600, 950, 976, 980, 1077, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await grid.evaluate((element) => {
        const card = element.children[0] as HTMLElement;
        const second = element.children[1] as HTMLElement;
        const third = element.children[2] as HTMLElement;
        const source = card.querySelector<HTMLElement>(
          ".sf-product-preview-source",
        )!;
        const media = card.querySelector<HTMLElement>(
          ".sf-product-media-shell",
        )!;
        const body = card.querySelector<HTMLElement>(".sf-product-body")!;
        const price = card.querySelector<HTMLElement>(".sf-card-price-panel")!;
        const summary = card.querySelector<HTMLElement>(".sf-product-summary")!;
        const meta = card.querySelector<HTMLElement>(".sf-card-meta-band")!;
        const stock = meta.children[0] as HTMLElement;
        const sku = meta.children[1] as HTMLElement;
        const footer = card.querySelector<HTMLElement>(".sf-product-actions")!;
        const controls = Array.from(
          footer.querySelectorAll<HTMLElement>(
            ":scope > .sf-card-action-hint > :is(button, a)",
          ),
        );
        const box = (target: Element) => {
          const rect = target.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          };
        };
        return {
          grid: box(element),
          card: box(card),
          second: box(second),
          third: box(third),
          source: box(source),
          media: box(media),
          body: box(body),
          price: box(price),
          summary: box(summary),
          meta: box(meta),
          stock: box(stock),
          sku: box(sku),
          footer: box(footer),
          controls: controls.map(box),
          pageOverflow: document.documentElement.scrollWidth - innerWidth,
          gap: parseFloat(getComputedStyle(element).columnGap),
          cardContentWidth: source.clientWidth,
        };
      });
      const twoColumns = layout.grid.width >= 2 * 28 * 16 + layout.gap - 0.5;
      expect(
        Math.abs(layout.second.top - layout.card.top) < 1,
        `${width}px columns`,
      ).toBe(twoColumns);
      expect(
        layout.third.top,
        `${width}px maximum two columns`,
      ).toBeGreaterThan(layout.card.top + 1);
      const horizontalCard = layout.cardContentWidth >= 27 * 16;
      expect(
        Math.abs(layout.media.top - layout.body.top) < 1,
        `${width}px card`,
      ).toBe(horizontalCard);
      if (horizontalCard) {
        if (locale === "en") {
          expect(layout.media.right).toBeLessThanOrEqual(layout.body.left + 1);
        } else {
          expect(layout.body.right).toBeLessThanOrEqual(layout.media.left + 1);
        }
      } else {
        expect(layout.media.bottom).toBeLessThanOrEqual(layout.body.top + 1);
      }
      expect(
        layout.pageOverflow,
        `${width}px page overflow`,
      ).toBeLessThanOrEqual(1);
      expect(layout.summary.bottom).toBeLessThanOrEqual(layout.price.top + 1);
      expect(layout.price.bottom).toBeLessThanOrEqual(layout.footer.top + 1);
      expect(layout.stock.left).toBeLessThan(layout.sku.left);
      expect(Math.abs(layout.stock.width - layout.sku.width)).toBeLessThan(1);
      expect(layout.meta.bottom).toBeLessThanOrEqual(layout.footer.top + 1);
      expect(layout.controls).toHaveLength(4);
      for (const control of layout.controls) {
        expect(control.width).toBeGreaterThanOrEqual(44);
        expect(control.height).toBeGreaterThanOrEqual(48);
        expect(control.left).toBeGreaterThanOrEqual(layout.card.left - 1);
        expect(control.right).toBeLessThanOrEqual(layout.card.right + 1);
      }
    }

    await page.setViewportSize({ width: 1077, height: 900 });
    const card = cards.first();
    for (const theme of ["dark", "medium", "light"]) {
      await page.locator("html").evaluate((root, value) => {
        root.dataset.theme = value;
      }, theme);
      await expect(card.locator(".sf-card-meta-band")).toBeVisible();
      await expect(card.locator(".sf-card-price-panel")).toBeVisible();
    }

    // Stress real markup with synthetic long values without touching catalog data.
    await card.evaluate((element) => {
      const category = element.querySelector(".sf-category-path bdi");
      if (category)
        category.textContent = "LongSyntheticCategoryName".repeat(6);
      const number = element.querySelector(
        ".sf-card-price-panel .sf-money-number",
      );
      if (number) number.textContent = "1,234,567.89";
      const price = element.querySelector<HTMLElement>(
        ".sf-card-purchase-band",
      );
      if (price) price.dataset.longPrice = "true";
    });
    const stressed = await card.evaluate((element) => {
      const category = element.querySelector<HTMLElement>(
        ".sf-product-category",
      )!;
      const summary = element.querySelector<HTMLElement>(
        ".sf-product-summary",
      )!;
      const panel = element.querySelector<HTMLElement>(".sf-card-price-panel")!;
      const amount = element.querySelector<HTMLElement>(
        ".sf-product-price__amount",
      )!;
      const context = element.querySelector<HTMLElement>(
        ".sf-card-price-context",
      )!;
      const footer = element.querySelector<HTMLElement>(".sf-product-actions")!;
      const a = amount.getBoundingClientRect();
      const c = context.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      return {
        categoryOverflow: category.scrollWidth - category.clientWidth,
        summaryBottom: summary.getBoundingClientRect().bottom,
        panelTop: p.top,
        panelBottom: p.bottom,
        footerTop: footer.getBoundingClientRect().top,
        amountLeft: a.left,
        amountRight: a.right,
        contextLeft: c.left,
        contextRight: c.right,
        panelLeft: p.left,
        panelRight: p.right,
        pageOverflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    expect(stressed.categoryOverflow).toBeLessThanOrEqual(1);
    expect(stressed.pageOverflow).toBeLessThanOrEqual(1);
    expect(stressed.summaryBottom).toBeLessThanOrEqual(stressed.panelTop + 1);
    expect(stressed.panelBottom).toBeLessThanOrEqual(stressed.footerTop + 1);
    expect(stressed.amountLeft).toBeGreaterThanOrEqual(stressed.panelLeft - 1);
    expect(stressed.amountRight).toBeLessThanOrEqual(stressed.contextLeft + 1);
    expect(stressed.contextRight).toBeLessThanOrEqual(stressed.panelRight + 1);

    const sku = card.locator("button.sf-card-sku");
    const skuValue = await sku.getAttribute("title");
    expect(skuValue).toBeTruthy();
    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, "writeText", {
        configurable: true,
        value: async (value: string) => {
          document.documentElement.dataset.testCopiedSku = value;
        },
      });
    });
    const initialUrl = page.url();
    await sku.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute(
      "data-test-copied-sku",
      skuValue!,
    );
    await expect(sku.getByRole("status")).toHaveText(
      locale === "he" ? "המק״ט הועתק" : "SKU copied",
    );
    await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
    expect(page.url()).toBe(initialUrl);

    const preview = card.locator(".sf-product-quick-preview");
    await preview.focus();
    await expect(preview).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator(".sf-hover-preview")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
    await expect(preview).toBeFocused();

    await gridButton.click();
    await expect(gridButton).toHaveAttribute("aria-pressed", "true");
    await expect(catalog).toHaveAttribute("data-catalog-view", "grid");
    expect(
      await cards.evaluateAll((elements) =>
        elements
          .slice(0, 4)
          .map((element) => element.getAttribute("data-product-name")),
      ),
    ).toEqual(firstNames);
  });
}
