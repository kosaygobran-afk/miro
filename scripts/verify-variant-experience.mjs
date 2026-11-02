import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const base = process.env.VARIANT_QA_BASE;
assert.ok(base && new URL(base).hostname === "127.0.0.1");
const browser = await chromium.launch();
const context = await browser.newContext({
  reducedMotion: "reduce",
  viewport: { width: 1280, height: 960 },
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await context.route("https://variant-qa.invalid/**", (route) =>
  route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#888"/></svg>',
  }),
);
await context.route("**/api/track", (route) => route.fulfill({ status: 204 }));
const pid = "11111111-1111-4111-8111-111111111111";
let variants = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    product_id: pid,
    sku: "QA-A",
    color_he: "שחור",
    color_en: "Black",
    color_hex: "#111111",
    stock_qty: 3,
    is_active: true,
    is_default: true,
    price_override: 200,
    low_stock_threshold: 0,
  },
];
let images = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    product_id: pid,
    image_url: "https://variant-qa.invalid/general.svg",
    sort_order: 0,
    variant_id: null,
  },
];
const mutations = [];
let stockConflict = false;
await context.route("**/api/management/**", async (route) => {
  const req = route.request(),
    path = new URL(req.url()).pathname;
  if (req.method() === "GET")
    return route.fulfill({
      json: path.endsWith("product-images") ? { images } : { variants },
    });
  const body = req.postDataJSON();
  mutations.push({ path, method: req.method(), body });
  if (path.endsWith("product-images")) {
    images = images.map((image) =>
      image.id === body.id ? { ...image, ...body } : image,
    );
    return route.fulfill({ json: { image: images[0] } });
  }
  if (path.endsWith("variants")) {
    const variant = {
      ...variants[0],
      ...body,
      id: "44444444-4444-4444-8444-444444444444",
      stock_qty: body.initial_stock_qty,
    };
    variants.push(variant);
    return route.fulfill({ json: { variant } });
  }
  if (path.endsWith("inventory")) {
    if (stockConflict)
      return route.fulfill({ status: 409, json: { error: "Stock changed" } });
    variants = variants.map((v) =>
      v.id === body.variantId ? { ...v, stock_qty: body.counted } : v,
    );
    return route.fulfill({
      json: { movementId: "55555555-5555-4555-8555-555555555555" },
    });
  }
  throw new Error(`Unexpected mutation ${path}`);
});
try {
  for (const locale of ["en", "he"]) {
    for (const version of ["1", "2"]) {
      for (const rolePrice of [100, 120, 130, 140, 150]) {
        await page.goto(
          `${base}/catalog-preview/variants?locale=${locale}&price=${rolePrice}&version=${version}`,
        );
        const info = page.locator(".sf-product-info");
        await expect(info).toHaveAttribute("data-selected-variant", "a");
        await expect(
          page.locator(".sf-main-image img").first(),
        ).toHaveAttribute("src", /a1.svg/);
        await expect(page.locator(".sf-thumbnail")).toHaveCount(3);
        await expect(info.locator(".sf-price-display strong")).toContainText(
          "180",
        );
        await page
          .locator('.sf-variant-chip-label input[value="b"]')
          .locator("..")
          .click();
        await expect(
          page.locator(".sf-main-image img").first(),
        ).toHaveAttribute("src", /b1.svg/);
        await expect(page.locator(".sf-thumbnail")).toHaveCount(2);
        await expect(info.locator(".sf-price-display strong")).toContainText(
          "270",
        );
        await expect(info.locator(".sf-stock-indicator__number")).toHaveText(
          "0",
        );
        await expect(
          info.getByRole("button", {
            name: locale === "he" ? /^הוספה לסל/ : /^Add to cart/,
          }),
        ).toBeDisabled();
        await expect(info).not.toContainText("Aggregate in stock");
        await page
          .locator('.sf-variant-chip-label input[value="c"]')
          .locator("..")
          .click();
        await expect(
          page.locator(".sf-main-image img").first(),
        ).toHaveAttribute("src", /general.svg/);
        await expect(page.locator(".sf-thumbnail")).toHaveCount(0);
        await expect(info.locator(".sf-price-display strong")).toContainText(
          String(rolePrice * 0.9),
        );
      }
      console.log(
        `PASS ${locale} v${version}: detail media/price/stock for guest + four role fallbacks`,
      );
      await page.goto(
        `${base}/catalog-preview/variants?locale=${locale}&mode=preview&version=${version}`,
      );
      await page.getByRole("button", { name: "Open preview" }).click();
      const preview = page.locator(".sf-hover-preview");
      await expect(preview).toBeVisible();
      await preview.locator('input[value="b"]').locator("..").click();
      await expect(preview.locator(".sf-stock-indicator__number")).toHaveText(
        "0",
      );
      await expect(
        preview.locator(".sf-hover-preview-price strong"),
      ).toContainText("270");
      await expect(
        preview.getByRole("button", {
          name: locale === "he" ? /^הוספה לסל/ : /^Add to cart/,
        }),
      ).toBeDisabled();
      await expect(
        preview.locator(".sf-hover-preview-media img").first(),
      ).toHaveAttribute("src", /b1.svg/);
      await page.keyboard.press("Escape");
      await expect(preview).toHaveCount(0);
      console.log(
        `PASS ${locale} v${version}: eye preview follows selected zero-stock variant`,
      );
    }
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(
        `${base}/catalog-preview/variants?locale=${locale}&price=none&base=none`,
      );
      const radio = page.locator('input[value="c"]');
      await radio.focus();
      await radio.press("Space");
      await expect(page.locator(".sf-product-info")).toHaveAttribute(
        "data-selected-variant",
        "c",
      );
      await expect(
        page.locator(".sf-product-info .sf-product-price-block"),
      ).toHaveAttribute("data-price-published", "false");
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      if (width === 320)
        await page.screenshot({
          path: `/tmp/miro-variant-${locale}-320.png`,
          fullPage: true,
        });
    }
    await page.setViewportSize({ width: 1280, height: 960 });
    variants = variants.slice(0, 1);
    variants[0].stock_qty = 3;
    await page.goto(
      `${base}/catalog-preview/variants?locale=${locale}&mode=management`,
    );
    const assignment = page.getByLabel(
      locale === "he" ? "שיוך תמונה" : "Image assignment",
      { exact: true },
    );
    await assignment.selectOption(variants[0].id);
    await expect(assignment).toHaveValue(variants[0].id);
    await assignment.selectOption("");
    await expect(assignment).toHaveValue("");
    await page
      .getByRole("button", {
        name: locale === "he" ? "הוסף וריאנט" : "Add variant",
        exact: true,
      })
      .click();
    await expect(page.locator("#variant-initial-stock")).toHaveValue("0");
    await page.locator("#variant-initial-stock").fill("7");
    await page.locator("#variant-sku").fill(`QA-NEW-${locale}`);
    await page
      .getByRole("button", {
        name: locale === "he" ? "שמור וריאנט" : "Save variant",
        exact: true,
      })
      .click();
    assert.equal(
      mutations.findLast((m) => m.path.endsWith("variants")).body
        .initial_stock_qty,
      7,
    );
    await page
      .getByRole("button", {
        name: locale === "he" ? "עדכון מלאי" : "Update stock",
        exact: true,
      })
      .first()
      .click();
    await page
      .getByRole("spinbutton", {
        name:
          locale === "he"
            ? "כמות שנספרה (כולל 0)"
            : "Counted quantity (including 0)",
      })
      .fill("0");
    await page
      .getByRole("textbox", {
        name: locale === "he" ? "סיבת העדכון" : "Reason for correction",
      })
      .fill("QA counted zero");
    await page
      .getByRole("button", {
        name: locale === "he" ? "שמירת ספירת מלאי" : "Save stock count",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const saved = mutations.findLast((m) => m.path.endsWith("inventory"));
    assert.equal(saved.body.counted, 0);
    assert.equal(saved.body.expectedStock, variants[0].stock_qty === 0 ? 3 : 0);
    stockConflict = true;
    await page
      .getByRole("button", {
        name: locale === "he" ? "עדכון מלאי" : "Update stock",
        exact: true,
      })
      .first()
      .click();
    await page
      .getByRole("spinbutton", {
        name:
          locale === "he"
            ? "כמות שנספרה (כולל 0)"
            : "Counted quantity (including 0)",
      })
      .fill("2");
    await page
      .getByRole("textbox", {
        name: locale === "he" ? "סיבת העדכון" : "Reason for correction",
      })
      .fill("QA conflict");
    await page
      .getByRole("button", {
        name: locale === "he" ? "שמירת ספירת מלאי" : "Save stock count",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: locale === "he" ? "רענון ובדיקה" : "Refresh and review",
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(
      mutations.filter((m) => m.path.endsWith("inventory")).length,
      locale === "en" ? 2 : 4,
    );
    stockConflict = false;
    variants[0].stock_qty = 3;
    console.log(
      `PASS ${locale}: media assignment/unassignment, opening stock, zero correction and no conflict retry`,
    );
  }
  for (const locale of ["en", "he"]) {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(
      `${base}/catalog-preview/variants?locale=${locale}&mode=preview`,
    );
    await page.getByRole("button", { name: "Open preview" }).click();
    const preview = page.locator(".sf-hover-preview");
    await preview.locator('input[value="b"]').focus();
    await preview.locator('input[value="b"]').press("Space");
    await expect(preview.locator('input[value="b"]')).toBeChecked();
    const choiceIsVisible = await preview
      .locator('input[value="b"]')
      .evaluate((input) => {
        const choice = input.parentElement.getBoundingClientRect();
        const region = input
          .closest(".sf-hover-preview-details")
          .getBoundingClientRect();
        return (
          choice.top >= region.top - 1 && choice.bottom <= region.bottom + 1
        );
      });
    assert.equal(
      choiceIsVisible,
      true,
      "Focused variant label must be visible in the details scroller",
    );
    for (const theme of ["dark", "medium", "light"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      assert.equal(
        await preview.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.left >= 15 &&
            r.right <= innerWidth - 15 &&
            r.top >= 15 &&
            r.bottom <= innerHeight - 15
          );
        }),
        true,
      );
    }
    await page.screenshot({
      path: `/tmp/miro-variant-preview-${locale}-320.png`,
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    console.log(
      `PASS ${locale}: 320px preview, keyboard selection, all three themes`,
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
