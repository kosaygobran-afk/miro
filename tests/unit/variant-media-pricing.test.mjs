import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
function load(file) {
  const exports = {};
  runInNewContext(
    ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { exports },
  );
  return exports;
}
const { getVariantImages } = load("src/lib/catalog/variant-media.ts");
const { resolvePrice } = load("src/lib/catalog/pricing.ts");
const variants = [
  { id: "a", price: 100, stockQty: 0, isDefault: true },
  { id: "b", price: 250, stockQty: 8 },
  { id: "c", price: null, stockQty: 0 },
];
const input = {
  variants,
  selectedVariantId: null,
  defaultVariantId: "a",
  basePrice: 70,
  roleOverride: null,
  variantOverride: null,
};
test("gallery includes every selected image plus general images and excludes siblings", () => {
  const images = [
    { id: "g", sortOrder: 0 },
    { id: "a2", sortOrder: 3, variantId: "a" },
    { id: "b1", sortOrder: 1, variantId: "b" },
    { id: "a1", sortOrder: 2, variantId: "a" },
  ];
  assert.equal(
    getVariantImages(images, "a")
      .map((i) => i.id)
      .join(),
    "a1,a2,g",
  );
  assert.equal(
    getVariantImages(images, "b")
      .map((i) => i.id)
      .join(),
    "b1,g",
  );
  assert.equal(
    getVariantImages(images, "c")
      .map((i) => i.id)
      .join(),
    "g",
  );
  assert.equal(
    getVariantImages(images, null)
      .map((i) => i.id)
      .join(),
    "g",
  );
  assert.equal(images[0].id, "g");
  assert.equal(getVariantImages(images.slice(1), "c").length, 0);
});
test("variant override is consistent for guests and every role fallback", () => {
  for (const roleOverride of [null, 90, 85, 80, 75]) {
    const result = resolvePrice({
      ...input,
      selectedVariantId: "b",
      roleOverride,
    });
    assert.equal(result.effectivePrice, 250);
    assert.equal(result.pricingVariant.id, "b");
    assert.equal(result.hasRoleOverride, false);
  }
});
test("unpriced selected variant inherits its role/base, never its sibling", () => {
  assert.equal(
    resolvePrice({ ...input, selectedVariantId: "c" }).effectivePrice,
    70,
  );
  assert.equal(
    resolvePrice({ ...input, selectedVariantId: "c", roleOverride: 85 })
      .effectivePrice,
    85,
  );
  assert.equal(
    resolvePrice({ ...input, selectedVariantId: "c", basePrice: null })
      .effectivePrice,
    null,
  );
  assert.equal(resolvePrice(input).effectivePrice, 100);
});
test("promotion uses the selected variant price, including zero stock", () => {
  const publicPromotion = { type: "percent", value: 10, compareAtPrice: null };
  assert.equal(
    resolvePrice({ ...input, selectedVariantId: "a", publicPromotion })
      .effectivePrice,
    90,
  );
  assert.equal(
    resolvePrice({ ...input, selectedVariantId: "b", publicPromotion })
      .effectivePrice,
    225,
  );
});
