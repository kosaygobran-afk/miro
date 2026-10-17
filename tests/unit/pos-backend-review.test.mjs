import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const money = await moduleAt("../../src/lib/commerce/money.ts");
const validation = await moduleAt("../../src/lib/commerce/validation.ts", {
  "./money": money,
});
const sanitize = await moduleAt("../../src/lib/pos-sale.ts");
const variantId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
class CommerceError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
const http = {
  CommerceError,
  commerceJson: (body, status = 200) => ({
    body,
    status,
    headers: { "Cache-Control": "private, no-store" },
  }),
  commerceFailure: (error) => ({
    body: { code: error.code ?? "commerce_unavailable" },
    status: error.status ?? 503,
  }),
  readCommerceJson: async (request) => request.json(),
  checkRpcError: (error) => {
    if (error)
      throw new CommerceError(
        error.code === "PGRST202"
          ? "commerce_migration_required"
          : "commerce_unavailable",
        503,
      );
  },
};

async function moduleAt(path, imports = {}) {
  const exports = {};
  const compiled = ts.transpileModule(
    await readFile(new URL(path, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  runInNewContext(compiled, {
    exports,
    URL,
    Map,
    Set,
    Promise,
    Request,
    Response,
    Headers,
    AbortController,
    TextDecoder,
    Uint8Array,
    Buffer,
    process,
    fetch,
    setTimeout,
    clearTimeout,
    console: { error() {} },
    require: (name) =>
      name === "server-only" ? {} : (imports[name] ?? require(name)),
  });
  return exports;
}

async function catalogHarness({
  authorized = true,
  rate = "ok",
  availabilityError = null,
  matchingProducts = [{ product_id: productId }],
  navigationCategories = [],
} = {}) {
  const queries = [];
  const product = {
    id: productId,
    slug: "camera",
    name_he: "מצלמה",
    name_en: "Camera",
    image_url: null,
    price: 100,
    sale_price: null,
    tracking_mode: "quantity",
    categories: {
      id: productId,
      slug: "cameras",
      name_he: "מצלמות",
      name_en: "Cameras",
    },
    product_variants: [
      {
        id: variantId,
        sku: "CAM1",
        is_active: true,
        pos_enabled: true,
        stock_qty: 5,
        pos_price: 75,
        price_override: 80,
      },
      {
        id: productId,
        sku: "DISABLED",
        is_active: true,
        pos_enabled: false,
        stock_qty: 5,
      },
    ],
  };
  const admin = {
    async rpc(name, payload) {
      queries.push({ table: name, payload });
      assert.equal(name, "commerce_pos_available_stock");
      if (availabilityError) return { data: null, error: availabilityError };
      return {
        data: [
          {
            variant_id: variantId,
            stock_qty: 5,
            reserved_qty: 2,
            available_qty: 3,
          },
        ],
        error: null,
      };
    },
    from(table) {
      const query = { table, operations: [] };
      queries.push(query);
      for (const method of [
        "select",
        "eq",
        "is",
        "order",
        "or",
        "limit",
        "range",
      ])
        query[method] = (...args) => {
          query.operations.push({ method, args });
          return query;
        };
      query.then = (resolve, reject) =>
        Promise.resolve({
          data:
            table === "products"
              ? [product]
              : table === "product_variants"
                ? matchingProducts
                : table === "categories"
                  ? navigationCategories.filter((category) =>
                      query.operations.every(
                        ({ method, args }) =>
                          !["eq", "is"].includes(method) ||
                          category[args[0]] === args[1],
                      ),
                    )
                  : [],
          count: table === "products" ? 1 : null,
          error: null,
        }).then(resolve, reject);
      return query;
    },
  };
  const route = await moduleAt(
    "../../src/app/api/management/pos/catalog/route.ts",
    {
      "next/server": {
        NextResponse: {
          json: (body, options = {}) => ({
            body,
            status: options.status ?? 200,
          }),
        },
      },
      "@/lib/commerce/http": http,
      "@/app/api/management/_shared": {
        withManagementAuth: async (_request, capability) => {
          assert.equal(capability, "recordSale");
          return authorized
            ? { ok: true, admin }
            : { ok: false, response: { status: 403 } };
        },
        checkManagementRateLimit: async () => rate,
        getClientIp: () => "fixture",
        errorResponse: (error, status = 500) => ({ body: { error }, status }),
        mapPostgresError: () => ({ status: 503 }),
      },
    },
  );
  return { ...route, queries };
}

test("POS catalog requires cashier access and fails closed on unavailable rate-limit storage", async () => {
  for (const [options, expected] of [
    [{ authorized: false }, 403],
    [{ rate: "error" }, 503],
    [{ rate: "limited" }, 429],
  ]) {
    const route = await catalogHarness(options);
    const response = await route.GET(
      new Request("https://miro.example/api/management/pos/catalog"),
    );
    assert.equal(response.status, expected);
    assert.equal(route.queries.length, 0);
  }
});

test("POS category navigation excludes children and inactive roots while products retain their explicit root relationship", async () => {
  const route = await catalogHarness({
    navigationCategories: [
      { id: productId, parent_id: null, is_active: true },
      { id: variantId, parent_id: productId, is_active: true },
      {
        id: "33333333-3333-4333-8333-333333333333",
        parent_id: null,
        is_active: false,
      },
    ],
  });
  const response = await route.GET(
    new Request(
      `https://miro.example/api/management/pos/catalog?category=${productId}`,
    ),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(
    Array.from(response.body.categories, (category) => category.id),
    [productId],
  );
  assert.equal(response.body.products[0].category.id, productId);
  const productQuery = route.queries.find(
    (query) => query.table === "products",
  );
  const select = productQuery.operations.find(
    (operation) => operation.method === "select",
  ).args[0];
  assert.match(select, /categories!products_category_id_fkey!inner\s*\(/);
  assert.equal(
    productQuery.operations.some(
      ({ method, args }) =>
        method === "eq" && args[0] === "categories.id" && args[1] === productId,
    ),
    true,
  );
});

test("POS catalog quotes reserved filter characters and uses canonical POS prices/held stock", async () => {
  const route = await catalogHarness();
  const term = 'CAM,price.gt.0)("\\model';
  const url = new URL("https://miro.example/api/management/pos/catalog");
  url.searchParams.set("q", term);
  const response = await route.GET(new Request(url));
  assert.equal(response.status, 200);
  const filter = route.queries
    .find((q) => q.table === "product_variants")
    .operations.find((op) => op.method === "or").args[0];
  const exact = '"CAM,price.gt.0)(\\"\\\\model"';
  const quoted = '"%CAM,price.gt.0)(\\"\\\\\\\\model%"';
  assert.equal(
    filter,
    `sku.eq.${exact},barcode.eq.${exact},sku.ilike.${quoted},barcode.ilike.${quoted}`,
  );
  const productQuery = route.queries.find((q) => q.table === "products");
  assert.equal(
    productQuery.operations.some(
      (op) =>
        op.method === "eq" &&
        op.args[0] === "product_variants.pos_enabled" &&
        op.args[1] === true,
    ),
    true,
  );
  const variants = response.body.products[0].variants;
  assert.equal(variants.length, 1);
  assert.equal(variants[0].price_override, 75);
  assert.equal(variants[0].stock_qty, 3);
  assert.equal(variants[0].on_hand_qty, 5);
  assert.equal(variants[0].reserved_qty, 2);
  assert.equal(response.headers["Cache-Control"], "private, no-store");
});

test("POS SKU search retains literal underscore/percent characters and exact scanner matches", async () => {
  const route = await catalogHarness();
  const url = new URL("https://miro.example/api/management/pos/catalog");
  url.searchParams.set("q", "CAM_%*");
  await route.GET(new Request(url));
  const filter = route.queries
    .find((q) => q.table === "product_variants")
    .operations.find((op) => op.method === "or").args[0];
  assert.equal(
    filter,
    'sku.eq."CAM_%*",barcode.eq."CAM_%*",sku.ilike."%CAM\\\\_\\\\%\\\\*%",barcode.ilike."%CAM\\\\_\\\\%\\\\*%"',
  );
});

test("POS pagination rejects unsafe/unbounded page offsets before catalog reads", async () => {
  const route = await catalogHarness();
  const response = await route.GET(
    new Request(
      "https://miro.example/api/management/pos/catalog?page=9007199254740992",
    ),
  );
  assert.equal(response.status, 400);
  assert.equal(route.queries.length, 0);
});

test("exact scanner queries exclude prefix/name matches before bounded pagination", async () => {
  const route = await catalogHarness();
  const response = await route.GET(
    new Request(
      "https://miro.example/api/management/pos/catalog?q=CAM1&exact=1",
    ),
  );
  assert.equal(response.status, 200);
  assert.equal(
    route.queries
      .find((q) => q.table === "product_variants")
      .operations.find((op) => op.method === "or").args[0],
    'sku.ilike."CAM1",barcode.eq."CAM1"',
  );
  assert.equal(
    route.queries
      .find((q) => q.table === "products")
      .operations.find((op) => op.method === "or").args[0],
    `id.in.(${productId})`,
  );
  const empty = await catalogHarness({ matchingProducts: [] });
  const missing = await empty.GET(
    new Request(
      "https://miro.example/api/management/pos/catalog?q=CAM1&exact=1",
    ),
  );
  assert.equal(missing.status, 200);
  assert.equal(missing.body.products.length, 0);
  assert.equal(missing.body.totalCount, 0);
  assert.equal(
    empty.queries.some((q) => q.table === "commerce_pos_available_stock"),
    false,
  );
  const invalid = await catalogHarness();
  assert.equal(
    (
      await invalid.GET(
        new Request("https://miro.example/api/management/pos/catalog?exact=1"),
      )
    ).status,
    400,
  );
});

test("missing POS availability migration never falls back to unsafe on-hand stock", async () => {
  const route = await catalogHarness({
    availabilityError: {
      code: "PGRST202",
      message: "PRIVATE missing RPC detail",
    },
  });
  const response = await route.GET(
    new Request("https://miro.example/api/management/pos/catalog"),
  );
  assert.equal(response.status, 503);
  assert.equal(response.body.code, "commerce_migration_required");
  assert.equal(Object.hasOwn(response.body, "products"), false);
  assert.equal(JSON.stringify(response).includes("PRIVATE"), false);
});

test("public quote DTO strips internal costs and all unrecognized snapshot fields", async () => {
  const dto = await moduleAt("../../src/lib/commerce/checkout-dto.ts", {
    "./http": http,
    "./validation": validation,
  });
  const item = {
    line_no: 1,
    product_id: productId,
    variant_id: variantId,
    quantity: 1,
    unit_price_agorot: 11800,
    discount_per_unit_agorot: 0,
    discount_agorot: 0,
    gross_agorot: 11800,
    net_agorot: 10000,
    vat_agorot: 1800,
    vat_rate: 18,
    sku_snapshot: "CAM1",
    product_name_he: "מצלמה",
    product_name_en: "Camera",
    unit_cost_agorot: 5000,
    provider_secret: "private",
    intent_id: "internal",
  };
  const result = dto.checkoutItemsDto([item]);
  assert.equal(result[0].unit_price_agorot, 11800);
  for (const field of ["unit_cost_agorot", "provider_secret", "intent_id"])
    assert.equal(Object.hasOwn(result[0], field), false);
  assert.throws(
    () => dto.checkoutItemsDto([{ ...item, gross_agorot: 1.5 }]),
    /commerce_unavailable/,
  );
});

async function salesHarness({ rpcError = null } = {}) {
  const writes = [];
  const route = await moduleAt("../../src/app/api/management/sales/route.ts", {
    "next/server": {
      NextResponse: {
        json: (body, options = {}) => ({ body, status: options.status ?? 200 }),
      },
    },
    "@/lib/commerce/http": http,
    "@/lib/commerce/money": money,
    "@/lib/pos-sale": sanitize,
    "@/lib/sales-channel": {
      PAYMENT_METHODS: [
        "cash",
        "credit_card",
        "bit",
        "bank_transfer",
        "check",
        "other",
      ],
      channelDbValues: () => ["pos"],
    },
    "@/lib/supabase/server": {
      createServerSupabaseClient: async () => ({
        async rpc(name, payload) {
          writes.push({ name, payload });
          return {
            data: {
              order_id: productId,
              order_number: "MIRO-TEST-1",
              source: "pos",
              status: "paid",
            },
            error: rpcError,
          };
        },
      }),
    },
    "@/app/api/management/_shared": {
      withManagementAuth: async () => ({ ok: true, admin: {} }),
      checkManagementRateLimit: async () => "ok",
      getClientIp: () => "fixture",
      errorResponse: (error, status = 500) => ({ body: { error }, status }),
    },
  });
  return { ...route, writes };
}
const legacySale = {
  customer: { name: "Walk-in" },
  items: [{ variantId, quantity: 3, unitPrice: 0.1, discountPerUnit: 0 }],
  payments: [{ method: "cash", amount: 0.3, installments: 1 }],
  idempotencyKey: "legacy-sale-key",
};
const saleRequest = (body) =>
  new Request("https://miro.example/api/management/sales", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("legacy sale accepts optional guest email and computes exact decimal payment balance", async () => {
  const route = await salesHarness();
  const response = await route.POST(saleRequest(legacySale));
  assert.equal(response.status, 200);
  assert.equal(route.writes.length, 1);
  assert.equal(route.writes[0].payload.p_customer.email, null);
  assert.equal(route.writes[0].payload.p_payments[0].amount, 0.3);
});

test("legacy sale rejects fractional cents, oversized totals, installment cash, and payment mismatch before writes", async () => {
  for (const body of [
    { ...legacySale, items: [{ ...legacySale.items[0], unitPrice: 0.001 }] },
    { ...legacySale, items: [{ ...legacySale.items[0], quantity: 10_001 }] },
    {
      ...legacySale,
      items: [
        {
          ...legacySale.items[0],
          quantity: 10_000,
          unitPrice: 9_999_999_999.99,
        },
      ],
    },
    {
      ...legacySale,
      payments: [{ ...legacySale.payments[0], installments: 2 }],
    },
    { ...legacySale, payments: [{ ...legacySale.payments[0], amount: 0.31 }] },
    {
      ...legacySale,
      items: [
        {
          ...legacySale.items[0],
          discountPerUnit: 0.01,
          discount_per_unit: 0.02,
        },
      ],
    },
  ]) {
    const route = await salesHarness();
    assert.equal((await route.POST(saleRequest(body))).status, 400);
    assert.equal(route.writes.length, 0);
  }
});

test("legacy sale returns reviewable conflict and keeps private database diagnostics out of responses", async () => {
  const route = await salesHarness({
    rpcError: { code: "PT409", message: "PRIVATE database price or identity" },
  });
  const response = await route.POST(saleRequest(legacySale));
  assert.equal(response.status, 409);
  assert.equal(response.body.code, "sale_conflict");
  assert.equal(JSON.stringify(response).includes("PRIVATE"), false);
});

test("bit installments and non-cash change are rejected before any financial operation", () => {
  assert.equal(
    validation.startAttemptSchema.safeParse({
      intent_id: productId,
      method: "bit",
      installments: 2,
      idempotency_key: "bit-payment-key-123",
    }).success,
    false,
  );
  const tender = {
    intent_id: productId,
    method: "cash",
    amount_agorot: 100,
    cash_received_agorot: 100,
    confirmed_received: true,
    idempotency_key: "cash-tender-key-123",
  };
  assert.equal(validation.manualTenderSchema.safeParse(tender).success, true);
  assert.equal(
    validation.manualTenderSchema.safeParse({
      ...tender,
      cash_received_agorot: 99,
    }).success,
    false,
  );
  assert.equal(
    validation.manualTenderSchema.safeParse({
      ...tender,
      method: "credit_card",
    }).success,
    false,
  );
  assert.equal(
    validation.manualTenderSchema.safeParse({
      ...tender,
      reference: "x".repeat(121),
    }).success,
    false,
  );
});

test("provider payment lookup fails closed when a HTTP-success response explicitly reports API failure", async () => {
  const common = await moduleAt("../../src/lib/commerce/payments/index.ts");
  const adapter = await moduleAt("../../src/lib/commerce/payments/payplus.ts", {
    "./index": common,
  });
  const gateway = adapter.createPayPlusGateway({
    config: {
      environment: "sandbox",
      apiKey: "fixture",
      secretKey: "fixture",
      paymentPageUid: "fixture",
    },
    transport: async () =>
      new Response(
        JSON.stringify({
          results: { status: "error", code: 403 },
          data: {
            status: "success",
            charge_method: 1,
            transaction_uid: "misleading",
            currency_code: "ILS",
            amount: "1.00",
            more_info: variantId,
          },
        }),
      ),
  });
  const result = await gateway.queryPayment({ providerRequestId: "request" });
  assert.equal(result.state, "unknown");
  assert.equal(result.transactionKind, "unknown");
});

test("known business RPC failures distinguish rejected quotes from uncertain key conflicts without exposing raw diagnostics", async () => {
  const actualHttp = await moduleAt("../../src/lib/commerce/http.ts", {
    "next/server": { NextResponse: { json: () => ({}) } },
    "@/lib/auth": {},
    "@/lib/permissions": {},
    "@/lib/request-origin": {},
    "@/lib/supabase/server": {},
    "@/lib/supabase/admin": {},
    "@/app/api/management/_shared": {},
  });
  for (const [message, code] of [
    ["Insufficient available stock", "insufficient_stock"],
    ["Idempotency payload conflict", "idempotency_conflict"],
    ["Open cash shift required", "cash_shift_required"],
    ["PRIVATE internal detail", "revision_conflict"],
    ["__proto__", "revision_conflict"],
  ]) {
    assert.throws(
      () => actualHttp.checkRpcError({ code: "PT409", message }),
      (error) => error.code === code && error.status === 409,
    );
  }
});

async function checkoutStatusHarness({ guest = false, paid = false } = {}) {
  const line = {
    line_no: 1,
    product_id: productId,
    variant_id: variantId,
    quantity: 1,
    unit_price_agorot: 11800,
    discount_per_unit_agorot: 0,
    discount_agorot: 0,
    gross_agorot: 11800,
    net_agorot: 10000,
    vat_agorot: 1800,
    vat_rate: 18,
    sku_snapshot: "CAM1",
    product_name_he: "מצלמה",
    product_name_en: "Camera",
    unit_cost_agorot: 5000,
  };
  const admin = {
    from(table) {
      const data =
        table === "payment_attempts"
          ? [
              {
                id: variantId,
                state: "captured",
                method: "cash",
                amount_agorot: 5000,
                collection_kind: "manual_recorded",
                idempotency_key: "cash-payment-key-1",
              },
              {
                id: productId,
                state: "declined",
                method: "credit_card",
                amount_agorot: 6800,
                collection_kind: "provider_collected",
                idempotency_key: "card-payment-key-1",
              },
            ]
          : table === "orders"
            ? { order_number: "MIRO-TEST-1" }
            : [line];
      const query = {};
      for (const method of ["select", "eq", "order", "limit", "single"])
        query[method] = () => query;
      query.then = (resolve, reject) =>
        Promise.resolve({ data, error: null }).then(resolve, reject);
      return query;
    },
  };
  return moduleAt("../../src/app/api/commerce/intents/[id]/route.ts", {
    "@/lib/commerce/http": {
      ...http,
      checkRpcError: (error) => {
        if (error) throw error;
      },
    },
    "@/lib/commerce/config": {
      commerceReadiness: () => ({ configured: false }),
    },
    "@/lib/commerce/money": money,
    "@/lib/commerce/checkout-dto": await moduleAt(
      "../../src/lib/commerce/checkout-dto.ts",
      { "./http": http, "./validation": validation },
    ),
    "@/lib/commerce/checkout-service": {
      authorizeCheckout: async () => ({
        admin,
        actor: guest ? null : { user: { id: "cashier" } },
        intent: {
          id: variantId,
          channel: "pos",
          total_agorot: 11800,
          status: paid ? "paid" : "partially_paid",
          finalized_order_id: paid ? productId : null,
        },
      }),
    },
  });
}

test("checkout status exposes exact remaining split balance, canonical quote and cashier resume without internal costs", async () => {
  const route = await checkoutStatusHarness();
  const response = await route.GET(
    new Request("https://miro.example/api/commerce/intents/" + variantId),
    { params: Promise.resolve({ id: variantId }) },
  );
  assert.equal(response.status, 200);
  assert.equal(response.body.intent.remaining_agorot, 6800);
  assert.equal(response.body.intent.channel, "pos");
  assert.equal(response.body.resume_pos_url, "/admin/pos");
  assert.equal(response.body.attempts[0].idempotency_key, "cash-payment-key-1");
  assert.equal(response.body.items[0].unit_price_agorot, 11800);
  assert.equal(
    Object.hasOwn(response.body.items[0], "unit_cost_agorot"),
    false,
  );
});

test("guest capability checkout status never advertises a cashier console route and finalized orders have zero balance", async () => {
  const route = await checkoutStatusHarness({ guest: true, paid: true });
  const response = await route.GET(
    new Request("https://miro.example/api/commerce/intents/" + variantId),
    { params: Promise.resolve({ id: variantId }) },
  );
  assert.equal(response.body.resume_pos_url, null);
  assert.equal(response.body.intent.remaining_agorot, 0);
  assert.equal(response.body.intent.order_number, "MIRO-TEST-1");
});
