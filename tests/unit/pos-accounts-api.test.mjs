import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";

const list = "../../src/app/api/management/accounts/route.ts";
const detail = "../../src/app/api/management/accounts/[orderId]/route.ts";
const request = (query = "") =>
  new Request(`http://localhost/api/management/accounts${query}`);
const params = {
  params: Promise.resolve({ orderId: "11111111-1111-4111-8111-111111111111" }),
};

async function load(
  file,
  { authorized = true, rate = "ok", error = null } = {},
) {
  const compiled = ts.transpileModule(
    await readFile(new URL(file, import.meta.url), "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    },
  ).outputText;
  const calls = [];
  const data = {
    orders: [],
    summary: { transaction_count: 0 },
    total_count: 0,
    order: {},
    order_items: [],
    order_payments: [],
    stock_movements: [],
  };
  const exports = {};
  const imports = {
    "next/server": {
      NextResponse: {
        json: (body, options) => ({ body, status: 200, ...options }),
      },
    },
    zod: { z },
    "@/app/api/management/_shared": {
      withManagementAuth: async () =>
        authorized
          ? {
              ok: true,
              admin: {
                rpc: () => {
                  throw new Error(
                    "Actor-scoped RPC must not use service credentials",
                  );
                },
              },
            }
          : { ok: false, response: { status: 403 } },
      checkManagementRateLimit: async () => rate,
      tooManyRequests: () => ({
        body: { error: "Too many requests", code: "rate_limited" },
        status: 429,
        headers: { "Retry-After": "60" },
      }),
      getClientIp: () => "127.0.0.1",
      errorResponse: (message, status) => ({
        body: { error: message },
        status,
      }),
    },
    "@/lib/supabase/server": {
      createServerSupabaseClient: async () => ({
        rpc: (name, args) => {
          calls.push({ name, args });
          return {
            returns: async () => ({ data: error ? null : data, error }),
            single: async () => ({ data: error ? null : data, error }),
          };
        },
      }),
    },
  };
  runInNewContext(compiled, {
    exports,
    URL,
    Date,
    require: (name) => imports[name],
  });
  return { GET: exports.GET, calls, data };
}

test("POS accounts retains actor auth and reads scalar JSON with valid default dates", async () => {
  const route = await load(list);
  const result = await route.GET(request());
  assert.equal(result.status, 200);
  assert.equal(route.calls[0].name, "management_pos_accounts");
  assert.equal(route.calls[0].args.p_from, new Date(0).toISOString());
  assert.ok(Number.isFinite(Date.parse(route.calls[0].args.p_to)));
  assert.equal(result.body.orders, route.data.orders);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
});

test("POS accounts rejects reversed dates before the database read", async () => {
  const route = await load(list);
  const result = await route.GET(
    request("?from=2026-10-09T00%3A00%3A00Z&to=2026-10-08T00%3A00%3A00Z"),
  );
  assert.equal(result.status, 400);
  assert.equal(route.calls.length, 0);
});

test("POS account detail retains the actor session and nested database projection", async () => {
  const route = await load(detail);
  const result = await route.GET(request(), params);
  assert.equal(result.status, 200);
  assert.equal(result.body, route.data);
  assert.equal(route.calls[0].name, "management_pos_account_detail");
  assert.equal(
    route.calls[0].args.p_order_id,
    "11111111-1111-4111-8111-111111111111",
  );
  assert.equal(result.headers["Cache-Control"], "private, no-store");
});

test("POS accounts denies auth and rate-limit failures before actor RPCs", async () => {
  for (const file of [list, detail])
    for (const options of [
      { authorized: false },
      { rate: "error" },
      { rate: "limited" },
    ]) {
      const route = await load(file, options);
      const result = await route.GET(request(), params);
      assert.equal(
        result.status,
        options.authorized === false
          ? 403
          : options.rate === "error"
            ? 503
            : 429,
      );
      assert.equal(route.calls.length, 0);
    }
});

test("missing POS account is 404; other database failures do not become empty success", async () => {
  for (const file of [list, detail]) {
    const route = await load(file, {
      error: { code: "42501", message: "private diagnostic" },
    });
    const result = await route.GET(request(), params);
    assert.equal(result.status, 500);
    assert.doesNotMatch(JSON.stringify(result.body), /private diagnostic/);
  }
  const route = await load(detail, {
    error: { code: "P0002", message: "private diagnostic" },
  });
  assert.equal((await route.GET(request(), params)).status, 404);
});
