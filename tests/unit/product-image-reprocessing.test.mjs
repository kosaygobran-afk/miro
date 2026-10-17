import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import sharp from "sharp";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
const productId = "11111111-1111-4111-8111-111111111111";
const imageId = "22222222-2222-4222-8222-222222222222";
const originalObject = `products/${productId}/original.jpeg`;
const storageOrigin = "https://owned.example";
const storageUrl = (name) =>
  `${storageOrigin}/storage/v1/object/public/product-media/${name}`;
const originalImage = {
  id: imageId,
  product_id: productId,
  image_url: storageUrl(originalObject),
  alt_he: "מצלמה",
  alt_en: "Camera",
  sort_order: 3,
};
const sourceBytes = await sharp({
  create: { width: 20, height: 20, channels: 3, background: "white" },
})
  .jpeg()
  .toBuffer();
const alphaPixels = Buffer.alloc(20 * 20 * 4, 255);
alphaPixels.fill(0, 0, 20 * 10 * 4);
const cutout = await sharp(alphaPixels, {
  raw: { width: 20, height: 20, channels: 4 },
})
  .png()
  .toBuffer();

async function loadSource(path, mocks = {}, globals = {}) {
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
        esModuleInterop: true,
      },
    }).outputText,
    {
      exports,
      Buffer,
      URL,
      TextDecoder,
      AbortSignal,
      FormData,
      Blob,
      File,
      Request,
      Response,
      crypto: globalThis.crypto,
      console: { warn() {}, error() {} },
      process: { env: {} },
      require: (name) =>
        name === "server-only" ? {} : (mocks[name] ?? nativeRequire(name)),
      ...globals,
    },
  );
  return exports;
}

const safety = await loadSource("src/lib/image-safety.ts");

async function imageRoute({
  authorized = true,
  found = true,
  image = originalImage,
  input = sourceBytes,
  processing = "processed",
  updateError = false,
  updateErrorCode = "23514",
  conflict = false,
  uncertainUpdate = false,
  uploadError = false,
} = {}) {
  const calls = {
    auth: [],
    selected: [],
    downloads: [],
    externalDownloads: [],
    uploaded: [],
    removed: [],
    updated: [],
    audits: [],
    revalidated: [],
    worker: 0,
  };
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: storageOrigin,
    ...(processing !== "unconfigured"
      ? {
          BACKGROUND_REMOVAL_WORKER_URL: "https://worker.example/private/",
          BACKGROUND_REMOVAL_WORKER_TOKEN: "synthetic-token",
        }
      : {}),
  };
  const processor = await loadSource(
    "src/lib/product-image-processing.ts",
    { "./image-safety": safety },
    {
      process: { env },
      fetch: async () => {
        calls.worker++;
        if (processing === "unavailable") {
          return new Response("Private worker error", { status: 503 });
        }
        return Response.json({
          skipped: processing === "transparent",
          reason: processing === "transparent" ? "already transparent" : null,
          image_base64: cutout.toString("base64"),
          mode: "RGBA",
        });
      },
    },
  );
  const storage = {
    download: async (name) => {
      calls.downloads.push(name);
      return { data: new Blob([input]), error: null };
    },
    upload: async (name, bytes, options) => {
      calls.uploaded.push({ name, bytes, options });
      return { error: uploadError ? { message: "Upload failed" } : null };
    },
    remove: async (names) => {
      calls.removed.push(...names);
      return { error: null };
    },
    getPublicUrl: (name) => ({ data: { publicUrl: storageUrl(name) } }),
  };
  const admin = {
    storage: {
      from: (bucket) => {
        assert.equal(bucket, "product-media");
        return storage;
      },
    },
    from: (table) => {
      const queryCall = { table, filters: [], fields: null };
      let patch;
      const query = {
        select: (fields) => {
          queryCall.fields = fields;
          return query;
        },
        eq: (field, value) => {
          queryCall.filters.push([field, value]);
          return query;
        },
        update: (value) => {
          patch = value;
          calls.updated.push({ patch, query: queryCall });
          return query;
        },
        insert: async (value) => {
          assert.equal(table, "audit_events");
          calls.audits.push(value);
          return { error: null };
        },
        maybeSingle: async () => {
          assert.equal(table, "product_images");
          if (patch) {
            if (uncertainUpdate) throw Error("Response lost after update");
            return {
              data: updateError || conflict ? null : { ...image, ...patch },
              error: updateError ? { code: updateErrorCode } : null,
            };
          }
          calls.selected.push(queryCall);
          return { data: found ? image : null, error: null };
        },
      };
      return query;
    },
  };
  const route = await loadSource(
    "src/app/api/management/product-images/remove-background/route.ts",
    {
      "next/server": { NextResponse: Response },
      "next/cache": {
        revalidatePath: (...args) => calls.revalidated.push(args),
      },
      "@/app/api/management/_shared": {
        withManagementAuth: async (_request, capability) => {
          calls.auth.push(capability);
          return authorized
            ? { ok: true, admin, actor: { user: { id: "actor-id" } } }
            : {
                ok: false,
                response: Response.json(
                  { error: "Forbidden" },
                  { status: 403 },
                ),
              };
        },
        errorResponse: (error, status = 500, details) =>
          Response.json({ error, details }, { status }),
        mapPostgresError: () =>
          Response.json({ error: "Database error" }, { status: 400 }),
      },
      "@/lib/image-safety": safety,
      "@/lib/product-image-processing": processor,
      "@/lib/remote-product-image": {
        downloadProductImage: async (url) => {
          calls.externalDownloads.push(url);
          return input;
        },
      },
    },
    { process: { env } },
  );
  return { ...route, calls };
}

