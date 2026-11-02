import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { z } from "zod";
import { createHash } from "node:crypto";

async function moduleAt(path, imports) {
  const exports = {};
  runInNewContext(
    ts.transpileModule(await readFile(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      Response,
      URL,
      Buffer,
      require: (name) => {
        assert.ok(name in imports, `Unexpected dependency: ${name}`);
        return imports[name];
      },
    },
  );
  return exports;
}
class CommerceError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
const options = await moduleAt("src/lib/commerce/documents/options.ts", {});
const samples = await moduleAt("src/lib/commerce/documents/sample.ts", {
  "server-only": {},
});
const currentIdentity = await moduleAt(
  "src/lib/commerce/documents/preview-identity.ts",
  {
    "server-only": {},
    zod: { z },
    "../http": {
      CommerceError,
      checkRpcError(error) {
        if (error) throw new CommerceError("commerce_unavailable", 503);
      },
    },
  },
);
const headers = await moduleAt(
  "src/lib/commerce/documents/preview-response.ts",
  { "server-only": {} },
);
const id = "11111111-1111-4111-8111-111111111111";
async function load({
  sample = true,
  denied = null,
  settings = null,
  rpcError = null,
} = {}) {
  const calls = [];
  const settingsCalls = [];
  const render = (kind, ...args) => {
    calls.push({ kind, args });
    return kind === "html"
      ? "<!doctype html>fixture"
      : { pdfBytes: new Uint8Array([37, 80, 68, 70, 45]) };
  };
  const route = await moduleAt(
    `src/app/api/management/commerce/documents/${sample ? "sample" : "[id]/preview"}/route.ts`,
    {
      zod: { z },
      "@/lib/commerce/http": {
        CommerceError,
        requireCommerceActor: async (_request, capability) => {
          assert.equal(capability, "viewCommerce");
          if (denied)
            throw new CommerceError(
              denied === 429 ? "rate_limited" : "forbidden",
              denied,
            );
          return {
            client: {
              rpc: async (name, args) => {
                settingsCalls.push({ name, args });
                return {
                  data: typeof settings === "function" ? settings() : settings,
                  error: rpcError,
                };
              },
            },
          };
        },
        commerceFailure: (error) =>
          Response.json({ error: error.code }, { status: error.status }),
      },
      "@/lib/commerce/documents/options": options,
      "@/lib/commerce/documents/sample": samples,
      "@/lib/commerce/documents/preview-response": headers,
      "@/lib/commerce/documents/preview-identity": currentIdentity,
      "@/lib/commerce/documents/renderer": {
        renderDraftHtml: (...args) => render("html", ...args),
        renderDraftDocument: (...args) => render("pdf", ...args),
      },
      "@/lib/commerce/document-service": {
        renderStoredDraftHtml: (...args) => render("html", ...args),
        renderStoredDraft: (...args) => render("pdf", ...args),
      },
    },
  );
  return {
    calls,
    settingsCalls,
    get: (query) =>
      route.GET(new Request(`https://miro.example/api?${query}`), {
        params: Promise.resolve({ id }),
      }),
  };
}

test("all eight sample choices use read-only draft rendering in both languages, paper sizes and output formats", async () => {
  for (const type of options.DOCUMENT_PREVIEW_TYPES)
    for (const language of ["he", "en"])
      for (const layout of ["a4", "receipt80"])
        for (const format of ["html", "pdf"]) {
          const route = await load();
          const response = await route.get(
            new URLSearchParams({ type, language, layout, format }),
          );
          assert.equal(response.status, 200);
          assert.equal(
            response.headers.get("cache-control"),
            "private, no-store",
          );
          assert.equal(response.headers.get("x-document-sample"), "true");
          assert.equal(response.headers.get("x-document-identity"), "sample");
          assert.equal(route.settingsCalls.length, 0);
          assert.equal(response.headers.get("x-document-state"), "draft");
          assert.match(
            response.headers.get("content-security-policy"),
            /frame-ancestors 'none'/,
          );
          assert.equal(route.calls.length, 1);
          assert.equal(route.calls[0].kind, format);
          const [snapshot, paper] = route.calls[0].args;
          assert.equal(snapshot.state, "draft");
          assert.equal(snapshot.number, undefined);
          assert.equal(snapshot.allocation_number, undefined);
          assert.equal(snapshot.type, type);
          assert.equal(snapshot.identity_snapshot.document_language, language);
          assert.equal(paper, layout);
          if (format === "pdf")
            assert.match(
              response.headers.get("content-disposition"),
              /^attachment; filename="MIRO-SAMPLE-/,
            );
        }
});

test("sample and stored preview authorization precedes validation, rendering and business reads", async () => {
  for (const sample of [true, false])
    for (const denied of [401, 403, 429]) {
      const route = await load({ sample, denied });
      assert.equal(
        (await route.get("type=invalid&language=invalid")).status,
        denied,
      );
      assert.equal(route.calls.length, 0);
      assert.equal(route.settingsCalls.length, 0);
      assert.equal(
        (await route.get("type=quote&language=en&source=business")).status,
        denied,
      );
      assert.equal(route.settingsCalls.length, 0);
    }
});

test("sample query rejects unsupported types, languages, layouts and injected business/numbering fields", async () => {
  for (const query of [
    "",
    "type=issued&language=en",
    "type=receipt&language=fr",
    "type=receipt&language=en&layout=A3",
    "type=quote&language=en&number=123",
    "type=quote&language=en&customer=private",
    "type=quote&language=en&format=svg",
    "type=quote&language=en&source=private",
  ]) {
    const route = await load();
    assert.equal((await route.get(query)).status, 400, query);
    assert.equal(route.calls.length, 0);
    assert.equal(route.settingsCalls.length, 0);
  }
});

test("current-business previews read the latest authorized identity on each opening and leave earlier snapshots unchanged", async () => {
  const original = samples.createDocumentSample(
    "quote",
    "he",
  ).identity_snapshot;
  const settings = {
    rows: [
      {
        identity: {
          ...original,
          legal_name: "Current business v1",
          secret: "never-render",
          address: { ...original.address, secret: "never-render" },
        },
      },
    ],
  };
  const before = JSON.stringify(settings);
  const route = await load({ settings: () => settings });
  assert.equal(
    (await route.get("type=quote&language=en&source=business")).status,
    200,
  );
  const first = route.calls[0].args[0];
  assert.equal(first.identity_snapshot.legal_name, "Current business v1");
  assert.equal(first.identity_snapshot.document_language, "en");
  assert.equal(first.identity_snapshot.secret, undefined);
  assert.equal(first.identity_snapshot.address.secret, undefined);
  assert.equal(JSON.stringify(settings), before);
  assert.match(first.note, /fictional customer, items and payments/);
  assert.equal(first.number, undefined);
  settings.rows[0].identity.legal_name = "Current business v2";
  settings.rows[0].identity.phone = "+972-00-000-0002";
  const updated = await route.get(
    "type=quote&language=he&source=business&format=pdf",
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.headers.get("x-document-identity"), "business");
  assert.equal(updated.headers.get("cache-control"), "private, no-store");
  assert.equal(
    route.calls[1].args[0].identity_snapshot.legal_name,
    "Current business v2",
  );
  assert.equal(
    route.calls[1].args[0].identity_snapshot.phone,
    "+972-00-000-0002",
  );
  assert.equal(first.identity_snapshot.legal_name, "Current business v1");
  assert.equal(original.legal_name, "עסק לדוגמה בלבד בע״מ");
  assert.equal(route.settingsCalls.length, 2);
  for (const call of route.settingsCalls) {
    assert.equal(call.name, "commerce_read");
    assert.equal(call.args.p_section, "settings");
    assert.equal(Object.keys(call.args.p_filters).length, 0);
  }
});

test("a valid saved 300-character street update previews in full while earlier canonical snapshots stay unchanged", async () => {
  const money = await moduleAt("src/lib/commerce/money.ts", {});
  const { commerceActionSchemas } = await moduleAt(
    "src/lib/commerce/validation.ts",
    { zod: { z }, "./money": money },
  );
  const { validateDocumentSnapshot } = await moduleAt(
    "src/lib/commerce/documents/snapshot.ts",
    { "server-only": {}, "node:crypto": { createHash } },
  );
  const originalStreet = "Original saved business address";
  const updatedStreet =
    "רחוב לדוגמה Example Street ".repeat(20).slice(0, 296) + " END";
  assert.equal(updatedStreet.length, 300);
  // Exercise the actual save schema and the largest supported printable fields.
  // Business names also fit the existing database's narrower 160-character cap.
  const saved = commerceActionSchemas.settings_save.parse({
    expected_revision: 0,
    patch: {
      legal_name: "B".repeat(160),
      trade_name: "T".repeat(160),
      entity_kind: "company",
      registration_number: "R".repeat(30),
      vat_number: "V".repeat(30),
      address: {
        street: originalStreet,
        city: "C".repeat(100),
        postal_code: "0".repeat(20),
        country: "IL",
      },
      phone: "0".repeat(30),
      email: `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(57)}.com`,
      document_language: "en",
      prices_include_vat: true,
      document_policy_version: "preview-test-only",
    },
  });
  assert.equal(saved.patch.email.length, 254);
  const settings = { rows: [{ identity: saved.patch }] };
  const route = await load({ settings: () => settings });
  assert.equal(
    (await route.get("type=quote&language=en&source=business")).status,
    200,
  );
  const earlier = validateDocumentSnapshot(route.calls[0].args[0]);
  const earlierHash = earlier.canonicalHash;
  const update = commerceActionSchemas.settings_save.parse({
    expected_revision: 1,
    patch: { address: { ...saved.patch.address, street: updatedStreet } },
  });
  settings.rows[0].identity = { ...saved.patch, ...update.patch };
  for (const language of ["he", "en"])
    for (const format of ["html", "pdf"]) {
      const response = await route.get(
        new URLSearchParams({
          type: "quote",
          source: "business",
          language,
          format,
        }),
      );
      assert.equal(response.status, 200);
      const preview = validateDocumentSnapshot(route.calls.at(-1).args[0]);
      assert.equal(
        preview.document.identity_snapshot.address.street,
        updatedStreet,
      );
      assert.equal(preview.document.identity_snapshot.email, saved.patch.email);
      assert.equal(
        preview.document.identity_snapshot.document_language,
        language,
      );
      assert.equal(
        preview.document.total_agorot,
        earlier.document.total_agorot,
      );
      assert.equal(preview.document.number, undefined);
    }
  assert.equal(
    earlier.document.identity_snapshot.address.street,
    originalStreet,
  );
  assert.equal(
    validateDocumentSnapshot(earlier.document).canonicalHash,
    earlierHash,
  );
  assert.ok(Object.isFrozen(earlier.document.identity_snapshot.address));

  const invalidStreet = updatedStreet + "X";
  assert.equal(
    commerceActionSchemas.settings_save.safeParse({
      expected_revision: 2,
      patch: { address: { ...saved.patch.address, street: invalidStreet } },
    }).success,
    false,
  );
  assert.throws(
    () =>
      validateDocumentSnapshot({
        ...earlier.document,
        identity_snapshot: {
          ...earlier.document.identity_snapshot,
          address: { ...saved.patch.address, street: invalidStreet },
        },
      }),
    /at most 300 characters/,
  );
  settings.rows[0].identity.address.street = invalidStreet;
  assert.equal(
    (await route.get("type=quote&language=en&source=business")).status,
    409,
  );
});

test("missing, malformed and unapproved entity details fail clearly without inventing business facts or rendering", async () => {
  const identity = samples.createDocumentSample(
    "quote",
    "en",
  ).identity_snapshot;
  for (const [settings, type, code] of [
    [null, "quote", "business_identity_required"],
    [
      { rows: [{ identity: { ...identity, legal_name: null } }] },
      "quote",
      "business_identity_required",
    ],
    [
      { rows: [{ identity: { ...identity, phone: "bad\u0000value" } }] },
      "quote",
      "business_identity_invalid",
    ],
    [
      { rows: [{ identity: { ...identity, entity_kind: "exempt" } }] },
      "tax_invoice",
      "business_identity_document_type_unavailable",
    ],
    [
      { rows: [{ identity: { ...identity, entity_kind: null } }] },
      "invoice_receipt",
      "business_identity_document_type_unavailable",
    ],
  ])
    for (const language of ["he", "en"]) {
      const route = await load({ settings });
      const html = await route.get(
        new URLSearchParams({ type, language, source: "business" }),
      );
      assert.equal(html.status, 409);
      assert.equal(html.headers.get("cache-control"), "private, no-store");
      assert.match(html.headers.get("content-type"), /text\/html/);
      const body = await html.text();
      assert.ok(body.includes(`lang="${language}"`));
      assert.ok(body.includes(`/${language}/admin/integrations`));
      assert.doesNotMatch(body, /bad\u0000value/);
      const pdf = await route.get(
        new URLSearchParams({
          type,
          language,
          source: "business",
          format: "pdf",
        }),
      );
      assert.equal(pdf.status, 409);
      assert.equal((await pdf.json()).error, code);
      assert.equal(route.calls.length, 0);
    }
});

test("exempt-business receipt samples preserve an honest zero-VAT fixture and remain canonical drafts", async () => {
  const identity = {
    ...samples.createDocumentSample("receipt", "he").identity_snapshot,
    entity_kind: "exempt",
    registration_number: "",
    vat_number: "",
  };
  const route = await load({ settings: { rows: [{ identity }] } });
  assert.equal(
    (await route.get("type=receipt&language=en&source=business")).status,
    200,
  );
  const draft = route.calls[0].args[0];
  assert.equal(draft.identity_snapshot.entity_kind, "exempt");
  assert.equal(draft.identity_snapshot.registration_number, "");
  assert.equal(draft.identity_snapshot.vat_number, "");
  assert.equal(draft.vat_agorot, 0);
  assert.equal(draft.total_agorot, draft.net_agorot);
  assert.equal(draft.payment_references[0].amount_agorot, draft.total_agorot);
  const { validateDocumentSnapshot } = await moduleAt(
    "src/lib/commerce/documents/snapshot.ts",
    { "server-only": {}, "node:crypto": { createHash } },
  );
  assert.equal(validateDocumentSnapshot(draft).document.state, "draft");
  assert.equal(draft.number, undefined);
  assert.equal(draft.allocation_number, undefined);
});

test("current-business transport failure is surfaced without retry or fictional fallback", async () => {
  const route = await load({ rpcError: { code: "SUPABASE_UNAVAILABLE" } });
  const result = await route.get("type=quote&language=en&source=business");
  assert.equal(result.status, 503);
  assert.equal(route.settingsCalls.length, 1);
  assert.equal(route.calls.length, 0);
});

test("stored HTML and PDF previews honor the selected paper size and stay private", async () => {
  for (const layout of ["a4", "receipt80"])
    for (const format of ["html", "pdf"]) {
      const route = await load({ sample: false });
      const response = await route.get(new URLSearchParams({ layout, format }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-document-state"), "draft");
      assert.deepEqual(route.calls, [{ kind: format, args: [id, layout] }]);
    }
});

test("stored snapshot translation keeps zero discounts, original amounts and the actual collection timestamp", async () => {
  const { documentSnapshotFromRow } = await moduleAt(
    "src/lib/commerce/document-service.ts",
    {
      "server-only": {},
      "@/lib/supabase/admin": {
        createAdminClient: () => {
          throw new Error("No business reads allowed");
        },
      },
      "./http": { CommerceError },
      "./documents/renderer": {},
      "./documents/paper-artwork": {},
      "./attachments": {},
    },
  );
  const sample = samples.createDocumentSample(
    "receipt",
    "he",
    "2026-11-02T14:51:20Z",
  );
  const row = {
    id,
    state: "draft",
    document_type: "receipt",
    created_at: "2026-11-02T14:51:20.123456+00:00",
    business_snapshot: sample.identity_snapshot,
    customer_snapshot: sample.customer_snapshot,
    subtotal_agorot: sample.net_agorot,
    vat_agorot: sample.vat_agorot,
    total_agorot: sample.total_agorot,
    document_snapshot: {
      items: sample.items.map((item) => ({
        ...item,
        unit_price_agorot: item.unit_agorot,
        discount_agorot: 0,
      })),
      payment_references: [
        {
          method: "card",
          status: "paid",
          amount_agorot: 40120,
          paid_at: "2026-11-02T14:51:20.654321+00:00",
        },
      ],
    },
  };
  const translated = documentSnapshotFromRow(row);
  assert.equal(translated.created_at, "2026-11-02T14:51:20.123Z");
  assert.equal(translated.items[0].discount_agorot, 0);
  assert.equal(translated.items[0].unit_agorot, 12500);
  assert.equal(translated.total_agorot, 40120);
  assert.equal(
    translated.payment_references[0].collected_at,
    "2026-11-02T14:51:20.654Z",
  );
  const { validateDocumentSnapshot } = await moduleAt(
    "src/lib/commerce/documents/snapshot.ts",
    { "server-only": {}, "node:crypto": { createHash } },
  );
  assert.equal(
    validateDocumentSnapshot(translated).document.total_agorot,
    40120,
  );
  assert.throws(
    () => documentSnapshotFromRow({ ...row, state: "issued" }),
    /document_preview_unavailable/,
  );
});
