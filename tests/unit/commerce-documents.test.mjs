import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = resolve(dirname(new URL(import.meta.url).pathname), "../..");
const nodeRequire = createRequire(import.meta.url);
const cache = new Map();
async function loadTs(name) {
  if (cache.has(name)) return cache.get(name);
  const path = resolve(root, `src/lib/commerce/documents/${name}.ts`);
  const source = await readFile(path, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  cache.set(name, exports);
  const localRequire = (specifier) =>
    specifier === "server-only"
      ? {}
      : specifier.startsWith("./")
        ? cache.get(specifier.slice(2))
        : nodeRequire(specifier);
  runInNewContext(output, {
    exports,
    require: localRequire,
    process,
    Buffer,
    URL,
    TextDecoder,
    console,
    setTimeout,
    clearTimeout,
  });
  return exports;
}
const snapshot = await loadTs("snapshot");
const renderer = await loadTs("renderer");
const sample = {
  schema_version: 1,
  id: "draft-preview-001",
  type: "proforma",
  state: "draft",
  created_at: "2026-10-06T09:00:00.000Z",
  identity_snapshot: {
    legal_name: "MIRO דוגמה בע״מ",
    trade_name: "MIRO בדיקה",
    entity_kind: "company",
    registration_number: "EXAMPLE-REG-01",
    vat_number: "EXAMPLE-VAT-01",
    address: {
      street: "רחוב לדוגמה 12",
      city: "תל אביב",
      postal_code: "0000000",
      country: "ישראל",
    },
    phone: "050-0000000",
    email: "example.invalid",
    document_language: "he",
  },
  customer_snapshot: {
    name: "לקוח לדוגמה",
    company_name: "חברת בדיקה",
    registration_number: "EXAMPLE-CUSTOMER-REG",
    address: {
      street: "רחוב ארוך מאוד 123, בניין מערבי",
      city: "חיפה",
      postal_code: "0000000",
      country: "ישראל",
    },
    email: "customer@example.invalid",
  },
  items: [
    {
      description:
        "מצלמת אבטחה חיצונית עם שם מוצר ארוך לצורך בדיקת גלישת שורה ופריסת טבלה בעברית",
      quantity: 2,
      unit_agorot: 12500,
      net_agorot: 25000,
      vat_agorot: 4250,
      gross_agorot: 29250,
    },
    {
      description: "Mixed English / עברית מוצר",
      quantity: 1,
      unit_agorot: 9999,
      net_agorot: 9999,
      vat_agorot: 1700,
      gross_agorot: 11699,
    },
  ],
  currency: "ILS",
  net_agorot: 34999,
  vat_agorot: 5950,
  total_agorot: 40949,
  payment_references: [],
  note: "מסמך טיוטה בלבד - לא להנפיק. English note with Hebrew.",
};

test("normalizes canonical snapshot immutably and hashes it deterministically", () => {
  const a = snapshot.validateDocumentSnapshot(sample);
  const b = snapshot.validateDocumentSnapshot(structuredClone(sample));
  assert.equal(a.canonicalHash, b.canonicalHash);
  assert.equal(Object.isFrozen(a.document), true);
  assert.equal(Object.isFrozen(a.document.items), true);
  assert.equal(a.document.type, "proforma");
});

test("orders Hebrew visual word runs right-to-left while keeping embedded English runs intact", () => {
  const watermark = renderer.bidiVisualTokens("טיוטה - לא מסמך מס", "he");
  assert.equal(watermark.at(-1), "טיוטה");
  assert.deepEqual(Array.from(watermark.filter((token) => token.trim())), [
    "מס",
    "מסמך",
    "לא",
    "-",
    "טיוטה",
  ]);
  const title = renderer.bidiVisualTokens("חשבונית עסקה / פרופורמה", "he");
  assert.equal(title.at(-1), "חשבונית");
  const mixed = renderer.bidiVisualTokens("Mixed English / עברית מוצר", "he");
  assert.deepEqual(Array.from(mixed.filter((token) => token.trim())), [
    "מוצר",
    "עברית",
    "/",
    "Mixed",
    "English",
  ]);
});

test("rejects totals mismatch, fiscal type without entity, and receipts without payments", () => {
  assert.throws(
    () => snapshot.validateDocumentSnapshot({ ...sample, total_agorot: 40950 }),
    /totals must exactly match/,
  );
  assert.throws(
    () =>
      snapshot.validateDocumentSnapshot({
        ...sample,
        type: "invoice_receipt",
        identity_snapshot: {
          ...sample.identity_snapshot,
          entity_kind: "unknown",
        },
      }),
    /confirmed registered/,
  );
  assert.throws(
    () => snapshot.validateDocumentSnapshot({ ...sample, type: "receipt" }),
    /at least one recorded payment/,
  );
});

test("draft renderer produces A4 and receipt PDFs with accessible logical Hebrew and exact amounts", async () => {
  const out = process.env.COMMERCE_PDF_OUTPUT_DIR;
  if (out) await mkdir(out, { recursive: true });
  for (const layout of ["a4", "receipt80"]) {
    const rendered = await renderer.renderDraftDocument(sample, layout);
    assert.equal(rendered.watermark, "DRAFT");
    assert.equal(rendered.layout, layout);
    assert.ok(rendered.pdfBytes.length > 2000);
    assert.equal(
      Buffer.from(rendered.pdfBytes).subarray(0, 5).toString(),
      "%PDF-",
    );
    assert.ok(rendered.accessibleHtml.includes("מצלמת אבטחה חיצונית"));
    assert.ok(rendered.accessibleHtml.includes("ILS 409.49"));
    assert.ok(rendered.accessibleHtml.includes('dir="rtl"'));
    assert.ok(rendered.accessibleHtml.includes("MIRO בדיקה"));
    assert.ok(rendered.accessibleHtml.includes("MIRO דוגמה בע״מ"));
    assert.ok(rendered.accessibleHtml.includes("EXAMPLE-CUSTOMER-REG"));
    assert.ok(
      rendered.accessibleHtml.includes(
        "Business registration: EXAMPLE-CUSTOMER-REG",
      ) ||
        rendered.accessibleHtml.includes("עוסק / חברה: EXAMPLE-CUSTOMER-REG"),
    );
    for (const identityPart of [
      "MIRO בדיקה",
      "EXAMPLE-REG-01",
      "EXAMPLE-VAT-01",
      "רחוב לדוגמה 12",
      "050-0000000",
      "example.invalid",
    ]) {
      assert.ok(rendered.accessibleHtml.includes(identityPart));
    }
    if (out) await writeFile(resolve(out, `${layout}.pdf`), rendered.pdfBytes);
  }
});

test("renders long English multi-page previews with complete identity on A4 and receipt layouts", async () => {
  const out = process.env.COMMERCE_PDF_OUTPUT_DIR;
  const items = Array.from({ length: 52 }, (_, index) => ({
    description: `Long catalog item ${index + 1}: outdoor security camera with extended bilingual model description for pagination review`,
    quantity: 1,
    unit_agorot: 10000,
    net_agorot: 10000,
    vat_agorot: 1700,
    gross_agorot: 11700,
  }));
  const english = {
    ...sample,
    id: "draft-multipage-en-001",
    type: "receipt",
    identity_snapshot: { ...sample.identity_snapshot, document_language: "en" },
    customer_snapshot: { name: "Sample customer" },
    items,
    net_agorot: 520000,
    vat_agorot: 88400,
    total_agorot: 608400,
    payment_references: [
      { method: "manual", amount_agorot: 608400, reference: "EXAMPLE-PAY-01" },
    ],
  };
  if (out) await mkdir(out, { recursive: true });
  for (const layout of ["a4", "receipt80"]) {
    const rendered = await renderer.renderDraftDocument(english, layout);
    assert.ok(rendered.pdfBytes.length > 5000);
    for (const part of [
      "MIRO בדיקה",
      "EXAMPLE-REG-01",
      "EXAMPLE-VAT-01",
      "רחוב לדוגמה 12",
      "050-0000000",
      "example.invalid",
    ]) {
      assert.ok(rendered.accessibleHtml.includes(part));
    }
    if (out)
      await writeFile(resolve(out, `long-en-${layout}.pdf`), rendered.pdfBytes);
  }
});

test("issued and voided documents are never regenerated", async () => {
  for (const state of ["issued", "voided"]) {
    await assert.rejects(
      renderer.renderDraftDocument(
        {
          ...sample,
          state,
          number: "DRAFT-NUMBER",
          issued_at: "2026-10-06T10:00:00Z",
        },
        "a4",
      ),
      /immutable/,
    );
  }
});
