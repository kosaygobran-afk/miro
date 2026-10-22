import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";

const source = await readFile(
  new URL(
    "../../src/app/api/management/product-lookup/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const productId = "10000000-0000-4000-8000-000000000001";
const variantId = "10000000-0000-4000-8000-000000000002";
function load({
  authorized = true,
  matchingProducts = [{ id: productId }],
  productError = null,
  variantError = null,
} = {}) {
  const calls = [];
  const exports = {};
  const admin = {
    from(table) {
      const call = { table, operations: [] };
      calls.push(call);
      const builder = {};
      for (const name of ["select", "eq", "or", "order", "limit"])
        builder[name] = (...args) => {
          call.operations.push([name, ...args]);
          return builder;
        };
      builder.then = (resolve) =>
        Promise.resolve(
          table === "products"
            ? { data: matchingProducts, error: productError }
            : {
                data: [
                  {
                    id: variantId,
                    sku: "SKU-001",
                    products: { id: productId },
                  },
                ],
                error: variantError,
              },
        ).then(resolve);
      return builder;
    },
  };
  const imports = {
    "next/server": {
      NextResponse: {
        json: (body, options) => ({ body, status: 200, ...options }),
      },
    },
    zod: { z },
    "@/app/api/management/_shared": {
      withManagementAuth: async (_request, capability) => {
        assert.equal(capability, "manageCatalog");
        return authorized
          ? { ok: true, admin }
          : { ok: false, response: { status: 403 } };
      },
      errorResponse: (message, status = 500) => ({
        body: { error: message },
        status,
      }),
      mapPostgresError: () => ({
        body: { error: "Operation failed" },
        status: 500,
      }),
    },
  };
  runInNewContext(compiled, { exports, URL, require: (name) => imports[name] });
  return {
    calls,
    get: (query = "") =>
      exports.GET(
        new Request(`http://localhost/api/management/product-lookup${query}`),
      ),
  };
}
function operations(route, table, name) {
  return (
    route.calls
      .find((call) => call.table === table)
      ?.operations.filter(([operation]) => operation === name) ?? []
  );
}

test("lookup denies unauthorized users before creating database queries", async () => {
  const route = load({ authorized: false });
  assert.equal((await route.get("?q=camera")).status, 403);
  assert.equal(route.calls.length, 0);
});
test("lookup default only returns active variants from active products", async () => {
  const route = load();
  const response = await route.get();
  assert.equal(response.status, 200);
  assert.equal(response.body.results[0].variant.id, variantId);
  assert.equal(response.body.results[0].product.id, productId);
  assert.deepEqual(
    JSON.parse(JSON.stringify(operations(route, "product_variants", "eq"))),
    [
      ["eq", "is_active", true],
      ["eq", "products.status", "active"],
    ],
  );
  assert.equal(route.calls.length, 1);
});
test("activeOnly=false removes both active filters instead of coercing false to true", async () => {
  const route = load();
  assert.equal((await route.get("?q=camera&activeOnly=false")).status, 200);
  assert.equal(operations(route, "product_variants", "eq").length, 0);
  assert.equal(operations(route, "products", "eq").length, 0);
});
for (const query of [
  "?activeOnly=maybe",
  "?activeOnly=0",
  "?limit=0",
  "?limit=51",
  "?variant_id=invalid",
  `?q=${"a".repeat(201)}`,
])
  test(`lookup rejects malformed query ${query.slice(0, 45)}`, async () => {
    const route = load();
    assert.equal((await route.get(query)).status, 400);
    assert.equal(route.calls.length, 0);
  });
test("name search resolves product IDs then ORs only root variant columns", async () => {
  const route = load();
  assert.equal((await route.get("?q=camera&limit=5")).status, 200);
  const parents = operations(route, "products", "or")[0][1];
  assert.match(parents, /name_he\.ilike\./);
  assert.match(parents, /name_en\.ilike\./);
  const variants = operations(route, "product_variants", "or")[0][1];
  assert.match(variants, /sku\.ilike\./);
  assert.match(variants, /barcode\.ilike\./);
  assert.ok(variants.includes(`product_id.in.(${productId})`));
  assert.doesNotMatch(variants, /products\./);
  assert.equal(operations(route, "products", "limit")[0][1], 200);
  assert.equal(operations(route, "product_variants", "limit")[0][1], 5);
});
test("SKU/barcode search still works when no product name matches", async () => {
  const route = load({ matchingProducts: [] });
  assert.equal((await route.get("?q=SKU-001")).status, 200);
  assert.doesNotMatch(
    operations(route, "product_variants", "or")[0][1],
    /in\.\(\)/,
  );
});
test("lookup bounds a supplied variant while retaining the search expression", async () => {
  const route = load();
  assert.equal(
    (await route.get(`?variant_id=${variantId}&q=camera`)).status,
    200,
  );
  assert.ok(
    operations(route, "product_variants", "eq").some(
      ([, column, value]) => column === "id" && value === variantId,
    ),
  );
});
test("punctuation and filter DSL remain within a quoted literal search pattern", async () => {
  const route = load();
  const term = 'x),is_active.eq.false,"\\%_*';
  assert.equal((await route.get(`?q=${encodeURIComponent(term)}`)).status, 200);
  const filter = operations(route, "products", "or")[0][1];
  const expectedPattern = `%${term.replace(/[\\%_*]/g, (character) => `\\${character}`)}%`;
  assert.equal(
    filter,
    `name_he.ilike.${JSON.stringify(expectedPattern)},name_en.ilike.${JSON.stringify(expectedPattern)}`,
  );
});
for (const stage of ["product", "variant"])
  test(`${stage} lookup failure returns an error without a misleading empty result or diagnostics`, async () => {
    const route = load({
      [`${stage}Error`]: {
        code: "PGRST100",
        message: "private schema diagnostic",
      },
    });
    const response = await route.get("?q=camera");
    assert.equal(response.status, 500);
    assert.equal(response.body.results, undefined);
    assert.doesNotMatch(
      JSON.stringify(response.body),
      /private schema|PGRST100/,
    );
  });
