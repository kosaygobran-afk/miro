import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
const moduleCache = new Map();

async function loadTs(path) {
  if (moduleCache.has(path)) return moduleCache.get(path);
  const source = await readFile(
    new URL(`../../src/lib/commerce/payments/${path}.ts`, import.meta.url),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  moduleCache.set(path, exports);
  const localRequire = (specifier) => {
    if (specifier === "server-only") return {};
    if (specifier === "./index") return moduleCache.get("index");
    return nodeRequire(specifier);
  };
  runInNewContext(output, {
    exports,
    require: localRequire,
    process,
    Buffer,
    URL,
    fetch,
    Response,
    Headers,
    AbortController,
    TextDecoder,
    console,
    setTimeout,
    clearTimeout,
  });
  return exports;
}

const common = await loadTs("index");
const payplus = await loadTs("payplus");
const { createPayPlusGateway, loadPayPlusConfig } = payplus;

const baseConfig = {
  environment: "sandbox",
  apiKey: "sandbox-api-key",
  secretKey: "sandbox-secret-key",
  paymentPageUid: "page-uid",
  enabledMethods: ["credit_card", "bit"],
  enabledFeatures: ["installments", "partialRefund"],
  trustedReturnHosts: ["miro.example"],
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function transportWith(handler) {
  const calls = [];
  return {
    calls,
    transport: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(String(init.body)) });
      return handler(url, init, calls.length);
    },
  };
}

function hostedInput(overrides = {}) {
  return {
    attemptId: "attempt-42",
    amountMinor: 12345,
    currency: "ILS",
    method: "credit_card",
    locale: "he",
    callbackUrl: "https://miro.example/api/payments/payplus/webhook",
    successUrl: "https://miro.example/pay/complete",
    failureUrl: "https://miro.example/pay/failed",
    cancelUrl: "https://miro.example/pay/cancelled",
    ...overrides,
  };
}

test("PayPlus hosted session sends exact agorot conversion and explicit issuer/callback settings", async () => {
  const fake = transportWith(() =>
    jsonResponse({
      results: { status: "success", code: 0 },
      data: {
        page_request_uid: "req-123",
        payment_page_link: "https://checkout.payplus.co.il/pay/req-123",
      },
    }),
  );
  const gateway = createPayPlusGateway({
    config: baseConfig,
    transport: fake.transport,
  });
  const result = await gateway.createHostedSession(
    hostedInput({ installments: 3 }),
  );
  assert.deepEqual(
    { ...result },
    {
      providerRequestId: "req-123",
      hostedUrl: "https://checkout.payplus.co.il/pay/req-123",
    },
  );
  const request = fake.calls[0];
  assert.equal(
    request.url,
    "https://restapidev.payplus.co.il/api/v1.0/PaymentPages/generateLink",
  );
  assert.equal(request.body.amount, 123.45);
  assert.equal(request.body.currency_code, "ILS");
  assert.equal(request.body.charge_method, 1);
  assert.equal(request.body.initial_invoice, false);
  assert.equal(request.body.more_info, "attempt-42");
  assert.equal(request.body.send_failure_callback, true);
  assert.equal(request.body.payments_selected, 3);
  assert.deepEqual(request.body.allowed_charge_methods, ["credit-card"]);
  assert.equal(request.init.headers["secret-key"], "sandbox-secret-key");
});

test("PayPlus bit session is explicit and generated redirect must pass host allowlist", async () => {
  const fake = transportWith(() =>
    jsonResponse({
      results: { status: "success", code: 0 },
      data: {
        page_request_uid: "r1",
        payment_page_link: "https://bit.payplus.co.il/r1",
      },
    }),
  );
  const gateway = createPayPlusGateway({
    config: baseConfig,
    transport: fake.transport,
  });
  await gateway.createHostedSession(hostedInput({ method: "bit" }));
  assert.deepEqual(fake.calls[0].body.allowed_charge_methods, ["bit"]);
  assert.equal(fake.calls[0].body.charge_default, "bit");

  const hostile = transportWith(() =>
    jsonResponse({
      results: { status: "success", code: 0 },
      data: {
        page_request_uid: "r2",
        payment_page_link: "https://attacker.example/pay",
      },
    }),
  );
  await assert.rejects(
    createPayPlusGateway({
      config: baseConfig,
      transport: hostile.transport,
    }).createHostedSession(hostedInput()),
    /allowlist/,
  );
  const businessFailure = transportWith(() =>
    jsonResponse({
      results: { status: "error", code: 401 },
      data: {
        page_request_uid: "r3",
        payment_page_link: "https://checkout.payplus.co.il/r3",
      },
    }),
  );
  await assert.rejects(
    createPayPlusGateway({
      config: baseConfig,
      transport: businessFailure.transport,
    }).createHostedSession(hostedInput()),
    /did not confirm/,
  );
});

