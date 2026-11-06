import { createElement } from "react";
import sharp from "sharp";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function loadDisplayComponent(file: string) {
  const exports = {};
  runInNewContext(
    ts.transpileModule(readFileSync(resolve(file), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { exports, require: createRequire(resolve("package.json")) },
  );
  return exports;
}
const { PriceAmount } = loadDisplayComponent(
  "src/features/catalog/price-amount.tsx",
) as typeof import("../src/features/catalog/price-amount");
const { StockIndicator } = loadDisplayComponent(
  "src/features/catalog/stock-indicator.tsx",
) as typeof import("../src/features/catalog/stock-indicator");
import { expect, test } from "@playwright/test";
import { DEFAULT_ANIMATION_SETTINGS } from "../src/lib/animation-settings";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/track", (route) => route.fulfill({ status: 204 }));
});

for (const locale of ["he", "en"] as const) {
  for (const width of [320, 1440, 1672]) {
    test(`${locale}: reference cards and view controls fit at ${width}px`, async ({
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
      );
      await page.evaluate(
        (detail) =>
          window.dispatchEvent(
            new CustomEvent("miro-animation-settings-change", { detail }),
          ),
        { ...DEFAULT_ANIMATION_SETTINGS, enabled: false },
      );
      const catalog = page.locator('.sf-catalog[data-catalog-scope="all"]');
      const card = catalog.locator(".sf-reference-card").first();
      await expect(card).toBeVisible();
      await expect(
        card.locator(
          ".sf-product-actions > .sf-card-action-hint > :is(button, a)",
        ),
      ).toHaveCount(4);
      await expect(
        card.locator(
          ".sf-card-meta-band .sf-card-stock-slot > :is(.sf-card-stock, .sf-availability-pending)",
        ),
      ).toHaveCount(1);
      await expect(card.locator(".sf-product-price")).toHaveCount(0);
      await expect(
        card.locator(".sf-card-media-tools .sf-card-price-main"),
      ).toHaveCount(1);
      await expect(
        card.locator('.sf-badge-rail-group[role="list"] .sf-card-featured'),
      ).toHaveText(locale === "he" ? "קולקציה" : "Collection");
      const label = await card
        .locator('.sf-badge-rail-group[role="list"] .sf-card-featured')
        .evaluate((e) => ({
          font: parseFloat(getComputedStyle(e).fontSize),
          border: parseFloat(getComputedStyle(e).borderTopWidth),
        }));
      expect(label.font).toBeGreaterThanOrEqual(12);
      expect(label.border).toBe(1);
      for (const theme of ["dark", "medium", "light"]) {
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        const geometry = await card.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const tags = element
            .querySelector(".sf-card-tags")!
            .getBoundingClientRect();
          const media = element
            .querySelector(".sf-product-media")!
            .getBoundingClientRect();
          const price = element
            .querySelector(".sf-product-price__amount")!
            .getBoundingClientRect();
          const sku = element
            .querySelector('[data-product-identifier="sku"]')!
            .getBoundingClientRect();
          const stock = element
            .querySelector(".sf-card-stock, .sf-availability-pending")!
            .getBoundingClientRect();
          const stockBand = element
            .querySelector(".sf-card-media-tools")!
            .getBoundingClientRect();
          const summary = element
            .querySelector(".sf-product-summary")!
            .getBoundingClientRect();
          const identifiers = element
            .querySelector(".sf-card-meta-band")!
            .getBoundingClientRect();
          const purchaseDetails = Array.from(
            element.querySelectorAll(
              ".sf-card-media-tools :is(.sf-product-price__amount, .sf-product-compare-at, .sf-product-discount, .sf-card-vat, .sf-card-stock, .sf-availability-pending)",
            ),
            (detail) => detail.getBoundingClientRect(),
          );
          const controlElements = Array.from(
            element.querySelectorAll(
              ".sf-product-actions > .sf-card-action-hint > :is(button, a)",
            ),
          );
          const controls = controlElements
            .map((e) => e.getBoundingClientRect())
            .sort((a, b) => a.left - b.left);
          const controlGaps = controls
            .slice(1)
            .map((r, index) => r.left - controls[index].right);
          const title = element.querySelector(".sf-product-summary h3")!;
          const titleStyle = getComputedStyle(title);
          const rtl = getComputedStyle(element).direction === "rtl";
          const codeLabel = element
            .querySelector(".sf-card-sku-label")!
            .getBoundingClientRect();
          const codeValue = element
            .querySelector(".sf-card-sku-value")!
            .getBoundingClientRect();
          return {
            controlCount: controls.length,
            tagsAbove: tags.bottom <= media.top + 1,
            contained: controls.every(
              (r) => r.left >= bounds.left && r.right <= bounds.right,
            ),
            oneRow: controls.every(
              (r) => Math.abs(r.top - controls[0].top) < 2,
            ),
            balancedActions:
              controls.length === 4 &&
              Math.abs(
                (controls[0].left + controls[3].right) / 2 -
                  bounds.left -
                  bounds.width / 2,
              ) < 1 &&
              controlGaps.every((gap) => gap >= 0 && gap <= 1.1),
            equalActionFrames: controls.every(
              (r) =>
                Math.abs(r.width - controls[0].width) < 1.1 &&
                Math.abs(r.height - 48) < 1,
            ),
            centeredActionIcons: controlElements.every((control) => {
              const frame = control.getBoundingClientRect();
              const icon = control
                .querySelector("svg:not(.sf-card-cart-slash)")
                ?.getBoundingClientRect();
              return (
                !!icon &&
                Math.abs(
                  icon.left + icon.width / 2 - frame.left - frame.width / 2,
                ) < 1 &&
                Math.abs(
                  icon.top + icon.height / 2 - frame.top - frame.height / 2,
                ) < 1
              );
            }),
            twoLineTitleReservation:
              parseFloat(titleStyle.minHeight) >=
              2 * parseFloat(titleStyle.lineHeight) - 1,
            identifiersAligned:
              codeLabel.bottom <= codeValue.top + 1 &&
              Math.abs(
                (rtl ? codeLabel.right : codeLabel.left) -
                  (rtl ? codeValue.right : codeValue.left),
              ) < 1,
            purchaseBandSizing:
              Math.abs(tags.height - 44) < 1 && stockBand.height >= 60,
            splitBand:
              identifiers.top >= media.bottom - 1 &&
              identifiers.bottom <= summary.top + 1 &&
              Math.abs(stock.width - sku.width) < 1 &&
              Math.abs(stock.height - sku.height) < 1 &&
              Math.abs(stock.right - sku.left) < 1,
            purchaseDetailsContained:
              purchaseDetails.length >= 1 &&
              purchaseDetails.every(
                (detail) =>
                  detail.left >= stockBand.left &&
                  detail.right <= stockBand.right &&
                  detail.top >= stockBand.top &&
                  detail.bottom <= stockBand.bottom,
              ),
            priceAfterDetails:
              summary.bottom <= stockBand.top + 1 &&
              price.bottom <= stockBand.bottom,
            priceLeftWordsRight:
              price.right <=
              element
                .querySelector(".sf-card-price-context")!
                .getBoundingClientRect().left +
                1,
            identifiersBeforePrice: identifiers.bottom <= price.top,
            noBarcode: !element.querySelector(
              '[data-product-identifier="barcode"]',
            ),
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
          };
        });
        expect(geometry).toEqual({
          controlCount: 4,
          tagsAbove: true,
          contained: true,
          oneRow: true,
          balancedActions: true,
          equalActionFrames: true,
          centeredActionIcons: true,
          twoLineTitleReservation: true,
          identifiersAligned: true,
          purchaseBandSizing: true,
          splitBand: true,
          purchaseDetailsContained: true,
          priceAfterDetails: true,
          priceLeftWordsRight: true,
          identifiersBeforePrice: true,
          noBarcode: true,
          overflow: false,
        });
      }
      await expect(card.locator(".sf-card-specifications")).toHaveCount(0);
      await expect(
        card.locator(".sf-product-summary .product-identifiers"),
      ).toHaveCount(0);
      const code = card.locator(".sf-card-sku");
      await expect(code).toBeVisible();
      await expect(code).toHaveAttribute(
        "title",
        (await code.locator(".sf-label-copy").first().textContent())!.trim(),
      );
      await expect(code.locator(".sf-overflow-label")).toHaveAttribute(
        "dir",
        "ltr",
      );
      await expect(
        card.locator(
          '[data-product-identifier="barcode"], .sf-card-identifiers-section',
        ),
      ).toHaveCount(0);
      await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
      await catalog
        .getByRole("button", {
          name: locale === "he" ? "תצוגת רשימה" : "List view",
          exact: true,
        })
        .click();
      await expect(catalog).toHaveAttribute("data-catalog-view", "list");
      expect(
        await catalog
          .locator(".sf-catalog-grid")
          .evaluate(
            (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length,
          ),
      ).toBe(1);
      await catalog
        .getByRole("button", {
          name: locale === "he" ? "תצוגת רשת" : "Grid view",
          exact: true,
        })
        .click();
      await expect(catalog).toHaveAttribute("data-catalog-view", "grid");
    });
  }
}

