// Exercise the connected database through actual management GET routes.
// Only a disposable QA identity is created/deleted; business data stays read-only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const base = new URL(
  process.env.COMMERCE_LIVE_BASE_URL || "http://localhost:3000",
).origin;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert.ok(url && publicKey && process.env.SUPABASE_SECRET_KEY);
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
  },
};
const service = createClient(url, process.env.SUPABASE_SECRET_KEY, options);
const output =
  process.env.COMMERCE_LIVE_OUTPUT_DIR ||
  path.join(os.tmpdir(), `miro-commerce-live-reads-${process.pid}`);
const report = { reads: [], anonymous: [], cleanup: false };
let actorId;
try {
  const email = `pos-loading-qa-${Date.now()}@miro-test.local`;
  const password = `${randomUUID()}Aa!`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.equal(created.error, null, "Disposable QA creation failed");
  actorId = created.data.user.id;
  for (const result of [
    await service
      .from("user_roles")
      .upsert({ user_id: actorId, role: "ceo" }, { onConflict: "user_id" }),
    await service
      .from("profiles")
      .update({ account_status: "active", role: "ceo", full_name: "POS QA" })
      .eq("id", actorId),
  ])
    assert.equal(result.error, null, "Disposable QA role setup failed");
  const user = createClient(url, publicKey, options);
  const signed = await user.auth.signInWithPassword({ email, password });
  assert.equal(signed.error, null, "Disposable CEO authentication failed");
  const cookieName = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  const cookie = `${cookieName}=base64-${Buffer.from(
    JSON.stringify(signed.data.session),
  ).toString("base64url")}`;
  const reads = [
    ["products?limit=10", (body) => Array.isArray(body?.products)],
    ["categories", (body) => Array.isArray(body?.categories)],
    ["inventory?limit=10", (body) => Array.isArray(body?.items)],
    ["services", (body) => Array.isArray(body?.services)],
    ["suppliers", (body) => Array.isArray(body?.suppliers)],
    ["requests?limit=10", (body) => Array.isArray(body?.rows)],
    [
      "analytics",
      (body) => body?.totals != null && Array.isArray(body?.perProduct),
    ],
    ["finance", (body) => body?.totals != null],
    ["settings", (body) => Array.isArray(body?.settings)],
    [
      "settings/animation",
      (body) => body?.settings != null && typeof body?.revision === "string",
    ],
    [
      "storefront/design",
      (body) => body?.design != null && typeof body?.revision === "string",
    ],
    ["storefront/rail", (body) => Array.isArray(body?.railItems)],
    [
      "pos/catalog?limit=30",
      (body) =>
        Array.isArray(body?.products) && Array.isArray(body?.categories),
    ],
    [
      "accounts?limit=10",
      (body) => Array.isArray(body?.orders) && body?.totals != null,
    ],
    [
      "accounts?from=2026-10-10T21:00:00.000Z&to=2026-10-17T20:59:59.999Z&limit=25&offset=0",
      (body) => Array.isArray(body?.orders) && body?.totals != null,
    ],
    [
      `accounts?method=cash&payment-status=voided&cashier=${actorId}&limit=25&offset=0`,
      (body) => Array.isArray(body?.orders) && body?.totals != null,
    ],
    ...["ceo", "admin"].map((role) => [
      `users?role=${role}&limit=100&offset=0`,
      (body) =>
        Array.isArray(body?.users) && Number.isSafeInteger(body?.totalCount),
    ]),
    ["tax", (body) => Array.isArray(body?.taxRates)],
    [
      "customers?limit=20&activeOnly=true",
      (body) => Array.isArray(body?.customers),
    ],
    ["sales?limit=10", (body) => Array.isArray(body?.orders)],
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
      `commerce/${section}`,
      (body) => Array.isArray(body?.rows),
    ]),
  ];
  for (const [route, validate] of reads) {
    const response = await fetch(`${base}/api/management/${route}`, {
      headers: { cookie },
      signal: AbortSignal.timeout(45000),
    });
    const body = await response.json().catch(() => null);
    const passed = response.ok && validate(body);
    // Do not write customer, inventory, financial, identity or session payloads.
    report.reads.push({ route, status: response.status, passed });
    console.log(
      `${passed ? "PASS" : "FAIL"} ${route}: HTTP ${response.status}`,
    );
    if (route.startsWith("pos/catalog?") && passed && body.products.length) {
      const { data, error } = await service
        .from("product_images")
        .select("product_id, image_url, sort_order")
        .in(
          "product_id",
          body.products.map((product) => product.id),
        )
        .order("sort_order");
      const firstImages = new Map();
      for (const image of data ?? []) {
        if (!firstImages.has(image.product_id))
          firstImages.set(image.product_id, image.image_url);
      }
      const valid =
        !error &&
        body.products.every(
          (product) =>
            !firstImages.has(product.id) ||
            product.image_url === firstImages.get(product.id),
        );
      report.reads.push({
        route: "pos/catalog gallery consistency",
        status: response.status,
        passed: valid,
      });
      console.log(
        `${valid ? "PASS" : "FAIL"} POS images match the current product galleries`,
      );
    }
    if (route.startsWith("accounts?") && passed && body.orders.length) {
      const detail = await fetch(
        `${base}/api/management/accounts/${body.orders[0].order_id}`,
        { headers: { cookie }, signal: AbortSignal.timeout(45000) },
      );
      const result = await detail.json().catch(() => null);
      const valid =
        detail.ok &&
        result?.order?.order_id === body.orders[0].order_id &&
        Array.isArray(result?.order_items) &&
        Array.isArray(result?.order_payments) &&
        Array.isArray(result?.stock_movements);
      report.reads.push({
        route: "accounts/{orderId}",
        status: detail.status,
        passed: valid,
      });
      console.log(
        `${valid ? "PASS" : "FAIL"} existing POS account detail: HTTP ${detail.status}`,
      );
    }
  }
  const missing = await fetch(
    `${base}/api/management/accounts/00000000-0000-4000-8000-000000000000`,
    { headers: { cookie }, signal: AbortSignal.timeout(45000) },
  );
  report.reads.push({
    route: "accounts/{missingOrderId}",
    status: missing.status,
    passed: missing.status === 404,
  });
  for (const route of [
    "pos/catalog",
    "accounts",
    "commerce/expenses",
    "commerce/report",
  ]) {
    const response = await fetch(`${base}/api/management/${route}`, {
      signal: AbortSignal.timeout(45000),
    });
    report.anonymous.push({
      route,
      status: response.status,
      passed: [401, 403].includes(response.status),
    });
  }
} finally {
  if (actorId) {
    const deleted = await service.auth.admin.deleteUser(actorId);
    report.cleanup = deleted.error === null;
    assert.ok(report.cleanup, "Disposable CEO cleanup failed");
    console.log("PASS disposable CEO cleanup");
  }
  await mkdir(output, { recursive: true });
  await writeFile(
    path.join(output, "live-reads.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
assert.ok(
  report.reads.every((read) => read.passed),
  "A management data contract failed",
);
assert.ok(
  report.anonymous.every((read) => read.passed),
  "Anonymous access was not denied",
);
console.log(
  `PASS ${report.reads.length} live reads and ${report.anonymous.length} access checks; ${output}`,
);
