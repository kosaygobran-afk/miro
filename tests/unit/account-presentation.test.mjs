import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const contract = {};
const source = await readFile(
  new URL("../../src/lib/account-presentation.ts", import.meta.url),
  "utf8",
);
runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { exports: contract },
);

test("account statuses localize every persisted order, request and invoice state", () => {
  for (const state of [
    "pending",
    "paid",
    "processing",
    "shipped",
    "completed",
    "cancelled",
    "refunded",
    "new",
    "in_progress",
    "waiting_customer",
    "closed",
    "spam",
    "draft",
    "issued",
    "void",
  ]) {
    assert.match(contract.accountStatusLabel(state, "he"), /[\u0590-\u05ff]/);
    assert.notEqual(
      contract.accountStatusLabel(state, "en"),
      "Status unavailable",
    );
  }
  assert.equal(
    contract.accountStatusLabel("future_state", "he"),
    "סטטוס לא זמין",
  );
});

test("account amounts retain cents and reject invalid data instead of inventing zero", () => {
  assert.match(contract.accountAmount(123.45, "ILS", "en"), /123\.45/);
  assert.equal(contract.accountAmount(NaN, "ILS", "en"), "Amount unavailable");
  assert.equal(contract.accountAmount(100, "invalid", "he"), "סכום לא זמין");
});

test("account date uses the business timezone across UTC midnight and rejects invalid dates", () => {
  const before = contract.accountDate("2026-10-01T22:30:00Z", "en");
  const after = contract.accountDate("2026-10-02T10:30:00Z", "en");
  assert.equal(before, after);
  assert.equal(contract.accountDate("invalid", "he"), "—");
});
