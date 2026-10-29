import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";

async function load(path, imports) {
  const source = await readFile(
    new URL(`../../${path}`, import.meta.url),
    "utf8",
  );
  const exports = {};
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      structuredClone,
      URL,
      console: { error() {} },
      require(name) {
        assert.ok(
          Object.hasOwn(imports, name),
          `Unexpected dependency: ${name}`,
        );
        return imports[name];
      },
    },
  );
  return exports;
}
const contract = await load("src/lib/glass-settings.ts", { zod: { z } });
const permissions = await load("src/lib/permissions.ts", {});
const origin = await load("src/lib/request-origin.ts", {});
const revision = "2026-10-29T12:00:00.000000+00:00";
const nextRevision = "2026-10-29T12:00:01.000000+00:00";
const NextResponse = {
  json(value, options = {}) {
    return new Response(JSON.stringify(value), {
      ...options,
      headers: { "content-type": "application/json", ...options.headers },
    });
  },
};

async function routeFixture({
  role = "ceo",
  status = "active",
  error = null,
  enabled = true,
} = {}) {
  const calls = [];
  const query = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    async maybeSingle() {
      return {
        data: { value: { enabled }, updated_at: revision },
        error: null,
      };
    },
  };
  const shared = await load("src/app/api/management/_shared.ts", {
    "@/lib/request-origin": origin,
    "@/lib/auth": {
      getAuthContext: async () => (role ? { role, status } : null),
    },
    "@/lib/supabase/admin": {
      createAdminClient: () => ({ from: () => query }),
    },
    "@/lib/permissions": permissions,
    "next/server": { NextResponse },
  });
  const route = await load("src/app/api/management/settings/glass/route.ts", {
    "next/server": { NextResponse },
    "next/cache": {
      revalidateTag: (...args) => calls.push(["tag", ...args]),
      revalidatePath: (...args) => calls.push(["path", ...args]),
    },
    zod: { z },
    "@/app/api/management/_shared": shared,
    "@/lib/glass-settings": contract,
    "@/lib/glass-settings-server": {
      rememberPublicGlassSettings: (value) => calls.push(["remember", value]),
    },
    "@/lib/supabase/server": {
      createServerSupabaseClient: async () => ({
        rpc: async (...args) => {
          calls.push(["rpc", ...args]);
          return { data: nextRevision, error };
        },
      }),
    },
  });
  const request = (
    method = "PUT",
    body = { settings: { enabled: false }, revision },
    requestOrigin = "https://miro.example",
  ) =>
    new Request("https://miro.example/api/management/settings/glass", {
      method,
      headers: {
        host: "miro.example",
        ...(requestOrigin ? { origin: requestOrigin } : {}),
        "content-type": "application/json",
      },
      ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
    });
  return { route, request, calls };
}

test("strict public and save contracts contain only appearance fields", () => {
  assert.equal(
    contract.glassSettingsSchema.safeParse({ enabled: false }).success,
    true,
  );
  for (const value of [
    {},
    { enabled: "false" },
    { enabled: false, role: "ceo" },
  ])
    assert.equal(contract.glassSettingsSchema.safeParse(value).success, false);
  assert.equal(
    contract.publicGlassSettingsSchema.safeParse(
      contract.DEFAULT_PUBLIC_GLASS_SETTINGS,
    ).success,
    true,
  );
  assert.equal(
    contract.publicGlassSettingsSchema.safeParse({
      enabled: true,
      revision,
      private: "forbidden",
    }).success,
    false,
  );
});

for (const role of ["ceo", "admin"]) {
  test(`${role} may read and save this global appearance setting`, async () => {
    const { route, request, calls } = await routeFixture({ role });
    const get = await route.GET(request("GET"));
    assert.equal(get.status, 200);
    assert.equal(get.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await get.json(), {
      settings: { enabled: true },
      revision,
      editable: true,
    });
    const put = await route.PUT(request());
    assert.equal(put.status, 200);
    assert.deepEqual(await put.json(), {
      settings: { enabled: false },
      revision: nextRevision,
      editable: true,
    });
    assert.equal(calls.filter(([name]) => name === "rpc").length, 1);
    assert.equal(calls.filter(([name]) => name === "tag").length, 1);
    assert.equal(calls.filter(([name]) => name === "path").length, 2);
  });
}

