import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const money = {};
runInNewContext(
  ts.transpileModule(
    await readFile(
      new URL("../../src/lib/commerce/money.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { exports: money },
);

test("agorot parsing keeps 0.01 and rejects unsafe/inexact browser amounts", () => {
  for (const [input, expected] of [
    ["0.01", 1],
    ["19.99", 1999],
    ["118.00", 11800],
    [0.1, 10],
  ]) {
    assert.equal(money.toAgorot(input), expected);
  }
  for (const input of [
    "1.005",
    "NaN",
    "1e3",
    "-1",
    "Infinity",
    "99999999999.99",
    0.1 + 0.2,
  ]) {
    assert.throws(() => money.toAgorot(input));
  }
  assert.equal(money.fromAgorot(1), "0.01");
  assert.equal(money.fromAgorot(-1), "-0.01");
});

test("VAT-inclusive line rounding preserves exact gross and discount across quantities", () => {
  const line = money.calculateSaleLine({
    unitAgorot: 11800,
    quantity: 3,
    discountPerUnitAgorot: 1180,
    vatBasisPoints: 1800,
  });
  assert.equal(line.grossAgorot, 31860);
  assert.equal(line.netAgorot, 27000);
  assert.equal(line.vatAgorot, 4860);
  assert.equal(line.discountAgorot, 3540);
  for (let gross = 0; gross < 500; gross++) {
    const result = money.grossVatBreakdown(gross, 1800);
    assert.equal(result.netAgorot + result.vatAgorot, gross);
    assert.ok(Number.isSafeInteger(result.netAgorot));
  }
});

test("fractional discounts round half up and sums/refunds never lose a cent", () => {
  assert.equal(money.percentageAmount(1, 5000), 1);
  assert.equal(money.percentageAmount(1999, 1000), 200);
  assert.equal(money.sumAgorot([1999, -1000, -999]), 0);
  assert.throws(() =>
    money.calculateSaleLine({
      unitAgorot: 100,
      quantity: 1.5,
      vatBasisPoints: 1800,
    }),
  );
  assert.throws(() =>
    money.calculateSaleLine({
      unitAgorot: 100,
      quantity: 1,
      discountPerUnitAgorot: 101,
      vatBasisPoints: 1800,
    }),
  );
  assert.throws(() => money.sumAgorot([money.MAX_AGOROT, money.MAX_AGOROT]));
});
