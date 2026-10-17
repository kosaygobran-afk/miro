import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
const categoryId = "11111111-1111-4111-8111-111111111111";
const oldIcon = `categories/${categoryId}/22222222-2222-4222-8222-222222222222.png`;
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const imageSafety = {};
runInNewContext(
  compile(
    await readFile(
      new URL("../../src/lib/image-safety.ts", import.meta.url),
      "utf8",
    ),
  ),
  {
    exports: imageSafety,
    URL,
    require: (name) => (name === "server-only" ? {} : nativeRequire(name)),
  },
);
const routeSource = compile(
  await readFile(
    new URL(
      "../../src/app/api/management/categories/icon/route.ts",
      import.meta.url,
    ),
    "utf8",
  ),
);

function loadRoute({ authorized = true } = {}) {
  const calls = { queries: [], removed: [], audits: [], revalidated: [] };
  const admin = {
    from(table) {
      let update;
      const builder = {
        select: () => builder,
        eq: () => builder,
        update(value) {
          update = value;
          calls.queries.push(value);
          return builder;
        },
        insert(value) {
          assert.equal(table, "audit_events");
          calls.audits.push(value);
          return Promise.resolve({ error: null });
        },
        single: async () => ({
          data: { id: categoryId, icon_image_url: oldIcon, ...update },
          error: null,
        }),
      };
      return builder;
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, imageSafety.CATEGORY_ICON_BUCKET);
        return {
          remove: async (paths) => {
            calls.removed.push(...paths);
            return { error: null };
          },
        };
      },
    },
  };
  const imports = {
    "next/server": { NextResponse: Response },
    "next/cache": { revalidatePath: (path) => calls.revalidated.push(path) },
    "@/lib/image-safety": imageSafety,
    "@/app/api/management/_shared": {
      withManagementAuth: async () =>
        authorized
          ? { ok: true, admin, actor: { user: { id: "fixture-admin" } } }
          : { ok: false, response: Response.json({}, { status: 403 }) },
      errorResponse: (error, status = 500) =>
        Response.json({ error }, { status }),
      mapPostgresError: () => Response.json({}, { status: 500 }),
    },
  };
  const route = {};
  runInNewContext(routeSource, {
    exports: route,
    URL,
    process: { env: {} },
    require: (name) => imports[name] ?? nativeRequire(name),
  });
  return { route, calls };
}

test("category manager null icon payload clears the saved owned icon and audits success", async () => {
  const { route, calls } = loadRoute();
  const result = await route.POST(
    new Request("http://localhost/api/management/categories/icon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_id: categoryId, image_url: null }),
    }),
  );
  assert.equal(result.status, 200);
  assert.equal((await result.json()).category.icon_image_url, null);
  assert.deepEqual(calls.removed, [oldIcon]);
  assert.equal(calls.queries[0].icon_image_url, null);
  assert.equal(calls.audits[0].action, "category_icon_cleared");
  assert.ok(calls.revalidated.includes("/he"));
  assert.ok(calls.revalidated.includes("/en"));
});

test("null icon clearing retains authorization before any mutation", async () => {
  const { route, calls } = loadRoute({ authorized: false });
  const result = await route.POST(
    new Request("http://localhost/api/management/categories/icon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_id: categoryId, image_url: null }),
    }),
  );
  assert.equal(result.status, 403);
  assert.equal(calls.queries.length, 0);
  assert.equal(calls.removed.length, 0);
  assert.equal(calls.audits.length, 0);
});
