import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
const nodeRequire = createRequire(import.meta.url);
class CommerceError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
function checkRpcError(error) {
  if (error) throw new CommerceError("rpc_failed", 503);
}
const source = await readFile(
  new URL("../../src/lib/commerce/checkout-service.ts", import.meta.url),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const intentId = "123e4567-e89b-42d3-a456-426614174000";
const attemptId = "123e4567-e89b-42d3-a456-426614174001";
function harness(options = {}) {
  const calls = [];
  let hostedCalls = 0;
  const intent = {
    id: intentId,
    channel: "pos",
    customer_id: null,
    total_agorot: 12345,
    status: "reserved",
    currency: "ILS",
  };
  const attempt = {
    id: attemptId,
    provider: "payplus",
    environment: "sandbox",
    merchant_ref: "merchant",
    request_uid: "request",
    amount_agorot: 12345,
    currency: "ILS",
    state: "pending",
    safe_metadata: options.savedMetadata ?? {},
  };
  const rpc = async (name, payload) => {
    calls.push({ name, payload });
    if (name === "commerce_guest_status")
      return {
        data: null,
        error: options.validGuest ? null : { code: "42501" },
      };
    if (name === "commerce_start_provider_attempt")
      return { data: { attempt, replayed: !!options.replayed }, error: null };
    return { data: { state: "captured" }, error: null };
  };
  const admin = {
    rpc,
    from(table) {
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        async maybeSingle() {
          return {
            data:
              table === "commerce_intents"
                ? { ...intent, ...options.intent }
                : attempt,
            error: null,
          };
        },
        async single() {
          return { data: { ...attempt, ...options.attempt }, error: null };
        },
      };
      return query;
    },
  };
  const gateway = {
    provider: "payplus",
    capabilities: {
      hostedCard: "enabled",
      bit: "enabled",
      installments: "disabled",
    },
    async createHostedSession() {
      hostedCalls++;
      if (options.timeout) throw new Error("PRIVATE provider diagnostic");
      return {
        providerRequestId: "request",
        hostedUrl: "https://checkout.payplus.co.il/session",
      };
    },
    async queryPayment() {
      return {
        state: "captured",
        transactionKind: "charge",
        amountMinor: 12345,
        currency: "ILS",
        attemptReference: attemptId,
        transactionId: "txn",
        merchantReference: null,
        ...options.snapshot,
      };
    },
  };
  const actor =
    options.actor === undefined
      ? { user: { id: "operator" }, role: "admin", status: "active" }
      : options.actor;
  const cookieStore = {
    get() {
      return options.cookie ? { value: options.cookie } : undefined;
    },
    set() {},
  };
  const exports = {};
  runInNewContext(output, {
    exports,
    process,
    Buffer,
    URL,
    Request,
    console,
    require(specifier) {
      if (specifier === "server-only") return {};
      if (specifier === "next/headers")
        return { cookies: async () => cookieStore };
      if (specifier === "@/lib/supabase/admin")
        return { createAdminClient: () => admin };
      if (specifier === "@/lib/supabase/server")
        return { createServerSupabaseClient: async () => ({ rpc }) };
      if (specifier === "@/lib/auth")
        return { getAuthContext: async () => actor };
      if (specifier === "@/lib/permissions")
        return { can: (role) => ["ceo", "admin"].includes(role) };
      if (specifier === "@/lib/request-origin")
        return {
          hasSameOrigin: (request) =>
            request.headers.get("origin") === "https://miro.example",
        };
      if (specifier === "@/app/api/management/_shared")
        return {
          checkManagementRateLimit: async () => "ok",
          getClientIp: () => "test",
        };
      if (specifier === "./http") return { CommerceError, checkRpcError };
      if (specifier === "./config")
        return {
          loadCommerceRuntime: () => ({
            gateway,
            environment: "sandbox",
            merchantRef: "merchant",
            providerMerchantId: "page-id",
            origin: "https://miro.example",
          }),
        };
      return nodeRequire(specifier);
    },
  });
  return { ...exports, calls, hostedCalls: () => hostedCalls };
}
const request = () =>
  new Request("https://miro.example/api/commerce/attempts", {
    method: "POST",
    headers: { origin: "https://miro.example" },
  });
const input = {
  intent_id: intentId,
  method: "credit_card",
  locale: "he",
  installments: 1,
  idempotency_key: "persisted-intent-key",
};

test("hosted request is persisted before remote creation and binding; replay never creates again", async () => {
  const fresh = harness();
  const result = await fresh.startHostedCheckout(request(), input);
  assert.equal(result.state, "pending");
  assert.deepEqual(
    fresh.calls.map((entry) => entry.name),
    ["commerce_start_provider_attempt", "commerce_bind_attempt"],
  );
  assert.equal(fresh.hostedCalls(), 1);
  const replay = harness({
    replayed: true,
    savedMetadata: { hosted_url: "https://checkout.payplus.co.il/session" },
  });
  assert.equal(
    (await replay.startHostedCheckout(request(), input)).replayed,
    true,
  );
  assert.equal(replay.hostedCalls(), 0);
  const unknown = harness({ replayed: true });
  assert.equal(
    (await unknown.startHostedCheckout(request(), input))
      .reconciliation_required,
    true,
  );
  assert.equal(unknown.hostedCalls(), 0);
});

test("timeout is marked unknown and queues a query without retrying GenerateLink", async () => {
  const context = harness({ timeout: true });
  const result = await context.startHostedCheckout(request(), input);
  assert.equal(result.state, "unknown");
  assert.equal(context.hostedCalls(), 1);
  assert.deepEqual(
    context.calls.map((entry) => entry.name),
    [
      "commerce_start_provider_attempt",
      "commerce_mark_attempt_unknown",
      "commerce_queue_reconciliation",
    ],
  );
  assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
});

test("reconciliation refuses foreign amount, currency, intent reference and missing transaction", async () => {
  for (const snapshot of [
    { amountMinor: 12344 },
    { currency: "USD" },
    { attemptReference: "another-attempt" },
    { transactionId: null },
    { state: "unknown" },
  ]) {
    const context = harness({ snapshot });
    await assert.rejects(
      context.reconcileAttempt(attemptId),
      (error) => error.code === "payment_reconciliation_required",
    );
    assert.equal(
      context.calls.some((entry) => entry.name === "commerce_provider_result"),
      false,
    );
  }
  const context = harness();
  await context.reconcileAttempt(attemptId);
  const applied = context.calls.find(
    (entry) => entry.name === "commerce_provider_result",
  );
  assert.equal(applied.payload.p_result.verification_source, "server_query");
  assert.equal(applied.payload.p_result.merchant_ref, "merchant");
});

test("guest scopes cannot authorize POS or another customer's intent without a verified capability", async () => {
  const guest = harness({ actor: null });
  await assert.rejects(
    guest.authorizeCheckout(request(), intentId, true),
    (error) => error.status === 404,
  );
  const foreign = harness({
    actor: { user: { id: "customer-a" }, role: "customer", status: "active" },
    intent: { channel: "website", customer_id: "customer-b" },
  });
  await assert.rejects(
    foreign.authorizeCheckout(request(), intentId),
    (error) => error.status === 404,
  );
  const scoped = harness({
    actor: null,
    cookie: "scoped-capability",
    validGuest: true,
  });
  const authorized = await scoped.authorizeCheckout(request(), intentId, true);
  assert.equal(authorized.actor, null);
  assert.equal(authorized.capability, "scoped-capability");
});
