import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";

const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
const [apiSource, clientSource] = await Promise.all([
  readFile(
    new URL("../../src/app/api/management/products/route.ts", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/management/product-management.tsx",
      import.meta.url,
    ),
    "utf8",
  ),
]);
const optionalOfferSchemas = {};
runInNewContext(
  compile(
    await readFile(
      new URL(
        "../../src/lib/catalog/product-options-schema.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
  {
    exports: optionalOfferSchemas,
    require: (name) => (name === "zod" ? { z } : undefined),
  },
);
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
};

function loadApi({ authorized = true, errorTable } = {}) {
  const started = [];
  const selected = {};
  const gates = { products: deferred(), categories: deferred() };
  const rows = {
    products: [{ id: "product" }],
    categories: [{ id: "category" }],
  };
  const admin = {
    from(table) {
      let single = false;
      const builder = {
        select: (projection) => {
          selected[table] = projection;
          return builder;
        },
        eq: () => builder,
        maybeSingle: () => {
          single = true;
          return builder;
        },
        order: () => builder,
        range: () => builder,
        then(resolve, reject) {
          started.push(table);
          return gates[table].promise
            .then(() => ({
              data: single ? rows[table][0] : rows[table],
              count: 1,
              error: errorTable === table ? { code: "database_error" } : null,
            }))
            .then(resolve, reject);
        },
      };
      return builder;
    },
  };
  const exports = {};
  const imports = {
    "next/server": {
      NextResponse: {
        json: (body, options) => ({ body, status: 200, ...options }),
      },
    },
    zod: { z },
    "@/lib/catalog/product-options-schema": optionalOfferSchemas,
    "@/app/api/management/_shared": {
      withManagementAuth: async () =>
        authorized
          ? { ok: true, admin }
          : { ok: false, response: { status: 403 } },
      errorResponse: (error, status) => ({ body: { error }, status }),
      mapPostgresError: (error) => ({ body: error, status: 503 }),
    },
    "@/lib/supabase/server": {},
    "next/cache": {},
  };
  runInNewContext(compile(apiSource), {
    exports,
    URL,
    require: (name) => imports[name],
  });
  return { GET: exports.GET, started, gates, rows, selected };
}

test("management products and categories start together and share one response", async () => {
  const api = loadApi();
  const response = api.GET(
    new Request("http://localhost/api/management/products"),
  );
  await tick();
  assert.deepEqual(api.started, ["products", "categories"]);
  api.gates.categories.resolve();
  api.gates.products.resolve();
  const result = await response;
  assert.equal(result.status, 200);
  assert.equal(result.body.products, api.rows.products);
  assert.equal(result.body.categories, api.rows.categories);
  assert.equal(result.body.totalCount, 1);
});

test("summary product reads omit editor data while full and single-product callers retain it", async () => {
  for (const query of [
    "?view=summary",
    "",
    "?view=summary&id=11111111-1111-4111-8111-111111111111",
  ]) {
    const api = loadApi();
    const response = api.GET(
      new Request(`http://localhost/api/management/products${query}`),
    );
    api.gates.products.resolve();
    api.gates.categories.resolve();
    assert.equal((await response).status, 200);
    const projection = api.selected.products;
    if (query === "?view=summary") {
      assert.doesNotMatch(
        projection,
        /description|specifications|seo_|purchase_cost|cost_override|product_prices|suppliers/,
      );
      for (const field of [
        "category_id",
        "price_override",
        "is_default",
        "is_active",
        "stock_qty",
        "alt_he",
        "alt_en",
        "sort_order",
      ])
        assert.ok(projection.includes(field), `Missing list field: ${field}`);
    } else {
      assert.match(projection, /description_he/);
      assert.match(projection, /product_prices/);
      assert.match(projection, /cost_override/);
    }
  }
});

test("management products deny unauthorized reads before querying", async () => {
  const api = loadApi({ authorized: false });
  const result = await api.GET(
    new Request("http://localhost/api/management/products"),
  );
  assert.equal(result.status, 403);
  assert.deepEqual(api.started, []);
});

for (const errorTable of ["products", "categories"]) {
  test(`management ${errorTable} failure remains an error`, async () => {
    const api = loadApi({ errorTable });
    const response = api.GET(
      new Request("http://localhost/api/management/products"),
    );
    api.gates.products.resolve();
    api.gates.categories.resolve();
    const result = await response;
    assert.equal(result.status, 503);
    assert.equal(result.body.code, "database_error");
  });
}

function loadClient(fetch) {
  const state = [];
  const refs = [];
  const effects = [];
  let stateIndex = 0;
  let refIndex = 0;
  const react = {
    useState(initial) {
      const index = stateIndex++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value) => (state[index] = value)];
    },
    useRef(initial) {
      const index = refIndex++;
      refs[index] ??= { current: initial };
      return refs[index];
    },
    useEffect: (effect) => effects.push(effect),
    useCallback: (callback) => callback,
  };
  const jsx = (type, props) => ({ type, props });
  const ui = new Proxy({}, { get: (_, name) => name });
  const imports = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "./use-collection-page": {
      useCollectionPage: (items) => ({ visibleItems: items, pager: {} }),
    },
  };
  const exports = {};
  runInNewContext(compile(clientSource), {
    exports,
    AbortController,
    Intl,
    queueMicrotask,
    fetch,
    require: (name) => imports[name] ?? ui,
  });
  return {
    render() {
      stateIndex = 0;
      refIndex = 0;
      return exports.ProductManagement({ locale: "en" });
    },
    mount() {
      this.render();
      return effects[0]();
    },
  };
}

