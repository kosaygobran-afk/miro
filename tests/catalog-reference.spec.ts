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
const { PriceAmount, DiscountBadge } = loadDisplayComponent(
  "src/features/catalog/price-amount.tsx",
) as typeof import("../src/features/catalog/price-amount");
const { ProductIdentifiers } = loadDisplayComponent(
  "src/features/catalog/product-identifiers.tsx",
) as typeof import("../src/features/catalog/product-identifiers");
const { StockIndicator } = loadDisplayComponent(
  "src/features/catalog/stock-indicator.tsx",
) as typeof import("../src/features/catalog/stock-indicator");
import { expect, test } from "@playwright/test";
import { DEFAULT_ANIMATION_SETTINGS } from "../src/lib/animation-settings";

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
          const barcode = element
            .querySelector('[data-product-identifier="barcode"]')!
            .getBoundingClientRect();
          const stock = element
            .querySelector(".sf-card-stock, .sf-availability-pending")!
            .getBoundingClientRect();
          const controls = Array.from(
            element.querySelectorAll(
              ".sf-product-actions > button, .sf-product-actions > a, .sf-product-actions > .sf-cart-quantity",
            ),
            (e) => e.getBoundingClientRect(),
          );
          return {
            tagsAbove: tags.bottom <= media.top + 1,
            contained: controls.every(
              (r) => r.left >= bounds.left && r.right <= bounds.right,
            ),
            oneRow: controls.every(
              (r) => Math.abs(r.top - controls[0].top) < 2,
            ),
            symmetricBands:
              Math.abs(
                tags.height -
                  element
                    .querySelector(".sf-card-media-tools")!
                    .getBoundingClientRect().height,
              ) < 1,
            parallelSku:
              Math.abs(price.y + price.height / 2 - sku.y - sku.height / 2) < 1,
            codesThenStock:
              sku.bottom <= barcode.top && barcode.bottom <= stock.top,
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
          };
        });
        expect(geometry).toEqual({
          tagsAbove: true,
          contained: true,
          oneRow: true,
          symmetricBands: true,
          parallelSku: true,
          codesThenStock: true,
          overflow: false,
        });
      }
      await expect(card.locator(".sf-card-specifications")).toHaveCount(0);
      await expect(
        card.locator(".sf-product-summary .product-identifiers"),
      ).toHaveCount(0);
      const codes = card.locator(
        ".sf-card-price-secondary .sf-card-identifiers",
      );
      await expect(codes).toBeVisible();
      for (const kind of ["sku", "barcode"]) {
        const value = codes.locator(`[data-product-identifier="${kind}"] dd`);
        await expect(value).toBeVisible();
        await expect(value).toHaveAttribute("dir", "ltr");
        await expect(value).toHaveAttribute(
          "title",
          (await value.textContent())!.trim(),
        );
      }
      await expect(codes.locator("button, summary")).toHaveCount(0);
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
      await expect(rail.locator(".sf-card-specifications")).toHaveCount(0);
      const geometry = await rail.evaluate((element) => {
        const card = element.getBoundingClientRect();
        const image = element
          .querySelector(".sf-product-media")!
          .getBoundingClientRect();
        const tags = element
          .querySelector(".sf-card-tags")!
          .getBoundingClientRect();
        const controls = Array.from(
          element.querySelector(".sf-product-actions")!.children,
          (node) => node.getBoundingClientRect(),
        );
        return {
          compact: card.height < 660,
          tagsAbove: tags.bottom <= image.top + 1,
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
        controlsFit: true,
      });
      await expect(
        rail.locator(".sf-card-price-secondary .product-identifiers"),
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
  test(`${locale}: sale price hierarchy and discount direction fit compact cards`, async ({
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
      ]) {
        const money = renderToStaticMarkup(
          createElement(PriceAmount, { amount, locale }),
        );
        const old = renderToStaticMarkup(
          createElement(PriceAmount, { amount: original, locale }),
        );
        const badge = renderToStaticMarkup(
          createElement(DiscountBadge, {
            percent,
            locale,
            className: "sf-product-discount",
          }),
        );
        const codes = renderToStaticMarkup(
          createElement(ProductIdentifiers, {
            sku: "DS-2CD1B47G2H-LIU",
            barcode: "1234567890123",
            locale,
            compact: true,
            className: "sf-card-identifiers",
          }),
        );
        const stock = renderToStaticMarkup(
          createElement(StockIndicator, {
            quantity: 15,
            locale,
            variant: "card",
          }),
        );
        await page.evaluate(
          ({ locale, money, old, badge, codes, stock, width }) => {
            document.querySelector("[data-price-fixture]")?.remove();
            const fixture = document.createElement("article");
            fixture.className = "sf-product-card sf-reference-card";
            fixture.dataset.priceFixture = "true";
            fixture.dir = locale === "he" ? "rtl" : "ltr";
            fixture.style.cssText = `position:fixed;top:100px;left:20px;width:${width}px;z-index:999999;min-height:0`;
            fixture.innerHTML = `<div class="sf-product-summary"></div><div class="sf-product-price"><div class="sf-card-price-main"><div class="sf-product-price__amount"><strong>${money}</strong></div><div class="sf-product-price__promotion"><del class="sf-product-compare-at" dir="ltr">${old}</del>${badge}</div><small class="sf-card-vat">${locale === "he" ? "כולל מע״מ" : "incl. VAT"}</small></div><div class="sf-card-price-secondary">${codes}${stock}</div></div>`;
            document.body.append(fixture);
          },
          { locale, money, old, badge, codes, stock, width },
        );
        const fixture = page.locator("[data-price-fixture]");
        await expect(fixture.locator(".sf-product-discount bdi")).toHaveText(
          `−${percent}%`,
        );
        const layout = await fixture.evaluate((element) => {
          const current = element.querySelector("strong")!;
          const old = element.querySelector("del")!;
          const discount = element.querySelector(".sf-product-discount")!;
          const card = element.getBoundingClientRect();
          const sidebar = element
            .querySelector(".sf-card-price-secondary")!
            .getBoundingClientRect();
          const sku = element
            .querySelector('[data-product-identifier="sku"]')!
            .getBoundingClientRect();
          const barcode = element
            .querySelector('[data-product-identifier="barcode"]')!
            .getBoundingClientRect();
          const vat = element
            .querySelector(".sf-card-vat")!
            .getBoundingClientRect();
          const stock = element
            .querySelector(".sf-card-stock")!
            .getBoundingClientRect();
          const centered = (a: DOMRect, b: DOMRect) =>
            Math.abs(a.top + a.height / 2 - b.top - b.height / 2) < 1;
          const a = current.getBoundingClientRect(),
            b = old.getBoundingClientRect(),
            c = discount.getBoundingClientRect();
          return {
            parallelRows:
              centered(a, sku) && centered(c, barcode) && centered(vat, stock),
            sidebarSeparate: a.right <= sidebar.left || sidebar.right <= a.left,
            codesUnderEachOther:
              sku.bottom <= barcode.top && barcode.bottom <= stock.top,
            contained: [a, b, c, sidebar].every(
              (r) => r.left >= card.left && r.right <= card.right,
            ),
            separate: [b, c].every(
              (r) =>
                r.left >= a.right || r.right <= a.left || r.top >= a.bottom,
            ),
            originalBelow: b.top >= a.bottom,
            percentageBeside:
              (b.right <= c.left || c.right <= b.left) &&
              Math.abs(b.y + b.height / 2 - c.y - c.height / 2) < 1,
            hierarchy:
              parseFloat(getComputedStyle(current).fontSize) >
              parseFloat(getComputedStyle(old).fontSize),
            direction: getComputedStyle(discount).direction,
          };
        });
        expect(layout).toEqual({
          contained: true,
          parallelRows: true,
          sidebarSeparate: true,
          codesUnderEachOther: true,
          separate: true,
          hierarchy: true,
          originalBelow: true,
          percentageBeside: true,
          direction: "ltr",
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
  test(`${locale}: photo control bands are symmetric and the page arrow navigates`, async ({
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
          equal: Math.abs(upper.height - lower.height) < 1,
          separate:
            upper.bottom <= stage.top + 1 && lower.top >= stage.bottom - 1,
          centered:
            Math.abs(photo.x + photo.width / 2 - stage.x - stage.width / 2) <
              1 &&
            Math.abs(photo.y + photo.height / 2 - stage.y - stage.height / 2) <
              1,
        };
      });
      expect(fit).toEqual({ equal: true, separate: true, centered: true });
    }
    const arrow = page
      .locator(".sf-catalog-grid .sf-card-media-tools .sf-product-expand")
      .first();
    const href = await arrow.getAttribute("href");
    await arrow.focus();
    await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new URL(href!, page.url()).href);
  });
}
