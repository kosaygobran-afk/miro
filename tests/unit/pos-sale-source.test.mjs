import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = await readFile(
  new URL("../../src/lib/pos-sale.ts", import.meta.url),
  "utf8",
);
const exports = {};
runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { exports },
);
const { sanitizePosSaleBody } = exports;

test("POS sale request strips any client-controlled source before validation", () => {
  const input = {
    source: "management",
    customer: {
      name: "Test Customer",
      email: "test@example.com",
      phone: "0501234567",
      userId: null,
    },
    items: [
      {
        variantId: "11111111-1111-1111-1111-111111111111",
        quantity: 1,
        unitPrice: 10,
        discountPerUnit: 0,
      },
    ],
    payments: [
      { method: "cash", amount: 10, installments: 1, reference: null },
    ],
    idempotencyKey: "abcd1234",
  };

  const sanitized = sanitizePosSaleBody(input);
  assert.deepEqual(JSON.parse(JSON.stringify(sanitized)), {
    customer: input.customer,
    items: input.items,
    payments: input.payments,
    idempotencyKey: input.idempotencyKey,
  });
  assert.equal(sanitized.source, undefined);
});
