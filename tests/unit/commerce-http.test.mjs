import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { randomUUID } from "node:crypto";
import ts from "typescript";

async function load({
  actor = null,
  allowed = false,
  origin = true,
  rate = "ok",
} = {}) {
  let privilegedCalls = 0;
  const exports = {};
  const compiled = ts.transpileModule(
    await readFile(
      new URL("../../src/lib/commerce/http.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const imports = {
    "server-only": {},
    "node:crypto": { randomUUID },
    "next/server": {
      NextResponse: { json: (body, options) => ({ body, ...options }) },
    },
    "@/lib/auth": { getAuthContext: async () => actor },
    "@/lib/permissions": { can: () => allowed },
    "@/lib/request-origin": { hasSameOrigin: () => origin },
    "@/lib/supabase/server": { createServerSupabaseClient: async () => ({}) },
    "@/lib/supabase/admin": {
      createAdminClient: () => {
        privilegedCalls++;
        return {};
      },
    },
    "@/app/api/management/_shared": {
      checkManagementRateLimit: async () => rate,
      getClientIp: () => "fixture",
    },
  };
  runInNewContext(compiled, {
    exports,
    require: (name) => imports[name],
    TextDecoder,
    Uint8Array,
    console: { error() {} },
  });
  return { ...exports, privilegedCalls: () => privilegedCalls };
}

test("financial auth fails closed before privileged access for origin/role/session denial", async () => {
  for (const config of [
    { origin: false },
    {},
    { actor: { role: "worker", status: "active" } },
    { actor: { role: "ceo", status: "suspended" }, allowed: true },
  ]) {
    const http = await load(config);
    await assert.rejects(() =>
      http.requireCommerceActor(
        new Request("https://miro.example/api", { method: "POST" }),
        "refundPayments",
      ),
    );
    assert.equal(http.privilegedCalls(), 0);
  }
  const http = await load({
    actor: { role: "ceo", status: "active" },
    allowed: true,
    rate: "limited",
  });
  await assert.rejects(
    () =>
      http.requireCommerceActor(
        new Request("https://miro.example/api"),
        "viewCommerce",
      ),
    /rate_limited/,
  );
});

test("bounded reader counts UTF-8 bytes and rejects oversized streamed bodies", async () => {
  const http = await load();
  assert.equal(
    await http.readBoundedBody(
      new Request("https://miro.example", { method: "POST", body: "אב" }),
      4,
    ),
    "אב",
  );
  await assert.rejects(
    () =>
      http.readBoundedBody(
        new Request("https://miro.example", { method: "POST", body: "אב" }),
        3,
      ),
    /body_too_large/,
  );
  await assert.rejects(
    () =>
      http.readBoundedBody(
        new Request("https://miro.example", {
          method: "POST",
          headers: { "content-length": "100000" },
          body: "x",
        }),
        10,
      ),
    /body_too_large/,
  );
  await assert.rejects(
    () =>
      http.readCommerceJson(
        new Request("https://miro.example", {
          method: "POST",
          headers: { "content-type": "text/html" },
          body: "{}",
        }),
      ),
    /invalid_content_type/,
  );
});

test("database failures expose safe codes and correlation IDs without private diagnostics", async () => {
  const http = await load();
  assert.throws(
    () => http.checkRpcError({ code: "PT409", message: "private" }),
    /revision_conflict/,
  );
  const failure = http.commerceFailure(
    new Error("private key and customer data"),
    "fixture",
  );
  assert.equal(failure.status, 503);
  assert.match(failure.body.correlation_id, /^[\da-f-]{36}$/);
  assert.doesNotMatch(JSON.stringify(failure), /private key|customer data/);
  assert.equal(failure.headers["Cache-Control"], "private, no-store");
});
