import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

async function loadModule(path, dependencies, globals = {}) {
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
      process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://public.test" } },
      structuredClone,
      require(name) {
        if (name === "server-only") return {};
        assert.ok(name in dependencies, `unexpected import: ${name}`);
        return dependencies[name];
      },
      ...globals,
    },
  );
  return exports;
}

function fakeDataCache() {
  const registrations = [];
  const entries = new Map();
  const wrapper = (load, keys, options) => {
    registrations.push({
      keys: [...keys],
      options: { ...options, tags: [...options.tags] },
    });
    const key = keys.join(":");
    return async () => {
      if (entries.has(key)) return entries.get(key);
      const value = await load();
      entries.set(key, value);
      return value;
    };
  };
  return { registrations, wrapper, entries };
}

test("public presentation reuses successful reads across requests with bounded tagged cache", async () => {
  const dataCache = fakeDataCache();
  const loaded = await loadModule("src/lib/public-presentation-cache.ts", {
    react: { cache: (fn) => fn },
    "next/cache": { unstable_cache: dataCache.wrapper },
  });
  let reads = 0;
  const read = loaded.cachePublicPresentation(
    loaded.PUBLIC_ANIMATION_SETTINGS_TAG,
    async () => ({ version: ++reads }),
  );
  assert.equal((await read()).version, 1);
  assert.equal((await read()).version, 1);
  assert.equal(reads, 1);
  assert.deepEqual(dataCache.registrations[0].keys, [
    "public-animation-settings",
    "https://public.test",
  ]);
  assert.equal(dataCache.registrations[0].options.revalidate, 60);
  assert.deepEqual(dataCache.registrations[0].options.tags, [
    "public-animation-settings",
  ]);
});

for (const { path, method, tag, rpc, schema, fallback } of [
  {
    path: "src/lib/storefront-design-server.ts",
    method: "getPublicStorefrontDesign",
    tag: "PUBLIC_STOREFRONT_DESIGN_TAG",
    rpc: "get_public_storefront_design",
    schema: "./storefront-design",
    fallback: "defaultStorefrontDesign",
  },
  {
    path: "src/lib/animation-settings-server.ts",
    method: "getPublicAnimationSettings",
    tag: "PUBLIC_ANIMATION_SETTINGS_TAG",
    rpc: "get_public_animation_settings",
    schema: "./animation-settings",
    fallback: "DEFAULT_ANIMATION_SETTINGS",
  },
]) {
  test(`${method} uses only public RPC, never persists outage or invalid payload fallbacks`, async () => {
    const entries = new Map();
    let reads = 0;
    const valid = { revision: "approved" },
      defaultValue = { revision: "fallback" };
    const schemaModule = {
      [fallback]: defaultValue,
      parseAnimationSettings: (value) => value,
    };
    const parse = (data) => {
      if (data !== valid) throw new Error("invalid public payload");
      return data;
    };
    schemaModule.storefrontDesignSchema = { parse };
    schemaModule.animationSettingsSchema = { parse };
    const loaded = await loadModule(path, {
      "@/lib/supabase/public-server": {
        createPublicServerClient: () => ({
          rpc: async (name) => {
            assert.equal(name, rpc);
            reads++;
            return reads === 1
              ? { error: { code: "outage" } }
              : reads === 2
                ? { data: { invalid: true } }
                : { data: valid };
          },
        }),
      },
      "./public-presentation-cache": {
        [tag]: tag,
        cachePublicPresentation: (key, fn) => async () => {
          if (entries.has(key)) return entries.get(key);
          const result = await fn();
          entries.set(key, result);
          return result;
        },
      },
      [schema]: schemaModule,
    });
    assert.deepEqual(await loaded[method](), defaultValue);
    assert.equal(entries.size, 0);
    assert.deepEqual(await loaded[method](), defaultValue);
    assert.equal(entries.size, 0);
    assert.deepEqual(await loaded[method](), valid);
    assert.deepEqual(await loaded[method](), valid);
    assert.equal(reads, 3);
  });
}

