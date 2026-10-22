import assert from "node:assert/strict";
import test from "node:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

const source = await readFile(
  new URL("../../src/lib/store-data.ts", import.meta.url),
  "utf8",
);
const compiled = compile(source);
const routes = {};
runInNewContext(
  compile(
    await readFile(
      new URL("../../src/lib/catalog/routes.ts", import.meta.url),
      "utf8",
    ),
  ),
  { exports: routes },
);
const cacheSource = compile(
  await readFile(
    new URL("../../src/lib/public-presentation-cache.ts", import.meta.url),
    "utf8",
  ),
);
const flush = () => new Promise(setImmediate);
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

function harness({ publicClient, timeout = AbortSignal.timeout } = {}) {
  const context = new AsyncLocalStorage();
  const exports = {};
  const entries = new Map();
  const registrations = [];
  const react = {
    cache(fn) {
      const requests = new WeakMap();
      return (...args) => {
        const request = context.getStore();
        let values = requests.get(request);
        if (!values) {
          values = new Map();
          requests.set(request, values);
        }
        const key = JSON.stringify(args);
        if (!values.has(key)) values.set(key, fn(...args));
        return values.get(key);
      };
    },
  };
  const presentationCache = {};
  runInNewContext(cacheSource, {
    exports: presentationCache,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://public.test" } },
    require(name) {
      if (name === "server-only") return {};
      if (name === "react") return react;
      assert.equal(name, "next/cache");
      return {
        unstable_cache(load, keys, options) {
          registrations.push({ keys: [...keys], options });
          const key = keys.join(":");
          return async () => {
            if (entries.has(key)) return entries.get(key);
            const result = await load();
            entries.set(key, result);
            return result;
          };
        },
      };
    },
  });
  const client = (request, publicRead) => ({
    auth: {
      async getUser() {
        request.events.push("auth");
        return { data: { user: await request.user } };
      },
    },
    rpc(name) {
      return {
        abortSignal: async (signal) => {
          request.signals ??= [];
          request.signals.push(signal);
          request.events.push(`rpc:${name}`);
          return {
            data: { out_of_stock_policy: "keep_visible_contact" },
            error: null,
          };
        },
      };
    },
    from(table) {
      const filters = {};
      let result;
      const query = {
        select(fields) {
          request.projections ??= [];
          request.projections.push({ table, fields, publicRead, filters });
          return query;
        },
        eq(key, value) {
          filters[key] = value;
          return query;
        },
        is(key, value) {
          filters[key] = value;
          return query;
        },
        order() {
          return query;
        },
        abortSignal(signal) {
          request.signals ??= [];
          request.signals.push(signal);
          return query;
        },
        maybeSingle() {
          return query;
        },
        then(resolve, reject) {
          result ??= Promise.resolve().then(async () => {
            request.events.push(
              `${publicRead ? "public" : "session"}:${table}`,
            );
            if (table === "products" && request.productsReady)
              await request.productsReady;
            const rows = {
              categories: [
                {
                  id: "category",
                  slug: "cameras",
                  name_he: "מצלמות",
                  name_en: "Cameras",
                },
              ],
              products: [
                {
                  id: "product",
                  slug: "camera",
                  category_id: "category",
                  name_he: "מצלמה",
                  name_en: "Camera",
                  price: 100,
                },
              ],
              product_variants: [
                {
                  id: "variant",
                  product_id: "product",
                  sku: "0005586793",
                  barcode: "0001234567890",
                  stock_qty: request.stock ?? 2,
                  is_default: true,
                },
              ],
              product_prices: request.role
                ? [{ product_id: "product", price: request.rolePrice }]
                : [],
              user_roles: { role: request.role },
              saved_products: [{ product_id: `saved-${request.role}` }],
            };
            if (table === "product_prices")
              assert.equal(filters.role, request.role);
            if (publicRead && table === "categories")
              return {
                data: (request.navigationRows ?? rows.categories).filter(
                  (row) =>
                    Object.entries(filters).every(([key, value]) =>
                      value === null
                        ? row[key] == null
                        : row[key] === undefined || row[key] === value,
                    ),
                ),
                error: request.navigationError ?? null,
              };
            return {
              data: rows[table] ?? [],
              error:
                request.failedTable === table
                  ? { message: "TypeError: fetch failed", code: "" }
                  : null,
            };
          });
          return result.then(resolve, reject);
        },
      };
      return query;
    },
  });
  runInNewContext(compiled, {
    exports,
    console: { error() {}, warn() {} },
    AbortSignal: { timeout },
    require(name) {
      if (name === "react") return react;
      if (name === "zod") return { z };
      if (name === "@/lib/catalog/routes") return routes;
      if (name === "@/lib/public-presentation-cache") return presentationCache;
      if (name === "@/lib/supabase/public-server")
        return {
          createPublicServerClient: () =>
            publicClient ?? client(context.getStore(), true),
        };
      if (name === "@/lib/supabase/server")
        return {
          createServerSupabaseClient: async () => {
            const request = context.getStore();
            request.serverClients++;
            return client(request, false);
          },
        };
      assert.equal(name, "@/lib/catalog/pricing");
      return {
        resolvePrice: ({ roleOverride, basePrice }) => ({
          effectivePrice: roleOverride ?? basePrice,
          compareAtPrice: null,
          publicPromotion: null,
        }),
      };
    },
  });
  return {
    exports,
    entries,
    registrations,
    run: (request, fn) => context.run(request, fn),
  };
}