test("unsupported account modules are disabled and no-obligo remains unverified", async () => {
  const gateway = createPayPlusGateway({
    config: {
      ...baseConfig,
      enabledMethods: ["credit_card"],
      enabledFeatures: [
        "authorizeCapture",
        "tokenizedRecurring",
        "settlementLookup",
      ],
    },
    transport: async () => jsonResponse({}),
  });
  assert.equal(gateway.capabilities.hostedCard, "enabled");
  assert.equal(gateway.capabilities.bit, "disabled");
  assert.equal(gateway.capabilities.masavDirectDebit, "disabled");
  assert.equal(gateway.capabilities.tapOnPhone, "disabled");
  assert.equal(gateway.capabilities.authorizeCapture, "disabled");
  assert.equal(gateway.capabilities.tokenizedRecurring, "disabled");
  assert.equal(gateway.capabilities.settlementLookup, "disabled");
  assert.equal(gateway.capabilities.noObligo.state, "unverified");
  await assert.rejects(
    gateway.createHostedSession(hostedInput({ method: "bit" })),
    /not enabled/,
  );
  await assert.rejects(
    gateway.createHostedSession(
      hostedInput({ successUrl: "https://evil.example/ok" }),
    ),
    /allowlist/,
  );
});

test("environment loader selects one credential set and rejects unspecified mode", () => {
  const config = loadPayPlusConfig({
    PAYPLUS_ENVIRONMENT: "production",
    PAYPLUS_PRODUCTION_API_KEY: "prod-key",
    PAYPLUS_PRODUCTION_SECRET_KEY: "prod-secret",
    PAYPLUS_PRODUCTION_PAGE_UID: "prod-page",
    PAYPLUS_PRODUCTION_ENABLED_METHODS: "credit_card,bit",
    PAYPLUS_PRODUCTION_RETURN_HOSTS: "miro.example",
  });
  assert.equal(config.environment, "production");
  assert.equal(config.apiKey, "prod-key");
  assert.deepEqual([...config.enabledMethods], ["credit_card", "bit"]);
  assert.deepEqual([...config.trustedReturnHosts], ["miro.example"]);
  assert.throws(() => loadPayPlusConfig({}), /must be sandbox or production/);
  assert.throws(
    () => loadPayPlusConfig({ PAYPLUS_ENVIRONMENT: "sandbox" }),
    /Missing PAYPLUS_SANDBOX_API_KEY/,
  );
});

test("money validation rejects unsafe, fractional and non-positive agorot", () => {
  assert.equal(common.amountMinorToNis(12345), 123.45);
  assert.equal(common.nisToAmountMinor("123.45"), 12345);
  assert.equal(common.nisToAmountMinor("1.001"), null);
  for (const value of [
    0,
    -1,
    1.1,
    Number.MAX_SAFE_INTEGER + 1,
    1_000_000_000_000,
    NaN,
  ]) {
    assert.throws(
      () => common.assertAmountMinor(value),
      /positive supported SQL numeric/,
    );
  }
});

test("hosted creation treats transport loss as unknown and rejects HTTP/business failure", async () => {
  const timeout = createPayPlusGateway({
    config: baseConfig,
    transport: async () => {
      throw new Error("socket reset");
    },
  });
  await assert.rejects(
    timeout.createHostedSession(hostedInput()),
    /outcome is unknown/,
  );
  const httpFailure = createPayPlusGateway({
    config: baseConfig,
    transport: async () =>
      jsonResponse({ results: { status: "error", code: 500 } }, 500),
  });
  await assert.rejects(
    httpFailure.createHostedSession(hostedInput()),
    /HTTP 500/,
  );
  const invalidAmount = createPayPlusGateway({
    config: baseConfig,
    transport: async () => jsonResponse({}),
  });
  await assert.rejects(
    invalidAmount.createHostedSession(
      hostedInput({ amountMinor: Number.MAX_SAFE_INTEGER + 1 }),
    ),
    /supported SQL numeric/,
  );
  await assert.rejects(
    invalidAmount.createHostedSession(hostedInput({ currency: "USD" })),
    /Only ILS/,
  );
});

