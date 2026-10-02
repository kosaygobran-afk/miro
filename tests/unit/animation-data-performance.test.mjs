import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const storeSource = await readFile(
  new URL("../../src/lib/store-data.ts", import.meta.url),
  "utf8",
);
const pricingSource = await readFile(
  new URL("../../src/lib/catalog/pricing.ts", import.meta.url),
  "utf8",
);
const servicesSource = await readFile(
  new URL("../../src/lib/public-services.ts", import.meta.url),
  "utf8",
);
const pricing = {};
runInNewContext(compile(pricingSource), { exports: pricing });

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function requestCache(fn) {
  const entries = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (!entries.has(key)) entries.set(key, fn(...args));
    return entries.get(key);
  };
}

function fixtures() {
  return {
    categories: [
      {
        id: "category-1",
        slug: "security-cameras",
        name_he: "מצלמות",
        name_en: "Cameras",
        icon_image_url: "/camera.svg",
      },
    ],
    products: [
      {
        id: "product-1",
        slug: "camera-model",
        category_id: "category-1",
        name_he: "מצלמה",
        name_en: "Camera",
        price: 100,
        status: "active",
        out_of_stock_policy: "inherit",
        tracking_mode: "none",
        image_url: "/legacy.svg",
      },
    ],
    product_variants: [
      {
        id: "variant-1",
        product_id: "product-1",
        stock_qty: 4,
        low_stock_threshold: 1,
        is_default: true,
        price_override: 90,
      },
    ],
    product_images: [
      { id: "image-1", product_id: "product-1", image_url: "/primary.svg" },
    ],
    product_prices: [{ product_id: "product-1", price: 70 }],
    saved_products: [{ product_id: "product-1", created_at: "2026-10-02" }],
    product_promo_badges: [1, 3, 2].map((priority) => ({
      id: `badge-${priority}`,
      product_id: "product-1",
      priority,
      scheduled_from: null,
      scheduled_until: null,
      promo_badge_types: {
        key: `badge-${priority}`,
        label_en: `Badge ${priority}`,
        label_he: `תג ${priority}`,
        is_active: true,
        shape: "tag",
        tone: "new",
      },
    })),
  };
}

