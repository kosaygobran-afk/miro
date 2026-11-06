import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { z } from "zod";
import ts from "typescript";

const compile = (path) =>
  ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const schemaExports = {};
runInNewContext(compile("src/lib/catalog/product-options-schema.ts"), {
  exports: schemaExports,
  require(name) {
    assert.equal(name, "zod");
    return { z };
  },
});
const productRoute = compile("src/app/api/management/products/route.ts");
const detailRoute = compile("src/app/api/management/products/[id]/route.ts");
const parentId = "a1000000-abcd-4123-8abc-000000000001";
const targetId = "b2000000-abcd-4123-8abc-000000000002";
const variantId = "c3000000-abcd-4123-8abc-000000000003";
const offerId = "d4000000-abcd-4123-8abc-000000000004";
const plain = (value) => JSON.parse(JSON.stringify(value));
const offer = (patch = {}) => ({
  target_product_id: targetId,
  target_variant_id: variantId,
  kind: "complementary",
  label_he: null,
  label_en: null,
  pricing_mode: "catalog",
  discount_bps: null,
  fixed_price_agorot: null,
  is_active: true,
  sort_order: 0,
  ...patch,
});

function harness({
  authorized = true,
  rpcError = null,
  product = { id: parentId, name_en: "Parent" },
  projection = { revision: 0, offers: [] },
  savedProduct = { id: parentId, name_en: "Updated parent" },
} = {}) {
  const calls = [],
    queries = [],
    revalidated = [];
  let userClients = 0;
  const admin = {
    from(table) {
      queries.push(table);
      const builder = {};
      for (const method of ["select", "eq"]) builder[method] = () => builder;
      builder.maybeSingle = async () => ({ data: product, error: null });
      return builder;
    },
  };
  const modules = {
    "next/server": {
      NextResponse: {
        json(body, options = {}) {
          return { body: plain(body), status: 200, ...options };
        },
      },
    },
    zod: { z },
    "@/lib/catalog/product-options-schema": schemaExports,
    "@/lib/catalog/category-errors": { getCategoryWriteError: () => null },
    "@/app/api/management/_shared": {
      withManagementAuth: async (_request, capability) => {
        assert.equal(capability, "manageCatalog");
        return authorized
          ? { ok: true, admin }
          : {
              ok: false,
              response: { status: 403, body: { error: "Forbidden" } },
            };
      },
      errorResponse: (error, status = 500) => ({ status, body: { error } }),
      mapPostgresError: (error) => ({
        status: error.code === "42501" ? 403 : 500,
        body: { error: "Operation failed" },
      }),
      mapPriceConstraintError: () => ({
        status: 400,
        body: { error: "Invalid price" },
      }),
    },
    "@/lib/supabase/server": {
      createServerSupabaseClient: async () => {
        userClients++;
        return {
          rpc: async (name, args) => {
            calls.push({ name, args: plain(args) });
            return {
              error: rpcError,
              data:
                name === "management_read_product_optional_offers"
                  ? projection
                  : name === "update_product_with_optional_offers"
                    ? { product: savedProduct, revision: 3 }
                    : savedProduct,
            };
          },
        };
      },
    },
    "next/cache": {
      revalidatePath: (path, type) => revalidated.push([path, type]),
    },
  };
  function load(source) {
    const exports = {};
    runInNewContext(source, {
      exports,
      URL,
      console: { error() {} },
      require(name) {
        assert.ok(name in modules, `Unexpected import: ${name}`);
        return modules[name];
      },
    });
    return exports;
  }
  const routes = load(productRoute),
    detail = load(detailRoute);
  return {
    calls,
    queries,
    revalidated,
    get userClients() {
      return userClients;
    },
    patch: (body) =>
      routes.PATCH(
        new Request("http://localhost/api/management/products", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      ),
    get: (id = parentId) =>
      detail.GET(
        new Request(`http://localhost/api/management/products/${id}`),
        { params: Promise.resolve({ id }) },
      ),
  };
}

test("ordinary product PATCH preserves the original single user-context update_product RPC", async () => {
  const h = harness();
  const response = await h.patch({
    id: parentId,
    name_en: "New name",
    price: 120,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(h.calls, [
    {
      name: "update_product",
      args: { p_id: parentId, p_patch: { name_en: "New name", price: 120 } },
    },
  ]);
  assert.equal(h.userClients, 1);
  assert.equal(h.queries.length, 0);
  assert.equal(response.body.product.id, parentId);
  assert.ok(
    h.revalidated.some(([path]) => path === "/he/store/[category]/[slug]"),
  );
});

for (const core of [{}, { name_he: "שם חדש", price: 125 }])
  test(`offer ${Object.keys(core).length ? "and core" : "only"} PATCH uses one atomic RPC and strips revision/offer metadata from core patch`, async () => {
    const h = harness();
    const payload = offer({
      label_en: "  Offer label  ",
      pricing_mode: "percent",
      discount_bps: 1250,
    });
    const response = await h.patch({
      id: parentId,
      ...core,
      optional_offers: [payload],
      expected_optional_offers_revision: 2,
    });
    assert.equal(response.status, 200);
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.calls[0], {
      name: "update_product_with_optional_offers",
      args: {
        p_id: parentId,
        p_patch: core,
        p_offers: [{ ...payload, label_en: "Offer label" }],
        p_expected_revision: 2,
      },
    });
    assert.deepEqual(response.body, {
      product: { id: parentId, name_en: "Updated parent" },
    });
    assert.equal(h.userClients, 1);
  });

test("empty replacement is an intentional atomic removal rather than Nothing to update", async () => {
  const h = harness();
  assert.equal(
    (
      await h.patch({
        id: parentId,
        optional_offers: [],
        expected_optional_offers_revision: 0,
      })
    ).status,
    200,
  );
  assert.deepEqual(h.calls[0].args.p_offers, []);
  assert.deepEqual(h.calls[0].args.p_patch, {});
});

const invalidBodies = [
  ["missing revision", { optional_offers: [offer()] }],
  ["orphan revision", { expected_optional_offers_revision: 0 }],
  [
    "negative revision",
    { optional_offers: [], expected_optional_offers_revision: -1 },
  ],
  [
    "self link",
    {
      optional_offers: [offer({ target_product_id: parentId })],
      expected_optional_offers_revision: 0,
    },
  ],
  [
    "case-insensitive self link",
    {
      optional_offers: [offer({ target_product_id: parentId.toUpperCase() })],
      expected_optional_offers_revision: 0,
    },
  ],
  [
    "duplicate target across groups",
    {
      optional_offers: [
        offer(),
        offer({ kind: "accompanying", sort_order: 1 }),
      ],
      expected_optional_offers_revision: 0,
    },
  ],
  [
    "case-insensitive duplicate target",
    {
      optional_offers: [
        offer(),
        offer({
          target_variant_id: variantId.toUpperCase(),
          kind: "accompanying",
        }),
      ],
      expected_optional_offers_revision: 0,
    },
  ],
  [
    "invalid target UUID",
    {
      optional_offers: [offer({ target_product_id: "not-a-product" })],
      expected_optional_offers_revision: 0,
    },
  ],
  [
    "invalid variant UUID",
    {
      optional_offers: [offer({ target_variant_id: "not-a-variant" })],
      expected_optional_offers_revision: 0,
    },
  ],
  [
    "unknown pricing mode",
    {
      optional_offers: [offer({ pricing_mode: "free" })],
      expected_optional_offers_revision: 0,
    },
  ],
  [
    "catalog mode with discount",
    {
      optional_offers: [offer({ discount_bps: 1000 })],
      expected_optional_offers_revision: 0,
    },
  ],
  [
    "mixed fixed and percent",
    {
      optional_offers: [
        offer({
          pricing_mode: "fixed",
          fixed_price_agorot: 4990,
          discount_bps: 1000,
        }),
      ],
      expected_optional_offers_revision: 0,
    },
  ],
  [
    "excess percent",
    {
      optional_offers: [offer({ pricing_mode: "percent", discount_bps: 9501 })],
      expected_optional_offers_revision: 0,
    },
  ],
  [
    "zero fixed amount",
    {
      optional_offers: [
        offer({ pricing_mode: "fixed", fixed_price_agorot: 0 }),
      ],
      expected_optional_offers_revision: 0,
    },
  ],
  [
    "fractional agorot",
    {
      optional_offers: [
        offer({ pricing_mode: "fixed", fixed_price_agorot: 1.5 }),
      ],
      expected_optional_offers_revision: 0,
    },
  ],
  [
    "excess fixed amount",
    {
      optional_offers: [
        offer({ pricing_mode: "fixed", fixed_price_agorot: 100_000_001 }),
      ],
      expected_optional_offers_revision: 0,
    },
  ],
  [
    "private cost inside offer",
    {
      optional_offers: [offer({ purchase_cost: 10 })],
      expected_optional_offers_revision: 0,
    },
  ],
  [
    "picker descriptor inside offer",
    {
      optional_offers: [offer({ target: { name_en: "forged" } })],
      expected_optional_offers_revision: 0,
    },
  ],
  [
    "oversized label",
    {
      optional_offers: [offer({ label_en: "a".repeat(161) })],
      expected_optional_offers_revision: 0,
    },
  ],
];
for (const [name, patch] of invalidBodies)
  test(`optional offer PATCH rejects ${name} before any RPC`, async () => {
    const h = harness();
    assert.equal((await h.patch({ id: parentId, ...patch })).status, 400);
    assert.equal(h.calls.length, 0);
    assert.equal(h.userClients, 0);
    assert.equal(h.revalidated.length, 0);
  });

test("revision conflict returns the explicit 409 contract with no revalidation or retries", async () => {
  const h = harness({ rpcError: { code: "PT409", message: "conflict" } });
  const response = await h.patch({
    id: parentId,
    optional_offers: [offer()],
    expected_optional_offers_revision: 1,
  });
  assert.equal(response.status, 409);
  assert.equal(response.body.code, "revision_conflict");
  assert.equal(h.calls.length, 1);
  assert.equal(h.revalidated.length, 0);
});

test("database target-product/variant mismatch is a safe validation failure", async () => {
  const h = harness({
    rpcError: { code: "22023", message: "Invalid target product or variant" },
  });
  assert.equal(
    (
      await h.patch({
        id: parentId,
        optional_offers: [offer()],
        expected_optional_offers_revision: 0,
      })
    ).status,
    400,
  );
  assert.equal(h.calls.length, 1);
  assert.equal(h.revalidated.length, 0);
});

test("unauthorized callers cannot read or mutate optional offers or create user clients", async () => {
  const h = harness({ authorized: false });
  assert.equal(
    (
      await h.patch({
        id: parentId,
        optional_offers: [offer()],
        expected_optional_offers_revision: 0,
      })
    ).status,
    403,
  );
  assert.equal((await h.get()).status, 403);
  assert.equal(h.calls.length, 0);
  assert.equal(h.queries.length, 0);
  assert.equal(h.userClients, 0);
});

test("database authorization is still enforced independently on combined writes", async () => {
  const h = harness({ rpcError: { code: "42501", message: "Forbidden" } });
  assert.equal(
    (
      await h.patch({
        id: parentId,
        optional_offers: [offer()],
        expected_optional_offers_revision: 0,
      })
    ).status,
    403,
  );
  assert.equal(h.calls.length, 1);
  assert.equal(h.revalidated.length, 0);
});

test("detail GET validates and returns offers/revision using the authorized user RPC", async () => {
  const h = harness({
    projection: {
      revision: 4,
      offers: [
        {
          ...offer({ id: offerId, label_en: "  Label  " }),
          purchase_cost: 9,
          target: {
            name_he: "מוצר",
            name_en: "Target",
            slug: "target",
            status: "active",
            sku: "SKU-001",
            private_cost: 4,
          },
        },
      ],
    },
  });
  const response = await h.get();
  assert.equal(response.status, 200);
  assert.equal(response.body.product.optional_offers_revision, 4);
  assert.equal(response.body.product.optional_offers[0].label_en, "Label");
  assert.equal(
    response.body.product.optional_offers[0].purchase_cost,
    undefined,
  );
  assert.equal(
    response.body.product.optional_offers[0].target.private_cost,
    undefined,
  );
  assert.deepEqual(h.calls, [
    {
      name: "management_read_product_optional_offers",
      args: { p_product_id: parentId },
    },
  ]);
});

for (const projection of [
  null,
  { revision: "1", offers: [] },
  { revision: 1, offers: [offer()] },
  { revision: -1, offers: [] },
  {
    revision: 1,
    offers: [
      offer({ id: offerId, pricing_mode: "fixed", fixed_price_agorot: 0 }),
    ],
  },
])
  test(`detail GET fails closed on malformed optional-offer projection ${JSON.stringify(projection).slice(0, 60)}`, async () => {
    const h = harness({ projection });
    const response = await h.get();
    assert.equal(response.status, 503);
    assert.equal(response.body.product, undefined);
  });

test("detail GET invalid/notfound products do not read offer configuration", async () => {
  const invalid = harness();
  assert.equal((await invalid.get("invalid")).status, 400);
  assert.equal(invalid.calls.length, 0);
  assert.equal(invalid.queries.length, 0);
  const missing = harness({ product: null });
  assert.equal((await missing.get()).status, 404);
  assert.equal(missing.calls.length, 0);
});
