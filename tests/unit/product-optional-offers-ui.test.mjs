import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const exports = {};
runInNewContext(
  ts.transpileModule(
    readFileSync(
      resolve("src/features/catalog/product-optional-offers.tsx"),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  {
    exports,
    require(name) {
      if (name.endsWith(".module.css"))
        return { default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (name === "lucide-react") {
        const Icon = () => createElement("svg", { "aria-hidden": true });
        return { Boxes: Icon, Package: Icon, PackagePlus: Icon };
      }
      if (name === "@/components/ui/reveal-image")
        return {
          RevealImage: ({ alt, src }) => createElement("img", { alt, src }),
        };
      return require(name);
    },
  },
);
const {
  ProductOptionalOffers,
  optionalOfferCanBeSelected,
  formatOptionalOfferPrice,
} = exports;

function offer(overrides = {}) {
  return {
    id: "offer-1",
    kind: "complementary",
    revision: 2,
    label: "Optional disk",
    productId: "disk-product",
    variantId: "disk-variant",
    name: "Surveillance disk",
    sku: "WD-12345678901234567890",
    slug: "disk",
    category: "storage",
    imageUrl: null,
    regularPrice: 100,
    unitPrice: 80.25,
    stockQty: 15,
    availabilityUnconfirmed: false,
    pricingMode: "percent",
    ...overrides,
  };
}

function render(offers, overrides = {}) {
  return renderToStaticMarkup(
    createElement(ProductOptionalOffers, {
      offers,
      locale: "en",
      selectedIds: new Set(),
      onToggle() {},
      parentAvailable: true,
      basePrice: 199.9,
      ...overrides,
    }),
  );
}

test("detail options stay absent without configuration and preserve both group orders", () => {
  assert.equal(render([]), "");
  for (const locale of ["he", "en"]) {
    const html = render(
      [offer({ id: "accompanying", kind: "accompanying" }), offer()],
      { locale },
    );
    const complementary =
      locale === "he" ? "מוצרים משלימים" : "Complementary products";
    const accompanying =
      locale === "he" ? "מוצרים נלווים" : "Accompanying products";
    assert.ok(html.indexOf(complementary) < html.indexOf(accompanying));
    assert.equal((html.match(/<fieldset/g) ?? []).length, 2);
    assert.equal((html.match(/type="checkbox"/g) ?? []).length, 2);
    assert.equal((html.match(/checked=""/g) ?? []).length, 0);
    assert.match(html, /WD-12345678901234567890/);
  }
});

test("failed optional-offer reads show a quiet local status instead of stale selections", () => {
  const html = render([offer()], {
    unavailable: true,
    selectedIds: new Set(["offer-1"]),
  });
  assert.match(html, /Additional options are temporarily unavailable/);
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /type="checkbox"/);
});

test("unknown price, unconfirmed stock, zero stock and blocked parent cannot be selected", () => {
  for (const unavailable of [
    { unitPrice: null },
    { unitPrice: 0 },
    { unitPrice: Number.NaN },
    { stockQty: 0 },
    { stockQty: Number.POSITIVE_INFINITY },
    { availabilityUnconfirmed: true },
  ]) {
    const item = offer(unavailable);
    assert.equal(optionalOfferCanBeSelected(item), false);
    assert.match(render([item]), /disabled=""/);
  }
  assert.match(render([offer()], { parentAvailable: false }), /disabled=""/);
  assert.equal(optionalOfferCanBeSelected(offer()), true);
  assert.doesNotMatch(render([offer()]), /disabled=""/);
});

test("selected offer totals retain fractional agorot and regular price only strikes for a discount", () => {
  const html = render([offer(), offer({ id: "offer-2", unitPrice: 0.01 })], {
    selectedIds: new Set(["offer-1", "offer-2"]),
  });
  assert.equal((html.match(/checked=""/g) ?? []).length, 2);
  assert.match(html, /280\.16/);
  assert.match(html, /80\.25/);
  assert.match(html, /0\.01/);
  assert.equal((html.match(/<del>/g) ?? []).length, 2);
  assert.doesNotMatch(render([offer({ unitPrice: 100 })]), /<del>/);
  assert.match(formatOptionalOfferPrice(0.01, "he"), /0\.01/);
});

test("99 chosen options keep deselection enabled and explain the cap for unchecked rows", () => {
  const offers = Array.from({ length: 100 }, (_, index) =>
    offer({ id: `offer-${index}` }),
  );
  const selectedIds = new Set(offers.slice(0, 99).map((item) => item.id));
  const html = render(offers, { selectedIds });
  assert.equal((html.match(/checked=""/g) ?? []).length, 99);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 1);
  assert.match(html, /Choose up to 99 options/);
  assert.match(html, /role="status"/);
});