function request(body = { id: imageId }) {
  return new Request(
    "https://miro.example/api/management/product-images/remove-background",
    { method: "POST", body: JSON.stringify(body) },
  );
}

function assertNoMutation(calls) {
  assert.equal(calls.uploaded.length, 0);
  assert.equal(calls.updated.length, 0);
  assert.equal(calls.removed.length, 0);
  assert.equal(calls.audits.length, 0);
}

test("existing-image removal enforces catalog authorization before reading or writing", async () => {
  const route = await imageRoute({ authorized: false });
  assert.equal((await route.POST(request())).status, 403);
  assert.deepEqual(route.calls.auth, ["manageCatalog"]);
  assert.equal(route.calls.selected.length, 0);
  assert.equal(route.calls.downloads.length, 0);
  assertNoMutation(route.calls);
});

test("existing-image removal rejects malformed identifiers and absent rows before downloading", async () => {
  for (const body of [
    null,
    {},
    { id: "5586793" },
    { id: imageId, extra: true },
  ]) {
    const route = await imageRoute();
    assert.equal((await route.POST(request(body))).status, 400);
    assert.equal(route.calls.selected.length, 0);
    assert.equal(route.calls.downloads.length, 0);
    assertNoMutation(route.calls);
  }
  const route = await imageRoute({ found: false });
  assert.equal((await route.POST(request())).status, 404);
  assert.equal(route.calls.downloads.length, 0);
  assertNoMutation(route.calls);
});

test("unconfigured and unavailable removal report failure without resaving the original", async () => {
  for (const processing of ["unconfigured", "unavailable"]) {
    const route = await imageRoute({ processing });
    const response = await route.POST(request());
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, "background_removal_unavailable");
    assert.equal(body.background_removal.status, "original");
    assertNoMutation(route.calls);
  }
});

test("SVG removal is explicitly unsupported and never writes an unchanged image", async () => {
  const route = await imageRoute({
    input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  });
  const response = await route.POST(request());
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.code, "background_removal_unsupported");
  assert.equal(body.background_removal.status, "original");
  assert.equal(route.calls.worker, 0);
  assertNoMutation(route.calls);
});

test("an already-transparent image returns its original reference without mutation", async () => {
  const route = await imageRoute({ input: cutout, processing: "transparent" });
  const response = await route.POST(request());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.background_removal.status, "transparent");
  assert.equal(body.image.image_url, originalImage.image_url);
  assertNoMutation(route.calls);
});

