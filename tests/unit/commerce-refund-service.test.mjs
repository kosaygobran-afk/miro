import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
const source = await readFile(
  new URL("../../src/lib/commerce/refund-service.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
function harness(options = {}) {
  const calls = [];
  const refund = {
    id: "refund-operation",
    attempt_id: "attempt",
    amount_agorot: 12345,
    state: "unknown",
    provider_refund_uid: null,
    ...options.refund,
  };
  const gateway = {
    provider: "payplus",
    async queryRefund(query) {
      calls.push({ name: "query", payload: query });
      return {
        state: "succeeded",
        transactionKind: "refund",
        amountMinor: 12345,
        currency: "ILS",
        refundId: "provider-refund",
        requestReference: refund.id,
        merchantReference: "page-uid",
        ...options.snapshot,
      };
    },
  };
  const admin = {
    from(table) {
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        async single() {
          return {
            error: null,
            data:
              table === "payment_refunds"
                ? refund
                : {
                    provider: "payplus",
                    environment: "sandbox",
                    merchant_ref: "account-hash",
                    ...options.attempt,
                  },
          };
        },
      };
      return q;
    },
    async rpc(name, payload) {
      calls.push({ name, payload });
      return {
        data: { refund_id: refund.id, state: "succeeded" },
        error: null,
      };
    },
  };
  class CommerceError extends Error {
    constructor(code) {
      super(code);
      this.code = code;
    }
  }
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "server-only") return {};
      if (name === "@/lib/supabase/admin")
        return { createAdminClient: () => admin };
      if (name === "./config")
        return {
          loadCommerceRuntime: () => ({
            gateway,
            environment: "sandbox",
            merchantRef: "account-hash",
            providerMerchantId: "page-uid",
          }),
        };
      if (name === "./http")
        return {
          CommerceError,
          checkRpcError: (error) => {
            if (error) throw new Error("rpc_failed");
          },
        };
      return require(name);
    },
  });
  return { ...exports, calls };
}
test("refund recovery queries the original marker and replays a deterministic verified event without submitting money", async () => {
  const h = harness();
  await h.reconcileRefund("refund-operation");
  await h.reconcileRefund("refund-operation");
  assert.deepEqual(
    h.calls.map((call) => call.name),
    ["query", "commerce_refund_result", "query", "commerce_refund_result"],
  );
  assert.equal(h.calls[0].payload.effectKey, "refund-operation");
  assert.equal(
    JSON.stringify(h.calls[1].payload),
    JSON.stringify(h.calls[3].payload),
  );
  assert.equal(h.calls[1].payload.p_result.verification_source, "server_query");
});
test("foreign refund marker, amount, currency, merchant and uncertain state never reach the money ledger", async () => {
  for (const snapshot of [
    { requestReference: "foreign" },
    { amountMinor: 1 },
    { currency: "USD" },
    { merchantReference: "foreign-page" },
    { state: "unknown" },
    { transactionKind: "unknown" },
    { refundId: null },
  ]) {
    const h = harness({ snapshot });
    await assert.rejects(
      h.reconcileRefund("refund-operation"),
      /refund_reconciliation_required/,
    );
    assert.equal(
      h.calls.some((c) => c.name === "commerce_refund_result"),
      false,
    );
  }
});
test("completed refunds recover locally, and another merchant account never queries the provider", async () => {
  const complete = harness({ refund: { state: "succeeded" } });
  assert.equal(
    (await complete.reconcileRefund("refund-operation")).state,
    "succeeded",
  );
  assert.equal(complete.calls.length, 0);
  const foreign = harness({ attempt: { merchant_ref: "other-account" } });
  await assert.rejects(
    foreign.reconcileRefund("refund-operation"),
    /provider_binding_mismatch/,
  );
  assert.equal(foreign.calls.length, 0);
});
