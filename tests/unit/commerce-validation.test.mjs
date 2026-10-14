import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
async function load(path, imports = {}) {
  const exports = {};
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { exports, require: (name) => imports[name] ?? require(name) },
  );
  return exports;
}
const money = await load("../../src/lib/commerce/money.ts");
const validation = await load("../../src/lib/commerce/validation.ts", {
  "./money": money,
});
const variant = "11111111-1111-4111-8111-111111111111";
const intent = {
  channel: "pos",
  idempotency_key: "unique_operation_123",
  customer_snapshot: { name: "Walk-in" },
  items: [{ variant_id: variant, quantity: 1 }],
};

test("cash corrections require one signed integer, with no ambiguous direction", () => {
  const cash = validation.commerceActionSchemas.cash_movement;
  const base = {
    session_id: variant,
    reason: "count correction",
    effect_key: "cash_correction_123",
  };
  for (const amount of [100, -100])
    assert.equal(
      cash.safeParse({
        ...base,
        kind: "correction",
        signed_amount_agorot: amount,
      }).success,
      true,
    );
  for (const amount of [0, 1.5, Number.MAX_SAFE_INTEGER])
    assert.equal(
      cash.safeParse({
        ...base,
        kind: "correction",
        signed_amount_agorot: amount,
      }).success,
      false,
    );
  assert.equal(
    cash.safeParse({ ...base, kind: "correction", amount_agorot: 100 }).success,
    false,
  );
  assert.equal(
    cash.safeParse({
      ...base,
      kind: "correction",
      signed_amount_agorot: -100,
      amount_agorot: 100,
    }).success,
    false,
  );
  assert.equal(
    cash.safeParse({ ...base, kind: "cash_in", signed_amount_agorot: -100 })
      .success,
    false,
  );
  assert.equal(
    cash.safeParse({ ...base, kind: "cash_out", amount_agorot: 100 }).success,
    true,
  );
});

test("canonical intent rejects browser prices, source, tax and public discount tampering", () => {
  assert.equal(validation.createIntentSchema.safeParse(intent).success, true);
  for (const field of [
    "unit_price",
    "unit_price_agorot",
    "source",
    "tax",
    "total_agorot",
  ]) {
    assert.equal(
      validation.createIntentSchema.safeParse({ ...intent, [field]: 1 })
        .success,
      false,
    );
  }
  assert.equal(
    validation.createIntentSchema.safeParse({
      ...intent,
      items: [{ ...intent.items[0], unit_price: 0.01 }],
    }).success,
    false,
  );
  const publicIntent = { ...intent };
  delete publicIntent.channel;
  assert.equal(
    validation.createPublicIntentSchema.safeParse(publicIntent).success,
    true,
  );
  assert.equal(
    validation.createPublicIntentSchema.safeParse({
      ...publicIntent,
      items: [{ ...intent.items[0], discount_per_unit_agorot: 1 }],
    }).success,
    false,
  );
});

test("business identity write cannot inject secrets or official issuance flags", () => {
  const schema = validation.commerceActionSchemas.settings_save;
  assert.equal(
    schema.safeParse({
      expected_revision: 1,
      patch: { legal_name: "MIRO example" },
    }).success,
    true,
  );
  for (const key of [
    "api_key",
    "secret_key",
    "official_issuance_enabled",
    "provider_token",
    "next_number",
  ]) {
    assert.equal(
      schema.safeParse({ expected_revision: 1, patch: { [key]: "unsafe" } })
        .success,
      false,
    );
  }
});

test("expenses require exact net/VAT/gross and valid actual calendar dates", () => {
  const expense = {
    supplier: { name: "Example supplier" },
    document: {
      reference: "TEST-1",
      document_date: "2026-10-06",
      expense_date: "2026-10-06",
      category: "Operations",
      currency: "ILS",
    },
    items: [
      {
        description: "Fixture",
        net_agorot: 10000,
        vat_agorot: 1800,
        gross_agorot: 11800,
      },
    ],
  };
  const schema = validation.commerceActionSchemas.expense_save;
  assert.equal(schema.safeParse(expense).success, true);
  assert.equal(
    schema.safeParse({
      ...expense,
      items: [{ ...expense.items[0], gross_agorot: 11799 }],
    }).success,
    false,
  );
  assert.equal(
    schema.safeParse({
      ...expense,
      document: { ...expense.document, expense_date: "2026-02-30" },
    }).success,
    false,
  );
  assert.equal(
    schema.safeParse({
      ...expense,
      attachments: [{ storage_key: "unverified" }],
    }).success,
    false,
  );
});

test("manual tenders require deliberate received confirmation and bounded whole agorot", () => {
  const tender = {
    intent_id: variant,
    method: "cash",
    amount_agorot: 1,
    confirmed_received: true,
    idempotency_key: "tender_operation_123",
  };
  assert.equal(validation.manualTenderSchema.safeParse(tender).success, true);
  for (const value of [false, undefined])
    assert.equal(
      validation.manualTenderSchema.safeParse({
        ...tender,
        confirmed_received: value,
      }).success,
      false,
    );
  for (const amount of [0, 0.01, -1, Number.MAX_SAFE_INTEGER])
    assert.equal(
      validation.manualTenderSchema.safeParse({
        ...tender,
        amount_agorot: amount,
      }).success,
      false,
    );
});

test("refund and recurrence inputs never accept raw card/token credentials", () => {
  const refund = {
    attempt_id: variant,
    amount_agorot: 1,
    reason: "Customer return",
    idempotency_key: "refund_operation_123",
  };
  assert.equal(validation.refundSchema.safeParse(refund).success, true);
  assert.equal(
    validation.refundSchema.safeParse({ ...refund, cvv: "123" }).success,
    false,
  );
  const plan = {
    name: "Draft agreement",
    amount_agorot: 10000,
    currency: "ILS",
    interval_months: 1,
    next_charge_at: "2026-11-06T12:00:00Z",
    consent_reference: "Consent record",
  };
  assert.equal(
    validation.commerceActionSchemas.recurring_save.safeParse(plan).success,
    true,
  );
  for (const field of [
    "card_number",
    "cvv",
    "provider_token",
    "token_reference",
  ]) {
    assert.equal(
      validation.commerceActionSchemas.recurring_save.safeParse({
        ...plan,
        [field]: "private",
      }).success,
      false,
    );
  }
});
