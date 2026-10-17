import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

const exports = {};
runInNewContext(
  ts.transpileModule(
    await readFile(
      new URL(
        "../../src/features/catalog/product-identifiers.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText,
  {
    exports,
    require(name) {
      assert.equal(name, "react/jsx-runtime");
      return jsx;
    },
  },
);
const render = (props) =>
  renderToStaticMarkup(
    createElement(exports.ProductIdentifiers, { locale: "en", ...props }),
  );

test("identifiers retain distinct semantic labels, exact codes and LTR digit order in both locales", () => {
  for (const locale of ["he", "en"]) {
    const html = render({
      locale,
      sku: "0005586793",
      barcode: "0001234567890",
      model: "CAM-1",
    });
    assert.match(html, /^<dl /);
    assert.equal((html.match(/<dt /g) ?? []).length, 3);
    assert.equal((html.match(/<dd /g) ?? []).length, 3);
    assert.match(html, /dir="ltr">0005586793<\/dd>/);
    assert.match(html, /dir="ltr">0001234567890<\/dd>/);
    assert.ok(html.includes(locale === "he" ? "ברקוד" : "Barcode"));
  }
});

test("MIRO reference barcodes are identified as internal catalog codes, without GTIN claims", () => {
  for (const locale of ["he", "en"]) {
    const html = render({ locale, barcode: "MIRO-REF-CAMERA-001" });
    assert.ok(
      html.includes(
        locale === "he" ? "קוד קטלוג פנימי" : "Internal catalog code",
      ),
    );
    assert.ok(!html.includes("GTIN"));
    assert.ok(!html.includes("Barcode"));
  }
});

test("missing values produce no invented codes or empty identifier rows", () => {
  assert.equal(render({ sku: " ", barcode: null, model: "" }), "");
  const html = render({ sku: "5586793", barcode: "", compact: true });
  assert.equal((html.match(/<dt /g) ?? []).length, 1);
  assert.match(html, /product-identifiers--compact/);
  assert.ok(!html.includes("Barcode"));
});

test("unselected identifiers prefer the same available/default variant as the catalog", () => {
  const choose = exports.getProductIdentifierVariant;
  const first = { sku: "FIRST", stockQty: 0 };
  const fallback = { sku: "DEFAULT", stockQty: 0, isDefault: true };
  const available = { sku: "AVAILABLE", stockQty: 2 };
  const defaultAvailable = {
    sku: "DEFAULT-AVAILABLE",
    stockQty: 1,
    isDefault: true,
  };
  assert.equal(
    choose([first, fallback, available, defaultAvailable]),
    defaultAvailable,
  );
  assert.equal(choose([first, fallback, available]), available);
  assert.equal(choose([first, fallback]), fallback);
  assert.equal(choose([first]), first);
  assert.equal(choose([]), null);
});