for (const locale of ["he", "en"] as const) {
  test(`${locale}: root navigation restores Version 1 and keeps the Version 2 root visible`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/${locale}/store/networkGear`);
    await expect(page.locator("html")).toHaveAttribute(
      "data-motion-ready",
      "true",
    );
    const apply = async (appearanceVersion: "1" | "2") =>
      page.evaluate(
        (detail) =>
          window.dispatchEvent(
            new CustomEvent("miro-animation-settings-change", { detail }),
          ),
        { ...DEFAULT_ANIMATION_SETTINGS, enabled: false, appearanceVersion },
      );
    await apply("1");
    const roots = page.locator(".sf-departments-collapsible");
    await expect(roots.locator(".sf-department")).toHaveCount(1);
    await expect(roots.getByRole("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(page.locator(".sf-reference-card")).toHaveCount(0);
    await apply("2");
    await expect
      .poll(() => roots.locator(".sf-department").count())
      .toBeGreaterThan(1);
    await expect(roots.getByRole("button")).toHaveCount(0);
    const visible = await roots
      .locator('[aria-current="page"]')
      .evaluate((element) => {
        const chip = element.getBoundingClientRect();
        const rail = element.parentElement!.getBoundingClientRect();
        return chip.left >= rail.left - 1 && chip.right <= rail.right + 1;
      });
    expect(visible).toBe(true);
  });
}

for (const locale of ["he", "en"] as const) {
  for (const width of [390, 1440]) {
    test(`${locale}: moving rail uses the reference card at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.route("**/api/track", (route) =>
        route.fulfill({ status: 204 }),
      );
      await page.goto(`/${locale}`);
      await expect(page.locator("html")).toHaveAttribute(
        "data-motion-ready",
        "true",
      );
      const rail = page
        .locator(
          '.sf-moving-rail-segment:not([aria-hidden="true"]) .sf-reference-rail',
        )
        .first();
      await expect(rail).toBeVisible();
      await expect(
        rail.locator(
          ".sf-product-actions > .sf-card-action-hint > :is(button, a)",
        ),
      ).toHaveCount(4);
      await expect(rail.locator(".sf-card-specifications")).toHaveCount(0);
      await expect(
        rail.locator(
          ".sf-card-meta-band .sf-card-stock-slot > :is(.sf-card-stock, .sf-availability-pending)",
        ),
      ).toHaveCount(1);
      await expect(rail.locator(".sf-product-price")).toHaveCount(0);
      await expect(
        rail.locator(".sf-card-media-tools .sf-card-price-main"),
      ).toHaveCount(1);
      const geometry = await rail.evaluate((element) => {
        const card = element.getBoundingClientRect();
        const image = element
          .querySelector(".sf-product-media")!
          .getBoundingClientRect();
        const tags = element
          .querySelector(".sf-card-tags")!
          .getBoundingClientRect();
        const stockBand = element
          .querySelector(".sf-card-media-tools")!
          .getBoundingClientRect();
        const stock = element
          .querySelector(".sf-card-stock, .sf-availability-pending")!
          .getBoundingClientRect();
        const controls = Array.from(
          element.querySelector(".sf-product-actions")!.children,
          (node) => node.getBoundingClientRect(),
        );
        return {
          compact: card.height < 660,
          tagsAbove: tags.bottom <= image.top + 1,
          purchaseBandSizing:
            Math.abs(tags.height - 44) < 1 && stockBand.height >= 60,
          stockBeforePrice:
            stock.top >= image.bottom - 1 &&
            stock.bottom <= stockBand.top + 1 &&
            stock.left >= card.left &&
            stock.right <= card.right,
          controlsFit: controls.every(
            (r) =>
              r.left >= card.left &&
              r.right <= card.right &&
              Math.abs(r.top - controls[0].top) < 2,
          ),
        };
      });
      expect(geometry).toEqual({
        compact: true,
        tagsAbove: true,
        purchaseBandSizing: true,
        stockBeforePrice: true,
        controlsFit: true,
      });
      await expect(
        rail.locator(".sf-card-meta-band .sf-card-sku"),
      ).toBeVisible();
      await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
      await rail.locator(".sf-moving-rail-preview-button").click();
      await expect(
        page.locator('.sf-hover-preview[data-state="open"]'),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        rail.locator(".sf-moving-rail-preview-button"),
      ).toBeFocused();
    });
  }
}

