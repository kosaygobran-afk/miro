// Broad connected read/access audit. Business records are read-only; the only
// writes are disposable QA users and their own private saved/history fixtures.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const base = new URL(
  process.env.DATA_ACCESS_BASE_URL || "http://127.0.0.1:3105",
).origin;
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname),
  "Only a local audit server is permitted",
);
const output =
  process.env.DATA_ACCESS_OUTPUT_DIR || "/tmp/miro-data-audit-20261022";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert.ok(
  url && key && process.env.SUPABASE_SECRET_KEY,
  "Supabase configuration required",
);
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(20000) }),
  },
};
const service = createClient(url, process.env.SUPABASE_SECRET_KEY, options);
const report = {
  checks: [],
  coverage: [],
  cleanup: [],
  startedAt: new Date().toISOString(),
};
const actors = [];
const fixtureHistoryIds = [];
const absent = "00000000-0000-4000-8000-000000000000";
let lastRequest = 0;
const interval = Number(process.env.DATA_ACCESS_INTERVAL_MS || "1300");
function record(label, passed, metadata = {}) {
  report.checks.push({ label, passed: Boolean(passed), ...metadata });
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}
async function request(route, actor, { method = "GET", body } = {}) {
  const remaining = interval - (Date.now() - lastRequest);
  if (remaining > 0)
    await new Promise((resolve) => setTimeout(resolve, remaining));
  lastRequest = Date.now();
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      ...(actor ? { cookie: actor.cookie } : {}),
      Origin: base,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(45000),
  });
  const result = await response.json().catch(() => null);
  return { response, result };
}
async function makeActor(role, status = "active") {
  const email = `data-audit-${role}-${Date.now()}-${actors.length}@miro-test.local`;
  const password = `Audit-${randomUUID()}Aa!`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.equal(created.error, null, "Disposable actor creation failed");
  const actor = { id: created.data.user.id, role, status };
  actors.push(actor);
  for (const result of [
    await service
      .from("user_roles")
      .upsert({ user_id: actor.id, role }, { onConflict: "user_id" }),
    await service
      .from("profiles")
      .update({ role, account_status: status, full_name: `Data audit ${role}` })
      .eq("id", actor.id),
  ])
    assert.equal(result.error, null, "Disposable actor setup failed");
  const client = createClient(url, key, options);
  const signed = await client.auth.signInWithPassword({ email, password });
  assert.equal(signed.error, null, "Disposable actor authentication failed");
  actor.client = client;
  actor.cookie = `sb-${new URL(url).hostname.split(".")[0]}-auth-token=base64-${Buffer.from(JSON.stringify(signed.data.session)).toString("base64url")}`;
  return actor;
}
async function getFiles(directory) {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) files.push(...(await getFiles(file)));
    else if (
      item.name === "route.ts" &&
      /^export async function GET\(/m.test(await readFile(file, "utf8"))
    )
      files.push(file);
  }
  return files;
}
const array = (key) => (body) => Array.isArray(body?.[key]);
const listContracts = [
  ["products", "products?limit=5", array("products")],
  ["categories", "categories", array("categories")],
  ["inventory", "inventory?limit=5", array("items")],
  ["services", "services", array("services")],
  ["suppliers", "suppliers", array("suppliers")],
  ["requests", "requests?limit=5", array("rows")],
  [
    "analytics",
    "analytics",
    (body) => body?.totals && Array.isArray(body?.perProduct),
  ],
  ["finance", "finance", (body) => body?.totals != null],
  ["settings", "settings", array("settings")],
  ["calculator-history", "calculator-history?limit=2", array("history")],
  [
    "settings/animation",
    "settings/animation",
    (body) => body?.settings && typeof body.revision === "string",
  ],
  [
    "storefront/design",
    "storefront/design",
    (body) => body?.design && typeof body.revision === "string",
  ],
  ["storefront/rail", "storefront/rail", array("railItems")],
  [
    "pos/catalog",
    "pos/catalog?limit=5",
    (body) => Array.isArray(body?.products) && Array.isArray(body?.categories),
  ],
  [
    "accounts",
    "accounts?limit=5",
    (body) => Array.isArray(body?.orders) && body?.totals,
  ],
  [
    "users",
    "users?limit=5",
    (body) =>
      Array.isArray(body?.users) && Number.isSafeInteger(body?.totalCount),
  ],
  ["tax", "tax", array("taxRates")],
  [
    "customers",
    "customers?limit=5",
    (body) =>
      Array.isArray(body?.customers) && Number.isSafeInteger(body?.totalCount),
  ],
  ["sales", "sales?limit=5", array("orders")],
  [
    "audit",
    "audit?limit=5",
    (body) =>
      Array.isArray(body?.auditEvents) &&
      Number.isSafeInteger(body?.totalCount),
  ],
  ["product-images", "product-images", array("images")],
  ["product-prices", "product-prices", array("prices")],
  ["product-lookup", "product-lookup?limit=5", array("results")],
  ["variants", "variants", array("variants")],
  ["storefront/badges", "storefront/badges", array("badgeTypes")],
  [
    "storefront/product-badges",
    "storefront/product-badges",
    array("productBadges"),
  ],
  ["storefront/promotions", "storefront/promotions", array("promotions")],
  ...[
    "settings",
    "integrations",
    "expenses",
    "documents",
    "drafts",
    "cash",
    "recurring",
    "intents",
    "payments",
    "report",
  ].map((section) => [
    "commerce/[section]",
    `commerce/${section}?limit=5`,
    array("rows"),
  ]),
];
try {
  const health = await fetch(`${base}/api/health`, {
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(
    health.status,
    200,
    "Local server readiness must pass before live audit",
  );
  record("local health readiness", true);
  const ceo = await makeActor("ceo");
  const admin = await makeActor("admin");
  const worker = await makeActor("worker");
  const customer = await makeActor("customer");
  const otherCustomer = await makeActor("customer");
  const products = await service
    .from("products")
    .select("id")
    .eq("status", "active")
    .eq("is_active", true)
    .neq("out_of_stock_policy", "hide_from_public")
    .limit(2);
  assert.equal(products.error, null, "Catalog schema check failed");
  assert.ok(
    products.data.length >= 2,
    "Two existing visible products required for private saved fixtures",
  );
  const productId = products.data[0].id;
  const variant = await service
    .from("product_variants")
    .select("id")
    .eq("product_id", productId)
    .limit(1)
    .maybeSingle();
  assert.equal(variant.error, null);
  const details = [
    [
      "products/[id]",
      `products/${productId}`,
      (body) => body?.product?.id === productId,
    ],
    ["accounts/[orderId]", `accounts/${absent}`, null, 404],
    [
      "commerce/product-channel",
      `commerce/product-channel?product_id=${productId}`,
      (body) =>
        body?.id === productId && typeof body?.sales_channel === "string",
    ],
    ["commerce/intents", "commerce/intents?limit=5", array("rows")],
    [
      "commerce/documents/[id]/preview",
      `commerce/documents/${absent}/preview?format=html`,
      null,
      404,
    ],
    [
      "commerce/expenses/[id]/attachments",
      `commerce/expenses/${absent}/attachments?attachment_id=${absent}`,
      null,
      404,
    ],
  ];
  const contracts = [...listContracts, ...details];
  const covered = new Set(contracts.map(([key]) => key));
  const getRoutes = (await getFiles("src/app/api/management")).map((file) =>
    path.relative("src/app/api/management", path.dirname(file)),
  );
  report.coverage = getRoutes.map((route) => ({
    route,
    covered: covered.has(route),
  }));
  record(
    "every management GET route has an explicit live contract",
    report.coverage.every((entry) => entry.covered),
    { routeCount: report.coverage.length },
  );
  for (const actor of [ceo, admin, worker, customer, null]) {
    for (const [, route, validate, status = 200] of contracts) {
      const { response, result } = await request(
        `/api/management/${route}`,
        actor,
      );
      const allowed = actor && ["ceo", "admin"].includes(actor.role);
      const passed = allowed
        ? response.status === status && (!validate || validate(result))
        : [401, 403].includes(response.status) && result?.error != null;
      record(
        `${actor?.role || "anonymous"}: GET ${route.replace(productId, "{product}")}`,
        passed,
        { status: response.status },
      );
    }
  }
  // Query validation distinguishes invalid input from database failures.
  for (const [route, status] of [
    ["products/not-a-uuid", 400],
    ["products?limit=0", 400],
    ["products?limit=101", 400],
    ["product-images?productId=invalid", 400],
    ["product-lookup?limit=51", 400],
    ["calculator-history?limit=0", 400],
    ["calculator-history?limit=51", 400],
    ["audit?from=2026-02-30", 400],
    ["audit?from=2026-10-22&to=2026-10-21", 400],
    ["inventory?variantId=invalid", 400],
    ["commerce/expenses?from=invalid", 400],
    [`products/${absent}`, 404],
    [`customers?id=${absent}`, 404],
  ]) {
    const { response } = await request(`/api/management/${route}`, ceo);
    record(`validation: GET ${route}`, response.status === status, {
      status: response.status,
    });
  }
  for (const actor of [ceo, admin]) {
    const { response, result } = await request(
      `/api/management/customers?id=${customer.id}`,
      actor,
    );
    record(
      `${actor.role}: customer detail complete shape`,
      response.ok &&
        result?.customer?.id === customer.id &&
        [result?.orders, result?.serviceRequests, result?.events].every(
          Array.isArray,
        ),
      { status: response.status },
    );
    for (const resource of ["product-images", "variants"]) {
      const { response: filtered, result: body } = await request(
        `/api/management/${resource}?productId=${productId}`,
        actor,
      );
      const rows = body?.[resource === "variants" ? "variants" : "images"];
      record(
        `${actor.role}: ${resource} product filter`,
        filtered.ok &&
          Array.isArray(rows) &&
          rows.every((row) => row.product_id === productId),
        { status: filtered.status },
      );
    }
    const { response: legacy, result: body } = await request(
      `/api/management/products?id=${productId}`,
      actor,
    );
    record(
      `${actor.role}: legacy product detail contract`,
      legacy.ok && body?.product?.id === productId,
      { status: legacy.status },
    );
    if (variant.data) {
      const { response: history, result: body } = await request(
        `/api/management/inventory?variantId=${variant.data.id}`,
        actor,
      );
      record(
        `${actor.role}: stock movement detail schema`,
        history.ok &&
          Array.isArray(body?.movements) &&
          "openingBalance" in body,
        { status: history.status },
      );
    }
  }
  // Compare offset slices against one bounded canonical API result.
  for (const [resource, key, first, second] of [
    ["inventory", "items", "limit=6&offset=0", "limit=3&offset=1"],
    ["products", "products", "limit=6&page=1", "limit=3&page=2"],
    ["customers", "customers", "limit=6&offset=0", "limit=3&offset=1"],
    ["users", "users", "limit=6&offset=0", "limit=3&offset=1"],
  ]) {
    const firstPage = await request(
      `/api/management/${resource}?${first}`,
      ceo,
    );
    const secondPage = await request(
      `/api/management/${resource}?${second}`,
      ceo,
    );
    const expected = firstPage.result?.[key]
      ?.slice(resource === "products" ? 3 : 1, resource === "products" ? 6 : 4)
      .map((row) => row.id);
    const actual = secondPage.result?.[key]?.map((row) => row.id);
    record(
      `${resource}: paginated IDs match canonical slice`,
      firstPage.response.ok &&
        secondPage.response.ok &&
        JSON.stringify(expected) === JSON.stringify(actual),
      {
        status: secondPage.response.status,
        expectedLength: expected?.length,
        actualLength: actual?.length,
      },
    );
  }
  for (const [label, term] of [
    ["English name", "camera"],
    ["identifier", "MIRO"],
    ["punctuation", "()"],
    ["Hebrew name", "מצלמה"],
    ["literal wildcards", "%_*"],
    ["filter grammar injection", 'x),is_active.eq.false,"\\%_*'],
  ]) {
    const { response, result } = await request(
      `/api/management/product-lookup?q=${encodeURIComponent(term)}&limit=5`,
      ceo,
    );
    record(
      `product lookup search handles ${label}`,
      response.ok && Array.isArray(result?.results),
      { status: response.status },
    );
  }
  const allLookup = await request(
    "/api/management/product-lookup?activeOnly=false&limit=5",
    ceo,
  );
  const canonicalVariants = await service
    .from("product_variants")
    .select("id,products!inner(id)")
    .order("sku")
    .limit(5);
  record(
    "product lookup activeOnly=false matches unrestricted canonical variants",
    allLookup.response.ok &&
      canonicalVariants.error === null &&
      JSON.stringify(
        allLookup.result?.results?.map((row) => row.variant.id),
      ) === JSON.stringify(canonicalVariants.data?.map((row) => row.id)),
    { status: allLookup.response.status },
  );
  const invalidActive = await request(
    "/api/management/product-lookup?activeOnly=maybe",
    ceo,
  );
  record(
    "product lookup rejects malformed activeOnly",
    invalidActive.response.status === 400,
    { status: invalidActive.response.status },
  );
  // Private calculator fixtures prove both role authorization and own-user scope.
  for (const [index, actor] of [ceo, admin].entries()) {
    const fixture = await service
      .from("calculator_history")
      .insert({
        user_id: actor.id,
        expression: `${index + 1}+1`,
        result: index + 2,
        context_path: "/qa/data-audit",
      })
      .select("id")
      .single();
    assert.equal(fixture.error, null, "Private calculator fixture failed");
    fixtureHistoryIds.push(fixture.data.id);
  }
  for (const [index, actor] of [ceo, admin].entries()) {
    const { response, result } = await request(
      "/api/management/calculator-history?limit=1",
      actor,
    );
    record(
      `${actor.role}: calculator own history isolation`,
      response.ok &&
        result?.history?.length === 1 &&
        result.history[0].id === fixtureHistoryIds[index] &&
        result.limit === 1,
      { status: response.status },
    );
  }
  // The fixtures belong exclusively to synthetic users; no owner catalog writes.
  for (const [index, actor] of [customer, otherCustomer].entries()) {
    const saved = await service
      .from("saved_products")
      .insert({ user_id: actor.id, product_id: products.data[index].id });
    assert.equal(saved.error, null, "Private saved-product fixture failed");
  }
  for (const [index, actor] of [customer, otherCustomer].entries()) {
    const { response, result } = await request(
      "/api/account/saved-products",
      actor,
    );
    record(
      `customer ${index + 1}: own saved-products API isolation`,
      response.ok &&
        result?.savedProducts?.length === 1 &&
        result.savedProducts[0].product_id === products.data[index].id,
      { status: response.status },
    );
    const peer = index ? customer : otherCustomer;
    const direct = await actor.client
      .from("saved_products")
      .select("user_id,product_id")
      .eq("user_id", peer.id);
    record(
      `customer ${index + 1}: direct peer saved-product RLS`,
      !direct.error && direct.data.length === 0,
    );
    const history = await actor.client.rpc("get_calculator_history", {
      p_limit: 1,
    });
    record(
      `customer ${index + 1}: calculator RPC denied`,
      history.error?.code === "42501",
    );
  }
  const anonSaved = await request("/api/account/saved-products", null);
  record("anonymous: saved products denied", anonSaved.response.status === 401);
  for (const status of ["suspended", "blocked"]) {
    const changed = await service
      .from("profiles")
      .update({ account_status: status })
      .eq("id", admin.id);
    assert.equal(changed.error, null);
    for (const route of [
      "products?limit=1",
      "customers?limit=1",
      "commerce/report",
    ]) {
      const { response } = await request(`/api/management/${route}`, admin);
      record(
        `${status} admin: ${route} denied`,
        [401, 403].includes(response.status),
        { status: response.status },
      );
    }
  }
} catch (error) {
  // Metadata only: exception messages can contain request/session details.
  report.exception = { name: error?.name ?? "Error" };
  throw error;
} finally {
  if (fixtureHistoryIds.length) {
    const deleted = await service
      .from("calculator_history")
      .delete()
      .in("id", fixtureHistoryIds);
    report.cleanup.push({
      fixture: "calculator_history",
      passed: deleted.error === null,
    });
  }
  for (const actor of actors) {
    const saved = await service
      .from("saved_products")
      .delete()
      .eq("user_id", actor.id);
    const deleted = await service.auth.admin.deleteUser(actor.id);
    const remains = await service
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("id", actor.id);
    report.cleanup.push({
      role: actor.role,
      passed:
        saved.error === null &&
        deleted.error === null &&
        remains.error === null &&
        remains.count === 0,
    });
  }
  report.finishedAt = new Date().toISOString();
  report.passed =
    !report.exception &&
    report.checks.every((entry) => entry.passed) &&
    report.cleanup.every((entry) => entry.passed);
  await mkdir(output, { recursive: true, mode: 0o700 });
  await writeFile(
    path.join(output, "data-access.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(
    `Audit: ${report.checks.filter((entry) => entry.passed).length}/${report.checks.length} passed; cleanup ${report.cleanup.every((entry) => entry.passed) ? "PASS" : "FAIL"}; metadata at ${output}/data-access.json`,
  );
}
assert.ok(report.passed, "Data contract/access audit failures require review");
