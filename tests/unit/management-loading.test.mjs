import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { z } from "zod";

async function load(file, imports) {
  const exports = {};
  runInNewContext(
    ts.transpileModule(await readFile(new URL(file, import.meta.url), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      Date,
      Intl,
      URL,
      console: { warn() {}, error() {} },
      require(name) {
        assert.ok(name in imports, `Unexpected import: ${name}`);
        return imports[name];
      },
    },
  );
  return exports;
}

function database(resolveQuery, gated) {
  const started = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  return {
    started,
    release,
    client: {
      from(table) {
        const query = { table, filters: [] };
        const builder = {
          select(projection, options) {
            Object.assign(query, { projection, options });
            return builder;
          },
          eq(...args) {
            query.filters.push(["eq", ...args]);
            return builder;
          },
          not(...args) {
            query.filters.push(["not", ...args]);
            return builder;
          },
          gte(...args) {
            query.filters.push(["gte", ...args]);
            return builder;
          },
          lte(...args) {
            query.filters.push(["lte", ...args]);
            return builder;
          },
          in(...args) {
            query.filters.push(["in", ...args]);
            return builder;
          },
          order(...args) {
            query.filters.push(["order", ...args]);
            return builder;
          },
          limit(limit) {
            query.limit = limit;
            return builder;
          },
          then(resolve, reject) {
            started.push(query);
            return (gated(query) ? gate : Promise.resolve())
              .then(() => resolveQuery(query))
              .then(resolve, reject);
          },
        };
        return builder;
      },
    },
  };
}

const filter = (query, method, column) =>
  query.filters.find(
    ([name, field]) => name === method && field === column,
  )?.[2];

async function overview({
  denied = false,
  lookupFailure = false,
  movementsFailure = false,
} = {}) {
  const rows = {
    profiles: [{ id: "actor-1", full_name: "Staff name" }],
    products: [{ id: "product-1", name_he: "מצלמה", name_en: "Camera" }],
    categories: [{ id: "category-1", name_he: "מצלמות", name_en: "Cameras" }],
    product_variants: [
      { id: "variant-1", products: { name_he: "מצלמה", name_en: "Camera" } },
    ],
  };
  const db = database(
    (query) => {
      const secondary = Boolean(filter(query, "in", "id"));
      if (secondary)
        return {
          data: lookupFailure ? null : rows[query.table],
          error: lookupFailure ? { message: "Lookup unavailable" } : null,
        };
      if (query.table === "orders")
        return {
          data: query.projection.startsWith("total")
            ? [{ total: 118, net_total: 100, vat_total: 18 }]
            : [
                {
                  id: "sale-1",
                  total: 118,
                  recorded_by: "actor-1",
                  order_number: "QA-1",
                },
              ],
          error: null,
        };
      if (query.table === "product_variants")
        return {
          data: [
            {
              stock_qty: 2,
              low_stock_threshold: 3,
              cost_override: null,
              products: { purchase_cost: 10 },
            },
          ],
          error: null,
        };
      if (query.table === "stock_movements")
        return {
          data: movementsFailure
            ? null
            : [
                { variant_id: "variant-1", delta: -2 },
                { variant_id: "variant-1", delta: -3 },
              ],
          error: movementsFailure ? { message: "Movements unavailable" } : null,
        };
      if (query.table === "audit_events")
        return {
          data: [
            {
              id: "audit-1",
              user_id: "actor-1",
              entity_type: "product",
              entity_id: "product-1",
              details: { name: "Product fallback" },
            },
            {
              id: "audit-2",
              user_id: "actor-1",
              entity_type: "category",
              entity_id: "category-1",
              details: { name: "Category fallback" },
            },
          ],
          error: null,
        };
      return { data: null, count: 2, error: null };
    },
    (query) => Boolean(filter(query, "in", "id")),
  );
  const api = await load("../../src/app/[locale]/(protected)/admin/page.tsx", {
    "react/jsx-runtime": jsx,
    "@/lib/auth": {
      requireRole: async () => {
        if (denied) throw new Error("Forbidden");
      },
    },
    "@/lib/management-audit": {
      israelDayStart: (day) => `${day}T00:00:00.000Z`,
    },
    "@/lib/supabase/admin": { createAdminClient: () => db.client },
    "@/lib/i18n": { isLocale: () => true },
    "@/components/management/overview-panel": { OverviewPanel: () => null },
    "@/components/auth/private-closed-page": {
      privateMetadata: () => () => ({}),
    },
  });
  return {
    ...db,
    page: () => api.default({ params: Promise.resolve({ locale: "en" }) }),
  };
}

test("overview starts all independent label lookups before any one completes", async () => {
  const fixture = await overview();
  const rendering = fixture.page();
  await new Promise(setImmediate);
  try {
    assert.deepEqual(
      fixture.started
        .filter((q) => filter(q, "in", "id"))
        .map((q) => q.table)
        .sort(),
      ["categories", "product_variants", "products", "profiles"],
    );
  } finally {
    fixture.release();
  }
  const result = (await rendering).props;
  assert.equal(result.operations.error, false);
  assert.equal(result.operations.data.inventoryUnits, 2);
  assert.equal(result.operations.data.inventoryValue, 20);
  assert.equal(result.operations.data.topMovers[0].unitsSold, 5);
  assert.equal(
    result.operations.data.recentSales[0].recordedByName,
    "Staff name",
  );
  assert.equal(result.activity.data.events[0].entityName, "Camera");
  assert.equal(result.activity.data.events[1].entityName, "Cameras");
});

test("optional overview label failures preserve independent panels and existing fallbacks", async () => {
  const fixture = await overview({ lookupFailure: true });
  fixture.release();
  const result = (await fixture.page()).props;
  assert.equal(result.kpis.error, false);
  assert.equal(result.attention.error, false);
  assert.equal(result.operations.error, false);
  assert.equal(result.operations.data.topMovers.length, 0);
  assert.equal(result.operations.data.recentSales[0].recordedByName, null);
  assert.equal(result.activity.data.events[0].entityName, "Product fallback");
});

test("failed overview movements keep operations unavailable and skip mover labels", async () => {
  const fixture = await overview({ movementsFailure: true });
  fixture.release();
  const result = (await fixture.page()).props;
  assert.equal(result.operations.error, true);
  assert.equal(result.operations.data, null);
  assert.equal(
    fixture.started.some(
      (q) => q.table === "product_variants" && filter(q, "in", "id"),
    ),
    false,
  );
});

test("overview authorization completes before private database requests", async () => {
  const fixture = await overview({ denied: true });
  await assert.rejects(fixture.page(), /Forbidden/);
  assert.equal(fixture.started.length, 0);
});

async function analytics({
  failTable,
  capped = false,
  authorized = true,
  rate = "ok",
} = {}) {
  const topProducts = ["product-1", "product-2"].map((product_id) => ({
    product_id,
    slug: product_id,
    name_en: product_id,
    name_he: null,
    views: 10,
  }));
  const db = database(
    (query) => {
      if (query.table === failTable)
        return { data: null, error: { code: "db_failure" } };
      if (query.table === "products")
        return {
          data: topProducts.map((p) => ({
            id: p.product_id,
            category_id: "category-1",
            categories: { slug: "cameras", name_en: "Cameras", name_he: null },
          })),
          error: null,
        };
      if (query.table === "v_product_daily_metrics")
        return {
          data: [{ day: "2026-10-01T00:00:00Z", events: 10 }],
          error: null,
        };
      if (query.table === "service_requests") return { count: 2, error: null };
      if (query.options?.head) return { count: 3, error: null };
      return {
        data: capped
          ? Array.from({ length: 5000 }, () => ({ session_id: "same-session" }))
          : [
              { session_id: "session-1" },
              { session_id: "session-1" },
              { session_id: "session-2" },
            ],
        error: null,
      };
    },
    () => true,
  );
  const rpcCalls = [];
  const api = await load("../../src/app/api/management/analytics/route.ts", {
    zod: { z },
    "next/server": {
      NextResponse: {
        json: (body, options) => ({ body, status: 200, ...options }),
      },
    },
    "@/lib/analytics-daily": { aggregateDailyEvents: (rows) => rows },
    "@/app/api/management/_shared": {
      withManagementAuth: async () =>
        authorized
          ? { ok: true, admin: db.client }
          : { ok: false, response: { status: 403 } },
      checkManagementRateLimit: async () => rate,
      tooManyRequests: () => ({
        body: { error: "Too many requests", code: "rate_limited" },
        status: 429,
        headers: { "Retry-After": "60" },
      }),
      getClientIp: () => "test-ip",
      errorResponse: (error, status) => ({ body: { error }, status }),
      mapPostgresError: (error) => ({
        body: { error: error.code },
        status: 500,
      }),
    },
    "@/lib/supabase/server": {
      createServerSupabaseClient: async () => ({
        rpc: async (name, args) => {
          rpcCalls.push({ name, args });
          return {
            data:
              name === "management_sales_summary"
                ? { current: { orders_count: 4 } }
                : {
                    from: args.p_from,
                    to: args.p_to,
                    totals: { product_views: 20 },
                    top_products: topProducts,
                  },
            error: null,
          };
        },
      }),
    },
    "@/lib/sales-channel": { channelDbValues: (value) => [value] },
  });
  return {
    ...db,
    rpcCalls,
    get: (query = "") =>
      api.GET(
        new Request(
          `https://miro.example.test/api/management/analytics${query}`,
        ),
      ),
  };
}

test("analytics loads exact product metrics, categories and UTC daily aggregates in one wave", async () => {
  const fixture = await analytics();
  const query = "?from=2026-10-01T07:12:00.000Z&to=2026-10-02T19:31:00.000Z";
  const response = fixture.get(query);
  await new Promise(setImmediate);
  try {
    assert.equal(fixture.started.length, 8);
  } finally {
    fixture.release();
  }
  const result = await response;
  assert.equal(result.status, 200);
  assert.equal(result.body.perProduct[0].category.slug, "cameras");
  assert.equal(result.body.perProduct[0].contactClicks, 3);
  assert.equal(result.body.perProduct[0].enquiries, 2);
  assert.equal(result.body.perProduct[0].uniqueViewers, 2);
  assert.equal(result.body.perProduct[0].conversion, 0.2);
  assert.equal(result.body.totals.salesCount, 4);
  for (const q of fixture.started.filter((q) =>
    ["analytics_events", "service_requests"].includes(q.table),
  )) {
    assert.equal(filter(q, "gte", "created_at"), "2026-10-01T07:12:00.000Z");
    assert.equal(filter(q, "lte", "created_at"), "2026-10-02T19:31:00.000Z");
    if (q.options?.head) assert.equal(q.options.count, "exact");
    else assert.equal(q.limit, 5000);
  }
  const daily = fixture.started.find(
    (q) => q.table === "v_product_daily_metrics",
  );
  assert.equal(filter(daily, "gte", "day"), "2026-10-01");
  assert.equal(filter(daily, "lte", "day"), "2026-10-02");
});

test("analytics omitted date parameters use resolved bounds instead of undefined database filters", async () => {
  const fixture = await analytics({ capped: true });
  fixture.release();
  const result = await fixture.get("?range=30d");
  assert.equal(result.status, 200);
  assert.equal(result.body.partial.uniqueViewersCapped, true);
  assert.equal(result.body.perProduct[0].uniqueViewers, 1);
  for (const q of fixture.started.filter((q) =>
    ["analytics_events", "service_requests"].includes(q.table),
  )) {
    assert.equal(filter(q, "gte", "created_at"), "1970-01-01T00:00:00.000Z");
    assert.ok(Number.isFinite(Date.parse(filter(q, "lte", "created_at"))));
  }
});

test("analytics query failures remain errors instead of partial success", async () => {
  for (const failTable of [
    "products",
    "analytics_events",
    "service_requests",
    "v_product_daily_metrics",
  ]) {
    const fixture = await analytics({ failTable });
    fixture.release();
    const result = await fixture.get();
    assert.equal(result.status, 500);
    assert.equal(result.body.error, "db_failure");
  }
});

test("analytics authorization and rate limiting still precede all database report reads", async () => {
  for (const options of [
    { authorized: false },
    { rate: "limited" },
    { rate: "error" },
  ]) {
    const fixture = await analytics(options);
    const result = await fixture.get();
    assert.ok([403, 429, 503].includes(result.status));
    assert.equal(fixture.started.length, 0);
    assert.equal(fixture.rpcCalls.length, 0);
  }
});
