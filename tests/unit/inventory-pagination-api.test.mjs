import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
const source = await readFile(
  new URL("../../src/app/api/management/inventory/route.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const rows = Array.from({ length: 8 }, (_, index) => ({
  variant_id: `variant-${index}`,
  product_id: "product",
  sku: `sku-${index}`,
  stock_qty: 2,
  low_stock_threshold: 1,
}));
function load({ authorized = true, data = rows, errorPage = null } = {}) {
  const calls = [];
  const exports = {};
  const imports = {
    "next/server": {
      NextResponse: {
        json: (body, options) => ({ body, status: 200, ...options }),
      },
    },
    "next/cache": {},
    zod: { z },
    "@/app/api/management/_shared": {
      withManagementAuth: async (_request, capability) => {
        assert.equal(capability, "manageInventory");
        return authorized
          ? {
              ok: true,
              admin: {
                from: () => {
                  throw new Error("List must use authorized session");
                },
              },
            }
          : { ok: false, response: { status: 403 } };
      },
      errorResponse: (message, status) => ({
        body: { error: message },
        status,
      }),
      mapPostgresError: () => ({
        body: { error: "Operation failed" },
        status: 500,
      }),
    },
    "@/lib/supabase/server": {
      createServerSupabaseClient: async () => ({
        rpc: async (name, args) => {
          assert.equal(name, "management_inventory_list");
          calls.push(args);
          if (args.p_page === errorPage)
            return {
              data: null,
              error: { code: "XX000", message: "private diagnostics" },
            };
          return {
            data: {
              total_count: data.length,
              page: args.p_page,
              page_size: args.p_page_size,
              items: data.slice(
                (args.p_page - 1) * args.p_page_size,
                args.p_page * args.p_page_size,
              ),
            },
            error: null,
          };
        },
      }),
    },
  };
  runInNewContext(compiled, { exports, URL, require: (name) => imports[name] });
  return {
    calls,
    get: (query) =>
      exports.GET(
        new Request(`http://localhost/api/management/inventory?${query}`),
      ),
  };
}
test("aligned inventory pages preserve one bounded actor-context RPC", async () => {
  const route = load();
  const response = await route.get("limit=3&offset=3");
  assert.equal(response.status, 200);
  assert.deepEqual(
    Array.from(response.body.items, (row) => row.id),
    ["variant-3", "variant-4", "variant-5"],
  );
  assert.equal(route.calls.length, 1);
  assert.equal(route.calls[0].p_page, 2);
});
test("unaligned inventory offsets fill the requested slice from at most two bounded pages", async () => {
  const route = load();
  const response = await route.get("limit=3&offset=1");
  assert.equal(response.status, 200);
  assert.deepEqual(
    Array.from(response.body.items, (row) => row.id),
    ["variant-1", "variant-2", "variant-3"],
  );
  assert.equal(response.body.totalCount, 8);
  assert.equal(response.body.limit, 3);
  assert.equal(response.body.offset, 1);
  assert.equal(route.calls.length, 2);
  assert.ok(route.calls.every((args) => args.p_page_size === 3));
});
test("unaligned final partial pages retain the real remaining rows without another RPC", async () => {
  const route = load();
  const response = await route.get("limit=3&offset=7");
  assert.deepEqual(
    Array.from(response.body.items, (row) => row.id),
    ["variant-7"],
  );
  assert.equal(route.calls.length, 1);
});
test("an offset beyond total count is a truthful empty result", async () => {
  const route = load();
  const response = await route.get("limit=3&offset=16");
  assert.equal(response.body.items.length, 0);
  assert.equal(response.body.totalCount, 8);
  assert.equal(route.calls.length, 1);
});
test("both inventory RPC pages retain search and stock filters", async () => {
  const route = load();
  assert.equal(
    (await route.get("limit=3&offset=1&search=camera&status=out_of_stock"))
      .status,
    200,
  );
  assert.equal(route.calls.length, 2);
  assert.ok(
    route.calls.every(
      (args) => args.p_search === "camera" && args.p_status === "out",
    ),
  );
});
test("a failed second page returns an error instead of a short successful page", async () => {
  const route = load({ errorPage: 2 });
  const response = await route.get("limit=3&offset=1");
  assert.equal(response.status, 500);
  assert.equal(response.body.items, undefined);
  assert.doesNotMatch(JSON.stringify(response.body), /private diagnostics/);
});
test("a failed first page stops without requesting another page", async () => {
  const route = load({ errorPage: 1 });
  assert.equal((await route.get("limit=3&offset=1")).status, 500);
  assert.equal(route.calls.length, 1);
});
test("inventory authorization precedes all data reads", async () => {
  const route = load({ authorized: false });
  assert.equal((await route.get("limit=3&offset=1")).status, 403);
  assert.equal(route.calls.length, 0);
});
