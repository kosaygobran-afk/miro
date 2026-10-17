import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
const categoryErrors = {};
runInNewContext(
  ts.transpileModule(
    await readFile(
      new URL("../../src/lib/catalog/category-errors.ts", import.meta.url),
      "utf8",
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
  { exports: categoryErrors },
);
const rootId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const otherRootId = "33333333-3333-4333-8333-333333333333";
const productId = "44444444-4444-4444-8444-444444444444";
const productInput = {
  category_id: rootId,
  name_he: "מוצר בדיקה",
  name_en: "Fixture product",
  slug: "fixture-product",
};
const categoryInput = {
  slug: "fixture-child",
  name_he: "תת־קטגוריית בדיקה",
  name_en: "Fixture child",
  parent_id: rootId,
};
const request = (section, method, body, query = "") =>
  new Request(`http://localhost/api/management/${section}${query}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json" },
  });

async function loadRoute(
  section,
  { authorized = true, rpcError = null, queryError = null, rows = [] } = {},
) {
  const calls = { auth: [], queries: [], rpc: [], revalidated: [], audits: [] };
  const product = { id: productId, ...productInput };
  const admin = {
    rpc() {
      throw new Error("Catalog RPCs must use the actor session");
    },
    from(table) {
      const call = { table, filters: [] };
      calls.queries.push(call);
      let mutation;
      const result = () => ({
        data: queryError
          ? null
          : mutation
            ? { id: childId, ...categoryInput, ...mutation }
            : table === "categories"
              ? rows
              : [],
        error: queryError,
        count: rows.length,
      });
      const query = {
        select(value) {
          call.select = value;
          return query;
        },
        insert(value) {
          if (table === "audit_events") calls.audits.push(value);
          mutation = value;
          call.insert = value;
          return query;
        },
        update(value) {
          mutation = value;
          call.update = value;
          return query;
        },
        delete() {
          call.deleted = true;
          return query;
        },
        eq(key, value) {
          call.filters.push([key, value]);
          return query;
        },
        order() {
          return query;
        },
        range() {
          return query;
        },
        single: async () => result(),
        maybeSingle: async () => ({
          data: table === "products" ? product : rows[0],
          error: queryError,
        }),
        then(resolve, reject) {
          return Promise.resolve(result()).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const actorClient = {
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      return { data: rpcError ? null : product, error: rpcError };
    },
  };
  const imports = {
    "@/lib/catalog/category-errors": categoryErrors,
    "next/server": { NextResponse: Response },
    "next/cache": {
      revalidatePath: (...args) => calls.revalidated.push(args),
      revalidateTag: (...args) => calls.revalidated.push(args),
    },
    "@/lib/supabase/server": {
      createServerSupabaseClient: async () => actorClient,
    },
    "@/lib/public-presentation-cache": {
      PUBLIC_STORE_NAVIGATION_TAG: "public-store-navigation",
    },
    "@/app/api/management/_shared": {
      withManagementAuth: async (_request, capability) => {
        calls.auth.push(capability);
        return authorized
          ? { ok: true, admin, actor: { user: { id: "fixture-actor" } } }
          : {
              ok: false,
              response: Response.json({ error: "Forbidden" }, { status: 403 }),
            };
      },
      errorResponse: (error, status = 500, details) =>
        Response.json({ error, details }, { status }),
      mapPostgresError: (error) =>
        Response.json(
          { error: "Database rejected category assignment", code: error.code },
          { status: error.code === "42501" ? 403 : 400 },
        ),
      mapPriceConstraintError: () =>
        Response.json(
          { error: "Invalid product constraints" },
          { status: 400 },
        ),
    },
  };
  const exports = {};
  runInNewContext(
    ts.transpileModule(
      await readFile(
        new URL(
          `../../src/app/api/management/${section}/route.ts`,
          import.meta.url,
        ),
        "utf8",
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    {
      exports,
      URL,
      console: { error() {} },
      require: (name) => imports[name] ?? nativeRequire(name),
    },
  );
  return { route: exports, calls };
}

test("catalog hierarchy mutations require manageCatalog before any data access", async () => {
  for (const section of ["products", "categories"])
    for (const method of ["POST", "PATCH"]) {
      const { route, calls } = await loadRoute(section, { authorized: false });
      const result = await route[method](request(section, method, {}));
      assert.equal(result.status, 403);
      assert.deepEqual(calls.auth, ["manageCatalog"]);
      assert.equal(calls.queries.length, 0);
      assert.equal(calls.rpc.length, 0);
    }
});

test("new products reject missing, null and invalid outer categories before writes", async () => {
  for (const category_id of [undefined, null, "", "invalid-id"]) {
    const { route, calls } = await loadRoute("products");
    const result = await route.POST(
      request("products", "POST", { ...productInput, category_id }),
    );
    assert.equal(result.status, 400, `Rejected root ${category_id}`);
    assert.equal(calls.rpc.length, 0);
    assert.equal(calls.revalidated.length, 0);
  }
});

test("product creation sends required root and optional child through actor-scoped atomic RPC", async () => {
  for (const subcategory_id of [undefined, null, childId]) {
    const { route, calls } = await loadRoute("products");
    const result = await route.POST(
      request("products", "POST", { ...productInput, subcategory_id }),
    );
    assert.equal(result.status, 200);
    assert.equal(calls.rpc.length, 1);
    assert.equal(calls.rpc[0].name, "create_catalog_product");
    assert.equal(calls.rpc[0].args.p_category_id, rootId);
    assert.equal(calls.rpc[0].args.p_subcategory_id, subcategory_id ?? null);
    assert.equal(
      calls.queries.length,
      0,
      "Never insert a product with service credentials",
    );
    assert.ok(calls.revalidated.some(([path]) => path.endsWith("/[slug]")));
  }
});

test("mismatched category creation errors stay errors and do not invalidate successful pages", async () => {
  const { route, calls } = await loadRoute("products", {
    rpcError: {
      code: "22023",
      message:
        "Internal category must belong to the selected external category",
    },
  });
  const result = await route.POST(
    request("products", "POST", { ...productInput, subcategory_id: childId }),
  );
  assert.equal(result.status, 400);
  assert.equal((await result.json()).code, "subcategory_mismatch");
  assert.equal(calls.rpc.length, 1);
  assert.equal(calls.revalidated.length, 0);
});

test("product editing forwards set and clear child assignments atomically", async () => {
  for (const patch of [
    { category_id: rootId, subcategory_id: childId },
    { subcategory_id: null },
    { category_id: otherRootId },
  ]) {
    const { route, calls } = await loadRoute("products");
    const result = await route.PATCH(
      request("products", "PATCH", { id: productId, ...patch }),
    );
    assert.equal(result.status, 200);
    assert.equal(calls.rpc.length, 1);
    assert.equal(calls.rpc[0].name, "update_product");
    assert.deepEqual(JSON.parse(JSON.stringify(calls.rpc[0].args)), {
      p_id: productId,
      p_patch: patch,
    });
    assert.equal(
      calls.queries.length,
      0,
      "Root changes need no stale service-side pre-read",
    );
  }
});

test("invalid child identifiers and mismatched edits cannot become successful saves", async () => {
  for (const method of ["POST", "PATCH"]) {
    const { route, calls } = await loadRoute("products");
    const payload =
      method === "POST"
        ? { ...productInput, subcategory_id: "not-a-uuid" }
        : { id: productId, subcategory_id: "not-a-uuid" };
    assert.equal(
      (await route[method](request("products", method, payload))).status,
      400,
    );
    assert.equal(calls.rpc.length, 0);
  }
  const { route, calls } = await loadRoute("products", {
    rpcError: {
      code: "22023",
      message:
        "Internal category must belong to the selected external category",
    },
  });
  const result = await route.PATCH(
    request("products", "PATCH", { id: productId, subcategory_id: childId }),
  );
  assert.equal(result.status, 400);
  assert.equal(calls.revalidated.length, 0);
});

test("category manager counts both assignments and its own child categories", async () => {
  const rows = [
    {
      id: rootId,
      parent_id: null,
      products: [{ count: 3 }],
      child_products: [{ count: 0 }],
    },
    {
      id: childId,
      parent_id: rootId,
      products: [{ count: 0 }],
      child_products: [{ count: 2 }],
    },
  ];
  const { route, calls } = await loadRoute("categories", { rows });
  const result = await route.GET(request("categories", "GET"));
  assert.equal(result.status, 200);
  const { categories } = await result.json();
  assert.equal(categories.find((row) => row.id === childId).product_count, 2);
  assert.equal(
    categories.find((row) => row.id === rootId).subcategory_count,
    1,
  );
  assert.match(calls.queries[0].select, /products_category_id_fkey/);
  assert.match(calls.queries[0].select, /products_subcategory_id_fkey/);
});

test("category create and edit preserve the explicit parent and surface hierarchy guard failures", async () => {
  for (const method of ["POST", "PATCH"]) {
    const payload =
      method === "POST" ? categoryInput : { id: childId, parent_id: rootId };
    const success = await loadRoute("categories");
    const result = await success.route[method](
      request("categories", method, payload),
    );
    assert.equal(result.status, 200);
    assert.equal(
      success.calls.queries[0][method === "POST" ? "insert" : "update"]
        .parent_id,
      rootId,
    );
    assert.equal(success.calls.audits.length, 1);

    const rejected = await loadRoute("categories", {
      queryError: {
        code: "22023",
        message:
          "Internal categories must belong directly to an external category",
      },
    });
    assert.equal(
      (await rejected.route[method](request("categories", method, payload)))
        .status,
      400,
    );
    assert.equal(rejected.calls.audits.length, 0);
    assert.equal(rejected.calls.revalidated.length, 0);
  }
});

test("reparenting an assigned category returns an actionable conflict without a success audit", async () => {
  const { route, calls } = await loadRoute("categories", {
    queryError: {
      code: "22023",
      message:
        "Category is in use; reassign products and internal categories before changing its parent",
    },
  });
  const result = await route.PATCH(
    request("categories", "PATCH", { id: childId, parent_id: otherRootId }),
  );
  assert.equal(result.status, 409);
  assert.equal((await result.json()).code, "category_in_use");
  assert.equal(calls.audits.length, 0);
  assert.equal(calls.revalidated.length, 0);
});

test("category manager default nullable descriptions and explicit description clearing are accepted", async () => {
  for (const method of ["POST", "PATCH"]) {
    const payload = {
      ...(method === "POST" ? categoryInput : { id: childId }),
      description_he: null,
      description_en: null,
      image_url: null,
    };
    const { route, calls } = await loadRoute("categories");
    const result = await route[method](request("categories", method, payload));
    assert.equal(result.status, 200);
    const write = calls.queries[0][method === "POST" ? "insert" : "update"];
    assert.equal(write.description_he, null);
    assert.equal(write.description_en, null);
    assert.equal(write.image_url, null);
    assert.equal(calls.audits.length, 1);
  }
});

test("external category aliases cannot create duplicate storefront routes", async () => {
  const { route, calls } = await loadRoute("categories", {
    queryError: {
      code: "23505",
      message:
        'duplicate key value violates unique constraint "categories_root_route_key_unique"',
    },
  });
  const result = await route.POST(
    request("categories", "POST", {
      slug: "security-cameras",
      name_he: "בדיקה",
      name_en: "Fixture",
    }),
  );
  assert.equal(result.status, 409);
  assert.deepEqual(await result.json(), {
    error: "duplicate_slug",
    code: "duplicate_slug",
  });
  assert.equal(calls.audits.length, 0);
  assert.equal(calls.revalidated.length, 0);
});

test("partial category edits never inject visibility or ordering defaults", async () => {
  for (const patch of [
    { name_en: "Revised category label" },
    { sort_order: 12 },
  ]) {
    const { route, calls } = await loadRoute("categories");
    const result = await route.PATCH(
      request("categories", "PATCH", { id: childId, ...patch }),
    );
    assert.equal(result.status, 200);
    const write = calls.queries.find(
      ({ table }) => table === "categories",
    ).update;
    assert.deepEqual(JSON.parse(JSON.stringify(write)), patch);
    assert.ok(
      !Object.hasOwn(write, "is_active"),
      "Sorting or naming must not reactivate an inactive category",
    );
    if (!("sort_order" in patch))
      assert.ok(
        !Object.hasOwn(write, "sort_order"),
        "Naming must not reset sibling order",
      );
  }
});

test("both management product reads disambiguate root and child category foreign keys", async () => {
  for (const section of ["products", "products/[id]"]) {
    const { route, calls } = await loadRoute(section);
    const result = await route.GET(
      request(
        "products",
        "GET",
        undefined,
        section === "products" ? `?id=${productId}` : "",
      ),
      { params: Promise.resolve({ id: productId }) },
    );
    assert.equal(result.status, 200);
    const projection = calls.queries.find(
      (call) => call.table === "products",
    ).select;
    assert.match(projection, /subcategory_id/);
    assert.match(projection, /categories!products_category_id_fkey/);
    assert.match(projection, /categories!products_subcategory_id_fkey/);
  }
});