for (const locale of ["he", "en"] as const) {
  test(`${locale}: compact prices sit below details with amounts left and context right`, async ({
    page,
  }) => {
    await page.goto(`/${locale}`);
    await expect(page.locator("html")).toHaveAttribute(
      "data-motion-ready",
      "true",
    );
    for (const width of [244, 288, 360])
      for (const [amount, original, percent] of [
        [5219, 5799, 10],
        [132, 220, 40],
        [1234567, 1500000, 18],
        [450, null, null],
      ] as const) {
        const money = renderToStaticMarkup(
          createElement(PriceAmount, { amount, locale }),
        );
        const old =
          original === null
            ? ""
            : renderToStaticMarkup(
                createElement(PriceAmount, { amount: original, locale }),
              );
        const badge =
          percent === null
            ? ""
            : `<span class="sf-product-discount sf-card-discount-note"><bdi dir="ltr">−${percent}%</bdi><span>${locale === "he" ? "הנחה" : "off"}</span></span>`;
        const codes = `<button type="button" class="sf-card-sku" data-product-identifier="sku" dir="${locale === "he" ? "rtl" : "ltr"}"><span class="sf-card-sku-label">${locale === "he" ? "מק״ט" : "SKU"}</span><span class="sf-card-sku-value" dir="ltr">DS-2CD1B47G2H-LIU</span></button>`;
        const stock = renderToStaticMarkup(
          createElement(StockIndicator, {
            quantity: 15,
            locale,
            variant: "segment",
          }),
        );
        await page.evaluate(
          ({ locale, money, old, badge, codes, stock, width, longPrice }) => {
            document.querySelector("[data-price-fixture]")?.remove();
            const fixture = document.createElement("article");
            fixture.className = "sf-product-card sf-reference-card";
            fixture.dataset.priceFixture = "true";
            fixture.dir = locale === "he" ? "rtl" : "ltr";
            fixture.style.cssText = `position:fixed;top:100px;left:20px;width:${width}px;z-index:999999;min-height:0`;
            const promotion = old
              ? `<div class="sf-product-price__promotion"><span class="sf-card-original-price"><span>${locale === "he" ? "לפני הנחה" : "Was"}</span><del class="sf-product-compare-at" dir="ltr">${old}</del></span>${badge}</div>`
              : `<span class="sf-card-price-label">${locale === "he" ? "מחיר המוצר" : "Product price"}</span>`;
            fixture.innerHTML = `<div class="sf-product-preview-source"><div class="sf-product-media-shell"><div class="sf-card-tags sf-badge-rail"></div><div class="sf-product-media"></div><div class="sf-card-meta-band"><div class="sf-card-stock-slot" dir="${locale === "he" ? "rtl" : "ltr"}">${stock}</div>${codes}</div></div><div class="sf-product-body"><div class="sf-product-summary"></div><div class="sf-card-media-tools sf-card-price-panel"><div class="sf-card-purchase-band"${longPrice ? ' data-long-price="true"' : ""}><div class="sf-card-price-main"><div class="sf-product-price__amount"><strong>${money}</strong></div><div class="sf-card-price-context" dir="${locale === "he" ? "rtl" : "ltr"}">${promotion}<small class="sf-card-vat">${locale === "he" ? "כולל מע״מ" : "incl. VAT"}</small></div></div></div></div></div></div>`;
            document.body.append(fixture);
          },
          {
            locale,
            money,
            old,
            badge,
            codes,
            stock,
            width,
            longPrice: Math.max(amount, original ?? 0) >= 1_000_000,
          },
        );
        const fixture = page.locator("[data-price-fixture]");
        await expect(fixture.locator(".sf-product-discount")).toHaveCount(
          percent === null ? 0 : 1,
        );
        await expect(fixture.locator(".sf-product-compare-at")).toHaveCount(
          original === null ? 0 : 1,
        );
        if (percent !== null) {
          await expect(fixture.locator(".sf-product-discount bdi")).toHaveText(
            `−${percent}%`,
          );
        }
        await expect(
          fixture.locator(
            ".sf-card-meta-band .sf-card-stock-slot > .sf-card-stock",
          ),
        ).toHaveCount(1);
        await expect(fixture.locator(".sf-product-price")).toHaveCount(0);
        await expect(
          fixture.locator(".sf-card-media-tools .sf-card-vat"),
        ).toHaveText(locale === "he" ? "כולל מע״מ" : "incl. VAT");
        const layout = await fixture.evaluate((element) => {
          const current = element.querySelector("strong")!;
          const currentMoney = current.querySelector(".sf-money")!;
          const old = element.querySelector("del");
          const discount = element.querySelector(".sf-product-discount");
          const card = element.getBoundingClientRect();
          const main = element
            .querySelector(".sf-card-price-main")!
            .getBoundingClientRect();
          const stock = element
            .querySelector(".sf-card-stock")!
            .getBoundingClientRect();
          const band = element
            .querySelector(".sf-card-media-tools")!
            .getBoundingClientRect();
          const tags = element
            .querySelector(".sf-card-tags")!
            .getBoundingClientRect();
          const summary = element
            .querySelector(".sf-product-summary")!
            .getBoundingClientRect();
          const identifiers = element
            .querySelector(".sf-card-meta-band")!
            .getBoundingClientRect();
          const sku = element
            .querySelector('[data-product-identifier="sku"]')!
            .getBoundingClientRect();
          const vat = element
            .querySelector(".sf-card-vat")!
            .getBoundingClientRect();
          const a = current.getBoundingClientRect();
          const b = old?.getBoundingClientRect();
          const c = discount?.getBoundingClientRect();
          const contained = (r: DOMRect, container: DOMRect) =>
            r.left >= container.left - 1 &&
            r.right <= container.right + 1 &&
            r.top >= container.top - 1 &&
            r.bottom <= container.bottom + 1;
          const separate = (first: DOMRect, second: DOMRect) =>
            first.right <= second.left + 1 ||
            second.right <= first.left + 1 ||
            first.bottom <= second.top + 1 ||
            second.bottom <= first.top + 1;
          const currentStyle = getComputedStyle(current);
          const strike = old ? getComputedStyle(old, "::after") : null;
          const transform =
            strike && strike.transform !== "none"
              ? new DOMMatrixReadOnly(strike.transform)
              : null;
          const oldBefore = old
            ? getComputedStyle(old, "::before").content
            : null;
          const currentStrike = getComputedStyle(current, "::after").content;
          return {
            bandSizing: Math.abs(tags.height - 44) < 1 && band.height >= 60,
            contained:
              [a, vat, ...(b ? [b] : []), ...(c ? [c] : [])].every((r) =>
                contained(r, band),
              ) && contained(band, card),
            stockSeparate: separate(main, stock),
            currentLeftOfContext:
              a.right <=
              element
                .querySelector(".sf-card-price-context")!
                .getBoundingClientRect().left +
                1,
            discountIsText:
              !discount ||
              (getComputedStyle(discount).backgroundColor ===
                "rgba(0, 0, 0, 0)" &&
                parseFloat(getComputedStyle(discount).borderRadius) === 0 &&
                !discount.matches("button,[role=button]")),
            promotionSeparated: !b || !c || separate(b, c),
            vatInContext: contained(
              vat,
              element
                .querySelector(".sf-card-price-context")!
                .getBoundingClientRect(),
            ),
            identifiersBeforePrice:
              identifiers.bottom <= band.top + 1 &&
              summary.bottom <= band.top + 1,
            splitStockSku:
              Math.abs(stock.right - sku.left) < 1 &&
              Math.abs(stock.width - sku.width) < 1,
            labelsAboveValues:
              element
                .querySelector(".sf-card-sku-label")!
                .getBoundingClientRect().bottom <=
              element
                .querySelector(".sf-card-sku-value")!
                .getBoundingClientRect().top +
                1,
            hierarchy:
              !old ||
              parseFloat(currentStyle.fontSize) >
                parseFloat(getComputedStyle(old).fontSize),
            boldTabularCurrent:
              parseFloat(currentStyle.fontWeight) >= 800 &&
              getComputedStyle(currentMoney).fontVariantNumeric.includes(
                "tabular-nums",
              ),
            existingFont:
              currentStyle.fontFamily === getComputedStyle(element).fontFamily,
            singleDiagonalStrike:
              !old ||
              (!!strike &&
                !["none", "normal"].includes(strike.content) &&
                parseFloat(strike.height) > 0 &&
                !!transform &&
                (Math.abs(transform.b) > 0.01 ||
                  Math.abs(transform.c) > 0.01) &&
                ["none", "normal"].includes(oldBefore!) &&
                !getComputedStyle(old).textDecorationLine.includes(
                  "line-through",
                )),
            noCurrentStrike:
              ["none", "normal"].includes(currentStrike) &&
              !currentStyle.textDecorationLine.includes("line-through"),
            discountDirection: discount
              ? getComputedStyle(discount.querySelector("bdi")!).direction
              : "ltr",
          };
        });
        expect(layout).toEqual({
          bandSizing: true,
          contained: true,
          stockSeparate: true,
          currentLeftOfContext: true,
          discountIsText: true,
          promotionSeparated: true,
          vatInContext: true,
          identifiersBeforePrice: true,
          splitStockSku: true,
          labelsAboveValues: true,
          hierarchy: true,
          boldTabularCurrent: true,
          existingFont: true,
          singleDiagonalStrike: true,
          noCurrentStrike: true,
          discountDirection: "ltr",
        });
      }
  });
}

