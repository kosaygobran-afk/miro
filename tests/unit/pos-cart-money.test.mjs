import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "typescript";

function compile(source, require = undefined) {
  const exports = {};
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { exports, require, crypto: webcrypto, setTimeout, clearTimeout },
  );
  return exports;
}
const money = compile(
  await readFile(
    new URL("../../src/lib/commerce/money.ts", import.meta.url),
    "utf8",
  ),
);
const utils = compile(
  await readFile(
    new URL(
      "../../src/components/management/tools/pos/pos-utils.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  (name) => {
    if (name === "@/lib/commerce/money") return money;
    if (name === "clsx") return { clsx: (...values) => values.join(" ") };
    if (name === "tailwind-merge") return { twMerge: (value) => value };
    if (name === "../../sales-types")
      return { formatIls: (value) => String(value) };
    throw new Error(`Unexpected import: ${name}`);
  },
);
const line = (unitPrice, quantity = 1, discountPerUnit = 0) => ({
  key: "line",
  variantId: "variant",
  quantity,
  unitPrice,
  discountPerUnit,
  product: null,
  variant: null,
});
const payment = (amount) => ({
  id: "payment",
  method: "cash",
  collectionKind: "manual_recorded",
  amount,
  installments: 1,
  reference: "",
});

test("missing catalog pricing cannot become an invented free POS item", () => {
  const product = { price: null, sale_price: null };
  const variant = { price_override: null };
  assert.equal(utils.hasSellPrice(product, variant), false);
  assert.equal(utils.hasSellPrice(product, { price_override: 0 }), true);
  assert.equal(utils.hasSellPrice({ ...product, price: 10 }, variant), true);
  assert.equal(utils.hasSellPrice(product, { price_override: -1 }), false);
  assert.equal(utils.hasSellPrice(product, { price_override: 1.001 }), false);
});

test("POS totals preserve exact cents across fractional prices, discounts and split tenders", () => {
  const totals = utils.computePosTotals(
    [line(0.1), line(0.2), line(19.99, 3, 0.1)],
    [payment(20), payment(39.97)],
    18,
  );
  assert.equal(totals.subtotal, 60.27);
  assert.equal(totals.discounts, 0.3);
  assert.equal(totals.total, 59.97);
  assert.equal(totals.paid, 59.97);
  assert.equal(totals.remaining, 0);
  assert.equal(totals.itemCount, 5);
  assert.equal(
    utils.validatePaymentTotal([payment(20), payment(39.97)], totals.total),
    true,
  );
});

test("VAT is unknown until a real rate is loaded and line discounts affect gross totals", () => {
  const unknown = utils.computePosTotals([line(118, 3, 11.8)], [], null);
  assert.equal(unknown.vat, null);
  assert.equal(unknown.total, 318.6);
  const known = utils.computePosTotals([line(118, 3, 11.8)], [], 18);
  assert.equal(known.vat, 48.6);
  assert.equal(utils.computeLineTotals(3, 118, 11.8, 18).net, 270);
});

test("payment validation blocks zero legs, underpayment and overpayment by one agora", () => {
  assert.equal(utils.validatePaymentTotal([payment(10.01)], 10), false);
  assert.equal(utils.validatePaymentTotal([payment(9.99)], 10), false);
  assert.equal(
    utils.validatePaymentTotal([payment(10), payment(0)], 10),
    false,
  );
  assert.equal(utils.validatePaymentTotal([], 0), false);
  assert.equal(utils.validatePaymentTotal([payment(0.1 + 0.2)], 0.3), false);
  assert.equal(utils.validatePaymentTotal([payment(10)], 10), true);
});

test("invalid persisted quantities, money and discounts fail closed rather than truncate", () => {
  for (const invalid of [
    line(10, 1.5),
    line(10, 0),
    line(10, 10001),
    line(10, 1, 10.01),
    line(-1),
    line(1.001),
    line(NaN),
  ]) {
    assert.throws(() => utils.computePosTotals([invalid], [], 18));
  }
  assert.throws(() => utils.computePosTotals([line(10)], [payment(-1)], 18));
});

test("blank cart placeholders never contribute a false item or monetary amount", () => {
  const totals = utils.computePosTotals(
    [{ ...line(500), variantId: "" }],
    [],
    18,
  );
  assert.equal(totals.total, 0);
  assert.equal(totals.itemCount, 0);
  assert.equal(totals.vat, 0);
});

test("operation keys meet the shared financial idempotency schema and remain distinct", () => {
  const keys = new Set(
    Array.from({ length: 500 }, () => utils.generateIdempotencyKey()),
  );
  assert.equal(keys.size, 500);
  for (const key of keys) assert.match(key, /^[A-Za-z0-9_-]{16,120}$/);
});

const quoted = (
  variantId,
  unitAgorot,
  quantity = 1,
  discountAgorot = 0,
  vatRate = 18,
) => ({
  variant_id: variantId,
  unit_price_agorot: unitAgorot,
  quantity,
  discount_per_unit_agorot: discountAgorot,
  vat_rate: vatRate,
});

test("quote review catches offsetting line-price changes even if the sale total is unchanged", () => {
  const lines = [
    { ...line(10), variantId: "a" },
    { ...line(20), variantId: "b" },
  ];
  assert.equal(
    utils.comparePosQuote(lines, [quoted("a", 1100), quoted("b", 1900)], 18)
      .itemsMatch,
    false,
  );
  assert.equal(
    utils.comparePosQuote(lines, [quoted("a", 1000), quoted("b", 2000)], 18)
      .itemsMatch,
    true,
  );
});

test("canonical quote review detects changed quantity, discount and missing variants", () => {
  const lines = [{ ...line(10, 2, 1), variantId: "a" }];
  for (const items of [
    undefined,
    [],
    [quoted("b", 1000, 2, 100)],
    [quoted("a", 1000, 3, 100)],
    [quoted("a", 1000, 2, 99)],
  ]) {
    assert.equal(utils.comparePosQuote(lines, items, 18).itemsMatch, false);
  }
  assert.equal(
    utils.comparePosQuote(lines, [quoted("a", 1000, 2, 100)], 18).itemsMatch,
    true,
  );
});

test("VAT-only changes require re-review and unknown/mixed tax never becomes an invented rate", () => {
  const lines = [{ ...line(10), variantId: "a" }];
  const changed = utils.comparePosQuote(
    lines,
    [quoted("a", 1000, 1, 0, 0)],
    18,
  );
  assert.equal(changed.itemsMatch, true);
  assert.equal(changed.vatRate, 0);
  assert.equal(changed.taxNeedsReview, true);
  assert.equal(
    utils.comparePosQuote(lines, [quoted("a", 1000)], null).taxNeedsReview,
    true,
  );
  assert.equal(
    utils.comparePosQuote(lines, [quoted("a", 1000, 1, 0, NaN)], 18).vatRate,
    null,
  );
  assert.equal(
    utils.comparePosQuote(
      lines,
      [quoted("a", 1000), quoted("b", 2000, 1, 0, 0)],
      18,
    ).vatRate,
    null,
  );
});

const attempt = (payment, state, patch = {}) => ({
  idempotency_key: payment.id,
  method: payment.method,
  collection_kind: payment.collectionKind,
  amount_agorot: money.toAgorot(payment.amount),
  state,
  ...patch,
});

test("payment recovery preserves captured split legs and retries only verified provider decline/void", () => {
  const cash = payment(5);
  const card = {
    ...payment(10),
    id: "card",
    method: "credit_card",
    collectionKind: "provider_collected",
  };
  const attempts = [attempt(cash, "captured"), attempt(card, "declined")];
  assert.equal(utils.getPosPaymentRecovery(cash, attempts), "captured");
  assert.equal(utils.getPosPaymentRecovery(card, attempts), "retry");
  assert.equal(
    utils.getPosPaymentRecovery(card, [attempt(card, "voided")]),
    "retry",
  );
  assert.equal(
    utils.getPosPaymentRecovery(cash, [attempt(cash, "declined")]),
    "blocked",
  );
  assert.equal(
    utils.getPosPaymentRecovery({ ...card, id: "replacement" }, attempts),
    "new",
  );
});

test("known pending hosted sessions resume with their existing key while uncertain states stay blocked", () => {
  const card = {
    ...payment(10),
    method: "credit_card",
    collectionKind: "provider_collected",
  };
  assert.equal(
    utils.getPosPaymentRecovery(card, [attempt(card, "pending")]),
    "resume",
  );
  for (const state of [
    "created",
    "authorized",
    "unknown",
    "exception",
    "refunded",
    "partially_refunded",
  ]) {
    assert.equal(
      utils.getPosPaymentRecovery(card, [attempt(card, state)]),
      "blocked",
    );
  }
  const cash = payment(10);
  assert.equal(
    utils.getPosPaymentRecovery(cash, [attempt(cash, "pending")]),
    "blocked",
  );
});

test("recovery treats altered method, amount or collection kind as conflicts", () => {
  const cash = payment(10);
  for (const patch of [
    { amount_agorot: 1001 },
    { method: "credit_card" },
    { collection_kind: "provider_collected" },
  ]) {
    assert.equal(
      utils.getPosPaymentRecovery(cash, [attempt(cash, "captured", patch)]),
      "conflict",
    );
  }
});

test("overdue manual-only partial sales resume while provider/unknown or pre-expiry exceptions remain blocked", () => {
  const cash = payment(5);
  const before = "2026-10-07T09:00:00Z";
  const after = "2026-10-07T11:00:00Z";
  const now = Date.parse("2026-10-07T10:00:00Z");
  assert.equal(
    utils.canResumeManualPosIntent(
      "exception",
      before,
      [attempt(cash, "captured")],
      [cash],
      now,
    ),
    true,
  );
  assert.equal(
    utils.canResumeManualPosIntent(
      "partially_paid",
      before,
      [attempt(cash, "captured")],
      [cash],
      now,
    ),
    true,
  );
  for (const state of ["reserved", "cancelled", "expired", "paid"])
    assert.equal(
      utils.canResumeManualPosIntent(
        state,
        before,
        [attempt(cash, "captured")],
        [cash],
        now,
      ),
      false,
    );
  for (const expiry of [after, undefined, "invalid"])
    assert.equal(
      utils.canResumeManualPosIntent(
        "exception",
        expiry,
        [attempt(cash, "captured")],
        [cash],
        now,
      ),
      false,
    );
  for (const state of ["pending", "unknown", "authorized", "exception"])
    assert.equal(
      utils.canResumeManualPosIntent(
        "exception",
        before,
        [attempt(cash, state)],
        [cash],
        now,
      ),
      false,
    );
  assert.equal(
    utils.canResumeManualPosIntent("exception", before, [], [cash], now),
    false,
  );
  assert.equal(
    utils.canResumeManualPosIntent(
      "exception",
      before,
      [attempt(cash, "captured", { collection_kind: "provider_collected" })],
      [cash],
      now,
    ),
    false,
  );
  assert.equal(
    utils.canResumeManualPosIntent(
      "exception",
      before,
      [attempt(cash, "captured")],
      [{ ...cash, collectionKind: "provider_collected" }],
      now,
    ),
    false,
  );
});