const visitor = (overrides = {}) => ({
  user: null,
  role: null,
  events: [],
  serverClients: 0,
  ...overrides,
});

test("catalog reads overlap auth, and role prices start before a slow catalog settles", async () => {
  const h = harness();
  const auth = deferred();
  const products = deferred();
  const request = visitor({
    user: auth.promise,
    role: "worker",
    rolePrice: 60,
    productsReady: products.promise,
  });
  const pending = h.run(request, () => h.exports.getStorePageData("en"));
  await flush();
  assert.ok(
    request.events.includes("session:products"),
    "catalog starts while auth is pending",
  );
  assert.ok(request.events.includes("auth"));
  assert.ok(
    !request.events.includes("session:product_prices"),
    "role pricing waits for the verified viewer",
  );
  auth.resolve({ id: "worker-user" });
  await flush();
  assert.ok(
    request.events.includes("session:product_prices"),
    "role pricing overlaps unfinished catalog reads",
  );
  products.resolve();
  const { viewer, catalog } = await pending;
  assert.equal(viewer.role, "worker");
  assert.equal(catalog.products[0].priceIls, 60);
  assert.equal(catalog.products[0].stockQty, 2);
  assert.equal(viewer.savedProductIds[0], "saved-worker");
  assert.equal(
    request.events.filter((event) => event === "session:products").length,
    1,
  );
});

test("viewer and live catalog stay isolated and fresh between requests", async () => {
  const h = harness();
  const worker = visitor({
    user: { id: "worker" },
    role: "worker",
    rolePrice: 60,
    stock: 9,
  });
  const anonymous = visitor({ stock: 1 });
  const [staff, publicPage] = await Promise.all([
    h.run(worker, () => h.exports.getStorePageData("en")),
    h.run(anonymous, () => h.exports.getStorePageData("en")),
  ]);
  assert.equal(staff.catalog.products[0].priceIls, 60);
  assert.equal(publicPage.catalog.products[0].priceIls, 100);
  assert.equal(publicPage.catalog.products[0].stockQty, 1);
  assert.equal(publicPage.viewer.role, null);
  assert.equal(publicPage.viewer.savedProductIds.length, 0);
  assert.ok(!anonymous.events.includes("session:product_prices"));
});

test("public catalog retains real SKU/barcode strings, including leading zeros", async () => {
  const h = harness();
  const catalog = await h.run(visitor(), () =>
    h.exports.getStoreCatalog("en", null, true),
  );
  assert.equal(catalog.products[0].variants[0].sku, "0005586793");
  assert.equal(catalog.products[0].variants[0].barcode, "0001234567890");
});

test("global navigation uses anonymous reads and deduplicates within a request", async () => {
  const h = harness();
  const request = visitor();
  const [first, second] = await h.run(request, () =>
    Promise.all([
      h.exports.getStoreNavigationCategories("en"),
      h.exports.getStoreNavigationCategories("en"),
    ]),
  );
  assert.equal(first, second);
  assert.equal(first[0].label, "Cameras");
  assert.equal(request.serverClients, 0);
  assert.equal(
    request.events.filter((event) => event === "public:categories").length,
    1,
  );
  const nextRequest = visitor();
  const hebrew = await h.run(nextRequest, () =>
    h.exports.getStoreNavigationCategories("he"),
  );
  assert.equal(hebrew[0].label, "מצלמות");
  assert.equal(
    nextRequest.events.length,
    0,
    "public bilingual labels are reused across requests",
  );
  const cachedRows = [...h.entries.values()][0];
  assert.deepEqual(Object.keys(cachedRows[0]).sort(), [
    "name_en",
    "name_he",
    "slug",
  ]);
  assert.deepEqual(h.registrations[0].keys, [
    "public-store-navigation",
    "https://public.test",
  ]);
  assert.equal(h.registrations[0].options.revalidate, 60);
});