for (const locale of ["he", "en"] as const) {
  test(`${locale}: card label loops share rail speed and pause accessibly`, async ({
    page,
  }) => {
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
      { ...DEFAULT_ANIMATION_SETTINGS, enabled: true },
    );
    // Narrow browser-only frames force overflow without changing product records.
    await page.addStyleTag({
      content: ".sf-catalog-grid .sf-reference-card { width: 220px; }",
    });
    const labels = page
      .locator('.sf-catalog-grid .sf-badge-rail[data-looping="true"]')
      .first();
    await expect(labels).toBeVisible();
    const speed = await labels.evaluate((element) => {
      const computed = getComputedStyle(element);
      const parent = getComputedStyle(
        document.querySelector(".sf-moving-rail-track")!,
      );
      return {
        labels:
          Math.abs(
            parseFloat(computed.getPropertyValue("--sf-badge-distance")),
          ) / parseFloat(computed.getPropertyValue("--sf-badge-duration")),
        products:
          Math.abs(parseFloat(parent.getPropertyValue("--sf-rail-shift"))) /
          parseFloat(parent.getPropertyValue("--sf-rail-duration")),
      };
    });
    expect(speed.labels).toBeCloseTo(speed.products, 0);
    await expect(
      labels.locator('.sf-badge-rail-group[aria-hidden="true"]'),
    ).toHaveCount(1);
    const toggle = labels.locator(".sf-badge-rail-toggle");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(
      await labels
        .locator(".sf-badge-rail-track")
        .evaluate((e) => getComputedStyle(e).animationPlayState),
    ).toBe("paused");
    await labels.locator(".sf-badge-rail-viewport").focus();
    await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(labels).toHaveCount(0);
    await expect(
      page.locator('.sf-catalog-grid .sf-badge-rail-group[aria-hidden="true"]'),
    ).toHaveCount(0);
  });
}

