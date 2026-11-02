import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = resolve(dirname(new URL(import.meta.url).pathname), "../..");
const nodeRequire = createRequire(import.meta.url);
const cache = new Map();
function loadTs(name) {
  if (cache.has(name)) return cache.get(name);
  const path = resolve(root, `src/lib/commerce/documents/${name}.ts`);
  const source = readFileSync(path, "utf8");
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
      : specifier === "@/components/brand/artwork.json"
        ? nodeRequire(resolve(root, "src/components/brand/artwork.json"))
        : specifier.startsWith("./")
          ? loadTs(specifier.slice(2))
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
await loadTs("paper-artwork");
await loadTs("format");
const samples = await loadTs("sample");
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
  assert.equal(renderer.bidiVisualTokens("(שחור)", "he").join(""), ")שחור(");
  assert.equal(renderer.bidiVisualTokens("IPC-42", "he").join(""), "IPC-42");
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
    assert.match(rendered.accessibleHtml, /<dt>עוסק \/ חברה<\/dt>/);
    assert.match(
      rendered.accessibleHtml,
      /<bdi dir="ltr">EXAMPLE-CUSTOMER-REG<\/bdi>/,
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

test("date and full clock use Israel time, with the correct winter and summer offsets", () => {
  for (const language of ["he", "en"]) {
    const winter = renderer.formatDocumentTimestamp(
      "2026-11-02T14:51:20.000Z",
      language,
    );
    assert.equal(winter.date, language === "he" ? "02.11.2026" : "02/11/2026");
    assert.equal(winter.time, "16:51:20 (UTC+02:00)");
    assert.equal(
      renderer.formatDocumentTimestamp("2026-07-02T21:51:20Z", language).time,
      "00:51:20 (UTC+03:00)",
    );
  }
});

test("every document choice renders both directions and paper sizes with isolated values and fixed vector artwork", async () => {
  const types = [
    "quote",
    "proforma",
    "transaction_invoice",
    "tax_invoice",
    "receipt",
    "invoice_receipt",
    "credit_note",
    "correction",
  ];
  const out = process.env.COMMERCE_PDF_OUTPUT_DIR;
  if (out) await mkdir(out, { recursive: true });
  for (const type of types)
    for (const language of ["he", "en"])
      for (const layout of ["a4", "receipt80"]) {
        const input = samples.createDocumentSample(
          type,
          language,
          "2026-11-02T14:51:20.000Z",
        );
        const before = JSON.stringify(input);
        const result = await renderer.renderDraftDocument(input, layout);
        const html = result.accessibleHtml;
        assert.equal(JSON.stringify(input), before);
        assert.equal(input.number, undefined);
        assert.match(html, new RegExp(`data-layout="${layout}"`));
        assert.match(
          html,
          new RegExp(`dir="${language === "he" ? "rtl" : "ltr"}"`),
        );
        assert.match(html, /<svg class="paper-brand"/);
        assert.match(html, /class="masthead"/);
        assert.match(html, /class="business-identity"/);
        assert.match(html, /class="brand-position"/);
        assert.match(html, /class="detail-grid(?:\s|")/);
        assert.match(html, /data-reading-anchor="start"/);
        assert.match(html, /<g fill="#17202a"><path/);
        assert.doesNotMatch(html, /<image|<script|https?:\/\/(?!www.w3.org)/);
        assert.match(html, /<bdi dir="ltr">\+972-00-000-0000<\/bdi>/);
        assert.match(html, /16:51:20 \(UTC\+02:00\)/);
        assert.match(html, /<bdi dir="ltr">ILS 10.00<\/bdi>/);
        assert.match(html, /ILS 401.20/);
        assert.ok(result.pdfBytes.length > 4000);
        assert.equal(renderer.renderDraftHtml(input, layout), html);
        if (out) {
          await writeFile(
            resolve(out, `${type}-${language}-${layout}.pdf`),
            result.pdfBytes,
          );
          await writeFile(
            resolve(out, `${type}-${language}-${layout}.html`),
            html,
          );
        }
      }
});

test("escaped dynamic text stays text and long descriptions and notes paginate without changing financial totals", async () => {
  const input = samples.createDocumentSample(
    "quote",
    "he",
    "2026-11-02T14:51:20Z",
  );
  input.customer_snapshot.name = '<script>alert("sample")</script> & לקוח';
  input.items[0].description =
    "SKU-123 עברית long description ".repeat(55) + " END-OF-DESCRIPTION";
  input.note =
    "Long note / הערה ארוכה 1234567890 ".repeat(100) + " END-OF-NOTE";
  input.identity_snapshot.address.street = "רחוב ארוך מאוד ".repeat(10);
  const out = process.env.COMMERCE_PDF_OUTPUT_DIR;
  for (const layout of ["a4", "receipt80"]) {
    const result = await renderer.renderDraftDocument(input, layout);
    assert.match(result.accessibleHtml, /&lt;script&gt;/);
    assert.doesNotMatch(result.accessibleHtml, /<script>/);
    assert.match(result.accessibleHtml, /ILS 401.20/);
    if (out)
      await writeFile(resolve(out, `stress-he-${layout}.pdf`), result.pdfBytes);
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

test("maximum-length identities and large immutable amounts remain complete on both paper sizes", async () => {
  const out = process.env.COMMERCE_PDF_OUTPUT_DIR;
  if (out) await mkdir(out, { recursive: true });
  const expectations = {};
  // Use the snapshot's real limits. End markers reveal dropped continuation text
  // in the actual PDF, including a long unbroken email rather than only prose.
  const long = (prefix, length, marker) =>
    `${prefix.repeat(Math.ceil(length / prefix.length)).slice(0, length - marker.length - 1)} ${marker}`;
  const email = (marker) =>
    `${"a".repeat(254 - marker.length - "@example.invalid".length)}${marker}@example.invalid`;
  for (const language of ["he", "en"]) {
    const input = samples.createDocumentSample(
      "receipt",
      language,
      "2026-11-02T14:51:20Z",
    );
    const words =
      language === "he"
        ? "שם עסק ארוך עם English מידע "
        : "Extended premium business identity ";
    input.identity_snapshot = {
      ...input.identity_snapshot,
      legal_name: long(words, 200, "LEGALEND42"),
      trade_name: long(words, 200, "TRADEEND42"),
      registration_number: long("REG0123456789", 50, "BIZREGEND42"),
      vat_number: long("VAT0123456789", 50, "BIZVATEND42"),
      address: {
        street: long(words, 300, "BIZSTREETEND42"),
        city: long(words, 100, "BIZCITYEND42"),
        postal_code: long("1234567890", 30, "BIZPOSTEND42"),
        country: long(words, 80, "BIZCOUNTRYEND42"),
      },
      phone: long("+9720123456789", 60, "BIZPHONEEND42"),
      email: email("BIZEMAILEND42"),
    };
    input.customer_snapshot = {
      name: long(words, 200, "CUSTOMEREND42"),
      company_name: long(words, 200, "COMPANYEND42"),
      registration_number: long("CUSTOMER0123456789", 50, "CUSTOMERREGEND42"),
      address: {
        street: long(words, 300, "CUSTSTREETEND42"),
        city: long(words, 100, "CUSTCITYEND42"),
        postal_code: long("1234567890", 30, "CUSTPOSTEND42"),
        country: long(words, 80, "CUSTCOUNTRYEND42"),
      },
      phone: long("+9720123456789", 60, "CUSTPHONEEND42"),
      email: email("CUSTEMAILEND42"),
    };
    input.items = [
      {
        description:
          "Maximum supported monetary magnitude / סכום גבוה ITEMEND42",
        quantity: 100000,
        unit_agorot: 8000000,
        discount_agorot: 0,
        net_agorot: 800000000000,
        vat_agorot: 144000000000,
        gross_agorot: 944000000000,
      },
    ];
    input.net_agorot = 800000000000;
    input.vat_agorot = 144000000000;
    input.total_agorot = 944000000000;
    input.payment_references = [
      {
        method: "manual",
        amount_agorot: input.total_agorot,
        reference: "PAYMENTEND42",
        collected_at: input.created_at,
      },
    ];
    input.note = "Complete maximum-field fixture NOTEEND42";
    const before = JSON.stringify(input);
    const required = [
      "LEGALEND42",
      "TRADEEND42",
      "BIZREGEND42",
      "BIZVATEND42",
      "BIZSTREETEND42",
      "BIZCITYEND42",
      "BIZPOSTEND42",
      "BIZCOUNTRYEND42",
      "BIZPHONEEND42",
      "BIZEMAILEND42",
      "CUSTOMEREND42",
      "COMPANYEND42",
      "CUSTOMERREGEND42",
      "CUSTSTREETEND42",
      "CUSTCITYEND42",
      "CUSTPOSTEND42",
      "CUSTCOUNTRYEND42",
      "CUSTPHONEEND42",
      "CUSTEMAILEND42",
      "ITEMEND42",
      "PAYMENTEND42",
      "NOTEEND42",
      "ILS 9,440,000,000.00",
      "ILS 80,000.00",
    ];
    for (const layout of ["a4", "receipt80"]) {
      const result = await renderer.renderDraftDocument(input, layout);
      assert.equal(
        JSON.stringify(input),
        before,
        "layout changed financial/source input",
      );
      for (const text of required)
        assert.ok(
          result.accessibleHtml.includes(text),
          `${language}/${layout}: missing ${text}`,
        );
      const stem = `maximum-${language}-${layout}`;
      expectations[`${stem}.pdf`] = required;
      if (out) {
        await writeFile(resolve(out, `${stem}.pdf`), result.pdfBytes);
        await writeFile(resolve(out, `${stem}.html`), result.accessibleHtml);
      }
    }
  }
  if (out)
    await writeFile(
      resolve(out, "pdf-content-expectations.json"),
      JSON.stringify(expectations, null, 2),
    );
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