test("global navigation never persists outage or invalid-payload fallbacks", async () => {
  const h = harness();
  for (const request of [
    visitor({ navigationError: { code: "outage" } }),
    visitor({ navigationRows: [{ slug: "cameras", name_en: "Cameras" }] }),
  ]) {
    const categories = await h.run(request, () =>
      h.exports.getStoreNavigationCategories("en"),
    );
    assert.equal(categories.length, 0);
    assert.equal(h.entries.size, 0);
  }
  const recovered = await h.run(visitor(), () =>
    h.exports.getStoreNavigationCategories("en"),
  );
  assert.equal(recovered[0].label, "Cameras");
  assert.equal(h.entries.size, 1);
});

test("global navigation filters internal categories at the anonymous query boundary", async () => {
  const h = harness();
  const request = visitor({
    navigationRows: [
      {
        slug: "tools",
        name_he: "אביזרים",
        name_en: "Accessories",
        parent_id: null,
        is_active: true,
      },
      {
        slug: "owner-child",
        name_he: "תת־קטגוריה",
        name_en: "Child category",
        parent_id: "root",
        is_active: true,
      },
      {
        slug: "inactive-root",
        name_he: "לא פעילה",
        name_en: "Inactive root",
        parent_id: null,
        is_active: false,
      },
    ],
  });
  const navigation = await h.run(request, () =>
    h.exports.getStoreNavigationCategories("en"),
  );
  assert.deepEqual(
    Array.from(navigation, ({ key, label }) => ({ key, label })),
    [{ key: "accessories", label: "Accessories" }],
  );
  const projection = request.projections.find(
    ({ table, publicRead }) => table === "categories" && publicRead,
  );
  assert.equal(projection.filters.parent_id, null);
  assert.equal(projection.filters.is_active, true);
  assert.equal(
    projection.fields,
    "slug, name_he, name_en",
    "Navigation caches only approved public bilingual fields",
  );
});

test("an early catalog preload failure still settles through the existing fallback", async () => {
  const h = harness();
  const auth = deferred();
  const products = deferred();
  const request = visitor({
    user: auth.promise,
    productsReady: products.promise,
  });
  const pending = h.run(request, () => h.exports.getStorePageData("en"));
  await flush();
  products.reject(new Error("upstream unavailable"));
  await flush();
  auth.resolve(null);
  const { viewer, catalog } = await pending;
  assert.equal(viewer.role, null);
  assert.equal(catalog.products.length, 0);
  assert.equal(catalog.categories.length, 0);
  assert.equal(catalog.error, "unavailable");
});

for (const table of [
  "categories",
  "products",
  "product_variants",
  "product_images",
]) {
  test(`a failed ${table} read reports unavailable and a fresh request can recover`, async () => {
    const h = harness();
    const failed = await h.run(visitor({ failedTable: table }), () =>
      h.exports.getStorePageData("en"),
    );
    assert.equal(failed.catalog.error, "unavailable");
    assert.equal(failed.catalog.products.length, 0);
    assert.equal(h.entries.size, 0, "outages must not enter the shared cache");
    const recovered = await h.run(visitor(), () =>
      h.exports.getStorePageData("en"),
    );
    assert.equal(recovered.catalog.error, undefined);
    assert.equal(recovered.catalog.products.length, 1);
  });
}

test("the installed SDK cancels catalog projections and retries within one shared deadline", async () => {
  const controller = new AbortController();
  const deadlines = [];
  const signals = [];
  const publicClient = createClient(
    "https://deadline.example.test",
    "test-key",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (_url, { signal }) => {
          signal.throwIfAborted();
          signals.push(signal);
          return new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          });
        },
      },
    },
  );
  const h = harness({
    publicClient,
    timeout(ms) {
      deadlines.push(ms);
      return controller.signal;
    },
  });
  const pending = h.run(visitor(), () =>
    h.exports.getStoreCatalog("en", null, true),
  );
  await flush();
  assert.equal(signals.length, 9);
  assert.ok(signals.every((signal) => signal === controller.signal));
  controller.abort(
    new DOMException("Catalog deadline elapsed", "TimeoutError"),
  );
  const catalog = await pending;
  assert.equal(catalog.error, "unavailable");
  assert.deepEqual(
    deadlines,
    [12_000],
    "SDK retries must not restart the budget",
  );
});