test("product management loads embedded categories with one read and retries failures", async () => {
  const calls = [];
  const categories = [{ id: "category", name_en: "Cameras" }];
  const client = loadClient(async (url) => {
    calls.push(url);
    return calls.length === 1
      ? { ok: false }
      : { ok: true, json: async () => ({ products: [], categories }) };
  });
  client.mount();
  await tick();
  const error = client.render();
  assert.equal(error.type, "ErrorState");
  error.props.onRetry();
  await tick();
  assert.equal(client.render().props.className, "mgmt-products-page");
  assert.equal(calls.length, 2);
  assert.ok(calls.every((url) => url.startsWith("/api/management/products?")));
  assert.ok(calls.every((url) => url.includes("view=summary")));
});

test("product management rejects incomplete data and aborts reads on unmount", async () => {
  const response = deferred();
  let signal;
  const client = loadClient(async (_, options) => {
    signal = options.signal;
    return response.promise;
  });
  const unmount = client.mount();
  await tick();
  unmount();
  assert.equal(signal.aborted, true);
  response.resolve({ ok: true, json: async () => ({ products: [] }) });
  await tick();
  assert.equal(client.render().type, "TableSkeleton");

  const incomplete = loadClient(async () => ({
    ok: true,
    json: async () => ({ products: [] }),
  }));
  incomplete.mount();
  await tick();
  assert.equal(incomplete.render().type, "ErrorState");
});

function findElement(element, predicate) {
  if (Array.isArray(element)) {
    for (const child of element) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
  } else if (element && typeof element === "object" && element.props) {
    if (predicate(element)) return element;
    return findElement(element.props.children, predicate);
  }
  return null;
}

test("summary-only product rows retain default price, active stock and gallery count", async () => {
  const client = loadClient(async () => ({
    ok: true,
    json: async () => ({
      products: [
        {
          id: "product",
          slug: "camera",
          name_en: "Camera",
          name_he: "מצלמה",
          category_id: "category",
          price: 100,
          is_featured: true,
          updated_at: "2026-10-29T00:00:00Z",
          status: "active",
          product_variants: [
            {
              id: "other",
              sku: "ALT",
              is_default: false,
              is_active: true,
              stock_qty: 4,
              price_override: 90,
            },
            {
              id: "default",
              sku: "CAM1",
              is_default: true,
              is_active: true,
              stock_qty: 3,
              price_override: 80,
            },
            {
              id: "inactive",
              sku: "OLD",
              is_default: false,
              is_active: false,
              stock_qty: 99,
              price_override: null,
            },
          ],
          product_images: [
            {
              id: "second",
              image_url: "https://media.example/second.jpg",
              alt_he: null,
              alt_en: "Second",
              sort_order: 1,
            },
            {
              id: "first",
              image_url: "https://media.example/first.jpg",
              alt_he: null,
              alt_en: "First",
              sort_order: 0,
            },
          ],
        },
      ],
      categories: [{ id: "category", name_en: "Cameras" }],
    }),
  }));
  client.mount();
  await tick();
  const content = client.render();
  assert.equal(
    findElement(
      content,
      (element) => element.props.className === "font-mono font-medium",
    ).props.children,
    7,
  );
  assert.match(
    findElement(content, (element) => element.props.className === "font-medium")
      .props.children,
    /80/,
  );
  assert.equal(
    findElement(
      content,
      (element) =>
        element.props.className === "product-management__image-count",
    ).props.children[1],
    2,
  );
  assert.ok(
    findElement(
      content,
      (element) => element.props.src === "https://media.example/first.jpg",
    ),
  );
  assert.ok(findElement(content, (element) => element.props.text === "CAM1"));
});

test("a product status update refreshes products and categories with one read", async () => {
  const calls = [];
  const product = {
    id: "product",
    name_en: "Camera",
    name_he: "מצלמה",
    slug: "camera",
    status: "active",
    category_id: "category",
    price: null,
    product_variants: [],
    product_images: [],
    updated_at: "2026-10-11T00:00:00Z",
  };
  const client = loadClient(async (url, options) => {
    calls.push([url, options.method ?? "GET"]);
    return {
      ok: true,
      json: async () => ({
        products: [product],
        categories: [{ id: "category", name_en: "Cameras" }],
      }),
    };
  });
  client.mount();
  await tick();
  const hide = findElement(
    client.render(),
    (element) =>
      element.type === "IconAction" && element.props.label === "Hide",
  );
  assert.ok(hide);
  hide.props.onClick();
  await tick();
  assert.deepEqual(
    calls.map(([, method]) => method),
    ["GET", "PATCH", "GET"],
  );
  assert.ok(calls.every(([url]) => url.startsWith("/api/management/products")));
});
