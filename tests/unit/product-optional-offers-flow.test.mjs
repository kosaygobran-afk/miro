import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
const compiled = new Map();
function load(file, imports = {}, globals = {}) {
  if (!compiled.has(file))
    compiled.set(
      file,
      ts.transpileModule(readFileSync(file, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    );
  const exports = {};
  runInNewContext(compiled.get(file), {
    exports,
    Request,
    Response,
    URL,
    Uint8Array,
    TextDecoder,
    Map,
    Set,
    Number,
    console: { error() {}, warn() {} },
    process: { env: { COMMERCE_PUBLIC_CHECKOUT_ENABLED: "true" } },
    require(name) {
      if (name === "server-only") return {};
      if (name in imports) return imports[name];
      if (name.startsWith("@/") || name.startsWith("./"))
        throw new Error(`Unexpected import ${name} in ${file}`);
      return nodeRequire(name);
    },
    ...globals,
  });
  return exports;
}
const json = (body, options) => Response.json(body, options);
const next = { NextResponse: { json } };
const validation = load("src/lib/commerce/validation.ts", {
  "./money": load("src/lib/commerce/money.ts"),
});
const shared = {
  checkManagementRateLimit: async () => "ok",
  getClientIp: () => "fixture-ip",
};
const origin = {
  hasSameOrigin: (request) =>
    request.headers.get("origin") === "https://miro.example",
};
const http = load("src/lib/commerce/http.ts", {
  "next/server": next,
  "@/lib/auth": {},
  "@/lib/permissions": {},
  "@/lib/request-origin": origin,
  "@/lib/supabase/server": {},
  "@/lib/supabase/admin": {},
  "@/app/api/management/_shared": shared,
});
const dto = load("src/lib/commerce/checkout-dto.ts", {
  "./validation": validation,
  "./http": http,
});
const offerSchemas = load("src/lib/catalog/product-options-schema.ts");
const offerPure = load("src/lib/catalog/product-options.ts");
const ids = {
  parent: "10000000-0000-4000-8000-000000000001",
  target: "10000000-0000-4000-8000-000000000002",
  pv: "20000000-0000-4000-8000-000000000001",
  tv: "20000000-0000-4000-8000-000000000002",
  offer: "30000000-0000-4000-8000-000000000001",
  intent: "40000000-0000-4000-8000-000000000001",
};
const rawOffer = {
  id: ids.offer,
  parent_product_id: ids.parent,
  target_product_id: ids.target,
  target_variant_id: ids.tv,
  kind: "complementary",
  label_he: "תוספת",
  label_en: "Selected extra",
  pricing_mode: "percent",
  discount_bps: 1000,
  fixed_price_agorot: null,
  is_active: true,
  sort_order: 0,
  catalog_price_agorot: 999,
  effective_price_agorot: 899,
};
const catalog = [
  {
    id: ids.parent,
    name: "Canonical parent",
    slug: "parent",
    category: "c",
    priceIls: 10.01,
    variants: [{ id: ids.pv, sku: "P", stockQty: 10, isDefault: true }],
    images: [],
  },
  {
    id: ids.target,
    name: "Canonical target",
    slug: "target",
    category: "c",
    priceIls: 700,
    variants: [{ id: ids.tv, sku: "T", stockQty: 10, isDefault: true }],
    images: [],
    private_cost: "PRIVATE",
  },
];
const eligibilityLines = [
  {
    line_id: "parent-line",
    product_id: ids.parent,
    variant_id: ids.pv,
    quantity: 2,
  },
  {
    line_id: "extra-line",
    product_id: ids.target,
    variant_id: ids.tv,
    quantity: 2,
    offer_id: ids.offer,
    parent_line_id: "parent-line",
    offer_revision: 3,
  },
];
const checkoutLines = eligibilityLines.map((line) =>
  Object.fromEntries(
    Object.entries(line).filter(([key]) => key !== "product_id"),
  ),
);
const customer = {
  user: { id: "customer" },
  role: "customer",
  status: "active",
};
function request(path, body, requestOrigin = "https://miro.example") {
  return new Request(`https://miro.example/api/${path}`, {
    method: "POST",
    headers: { origin: requestOrigin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function storedItem(extra = {}) {
  return {
    line_no: 1,
    product_id: ids.target,
    variant_id: ids.tv,
    quantity: 2,
    unit_price_agorot: 899,
    discount_per_unit_agorot: 0,
    discount_agorot: 0,
    gross_agorot: 1798,
    net_agorot: 1524,
    vat_agorot: 274,
    vat_rate: 18,
    sku_snapshot: "T",
    product_name_he: "תוספת",
    product_name_en: "Extra",
    line_id: "extra-line",
    offer_id: ids.offer,
    parent_line_id: "parent-line",
    offer_revision: 3,
    offer_snapshot: { ...rawOffer, revision: 3 },
    unit_cost_agorot: 123,
    private_provider_reference: "PRIVATE",
    ...extra,
  };
}
function checkoutHarness(options = {}) {
  const calls = [],
    cookies = [];
  function client(scope) {
    return {
      async rpc(name, payload) {
        calls.push({ scope, name, payload });
        if (options.throwRpc) throw new Error("PRIVATE upstream diagnostic");
        return (
          options.rpcResult ?? {
            error: null,
            data: {
              intent: { id: ids.intent },
              items: [storedItem()],
              replayed: false,
              guest_capability: "private-capability",
            },
          }
        );
      },
    };
  }
  const route = load(
    "src/app/api/commerce/checkout/route.ts",
    {
      "@/lib/request-origin": origin,
      "@/lib/supabase/server": {
        createServerSupabaseClient: async () => client("user"),
      },
      "@/lib/supabase/admin": { createAdminClient: () => client("service") },
      "@/lib/auth": { getAuthContext: async () => options.actor ?? null },
      "@/app/api/management/_shared": shared,
      "@/lib/commerce/validation": validation,
      "@/lib/commerce/http": http,
      "@/lib/commerce/checkout-service": {
        storeGuestCapability: async (...args) => cookies.push(args),
      },
      "@/lib/commerce/checkout-dto": dto,
    },
    options.enabled === false ? { process: { env: {} } } : {},
  );
  return { ...route, calls, cookies };
}
const checkoutBody = (items = checkoutLines) => ({
  locale: "en",
  idempotency_key: "optional-offer-checkout-key",
  customer_snapshot: { name: "Fixture customer", email: "test@example.com" },
  items,
});

for (const actor of [null, customer]) {
  const kind = actor ? "customer" : "guest";
  test(`${kind} checkout routes configured identities to protected optional-offer RPC and returns safe snapshots`, async () => {
    const h = checkoutHarness({ actor });
    const response = await h.POST(request("commerce/checkout", checkoutBody()));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].scope, actor ? "user" : "service");
    assert.equal(
      h.calls[0].name,
      actor
        ? "commerce_create_optional_offers_intent"
        : "commerce_create_guest_optional_offers_intent",
    );
    assert.deepEqual(
      JSON.parse(JSON.stringify(h.calls[0].payload.p_payload.items)),
      checkoutLines,
    );
    assert.equal(h.calls[0].payload.p_payload.channel, "website");
    assert.equal("locale" in h.calls[0].payload.p_payload, false);
    assert.equal(JSON.stringify(body).includes("PRIVATE"), false);
    assert.equal("unit_cost_agorot" in body.items[0], false);
    assert.equal("is_active" in body.items[0].offer_snapshot, false);
    assert.equal(body.items[0].offer_snapshot.effective_price_agorot, 899);
    assert.equal(body.next_url, `/en/pay/${ids.intent}`);
    assert.equal(h.cookies.length, actor ? 0 : 1);
    assert.match(response.headers.get("cache-control"), /no-store/);
  });
  test(`${kind} standalone checkout keeps original RPC and strips optional line identity`, async () => {
    const h = checkoutHarness({ actor });
    const response = await h.POST(
      request("commerce/checkout", checkoutBody([checkoutLines[0]])),
    );
    assert.equal(response.status, 200);
    assert.equal(
      h.calls[0].name,
      actor ? "commerce_create_intent" : "commerce_create_guest_intent",
    );
    assert.deepEqual(
      JSON.parse(JSON.stringify(h.calls[0].payload.p_payload.items)),
      [{ variant_id: ids.pv, quantity: 2 }],
    );
  });
}

test("checkout rejects monetary injection and incomplete offer context before every RPC", async () => {
  for (const patch of [
    { unit_price_agorot: 1 },
    { discount_per_unit_agorot: 100 },
    { offer_revision: undefined },
    { parent_line_id: "extra-line" },
    { line_id: undefined },
    { offer_id: undefined },
  ]) {
    const h = checkoutHarness();
    const response = await h.POST(
      request(
        "commerce/checkout",
        checkoutBody([checkoutLines[0], { ...checkoutLines[1], ...patch }]),
      ),
    );
    assert.equal(response.status, 400);
    assert.equal(h.calls.length, 0);
  }
});

test("checkout preserves role, origin and disabled-payment gates", async () => {
  for (const [options, foreign, status] of [
    [{ actor: { ...customer, role: "admin" } }, false, 403],
    [{ actor: { ...customer, status: "suspended" } }, false, 403],
    [{}, true, 403],
    [{ enabled: false }, false, 503],
  ]) {
    const h = checkoutHarness(options);
    const response = await h.POST(
      request(
        "commerce/checkout",
        checkoutBody(),
        foreign ? "https://foreign.example" : undefined,
      ),
    );
    assert.equal(response.status, status);
    assert.equal(h.calls.length, 0);
  }
});

test("stale or uncertain optional checkout never retries or writes a guest capability", async () => {
  const conflict = checkoutHarness({
    rpcResult: {
      data: null,
      error: { code: "PT409", message: "Offer revision changed" },
    },
  });
  assert.equal(
    (await conflict.POST(request("commerce/checkout", checkoutBody()))).status,
    409,
  );
  assert.equal(conflict.calls.length, 1);
  assert.equal(conflict.cookies.length, 0);
  const uncertain = checkoutHarness({ throwRpc: true });
  const response = await uncertain.POST(
    request("commerce/checkout", checkoutBody()),
  );
  assert.equal(response.status, 503);
  assert.equal(uncertain.calls.length, 1);
  assert.equal(uncertain.cookies.length, 0);
  assert.equal(
    JSON.stringify(await response.json()).includes("PRIVATE"),
    false,
  );
});

function offerHarness(options = {}) {
  const rpcCalls = [];
  const loader = load("src/lib/catalog/product-options-server.ts", {
    "@/lib/supabase/server": {
      createServerSupabaseClient: async () => ({
        async rpc(name, args) {
          rpcCalls.push({ name, args });
          if (options.readFailure)
            return { data: null, error: { message: "PRIVATE" } };
          return {
            data: options.projection ?? {
              revision: 3,
              offers: [{ ...rawOffer, ...options.offer }],
            },
            error: null,
          };
        },
      }),
    },
    "./product-options": offerPure,
    "./product-options-schema": offerSchemas,
  });
  const resolver = load("src/lib/catalog/product-options-cart-server.ts", {
    "./product-options-server": loader,
  });
  return { ...loader, ...resolver, rpcCalls };
}

test("public loader uses authoritative exact cents, caller-visible catalog and a minimal DTO", async () => {
  const h = offerHarness();
  const result = await h.getProductOptionalOffers(ids.parent, catalog, "en");
  assert.equal(result.revision, 3);
  assert.equal(result.offers[0].unitPrice, 8.99);
  assert.equal(result.offers[0].regularPrice, 9.99);
  assert.equal(result.offers[0].label, "Selected extra");
  assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
  assert.equal("discount_bps" in result.offers[0], false);
  assert.equal(
    (await h.getProductOptionalOffers(ids.parent, [catalog[0]], "he")).offers
      .length,
    0,
  );
  const unpublished = await offerHarness({
    offer: { catalog_price_agorot: null, effective_price_agorot: null },
  }).getProductOptionalOffers(ids.parent, catalog, "he");
  assert.equal(unpublished.offers[0].unitPrice, null);
});

test("public loader fails closed for missing authoritative prices, foreign parent or malformed projection", async () => {
  for (const options of [
    { readFailure: true },
    { offer: { parent_product_id: ids.target } },
    { offer: { parent_product_id: undefined } },
    { offer: { catalog_price_agorot: undefined } },
    { offer: { effective_price_agorot: undefined } },
    { offer: { effective_price_agorot: -1 } },
  ])
    await assert.rejects(() =>
      offerHarness(options).getProductOptionalOffers(ids.parent, catalog, "he"),
    );
});

function eligibilityHarness(options = {}) {
  const offers = offerHarness(options);
  const products = (options.catalog ?? catalog).map((product) => ({
    id: product.id,
    status: "active",
    sales_channel: "online_checkout",
    price: product.priceIls,
    product_variants: product.variants.map((variant) => ({
      ...variant,
      is_active: true,
      is_default: true,
    })),
  }));
  const route = load("src/app/api/commerce/eligibility/route.ts", {
    "@/lib/supabase/admin": {
      createAdminClient: () => ({
        from: () => ({
          select: () => ({ in: async () => ({ data: products, error: null }) }),
        }),
      }),
    },
    "@/lib/commerce/config": {
      commerceReadiness: () => ({
        configured: true,
        capabilities: { hostedCard: "enabled" },
      }),
    },
    "@/lib/request-origin": origin,
    "@/lib/commerce/validation": validation,
    "@/lib/store-data": {
      getStoreViewer: async () => ({ role: options.role ?? null }),
      getStoreCatalog: async () => ({
        products: options.catalog ?? catalog,
        error: options.catalogError,
      }),
    },
    "@/lib/catalog/product-options-cart-server": offers,
    "@/app/api/management/_shared": shared,
    "@/lib/commerce/http": http,
  });
  return { ...route, offers };
}

test("eligibility verifies fresh offer projection and forwards complete identity without browser prices", async () => {
  const h = eligibilityHarness();
  const response = await h.POST(
    request("commerce/eligibility", { locale: "en", items: eligibilityLines }),
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.eligible, true);
  assert.deepEqual(body.items, checkoutLines);
  assert.equal(h.offers.rpcCalls.length, 1);
});

test("eligibility refuses stale, orphaned, aggregate-stock or privileged selections", async () => {
  for (const [options, lines] of [
    [{}, [eligibilityLines[0], { ...eligibilityLines[1], offer_revision: 2 }]],
    [{}, [{ ...eligibilityLines[1], parent_line_id: "missing" }]],
    [
      {},
      [
        ...eligibilityLines,
        {
          ...eligibilityLines[1],
          line_id: "standalone",
          quantity: 9,
          offer_id: undefined,
          parent_line_id: undefined,
          offer_revision: undefined,
        },
      ],
    ],
    [{ role: "admin" }, eligibilityLines],
  ]) {
    const response = await eligibilityHarness(options).POST(
      request("commerce/eligibility", { items: lines }),
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).eligible, false);
  }
});

test("eligibility reports unavailable after fresh catalog or offer read failure", async () => {
  for (const options of [
    { readFailure: true },
    { catalogError: "unavailable" },
  ]) {
    const response = await eligibilityHarness(options).POST(
      request("commerce/eligibility", { items: eligibilityLines }),
    );
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "commerce_unavailable");
  }
});

const cartOffer = {
  id: ids.offer,
  revision: 3,
  kind: "accompanying",
  label: "FORGED LABEL",
  productId: ids.target,
  variantId: ids.tv,
  name: "FORGED NAME",
  sku: "FORGED SKU",
  slug: "target",
  category: "c",
  imageUrl: null,
  unitPrice: 0.01,
};
const enquiryBody = () => ({
  name: "Fixture",
  email: "fixture@example.com",
  phone: "",
  message: "Fixture request",
  locale: "en",
  source: "checkout_page",
  cart: [
    {
      productId: ids.parent,
      variantId: ids.pv,
      slug: "parent",
      name: "FORGED PARENT",
      unitPrice: 0.01,
      quantity: 2,
      lineId: "parent-line",
      optionalOffers: [cartOffer],
    },
  ],
  shipping: { address: "Fixture street", city: "Fixture city", postalCode: "" },
});
function enquiryHarness(options = {}) {
  const calls = [],
    offers = offerHarness(options);
  const route = load("src/app/api/enquiries/route.ts", {
    "next/server": next,
    "@/lib/supabase/server": {
      createServerSupabaseClient: async () => ({
        async rpc(name, payload) {
          calls.push({ name, payload });
          return {
            data: name === "check_rate_limit" ? true : "request-id",
            error: null,
          };
        },
      }),
    },
    "@/lib/request-origin": origin,
    "@/lib/store-data": {
      getStoreViewer: async () => ({ role: null }),
      getStoreCatalog: async () => ({ products: catalog, error: null }),
    },
    "@/lib/catalog/pricing": {
      resolvePrice: ({ basePrice }) => ({ effectivePrice: basePrice }),
    },
    "@/lib/catalog/product-options-cart-server": offers,
  });
  return { ...route, calls };
}

test("quote-only enquiry rebuilds selected product metadata and exact totals from fresh server prices", async () => {
  const h = enquiryHarness();
  const response = await h.POST(request("enquiries", enquiryBody()));
  assert.equal(response.status, 200);
  const write = h.calls.find(
    (entry) => entry.name === "create_service_request",
  );
  const checkout = write.payload.p_metadata.checkout;
  assert.equal(checkout.estimated_subtotal, 38);
  assert.equal(checkout.payment_collected, false);
  assert.equal(checkout.cart.length, 2);
  assert.equal(checkout.cart[0].unitPrice, 10.01);
  assert.equal(checkout.cart[1].unitPrice, 8.99);
  assert.equal(checkout.cart[1].offerKind, "complementary");
  assert.equal(checkout.cart[1].label, "Selected extra");
  assert.equal(checkout.cart[1].parentLineId, "parent-line");
  assert.equal(checkout.cart[1].offerRevision, 3);
  assert.equal(JSON.stringify(write.payload).includes("FORGED"), false);
});

test("enquiry rejects stale offers, forged target slugs and unknown reads without creating requests", async () => {
  for (const [options, patch, status] of [
    [{}, { revision: 2 }, 409],
    [{}, { slug: "forged-target" }, 409],
    [{ readFailure: true }, {}, 503],
  ]) {
    const h = enquiryHarness(options),
      body = enquiryBody();
    body.cart[0].optionalOffers = [{ ...cartOffer, ...patch }];
    const response = await h.POST(request("enquiries", body));
    assert.equal(response.status, status);
    assert.equal(
      h.calls.some((entry) => entry.name === "create_service_request"),
      false,
    );
  }
});
