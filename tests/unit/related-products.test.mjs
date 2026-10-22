import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const compile = (path, imports = {}) => {
  const exports = {};
  runInNewContext(
    ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { exports, require: (name) => imports[name] },
  );
  return exports;
};
const pricing = compile("../../src/lib/catalog/pricing.ts");
const { getRelatedProducts } = compile(
  "../../src/lib/catalog/related-products.ts",
  { "./pricing": pricing },
);
const product = (id, overrides = {}) => ({
  id,
  category: "cameras",
  subcategoryId: "outdoor",
  stockState: "in_stock",
  stockQty: 0,
  outOfStockPolicy: "keep_visible_contact",
  ...overrides,
});
test("related selection ranks same child, fills from root and preserves input and current price projection", () => {
  const current = product("current");
  const root = product("root", { subcategoryId: "indoor", priceIls: null });
  const sibling = product("sibling", { priceIls: 123, rolePrice: 123 });
  const input = [
    current,
    root,
    sibling,
    product("other", { category: "alarms" }),
    sibling,
  ];
  const original = [...input];
  const result = getRelatedProducts(current, input);
  assert.deepEqual(
    Array.from(result, (p) => p.id),
    ["sibling", "root"],
  );
  assert.equal(result[0], sibling);
  assert.equal(result[1].priceIls, null);
  assert.deepEqual(input, original);
});
test("hidden stock is excluded, visible enquiry-only items remain, cap follows ranking", () => {
  const current = product("current");
  const input = [
    product("root", { subcategoryId: undefined }),
    product("hidden", {
      stockState: "out",
      outOfStockPolicy: "hide_from_public",
    }),
    product("quote", { stockState: "out", priceIls: null }),
  ];
  assert.deepEqual(
    Array.from(getRelatedProducts(current, input, 1), (p) => p.id),
    ["quote"],
  );
  assert.equal(getRelatedProducts(current, input, 0).length, 0);
  assert.equal(getRelatedProducts(current, [current]).length, 0);
});
test("a product with no child keeps root catalog ordering", () => {
  assert.deepEqual(
    Array.from(
      getRelatedProducts(product("current", { subcategoryId: undefined }), [
        product("a"),
        product("b"),
      ]),
      (p) => p.id,
    ),
    ["a", "b"],
  );
});