test("status query keeps J4 capture, J5 authorization and unknown distinct", async () => {
  const responses = [
    {
      data: {
        transaction_uid: "txn-j4",
        amount: "12.34",
        currency_code: "ILS",
        charge_method: 1,
        status: "success",
        more_info: "attempt-42",
      },
    },
    {
      data: {
        transaction_uid: "txn-j5",
        amount: "12.34",
        currency_code: "ILS",
        charge_method: 2,
        status: "success",
        more_info: "attempt-42",
      },
    },
    {
      data: {
        transaction_uid: "txn-unclear",
        amount: "12.34",
        currency_code: "ILS",
        status: "success",
      },
    },
  ];
  const fake = transportWith((_url, _init, index) =>
    jsonResponse(responses[index - 1] ?? responses[0]),
  );
  const gateway = createPayPlusGateway({
    config: baseConfig,
    transport: fake.transport,
  });
  const captured = await gateway.queryPayment({ providerRequestId: "req-1" });
  const authorized = await gateway.queryPayment({
    providerTransactionId: "txn-j5",
  });
  const unknown = await gateway.queryPayment({ providerRequestId: "req-3" });
  assert.equal(captured.state, "captured");
  assert.equal(captured.transactionKind, "charge");
  assert.equal(captured.amountMinor, 1234);
  assert.equal(captured.transactionId, "txn-j4");
  assert.equal(captured.attemptReference, "attempt-42");
  assert.equal(authorized.state, "authorized");
  assert.equal(authorized.transactionKind, "authorization");
  assert.equal(unknown.state, "unknown");
  assert.equal(unknown.transactionKind, "unknown");
  assert.equal(unknown.transactionId, "txn-unclear");
  assert.equal(fake.calls[0].body.payment_request_uid, "req-1");
  assert.equal(fake.calls[1].body.transaction_uid, "txn-j5");
  const recovered = await gateway.queryPayment({
    attemptReference: "attempt-crash-recovery",
  });
  assert.equal(fake.calls[3].body.more_info, "attempt-crash-recovery");
  assert.equal(recovered.attemptReference, "attempt-42");
  await assert.rejects(
    gateway.queryPayment({
      providerRequestId: "r",
      providerTransactionId: "t",
    }),
    /exactly one/,
  );
  await assert.rejects(gateway.queryPayment({}), /exactly one/);
});

test("query HTTP and transport failures remain unknown", async () => {
  const badHttp = createPayPlusGateway({
    config: baseConfig,
    transport: async () => jsonResponse({ error: "unavailable" }, 503),
  });
  assert.equal(
    (await badHttp.queryPayment({ providerRequestId: "req" })).state,
    "unknown",
  );
  const timeout = createPayPlusGateway({
    config: baseConfig,
    transport: async () => {
      throw new Error("timeout");
    },
  });
  assert.equal(
    (await timeout.queryPayment({ providerRequestId: "req" })).state,
    "unknown",
  );
});

test("callback HMAC uses documented JSON.stringify serialization and returns only safe references", () => {
  const gateway = createPayPlusGateway({
    config: baseConfig,
    transport: async () => jsonResponse({}),
  });
  const body = {
    data: {
      page_request_uid: "req-abc",
      transaction_uid: "txn-abc",
      more_info: "attempt-42",
      amount: "12.34",
    },
  };
  const raw = JSON.stringify(body);
  const signature = createHmac("sha256", baseConfig.secretKey)
    .update(JSON.stringify(JSON.parse(raw)))
    .digest("base64");
  const verified = gateway.verifyNotification(
    raw,
    new Headers({ "user-agent": "PayPlus", hash: signature }),
  );
  assert.deepEqual(
    { ...verified },
    {
      providerRequestId: "req-abc",
      providerTransactionId: "txn-abc",
      attemptReference: "attempt-42",
      fingerprint: createHash("sha256").update(raw).digest("hex"),
    },
  );
  assert.throws(
    () =>
      gateway.verifyNotification(
        raw,
        new Headers({ "user-agent": "forged", hash: signature }),
      ),
    /user-agent/,
  );
  assert.throws(
    () =>
      gateway.verifyNotification(
        raw,
        new Headers({
          "user-agent": "PayPlus",
          hash: `${signature.slice(0, -3)}xxx`,
        }),
      ),
    /did not verify/,
  );
  assert.throws(
    () =>
      gateway.verifyNotification(
        "{}",
        new Headers({ "user-agent": "PayPlus" }),
      ),
    /signature/,
  );
  assert.throws(
    () => gateway.verifyNotification("x".repeat(65537), new Headers()),
    /too large/,
  );
});