test("the installed SDK still recovers a transient catalog read without extra retry layers", async () => {
  let productReads = 0;
  const publicClient = createClient(
    "https://recovery.example.test",
    "test-key",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (url) => {
          if (
            new URL(url).pathname === "/rest/v1/products" &&
            productReads++ === 0
          )
            throw new TypeError("fetch failed");
          return new Response("[]", {
            headers: { "Content-Type": "application/json" },
          });
        },
      },
    },
  );
  const h = harness({ publicClient });
  const catalog = await h.run(visitor(), () =>
    h.exports.getStoreCatalog("en", null, true),
  );
  assert.equal(catalog.error, undefined);
  assert.equal(productReads, 2);
});

const categoryRoute = compile(
  await readFile(
    new URL(
      "../../src/app/api/management/categories/route.ts",
      import.meta.url,
    ),
    "utf8",
  ),
);
const categoryId = "11111111-1111-4111-8111-111111111111";
const categoryErrors = {};
runInNewContext(
  compile(
    await readFile(
      new URL("../../src/lib/catalog/category-errors.ts", import.meta.url),
      "utf8",
    ),
  ),
  { exports: categoryErrors },
);

function categoryApi({ authorized = true, fail = false } = {}) {
  const invalidations = [];
  const queries = [];
  const category = { id: categoryId, slug: "cameras" };
  const exports = {};
  const admin = {
    from(table) {
      queries.push(table);
      const reply = {
        data: category,
        error: fail && table === "categories" ? { code: "outage" } : null,
      };
      const builder = {
        insert: () => builder,
        update: () => builder,
        delete: () => builder,
        select: () => builder,
        eq: () => builder,
        single: async () => reply,
        then: (resolve, reject) => Promise.resolve(reply).then(resolve, reject),
      };
      return builder;
    },
  };
  runInNewContext(categoryRoute, {
    exports,
    URL,
    require(name) {
      if (name === "zod") return { z };
      if (name === "next/server")
        return {
          NextResponse: {
            json: (body, options) => ({ body, status: 200, ...options }),
          },
        };
      if (name === "next/cache")
        return {
          revalidatePath() {},
          revalidateTag: (tag, profile) =>
            invalidations.push({ tag, expire: profile.expire }),
        };
      if (name === "@/lib/public-presentation-cache")
        return { PUBLIC_STORE_NAVIGATION_TAG: "public-store-navigation" };
      if (name === "@/lib/catalog/category-errors") return categoryErrors;
      assert.equal(name, "@/app/api/management/_shared");
      return {
        withManagementAuth: async () =>
          authorized
            ? { ok: true, admin, actor: { user: { id: "actor" } } }
            : { ok: false, response: { status: 403 } },
        mapPostgresError: () => ({ status: 503 }),
        errorResponse: (_message, status) => ({ status }),
      };
    },
  });
  return { exports, invalidations, queries };
}

for (const { method, query, body } of [
  {
    method: "POST",
    body: { slug: "cameras", name_he: "מצלמות", name_en: "Cameras" },
  },
  { method: "PATCH", body: { id: categoryId, name_en: "Cameras" } },
  { method: "DELETE", query: `?id=${categoryId}` },
  { method: "DELETE", query: `?id=${categoryId}&hard=true` },
]) {
  test(`category ${method}${query?.includes("hard") ? " hard delete" : ""} expires public navigation only after an authorized successful write`, async () => {
    const request = () =>
      new Request(`http://localhost/api/management/categories${query ?? ""}`, {
        method,
        ...(body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      });
    const denied = categoryApi({ authorized: false });
    assert.equal((await denied.exports[method](request())).status, 403);
    assert.equal(denied.queries.length, 0);
    assert.equal(denied.invalidations.length, 0);
    const failed = categoryApi({ fail: true });
    assert.equal((await failed.exports[method](request())).status, 503);
    assert.equal(failed.invalidations.length, 0);
    const saved = categoryApi();
    assert.equal((await saved.exports[method](request())).status, 200);
    assert.deepEqual(saved.invalidations, [
      { tag: "public-store-navigation", expire: 0 },
    ]);
  });
}