function loadStore({
  rows = fixtures(),
  defaultsGate,
  priceGate,
  failedTable,
} = {}) {
  const started = [];
  const queries = [];
  const client = (mode) => ({
    from(table) {
      const query = { table, mode, filters: [] };
      const builder = {
        select(fields) {
          query.fields = fields;
          return builder;
        },
        eq(field, value) {
          query.filters.push([field, value]);
          return builder;
        },
        in(field, values) {
          query.filters.push([field, values]);
          return builder;
        },
        order() {
          return builder;
        },
        limit(value) {
          query.limit = value;
          return builder;
        },
        then(resolve, reject) {
          started.push(`${mode}:${table}`);
          queries.push(query);
          return Promise.resolve(
            table === "product_prices" && priceGate
              ? priceGate.promise
              : undefined,
          )
            .then(() => ({
              data: rows[table] ?? [],
              error: table === failedTable ? { code: "unavailable" } : null,
            }))
            .then(resolve, reject);
        },
      };
      return builder;
    },
    async rpc(name) {
      started.push(`${mode}:${name}`);
      if (defaultsGate) await defaultsGate.promise;
      return {
        data: {
          low_stock_threshold: 3,
          out_of_stock_policy: "keep_visible_contact",
        },
        error: null,
      };
    },
  });
  // One harness represents one React server request. No memoized result is
  // reused by another harness (or another authenticated visitor).
  const imports = {
    react: { cache: requestCache },
    "@/lib/supabase/public-server": {
      createPublicServerClient: () => client("anonymous"),
    },
    "@/lib/supabase/server": {
      createServerSupabaseClient: async () => client("session"),
    },
    "@/lib/catalog/pricing": pricing,
  };
  const exports = {};
  runInNewContext(compile(storeSource), {
    exports,
    require: (name) => {
      assert.ok(imports[name], `Unexpected import ${name}`);
      return imports[name];
    },
    console,
  });
  return { ...exports, started, queries };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("catalogue rows and role prices start while inventory defaults are pending", async () => {
  const defaultsGate = deferred();
  const priceGate = deferred();
  const store = loadStore({ defaultsGate, priceGate });
  const result = store.getStoreCatalog("en", "ceo");
  await tick();
  for (const table of [
    "products",
    "product_variants",
    "product_images",
    "categories",
    "product_promo_badges",
    "product_prices",
  ]) {
    assert.ok(
      store.started.includes(`session:${table}`),
      `${table} starts in parallel`,
    );
  }
  defaultsGate.resolve();
  priceGate.resolve();
  const catalog = await result;
  assert.equal(catalog.products[0].priceIls, 70);
  assert.equal(catalog.products[0].stockState, "in_stock");
  assert.equal(catalog.products[0].outOfStockPolicy, "keep_visible_contact");
  assert.deepEqual(
    Array.from(catalog.products[0].promoBadges, (badge) => badge.id),
    ["badge-3", "badge-2", "badge-1"],
  );
  assert.equal(catalog.products[0].images[0].url, "/primary.svg");
  assert.equal(catalog.products[0].images[1].url, "/legacy.svg");
});

test("metadata and role-aware page share rows without sharing prices or anonymous reads", async () => {
  const store = loadStore();
  const [metadata, page] = await Promise.all([
    store.getStoreCatalog("en"),
    store.getStoreCatalog("he", "ceo"),
  ]);
  assert.equal(
    store.started.filter((entry) => entry === "session:products").length,
    1,
  );
  assert.equal(metadata.products[0].priceIls, 90);
  assert.equal(page.products[0].priceIls, 70);
  assert.equal(page.products[0].name, "מצלמה");
  await store.getStoreCatalog("en", null, true);
  assert.equal(
    store.started.filter((entry) => entry === "anonymous:products").length,
    1,
  );
  const separateRequest = loadStore();
  await separateRequest.getStoreCatalog("en");
  assert.equal(
    separateRequest.started.filter((entry) => entry === "session:products")
      .length,
    1,
  );
});

test("saved-products data starts categories and restricted role prices alongside images", async () => {
  const priceGate = deferred();
  const store = loadStore({ priceGate });
  const pending = store.getSavedProductsWithCanonicalData(
    "en",
    "user-1",
    "ceo",
  );
  await tick();
  assert.ok(store.started.includes("session:categories"));
  assert.ok(store.started.includes("session:product_images"));
  assert.ok(store.started.includes("session:product_prices"));
  const prices = store.queries.find(
    (query) => query.table === "product_prices",
  );
  assert.deepEqual(Array.from(prices.filters[1][1]), ["product-1"]);
  priceGate.resolve();
  const result = await pending;
  assert.equal(result[0].price, 70);
  assert.equal(result[0].imageUrl, "/primary.svg");
  assert.equal(result[0].categoryLabel, "Cameras");
  assert.equal(result[0].category, "cameras");
  assert.equal(result[0].slug, "camera-model");
  assert.ok(
    !store.queries
      .find((query) => query.table === "products")
      .fields.includes("description"),
  );
});

test("hidden out-of-stock products stay hidden after catalogue parallelization", async () => {
  const rows = fixtures();
  rows.product_variants[0].stock_qty = 0;
  rows.products[0].out_of_stock_policy = "hide_from_public";
  const store = loadStore({ rows });
  const catalog = await store.getStoreCatalog("en", "ceo");
  assert.equal(catalog.products.length, 0);
  const saved = await store.getSavedProductsWithCanonicalData(
    "en",
    "user-1",
    "ceo",
  );
  assert.equal(saved.length, 0);
});

test("service metadata and page share the same published read within one request", async () => {
  const filters = [];
  let reads = 0;
  const builder = {
    select() {
      return builder;
    },
    eq(field, value) {
      filters.push([field, value]);
      return builder;
    },
    async maybeSingle() {
      reads++;
      return {
        data: { id: "service-1", slug: "cameras", content: {} },
        error: null,
      };
    },
  };
  const exports = {};
  const imports = {
    react: { cache: requestCache },
    "@/lib/supabase/public-server": {
      createPublicServerClient: () => ({ from: () => builder }),
    },
  };
  runInNewContext(compile(servicesSource), {
    exports,
    require: (name) => imports[name],
    console,
  });
  const [metadata, page] = await Promise.all([
    exports.getPublishedServiceBySlug("cameras"),
    exports.getPublishedServiceBySlug("cameras"),
  ]);
  assert.equal(reads, 1);
  assert.equal(metadata, page);
  assert.deepEqual(filters, [
    ["slug", "cameras"],
    ["is_active", true],
  ]);
});

test("saved-product failures remain distinct from an empty account, including missing role pricing", async () => {
  for (const failedTable of [
    "saved_products",
    "products",
    "product_images",
    "product_variants",
    "categories",
    "product_prices",
  ]) {
    const store = loadStore({ failedTable });
    assert.equal(
      await store.getSavedProductsWithCanonicalData("he", "user-1", "customer"),
      null,
      failedTable,
    );
  }
  const rows = fixtures();
  rows.saved_products = [];
  const store = loadStore({ rows });
  assert.equal(
    (await store.getSavedProductsWithCanonicalData("en", "user-1", "customer"))
      .length,
    0,
  );
  assert.equal(
    store.queries.find((query) => query.table === "saved_products").limit,
    10,
  );
  assert.equal(
    store.started.length,
    1,
    "empty saves do not trigger canonical reads",
  );
});