test("protected GET returns authoritative global off without caching the response", async () => {
  const { route, request, calls } = await routeFixture({
    role: "admin",
    enabled: false,
  });
  const response = await route.GET(request("GET"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    settings: { enabled: false },
    revision,
    editable: true,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ["remember", { enabled: false, revision }],
  ]);
});

for (const actor of [
  { role: null },
  { role: "worker" },
  { role: "customer" },
  { role: "ceo", status: "blocked" },
  { role: "admin", status: "blocked" },
]) {
  test(`${actor.role ?? "anonymous"}/${actor.status ?? "active"} cannot read or save protected global setting`, async () => {
    const { route, request, calls } = await routeFixture(actor);
    assert.equal((await route.GET(request("GET"))).status, 403);
    assert.equal((await route.PUT(request())).status, 403);
    assert.equal(calls.length, 0);
  });
}

test("same-origin and strict complete revision contract fail before any write", async () => {
  const { route, request, calls } = await routeFixture({ role: "admin" });
  for (const requestOrigin of [null, "https://untrusted.example"])
    assert.equal(
      (await route.PUT(request("PUT", undefined, requestOrigin))).status,
      403,
    );
  for (const body of [
    null,
    {},
    { settings: { enabled: false } },
    { settings: { enabled: "false" }, revision },
    { settings: { enabled: false, private: "x" }, revision },
    { settings: { enabled: false }, revision, role: "ceo" },
  ])
    assert.equal((await route.PUT(request("PUT", body))).status, 400);
  assert.equal(calls.length, 0);
});

test("revision conflicts and uncertain failures do not retry or invalidate cache", async () => {
  for (const [code, expected] of [
    ["PT409", 409],
    ["SUPABASE_TIMEOUT", 500],
  ]) {
    const { route, request, calls } = await routeFixture({
      error: { code, message: "test failure" },
    });
    assert.equal((await route.PUT(request())).status, expected);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "rpc");
  }
});

test("public loader cold fallback defaults on; later outage retains last known global off", async () => {
  let result = { data: null, error: new Error("unavailable") };
  let reads = 0;
  const server = await load("src/lib/glass-settings-server.ts", {
    "server-only": {},
    "@/lib/supabase/public-server": {
      createPublicServerClient: () => ({
        rpc: async (name) => {
          assert.equal(name, "get_public_glass_settings");
          reads++;
          return result;
        },
      }),
    },
    "./public-presentation-cache": {
      cachePublicPresentation: (_tag, loader) => loader,
    },
    "./glass-settings": contract,
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(await server.getPublicGlassSettings())),
    { enabled: true, revision: null },
  );
  result = { data: { enabled: false, revision }, error: null };
  assert.equal((await server.getPublicGlassSettings()).enabled, false);
  result = { data: null, error: new Error("unavailable") };
  assert.equal((await server.getPublicGlassSettings()).enabled, false);
  result = {
    data: { enabled: true, revision, private: "forbidden" },
    error: null,
  };
  assert.equal((await server.getPublicGlassSettings()).enabled, false);
  assert.equal(reads, 4, "Fallbacks never suppress later recovery attempts");
  result = { data: { enabled: true, revision: nextRevision }, error: null };
  assert.equal((await server.getPublicGlassSettings()).enabled, true);
  const confirmed = {
    enabled: false,
    revision: "2026-10-29T12:00:01.000001+00:00",
  };
  server.rememberPublicGlassSettings(confirmed);
  assert.equal(
    (await server.getPublicGlassSettings()).enabled,
    false,
    "A confirmed save wins over an older in-flight/cache result, including microsecond revisions",
  );
  result = { data: null, error: new Error("unavailable") };
  assert.equal(
    (await server.getPublicGlassSettings()).enabled,
    false,
    "A confirmed save stays authoritative during a subsequent outage",
  );
});