for (const locale of ["he", "en"] as const) {
  test(`${locale}: grid and rail share a continuous label/image backplate`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/${locale}`);
    await expect(page.locator("html")).toHaveAttribute(
      "data-motion-ready",
      "true",
    );
    for (const selector of [
      ".sf-catalog-grid .sf-reference-card",
      ".sf-moving-rail-segment .sf-reference-rail",
    ]) {
      const card = page.locator(selector).first();
      const colors = await card.evaluate((element) => {
        const paint = (node: Element): string => {
          let current: Element | null = node;
          while (current) {
            const color = getComputedStyle(current).backgroundColor;
            if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent")
              return color;
            current = current.parentElement;
          }
          return "transparent";
        };
        return {
          tags: paint(element.querySelector(".sf-card-tags")!),
          image: paint(element.querySelector(".sf-product-media")!),
        };
      });
      expect(colors.tags).toBe(colors.image);
      expect(colors.tags).not.toBe("transparent");
    }
  });
}

for (const locale of ["he", "en"] as const) {
  test(`${locale}: enabled hover keeps rounded header paint inside the top border`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(`/${locale}`);
    await expect(page.locator("html")).toHaveAttribute(
      "data-motion-ready",
      "true",
    );
    for (const style of ["3d-pop-up-smooth", "soft-reveal"] as const) {
      await page.evaluate(
        (detail) =>
          window.dispatchEvent(
            new CustomEvent("miro-animation-settings-change", { detail }),
          ),
        {
          ...DEFAULT_ANIMATION_SETTINGS,
          enabled: true,
          features: {
            ...DEFAULT_ANIMATION_SETTINGS.features,
            ambientMotion: false,
          },
          productPreviewStyle: style,
        },
      );
      await expect(page.locator("html")).toHaveAttribute(
        "data-product-preview-style",
        style,
      );
      for (const selector of [
        ".sf-catalog-grid .sf-reference-card",
        ".sf-moving-rail-segment .sf-reference-rail",
      ]) {
        const card = page.locator(selector).first();
        await card.evaluate((e) => {
          (e.parentElement as HTMLElement).style.background = "#ff00ff";
        });
        await card.locator(".sf-product-media").hover();
        await expect
          .poll(() =>
            card
              .locator("[data-preview-source]")
              .evaluate((e) => getComputedStyle(e).transform),
          )
          .toBe("none");
        const accent = await card.evaluate((e) => {
          const probe = document.createElement("span");
          probe.style.color = "var(--accent-text)";
          e.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        });
        await expect
          .poll(() => card.evaluate((e) => getComputedStyle(e).borderTopColor))
          .toBe(accent);
        const geometry = await card.evaluate((e) => ({
          frame: e.getBoundingClientRect().top,
          paint: e
            .querySelector(".sf-product-media-shell")!
            .getBoundingClientRect().top,
          color: getComputedStyle(e).borderTopColor,
          direction: getComputedStyle(e.querySelector("h3")!).direction,
        }));
        expect(geometry.paint).toBeGreaterThanOrEqual(geometry.frame + 0.9);
        expect(geometry.direction).toBe(locale === "he" ? "rtl" : "ltr");
        const { data, info } = await sharp(await card.screenshot())
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const pixel = (x: number, y: number) =>
          Array.from(
            data.subarray(
              (y * info.width + x) * 3,
              (y * info.width + x) * 3 + 3,
            ),
          );
        const corner = pixel(1, 1);
        expect(corner[0]).toBeGreaterThan(130);
        expect(corner[1]).toBeLessThan(70);
        expect(corner[2]).toBeGreaterThan(130);
        const expected = geometry.color.match(/[\d.]+/g)!.map(Number);
        const top = [0, 1, 2].map((y) => pixel(Math.floor(info.width / 2), y));
        expect(
          top.some((rgb) =>
            rgb.every(
              (channel, index) => Math.abs(channel - expected[index]) < 55,
            ),
          ),
        ).toBe(true);
      }
    }
  });
}

for (const locale of ["he", "en"] as const) {
  test(`${locale}: photo and purchase bands stay separate and the footer page arrow navigates`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/${locale}`);
    await expect(page.locator("html")).toHaveAttribute(
      "data-motion-ready",
      "true",
    );
    for (const selector of [
      ".sf-catalog-grid .sf-reference-card",
      ".sf-moving-rail-segment .sf-reference-rail",
    ]) {
      const card = page.locator(selector).first();
      await card.scrollIntoViewIfNeeded();
      await expect(card.locator(".sf-product-image-fit img")).toHaveAttribute(
        "data-image-ready",
        "true",
      );
      const fit = await card.evaluate((element) => {
        const upper = element
          .querySelector(".sf-card-tags")!
          .getBoundingClientRect();
        const lower = element
          .querySelector(".sf-card-media-tools")!
          .getBoundingClientRect();
        const stage = element
          .querySelector(".sf-product-media")!
          .getBoundingClientRect();
        const photo = element
          .querySelector(".sf-product-image-fit img")!
          .getBoundingClientRect();
        return {
          reservedBands: Math.abs(upper.height - 44) < 1 && lower.height >= 60,
          separate:
            upper.bottom <= stage.top + 1 && lower.top >= stage.bottom - 1,
          centered:
            Math.abs(photo.x + photo.width / 2 - stage.x - stage.width / 2) <
              1 &&
            Math.abs(photo.y + photo.height / 2 - stage.y - stage.height / 2) <
              1,
        };
      });
      expect(fit).toEqual({
        reservedBands: true,
        separate: true,
        centered: true,
      });
    }
    const arrow = page
      .locator(".sf-catalog-grid .sf-product-actions .sf-card-details-action")
      .first();
    const href = await arrow.getAttribute("href");
    await arrow.focus();
    await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new URL(href!, page.url()).href);
  });
}