test("processing an existing owned image saves a real PNG and preserves metadata and the original object", async () => {
  const route = await imageRoute();
  const response = await route.POST(request());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.background_removal.status, "processed");
  assert.deepEqual(route.calls.downloads, [originalObject]);
  assert.equal(route.calls.externalDownloads.length, 0);
  assert.equal(route.calls.uploaded.length, 1);
  const upload = route.calls.uploaded[0];
  assert.ok(upload.bytes.equals(cutout));
  assert.equal(upload.options.contentType, "image/png");
  assert.equal(upload.options.upsert, false);
  assert.match(upload.name, new RegExp(`^products/${productId}/.+\\.png$`));
  assert.notEqual(upload.name, originalObject);
  assert.equal(body.image.image_url, storageUrl(upload.name));
  assert.equal(body.image.alt_he, originalImage.alt_he);
  assert.equal(body.image.alt_en, originalImage.alt_en);
  assert.equal(body.image.sort_order, originalImage.sort_order);
  assert.equal(route.calls.updated.length, 1);
  assert.deepEqual(Object.keys(route.calls.updated[0].patch), ["image_url"]);
  assert.deepEqual(route.calls.updated[0].query.filters, [
    ["id", imageId],
    ["image_url", originalImage.image_url],
  ]);
  assert.deepEqual(route.calls.removed, []);
  assert.equal(route.calls.audits.length, 1);
  assert.equal(
    route.calls.audits[0].action,
    "product_image_background_removed",
  );
  assert.equal(route.calls.audits[0].user_id, "actor-id");
  assert.equal(route.calls.audits[0].details.image_id, imageId);
  assert.equal(
    route.calls.audits[0].details.background_removal.status,
    "processed",
  );
  for (const locale of ["he", "en"]) {
    assert.ok(route.calls.revalidated.some(([path]) => path === `/${locale}`));
    assert.ok(
      route.calls.revalidated.some(
        ([path, scope]) => path === `/${locale}/store` && scope === "layout",
      ),
      "The store layout invalidation must include every category and product page",
    );
  }
});

test("external existing images use the hardened downloader before the shared processor", async () => {
  const image = {
    ...originalImage,
    image_url: "https://external.example/photo.jpg",
  };
  const route = await imageRoute({ image });
  const response = await route.POST(request());
  assert.equal(response.status, 200);
  assert.deepEqual(route.calls.downloads, []);
  assert.deepEqual(route.calls.externalDownloads, [image.image_url]);
  assert.ok(route.calls.uploaded[0].bytes.equals(cutout));
});

test("a confirmed update failure or concurrent image change cleans up only the newly uploaded cutout", async () => {
  for (const options of [{ updateError: true }, { conflict: true }]) {
    const route = await imageRoute(options);
    const response = await route.POST(request());
    assert.equal(response.status, options.conflict ? 409 : 400);
    assert.equal(route.calls.uploaded.length, 1);
    assert.deepEqual(route.calls.removed, [route.calls.uploaded[0].name]);
    assert.ok(!route.calls.removed.includes(originalObject));
    assert.equal(route.calls.audits.length, 0);
  }
});

test("upload failure leaves the existing image and original storage untouched", async () => {
  const route = await imageRoute({ uploadError: true });
  assert.equal((await route.POST(request())).status, 500);
  assert.equal(route.calls.updated.length, 0);
  assert.equal(route.calls.removed.length, 0);
  assert.equal(route.calls.audits.length, 0);
});

test("an uncertain update response keeps the cutout available for reconciliation", async () => {
  const route = await imageRoute({ uncertainUpdate: true });
  await assert.rejects(route.POST(request()), /Response lost after update/);
  assert.equal(route.calls.uploaded.length, 1);
  assert.equal(route.calls.removed.length, 0);
  assert.equal(route.calls.audits.length, 0);
});

test("transport and cancellation database errors retain the new cutout for reconciliation", async () => {
  for (const code of ["", "PGRST000", "PGRST001", "PGRST002", "57014"]) {
    const route = await imageRoute({
      updateError: true,
      updateErrorCode: code,
    });
    assert.equal((await route.POST(request())).status, 400);
    assert.equal(route.calls.uploaded.length, 1);
    assert.equal(route.calls.removed.length, 0);
    assert.equal(route.calls.audits.length, 0);
  }
});