for (const { path, schemaImport, schemaName, bodyKey, tagName } of [
  {
    path: "src/app/api/management/storefront/design/route.ts",
    schemaImport: "@/lib/storefront-design",
    schemaName: "storefrontDesignSchema",
    bodyKey: "design",
    tagName: "PUBLIC_STOREFRONT_DESIGN_TAG",
  },
  {
    path: "src/app/api/management/settings/animation/route.ts",
    schemaImport: "@/lib/animation-settings",
    schemaName: "animationSettingsSchema",
    bodyKey: "settings",
    tagName: "PUBLIC_ANIMATION_SETTINGS_TAG",
  },
]) {
  test(`${bodyKey} save expires public cache only after authorized successful SQL write`, async () => {
    let allowed = false,
      sqlError = null,
      writes = 0;
    const invalidations = [];
    const schema = { safeParse: (data) => ({ success: true, data }) };
    const chain = { strict: () => schema };
    const loaded = await loadModule(path, {
      "next/server": { NextResponse: { json: (body) => body } },
      "next/cache": {
        revalidateTag: (tag, profile) =>
          invalidations.push({ tag, expire: profile.expire }),
        revalidatePath: () => {},
      },
      zod: {
        z: { object: () => chain, string: () => ({ datetime: () => ({}) }) },
      },
      "@/app/api/management/_shared": {
        withManagementAuth: async () =>
          allowed
            ? { ok: true, actor: { role: "ceo" } }
            : { ok: false, response: { status: 403 } },
        errorResponse: (_message, status) => ({ status }),
        mapPostgresError: () => ({ status: 500 }),
      },
      [schemaImport]: { [schemaName]: schema },
      "@/lib/appearance-presets": { appearancePresetSchema: schema },
      "@/lib/supabase/server": {
        createServerSupabaseClient: async () => ({
          rpc: async () => {
            writes++;
            return { data: "revision-2", error: sqlError };
          },
        }),
      },
      "@/lib/public-presentation-cache": { [tagName]: tagName },
    });
    const request = {
      json: async () => ({
        [bodyKey]: { public: true },
        revision: "revision-1",
      }),
    };
    assert.equal((await loaded.PUT(request)).status, 403);
    assert.equal(writes, 0);
    assert.equal(invalidations.length, 0);
    allowed = true;
    sqlError = { code: "PT409" };
    assert.equal((await loaded.PUT(request)).status, 409);
    assert.equal(invalidations.length, 0);
    sqlError = null;
    await loaded.PUT(request);
    assert.deepEqual(invalidations, [{ tag: tagName, expire: 0 }]);
  });
}

test("contact configuration caches only validated anonymous RPC data and recovers after outage", async () => {
  const { z } = await import("zod");
  const dataCache = fakeDataCache();
  let reads = 0;
  const publicPayload = {
    phone: "+972123456789",
    email: "shop@example.test",
    whatsapp: "972123456789",
    address_en: "Approved public address",
  };
  const loaded = await loadModule(
    "src/lib/contact-config.ts",
    {
      zod: { z },
      react: { cache: (fn) => fn },
      "@/lib/public-presentation-cache": {
        PUBLIC_CONTACT_CONFIG_TAG: "contact",
        cachePublicPresentation: (tag, fn) =>
          dataCache.wrapper(fn, [tag], { tags: [tag] }),
      },
      "@/lib/supabase/public-server": {
        createPublicServerClient: () => ({
          rpc: async (name) => {
            assert.equal(name, "get_public_contact_config");
            reads++;
            return reads === 1
              ? { error: { code: "outage" } }
              : { data: publicPayload };
          },
        }),
      },
    },
    {
      process: { env: { NEXT_PUBLIC_CONTACT_PHONE: "+972987654321" } },
      console: { error: () => {} },
    },
  );
  const fallback = await loaded.getPublicContactConfig();
  assert.equal(fallback.phone, "+972987654321");
  assert.equal(fallback.email, null);
  assert.equal(dataCache.entries.size, 0);
  const config = await loaded.getPublicContactConfig();
  assert.equal(config.phone, "+972987654321");
  assert.equal(config.email, "shop@example.test");
  assert.equal(config.addressEn, publicPayload.address_en);
  await loaded.getPublicContactConfig();
  assert.equal(reads, 2);
});

test("public contact save expires cache only after successful authorized write", async () => {
  const { z } = await import("zod");
  let allowed = false,
    sqlError = null,
    writes = 0;
  const invalidations = [];
  const loaded = await loadModule(
    "src/app/api/management/settings/route.ts",
    {
      zod: { z },
      "next/server": {
        NextResponse: { json: (body, options) => ({ body, ...options }) },
      },
      "next/cache": {
        revalidateTag: (tag, profile) =>
          invalidations.push({ tag, expire: profile.expire }),
      },
      "@/lib/public-presentation-cache": {
        PUBLIC_CONTACT_CONFIG_TAG: "contact",
      },
      "@/app/api/management/_shared": {
        withManagementAuth: async () =>
          allowed
            ? {
                ok: true,
                admin: {
                  from: () => ({
                    select: async () => ({ data: [], error: null }),
                  }),
                },
              }
            : { ok: false, response: { status: 403 } },
        errorResponse: (_message, status) => ({ status }),
        mapPostgresError: () => ({ status: 500 }),
      },
      "@/lib/supabase/server": {
        createServerSupabaseClient: async () => ({
          rpc: async () => {
            writes++;
            return { error: sqlError };
          },
        }),
      },
    },
    { console: { error: () => {} } },
  );
  const request = {
    json: async () => ({
      key: "public_contact",
      value: { phone: "+972123456789" },
    }),
  };
  assert.equal((await loaded.POST(request)).status, 403);
  assert.equal(writes, 0);
  allowed = true;
  sqlError = { code: "42501" };
  assert.equal((await loaded.POST(request)).status, 403);
  assert.equal(invalidations.length, 0);
  sqlError = null;
  assert.equal((await loaded.POST(request)).body.ok, true);
  assert.deepEqual(invalidations, [{ tag: "contact", expire: 0 }]);
});