for (const locale of ["he", "en"] as const) {
  test(`${locale}: SKU copies in full and its overflow rail starts only on intent`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
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
      {
        ...DEFAULT_ANIMATION_SETTINGS,
        features: {
          ...DEFAULT_ANIMATION_SETTINGS.features,
          ambientMotion: false,
        },
      },
    );
    const card = page.locator(".sf-catalog-grid .sf-reference-card").first();
    const button = card.locator("button.sf-card-sku");
    const value = (await button.getAttribute("title"))!;
    // A browser-only narrow value frame exercises real measured overflow.
    await button.locator(".sf-card-sku-value").evaluate((e) => {
      (e as HTMLElement).style.width = "1.5rem";
    });
    const label = button.locator(".sf-overflow-label");
    const track = label.locator(".sf-label-track");
    await expect(label).toHaveAttribute("data-overflow", "true");
    await page.mouse.move(0, 0);
    await expect(track).toHaveCSS("animation-play-state", "paused");
    await button.hover();
    await expect(track).toHaveCSS("animation-play-state", "running");
    await page.mouse.move(0, 0);
    await expect(track).toHaveCSS("animation-play-state", "paused");
    await button.focus();
    await expect(track).toHaveCSS("animation-play-state", "running");
    await page.keyboard.press("Enter");
    await expect(button.getByRole("status")).toHaveText(
      locale === "he" ? "המק״ט הועתק" : "SKU copied",
    );
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      value,
    );
    await page.keyboard.press("Space");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      value,
    );
    await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
    const originalUrl = page.url();
    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, "writeText", {
        value: () =>
          Promise.reject(new DOMException("Denied", "NotAllowedError")),
        configurable: true,
      });
    });
    await button.click();
    await expect(button.getByRole("status")).toContainText(
      locale === "he" ? "ההעתקה נכשלה" : "Copy failed",
    );
    expect(page.url()).toBe(originalUrl);
    await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
    await page.evaluate(
      (detail) =>
        window.dispatchEvent(
          new CustomEvent("miro-animation-settings-change", { detail }),
        ),
      {
        ...DEFAULT_ANIMATION_SETTINGS,
        features: {
          ...DEFAULT_ANIMATION_SETTINGS.features,
          textRails: false,
          ambientMotion: false,
        },
      },
    );
    await expect(label).toHaveAttribute("data-static", "true");
    await expect(label).not.toHaveAttribute("data-overflow", "true");
    await expect(track).toHaveCSS("animation-name", "none");

    // All four joined footer cells use the same paint as the SKU half,
    // while retaining their individual hover/focus hints and inset ring.
    await button.hover();
    const hoverPaint = await button.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    for (const action of await card
      .locator(".sf-card-action-hint > :is(button, a)")
      .all()) {
      await action.hover();
      await expect
        .poll(() =>
          action.evaluate(
            (element) => getComputedStyle(element).backgroundColor,
          ),
        )
        .toBe(hoverPaint);
      await expect(page.getByRole("tooltip")).toHaveCount(1);
      await expect(action).toHaveAttribute(
        "aria-describedby",
        (await page.getByRole("tooltip").getAttribute("id"))!,
      );
      await page.keyboard.press("Escape");
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      await action.focus();
      await expect(page.getByRole("tooltip")).toHaveCount(1);
      await expect(action).toHaveCSS("outline-offset", "-3px");
      await page.keyboard.press("Escape");
    }
    await expect(label).toHaveCSS("white-space", "normal");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(track).toHaveCSS("animation-name", "none");
  });
}
