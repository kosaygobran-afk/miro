import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

async function inventoryLoader(fetch) {
  const source = await readFile(
    new URL(
      "../../src/components/management/inventory-manager.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const exports = {};
  runInNewContext(
    ts.transpileModule(`${source}\nexport { fetchInventoryPages };`, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    { exports, fetch, URLSearchParams, require: () => ({}) },
  );
  return exports.fetchInventoryPages;
}

test("cancelled deferred inventory fetch never calls the network", async () => {
  let calls = 0;
  const load = await inventoryLoader(() => {
    calls++;
    throw new Error("Already cancelled work reached fetch");
  });
  const controller = new AbortController();
  const pending = Promise.resolve().then(() =>
    load({ signal: controller.signal }),
  );
  controller.abort();
  assert.equal((await pending).length, 0);
  assert.equal(calls, 0);
});

test("cancellation during body loading discards stale rows and stops pagination", async () => {
  let calls = 0;
  const controller = new AbortController();
  const load = await inventoryLoader(async () => {
    calls++;
    return {
      ok: true,
      json: async () => {
        controller.abort();
        return {
          items: Array.from({ length: 100 }, (_, id) => ({ id })),
          totalCount: 200,
        };
      },
    };
  });
  assert.equal((await load({ signal: controller.signal })).length, 0);
  assert.equal(calls, 1);
});

test("active inventory fetch still reads all pages with its filters", async () => {
  const urls = [];
  const load = await inventoryLoader(async (url) => {
    urls.push(new URL(url, "https://miro.test"));
    return {
      ok: true,
      json: async () => ({
        items: Array.from({ length: urls.length === 1 ? 100 : 1 }, (_, id) => ({
          id,
        })),
        totalCount: 101,
      }),
    };
  });
  assert.equal((await load({ search: "camera", lowStock: true })).length, 101);
  assert.deepEqual(
    urls.map((url) => url.searchParams.get("offset")),
    ["0", "100"],
  );
  assert.ok(
    urls.every(
      (url) =>
        url.searchParams.get("search") === "camera" &&
        url.searchParams.get("lowStock") === "true",
    ),
  );
});

test("real inventory errors still reject", async () => {
  const load = await inventoryLoader(async () => ({
    ok: false,
    json: async () => ({ error: "Inventory unavailable" }),
  }));
  await assert.rejects(load({}), /Inventory unavailable/);
});
