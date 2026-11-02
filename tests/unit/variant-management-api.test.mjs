import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { z } from "zod";
const pid = "11111111-1111-4111-8111-111111111111";
const vid = "22222222-2222-4222-8222-222222222222";
function load(surface, { authorized = true, rpcError = null } = {}) {
  const calls = [],
    invalidated = [],
    exports = {};
  const imports = {
    "next/server": {
      NextResponse: {
        json: (body, options) => ({ body, status: 200, ...options }),
      },
    },
    "next/cache": { revalidatePath: (...args) => invalidated.push(args) },
    zod: { z },
    "@/app/api/management/_shared": {
      withManagementAuth: async (_request, capability) => {
        assert.equal(
          capability,
          surface === "inventory" ? "manageInventory" : "manageCatalog",
        );
        return authorized
          ? { ok: true }
          : { ok: false, response: { status: 403 } };
      },
      errorResponse: (message, status = 500) => ({
        body: { error: message },
        status,
      }),
      mapPostgresError: () => ({ status: 500 }),
      mapPriceConstraintError: () => ({ status: 400 }),
    },
    "@/lib/supabase/server": {
      createServerSupabaseClient: async () => ({
        rpc: async (name, args) => {
          calls.push({ name, args });
          return {
            data:
              surface === "inventory"
                ? "movement-id"
                : { id: vid, product_id: pid, ...args.p_patch },
            error: rpcError,
          };
        },
      }),
    },
    "@/lib/image-safety": { isAcceptedImageReference: () => true },
    "@/lib/product-image-processing": {},
    "@/lib/remote-product-image": {},
  };
  runInNewContext(
    ts.transpileModule(
      readFileSync(`src/app/api/management/${surface}/route.ts`, "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    { exports, URL, console: { error() {} }, require: (name) => imports[name] },
  );
  return {
    calls,
    invalidated,
    invoke: (method, body) =>
      exports[method](
        new Request(`http://localhost/api/management/${surface}`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      ),
  };
}
test("new variants use the authorized atomic creation wrapper with zero or positive quantities", async () => {
  for (const qty of [undefined, 0, 8]) {
    const route = load("variants");
    assert.equal(
      (
        await route.invoke("POST", {
          product_id: pid,
          sku: "QA",
          ...(qty === undefined ? {} : { initial_stock_qty: qty }),
        })
      ).status,
      200,
    );
    assert.equal(route.calls[0].name, "create_catalog_variant_with_stock");
    assert.equal(route.calls[0].args.p_data.initial_stock_qty, qty ?? 0);
    assert.ok(route.invalidated.length);
  }
});
test("creation rejects fractional, negative, missing-kind and unknown stock writes before RPC", async () => {
  for (const payload of [
    { initial_stock_qty: -1 },
    { initial_stock_qty: 1.5 },
    { initial_stock_qty: null },
    { stock_qty: 5 },
    { opening_quantity: 8 },
  ]) {
    const route = load("variants");
    assert.equal(
      (await route.invoke("POST", { product_id: pid, sku: "QA", ...payload }))
        .status,
      400,
    );
    assert.equal(route.calls.length, 0);
  }
});
test("image assignment and clearing use the self-authorizing wrapper", async () => {
  for (const variant_id of [vid, null]) {
    const route = load("product-images");
    assert.equal(
      (await route.invoke("PATCH", { id: vid, variant_id })).status,
      200,
    );
    assert.equal(route.calls[0].name, "update_catalog_image");
    assert.equal(route.calls[0].args.p_patch.variant_id, variant_id);
  }
  const route = load("product-images");
  assert.equal(
    (await route.invoke("PATCH", { id: vid, variant_id: "bad" })).status,
    400,
  );
  assert.equal(route.calls.length, 0);
});
test("zero correction carries the expected quantity and stale writes return 409 without retry", async () => {
  const route = load("inventory");
  assert.equal(
    (
      await route.invoke("PATCH", {
        variantId: vid,
        counted: 0,
        expectedStock: 8,
        reason: "Stock count",
      })
    ).status,
    200,
  );
  assert.equal(route.calls[0].name, "adjust_catalog_variant_stock");
  assert.equal(route.calls[0].args.p_counted, 0);
  assert.equal(route.calls[0].args.p_expected, 8);
  const stale = load("inventory", { rpcError: { code: "PT409" } });
  assert.equal(
    (
      await stale.invoke("PATCH", {
        variantId: vid,
        counted: 0,
        expectedStock: 8,
        reason: "Stale count",
      })
    ).status,
    409,
  );
  assert.equal(stale.calls.length, 1);
  assert.equal(stale.invalidated.length, 0);
});
test("authorization denial prevents every new media/stock/create RPC", async () => {
  for (const [surface, method, body] of [
    ["variants", "POST", { product_id: pid, sku: "QA" }],
    ["product-images", "PATCH", { id: vid, variant_id: null }],
    [
      "inventory",
      "PATCH",
      { variantId: vid, counted: 0, expectedStock: 2, reason: "No access" },
    ],
  ]) {
    const route = load(surface, { authorized: false });
    assert.equal((await route.invoke(method, body)).status, 403);
    assert.equal(route.calls.length, 0);
  }
});