test("refund only verifies explicit provider success with refund transaction UID", async () => {
  const responses = [
    {
      results: { status: "success", code: 0 },
      data: {
        transaction_uid: "refund-uid",
        amount: "12.34",
        currency_code: "ILS",
      },
    },
    { results: { status: "success", code: 0 }, data: {} },
  ];
  const fake = transportWith((_url, _init, index) =>
    jsonResponse(responses[index - 1] ?? responses[0]),
  );
  const gateway = createPayPlusGateway({
    config: baseConfig,
    transport: fake.transport,
  });
  const result = await gateway.refund({
    transactionId: "captured-uid",
    amountMinor: 1234,
    effectKey: "refund-effect-1",
  });
  assert.deepEqual(
    { ...result },
    {
      state: "verified",
      providerTransactionId: "refund-uid",
      amountMinor: 1234,
    },
  );
  assert.equal(fake.calls[0].body.transaction_uid, "captured-uid");
  assert.equal(fake.calls[0].body.amount, 12.34);
  assert.equal(fake.calls[0].body.initial_invoice, false);
  const unproven = await gateway.refund({
    transactionId: "captured-uid",
    amountMinor: 1234,
    effectKey: "refund-effect-2",
  });
  assert.equal(unproven.state, "unknown");
});

test("refund timeout is unknown and must not be automatically retried", async () => {
  const gateway = createPayPlusGateway({
    config: baseConfig,
    transport: async () => {
      throw new Error("timeout after write");
    },
  });
  const result = await gateway.refund({
    transactionId: "captured-uid",
    amountMinor: 100,
    effectKey: "refund-once",
  });
  assert.equal(result.state, "unknown");
});

test("refund lookup verifies only one exact more_info refund row with full binding", async () => {
  const refund = {
    transaction_uid: "refund-uid-1",
    more_info: "stable-refund-effect",
    amount: "12.34",
    currency_code: "ILS",
    charge_method: 4,
    status: "success",
    payment_page_uid: "page-uid",
  };
  const fake = transportWith(() =>
    jsonResponse({ results: { status: "success", code: 0 }, data: [refund] }),
  );
  const gateway = createPayPlusGateway({
    config: baseConfig,
    transport: fake.transport,
  });
  const result = await gateway.queryRefund({
    effectKey: "stable-refund-effect",
  });
  assert.deepEqual(
    { ...result },
    {
      state: "succeeded",
      transactionKind: "refund",
      amountMinor: 1234,
      currency: "ILS",
      refundId: "refund-uid-1",
      requestReference: "stable-refund-effect",
      merchantReference: "page-uid",
    },
  );
  assert.equal(
    fake.calls[0].url,
    "https://restapidev.payplus.co.il/api/v1.0/Transactions/View",
  );
  assert.deepEqual(fake.calls[0].body, { more_info: "stable-refund-effect" });

  const withUid = transportWith(() =>
    jsonResponse({ results: { status: "success", code: 0 }, data: [refund] }),
  );
  const byUid = await createPayPlusGateway({
    config: baseConfig,
    transport: withUid.transport,
  }).queryRefund({
    effectKey: "stable-refund-effect",
    providerRefundId: "refund-uid-1",
  });
  assert.equal(byUid.state, "succeeded");
  assert.deepEqual(withUid.calls[0].body, {
    more_info: "stable-refund-effect",
    transaction_uid: "refund-uid-1",
  });
});

test("refund lookup fails closed for absent, mismatched, ambiguous, non-refund, and incomplete rows", async () => {
  const exact = {
    transaction_uid: "refund-uid-1",
    more_info: "effect-1",
    amount: "1.00",
    currency_code: "ILS",
    charge_method: 4,
    status: "success",
  };
  const responses = [
    { results: { status: "success", code: 0 }, data: [] },
    {
      results: { status: "success", code: 0 },
      data: [{ ...exact, more_info: "different-effect" }],
    },
    {
      results: { status: "success", code: 0 },
      data: [exact, { ...exact, transaction_uid: "refund-uid-2" }],
    },
    {
      results: { status: "success", code: 0 },
      data: [{ ...exact, charge_method: 1 }],
    },
    {
      results: { status: "success", code: 0 },
      data: [{ ...exact, currency_code: "USD" }],
    },
    {
      results: { status: "success", code: 0 },
      data: [{ ...exact, status: "pending" }],
    },
  ];
  const fake = transportWith((_url, _init, index) =>
    jsonResponse(responses[index - 1]),
  );
  const gateway = createPayPlusGateway({
    config: baseConfig,
    transport: fake.transport,
  });
  for (let index = 0; index < responses.length; index++) {
    const result = await gateway.queryRefund({ effectKey: "effect-1" });
    assert.notEqual(
      result.state,
      "succeeded",
      `response ${index} must not prove a refund`,
    );
  }
  const timeout = createPayPlusGateway({
    config: baseConfig,
    transport: async () => {
      throw new Error("timeout");
    },
  });
  assert.equal(
    (await timeout.queryRefund({ effectKey: "effect-1" })).state,
    "unknown",
  );
});
