import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
const localRequire = createRequire(resolve("package.json"));
function load(file) {
  const exports = {};
  runInNewContext(
    ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      require(name) {
        if (name === "./copy")
          return load("src/components/management/product-editor/copy.ts");
        if (
          name === "../ui" ||
          name === "lucide-react" ||
          name.endsWith(".module.css")
        )
          return {};
        return localRequire(name);
      },
    },
  );
  return exports;
}
const { offerInputHundredths, optionalOfferRows, optionalOfferRowsToDrafts } =
  load("src/components/management/product-editor/optional-offers-section.tsx");
const parent = "11111111-1111-4111-8111-111111111111";
const product = "22222222-2222-4222-8222-222222222222";
const variant = "33333333-3333-4333-8333-333333333333";
const row = (patch = {}) => ({
  key: "draft-1",
  target_product_id: product,
  target_variant_id: variant,
  kind: "complementary",
  label_he: "",
  label_en: "",
  pricing_mode: "catalog",
  discount_input: "",
  fixed_input: "",
  is_active: true,
  ...patch,
});
const plain = (value) => JSON.parse(JSON.stringify(value));

test("editor converts decimal prices/percentages to integer units without accepting exponent or excess precision", () => {
  for (const [input, expected] of [
    ["0.01", 1],
    ["49.90", 4990],
    ["95", 9500],
    ["10.5", 1050],
    [" 1.20 ", 120],
    ["90071992547409.91", Number.MAX_SAFE_INTEGER],
  ])
    assert.equal(offerInputHundredths(input), expected, input);
  for (const input of [
    "",
    "1e2",
    "-1",
    "1.005",
    "NaN",
    "Infinity",
    "1,25",
    "90071992547409.92",
  ])
    assert.equal(offerInputHundredths(input), null, input);
});

test("editor serializes only explicit offer fields, clears irrelevant price modes and scopes ordering to each group", () => {
  const result = plain(
    optionalOfferRowsToDrafts(
      [
        row({
          kind: "accompanying",
          discount_input: "10",
          fixed_input: "49.90",
          target: { name_he: "private picker descriptor" },
        }),
        row({
          key: "draft-2",
          target_variant_id: "44444444-4444-4444-8444-444444444444",
          pricing_mode: "percent",
          discount_input: "0.01",
          label_en: " Label ",
        }),
        row({
          key: "draft-3",
          target_variant_id: "55555555-5555-4555-8555-555555555555",
          pricing_mode: "fixed",
          fixed_input: "49.90",
          id: "66666666-6666-4666-8666-666666666666",
        }),
      ],
      parent,
      "en",
    ),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.offers.map((o) => [
      o.kind,
      o.sort_order,
      o.discount_bps,
      o.fixed_price_agorot,
    ]),
    [
      ["accompanying", 0, null, null],
      ["complementary", 0, 1, null],
      ["complementary", 1, null, 4990],
    ],
  );
  assert.equal(result.offers[1].label_en, "Label");
  assert.equal(result.offers[0].label_he, null);
  assert.equal(result.offers[0].target, undefined);
  assert.equal(result.offers[0].key, undefined);
  assert.equal(result.offers[2].id, "66666666-6666-4666-8666-666666666666");
});

test("editor rejects self-links, duplicate variants across groups, invalid targets and invalid pricing limits", () => {
  const invalid = [
    [row({ target_product_id: parent }), "target"],
    [row({ target_variant_id: "" }), "target"],
    [row({ pricing_mode: "percent", discount_input: "0" }), "pricing"],
    [row({ pricing_mode: "percent", discount_input: "95.01" }), "pricing"],
    [row({ pricing_mode: "fixed", fixed_input: "0" }), "pricing"],
    [row({ pricing_mode: "fixed", fixed_input: "1.001" }), "pricing"],
    [row({ pricing_mode: "fixed", fixed_input: "1000000.01" }), "pricing"],
    [row({ label_he: "א".repeat(161) }), "label"],
  ];
  for (const [entry, field] of invalid) {
    const result = optionalOfferRowsToDrafts([entry], parent, "he");
    assert.equal(result.ok, false);
    assert.equal(result.error.field, field);
  }
  const duplicate = optionalOfferRowsToDrafts(
    [row(), row({ key: "another", kind: "accompanying" })],
    parent,
    "en",
  );
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error.rowKey, "another");
});

test("saved fixed-price text preserves exact agorot and valid configured amounts round-trip in group order", () => {
  const saved = {
    id: "66666666-6666-4666-8666-666666666666",
    target_product_id: product,
    target_variant_id: variant,
    kind: "complementary",
    label_he: null,
    label_en: null,
    pricing_mode: "fixed",
    discount_bps: null,
    fixed_price_agorot: Number.MAX_SAFE_INTEGER,
    is_active: true,
    sort_order: 5,
  };
  const rows = optionalOfferRows([saved]);
  assert.equal(rows[0].fixed_input, "90071992547409.91");
  const result = optionalOfferRowsToDrafts(rows, parent, "en");
  assert.equal(result.ok, false);
  const valid = optionalOfferRowsToDrafts(
    optionalOfferRows([{ ...saved, fixed_price_agorot: 100_000_000 }]),
    parent,
    "en",
  );
  assert.equal(valid.ok, true);
  assert.equal(valid.offers[0].fixed_price_agorot, 100_000_000);
  const ordered = optionalOfferRows([
    { ...saved, id: "later", kind: "accompanying", sort_order: 0 },
    { ...saved, id: "second", sort_order: 2 },
    { ...saved, id: "first", sort_order: 1 },
  ]);
  assert.deepEqual(plain(ordered.map((r) => r.key)), [
    "first",
    "second",
    "later",
  ]);
});
