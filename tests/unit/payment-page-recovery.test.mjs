import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const exported = {};
runInNewContext(
  ts.transpileModule(
    await readFile(
      new URL(
        "../../src/features/commerce/payment-page-client.tsx",
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
    exports: exported,
    require: (name) =>
      name === "@/lib/commerce/money" ? { MAX_AGOROT: 999_999_999_999 } : {},
  },
);
const id = "11111111-1111-1111-1111-111111111111";
const otherId = "22222222-2222-2222-2222-222222222222";
const status = () => ({
  intent: {
    id,
    status: "reserved",
    currency: "ILS",
    channel: "website",
    read_only_expired: false,
    total_agorot: 1000,
    remaining_agorot: 1000,
    order_id: null,
  },
  attempts: [],
  readiness: {
    configured: true,
    capabilities: {
      hostedCard: "enabled",
      bit: "enabled",
      installments: "enabled",
    },
  },
});
const leg = () => ({
  intentId: id,
  method: "credit_card",
  count: 3,
  amount: 1000,
  selector: "credit_card:3:1000",
  key: "33333333-3333-3333-3333-333333333333",
});

test("payment status authority is bound to the currently requested intent and bounded exact balance", () => {
  assert.equal(exported.isPaymentPageStatus(status(), id), true);
  assert.equal(exported.isPaymentPageStatus(status(), otherId), false);
  for (const patch of [
    { remaining_agorot: 1001 },
    { total_agorot: 1.5 },
    { total_agorot: Infinity },
    { remaining_agorot: -1 },
    { currency: "USD" },
    { read_only_expired: undefined },
    { channel: "unknown" },
  ]) {
    const candidate = status();
    Object.assign(candidate.intent, patch);
    assert.equal(exported.isPaymentPageStatus(candidate, id), false);
  }
  assert.equal(
    exported.isPaymentPageStatus({ ...status(), attempts: null }, id),
    false,
  );
});

test("uncertain payment leg restores only for its exact intent, key, method, installments and amount", () => {
  assert.equal(exported.isAmbiguousPaymentLeg(leg(), id), true);
  assert.equal(exported.isAmbiguousPaymentLeg(leg(), otherId), false);
  for (const patch of [
    { key: "invalid" },
    { amount: 1001 },
    { count: 2 },
    { method: "bit" },
    { selector: "credit_card:1:1000" },
    { count: 25 },
    { amount: 0 },
  ])
    assert.equal(
      exported.isAmbiguousPaymentLeg({ ...leg(), ...patch }, id),
      false,
    );
  assert.equal(
    exported.isAmbiguousPaymentLeg(
      { ...leg(), method: "bit", count: 1, selector: "bit:1:1000" },
      id,
    ),
    true,
  );
});

test("collection stays blocked for open, unknown, exception or unrecognized attempt states", () => {
  for (const state of [
    "created",
    "pending",
    "authorized",
    "unknown",
    "exception",
    "unrecognized",
    "failed",
    "cancelled",
  ]) {
    const candidate = status();
    candidate.attempts = [{ state }];
    assert.equal(exported.isPaymentPageCollectable(candidate), false);
  }
  for (const state of ["captured", "declined", "voided"]) {
    const candidate = status();
    candidate.attempts = [{ state }];
    assert.equal(exported.isPaymentPageCollectable(candidate), true);
  }
});

test("finished, expired, exception, unconfigured and exhausted requests cannot collect", () => {
  for (const patch of [
    { status: "paid" },
    { status: "cancelled" },
    { status: "expired" },
    { status: "exception" },
    { read_only_expired: true },
    { order_id: otherId },
    { remaining_agorot: 0 },
  ]) {
    const candidate = status();
    Object.assign(candidate.intent, patch);
    assert.equal(exported.isPaymentPageCollectable(candidate), false);
  }
  const unavailable = status();
  unavailable.readiness.configured = false;
  assert.equal(exported.isPaymentPageCollectable(unavailable), false);
});
