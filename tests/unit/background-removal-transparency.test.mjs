import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import sharp from "sharp";

const nativeRequire = createRequire(import.meta.url);
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
      setTimeout,
      clearTimeout,
      FormData,
      Blob,
      File,
      Request,
      Response,
      crypto: globalThis.crypto,
      console: { warn() {} },
      process: { env: {} },
      require: (name) =>
        name === "server-only" ? {} : (mocks[name] ?? nativeRequire(name)),
      ...globals,
    },
  );
  return exports;
}
const safety = await loadSource("src/lib/image-safety.ts");
// A real two-frame WebP fixture; metadata must detect animation.
const animatedWebp = Buffer.from(
  "UklGRpQAAABXRUJQVlA4WAoAAAACAAAAAwAAAwAAQU5JTQYAAAAAAAAAAABBTk1GMAAAAAAAAAAAAAMAAAMAAGQAAAJWUDggGAAAADABAJ0BKgQABAABQCYlpAADcAD+/PQAAEFOTUYwAAAAAAAAAAAAAwAAAwAAZAAAAFZQOCAYAAAANAEAnQEqBAAEAAAAJiWkAANwAP79NmgA",
  "base64",
);
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
async function processor(
  fetch = () => {
    throw Error("Unexpected request");
  },
  env = {},
) {
  return loadSource(
    "src/lib/product-image-processing.ts",
    { "./image-safety": safety },
    { fetch, process: { env } },
  );
}
const configured = {
  BACKGROUND_REMOVAL_WORKER_URL: "https://worker.example/private/",
  BACKGROUND_REMOVAL_WORKER_TOKEN: "synthetic-token",
};

test("actual Python snake_case contract produces a validated PNG cutout", async () => {
  let calls = 0;
  const { processProductImage } = await processor(async (url, init) => {
    calls++;
    assert.equal(url.href, "https://worker.example/private/remove-background");
    assert.equal(init.headers.Authorization, "Bearer synthetic-token");
    assert.equal(init.redirect, "error");
    assert.equal(init.body.get("file").type, "image/jpeg");
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json({
      skipped: false,
      reason: null,
      image_base64: cutout.toString("base64"),
      mode: "processed",
    });
  }, configured);
  const result = await processProductImage(sourceBytes, "jpeg");
  assert.equal(result.backgroundRemoval.status, "processed");
  assert.equal(result.type, "png");
  assert.ok(result.bytes.equals(cutout));
  assert.equal(calls, 1);
});

test("disabled worker and SVG preserve original bytes and report original, never success", async () => {
  const { processProductImage } = await processor();
  const original = await processProductImage(sourceBytes, "jpeg");
  assert.strictEqual(original.bytes, sourceBytes);
  assert.equal(original.type, "jpeg");
  assert.equal(original.backgroundRemoval.status, "original");
  const enabled = await processor(undefined, configured);
  assert.equal(
    (
      await enabled.processProductImage(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        "svg",
      )
    ).backgroundRemoval.reason,
    "svg",
  );
});

test("transparent WebP skip keeps original WebP bytes and MIME", async () => {
  const webp = await sharp(cutout).webp().toBuffer();
  const { processProductImage } = await processor(
    async () =>
      Response.json({
        skipped: true,
        reason: "already transparent",
        image_base64: webp.toString("base64"),
        mode: "RGBA",
      }),
    configured,
  );
  const result = await processProductImage(webp, "webp");
  assert.strictEqual(result.bytes, webp);
  assert.equal(result.type, "webp");
  assert.equal(result.backgroundRemoval.status, "transparent");
});

test("worker errors, malformed responses and invalid cutouts safely preserve originals", async () => {
  const opaque = await sharp(sourceBytes).png().toBuffer();
  const empty = await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
  for (const body of [
    null,
    { skipped: false },
    ...[sourceBytes, opaque, empty, Buffer.from("corrupt")].map((bytes) => ({
      skipped: false,
      reason: null,
      image_base64: bytes.toString("base64"),
      mode: "processed",
    })),
  ]) {
    const { processProductImage } = await processor(
      async () =>
        body === null
          ? new Response("private error", { status: 500 })
          : Response.json(body),
      configured,
    );
    const result = await processProductImage(sourceBytes, "jpeg");
    assert.strictEqual(result.bytes, sourceBytes);
    assert.equal(result.backgroundRemoval.reason, "processing_unavailable");
  }
});

test("streamed worker response size cap works without Content-Length", async () => {
  let cancelled = false;
  const { processProductImage } = await processor(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(8 * 1024 * 1024));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
    configured,
  );
  assert.equal(
    (await processProductImage(sourceBytes, "jpeg")).backgroundRemoval.status,
    "original",
  );
  assert.ok(cancelled);
});

test("real image validation rejects corrupt, active SVG, oversized and animated input", async () => {
  const { validateProductImage } = await processor();
  assert.equal(await validateProductImage(sourceBytes), "jpeg");
  assert.equal(await validateProductImage(cutout), "png");
  assert.equal(
    await validateProductImage(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    ),
    "svg",
  );
  for (const bytes of [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("<svg><script>alert(1)</script></svg>"),
    Buffer.alloc(5 * 1024 * 1024 + 1),
    animatedWebp,
  ]) {
    await assert.rejects(validateProductImage(bytes));
  }
});

test("remote importer rejects private, mapped, reserved and mixed DNS answers before connecting", async () => {
  const { isPublicImageAddress } = await loadSource(
    "src/lib/remote-product-image.ts",
    { "./image-safety": safety },
  );
  for (const ip of [
    "127.0.0.2",
    "10.0.0.1",
    "172.31.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.1.1",
    "198.18.0.1",
    "240.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "2002:7f00:1::",
  ])
    assert.equal(isPublicImageAddress(ip), false, ip);
  for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])
    assert.equal(isPublicImageAddress(ip), true, ip);
  let connected = false;
  const { downloadProductImage } = await loadSource(
    "src/lib/remote-product-image.ts",
    {
      "./image-safety": safety,
      "node:dns/promises": {
        lookup: async () => [
          { address: "8.8.8.8", family: 4 },
          { address: "10.0.0.1", family: 4 },
        ],
      },
      "node:https": {
        request() {
          connected = true;
        },
      },
    },
  );
  for (const url of [
    "https://example.com/image",
    "http://example.com/image",
    "https://user:secret@example.com/image",
    "https://example.com:8443/image",
  ])
    await assert.rejects(downloadProductImage(url));
  assert.equal(connected, false);
});

async function imageRoute(
  upload,
  {
    insertFails = false,
    authorized = true,
    found = true,
    configuredWorker = false,
  } = {},
) {
  const calls = { uploaded: [], removed: [], inserted: [], downloads: 0 };
  const processing = await processor(
    undefined,
    configuredWorker ? configured : {},
  );
  const storage = {
    upload: async (name, bytes, options) => {
      calls.uploaded.push({ name, bytes, options });
      return { error: null };
    },
    remove: async (names) => {
      calls.removed.push(...names);
      return { error: null };
    },
    getPublicUrl: (name) => ({
      data: {
        publicUrl: `https://owned.example/storage/v1/object/public/product-media/${name}`,
      },
    }),
  };
  const admin = {
    storage: { from: () => storage },
    from: (table) => {
      let value;
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: found ? { id: "product" } : null,
          error: null,
        }),
        insert: (input) => {
          value = input;
          calls.inserted.push({ table, value });
          return query;
        },
        single: async () => ({
          data: insertFails ? null : { ...value, id: "image-id" },
          error: insertFails ? { code: "23503" } : null,
        }),
      };
      return query;
    },
  };
  const route = await loadSource(
    `src/app/api/management/product-images/${upload ? "upload/" : ""}route.ts`,
    {
      "next/server": { NextResponse: Response },
      "next/cache": { revalidatePath() {} },
      "@/app/api/management/_shared": {
        withManagementAuth: async (_request, capability) => {
          assert.equal(capability, "manageCatalog");
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
        errorResponse: (error, status) => Response.json({ error }, { status }),
        mapPostgresError: () =>
          Response.json({ error: "Database error" }, { status: 400 }),
      },
      "@/lib/supabase/server": {},
      "@/lib/image-safety": safety,
      "@/lib/product-image-processing": processing,
      "@/lib/remote-product-image": {
        downloadProductImage: async () => {
          calls.downloads++;
          return sourceBytes;
        },
      },
    },
    { process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://owned.example" } } },
  );
  return { ...route, calls };
}
const productId = "11111111-1111-4111-8111-111111111111";
function uploadRequest(bytes = sourceBytes, name = "photo.jpg") {
  const form = new FormData();
  form.set("file", new File([bytes], name));
  form.set("product_id", productId);
  form.set("alt_en", "Camera");
  return new Request(
    "https://miro.example/api/management/product-images/upload",
    { method: "POST", body: form },
  );
}
function urlRequest(url) {
  return new Request("https://miro.example/api/management/product-images", {
    method: "POST",
    body: JSON.stringify({ product_id: productId, image_url: url }),
  });
}

test("upload route stores exact original with correct MIME and returns truthful status", async () => {
  const route = await imageRoute(true);
  const response = await route.POST(uploadRequest());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).background_removal.status, "original");
  assert.ok(route.calls.uploaded[0].bytes.equals(sourceBytes));
  assert.equal(route.calls.uploaded[0].options.contentType, "image/jpeg");
  assert.match(route.calls.uploaded[0].name, /\.jpeg$/);
  assert.equal(route.calls.inserted[0].value.alt_en, "Camera");
});

test("upload/URL imports clean up only their newly uploaded object on insert failure", async () => {
  for (const upload of [true, false]) {
    const route = await imageRoute(upload, { insertFails: true });
    const response = await route.POST(
      upload
        ? uploadRequest()
        : urlRequest("https://external.example/camera.jpg"),
    );
    assert.equal(response.status, 400);
    assert.deepEqual(route.calls.removed, [route.calls.uploaded[0].name]);
  }
});

test("owned relative object reference is normalized without parsing it as an absolute URL", async () => {
  const route = await imageRoute(false);
  const reference = `products/${productId}/existing.webp`;
  const response = await route.POST(urlRequest(reference));
  assert.equal(response.status, 200);
  assert.equal(route.calls.downloads, 0);
  assert.equal(route.calls.uploaded.length, 0);
  assert.equal(
    (await response.json()).image.image_url,
    `https://owned.example/storage/v1/object/public/product-media/${reference}`,
  );
});

test("authentication, missing products and unsafe uploads stop before storage", async () => {
  for (const upload of [true, false]) {
    const denied = await imageRoute(upload, { authorized: false });
    assert.equal(
      (
        await denied.POST(
          upload
            ? uploadRequest()
            : urlRequest("https://external.example/a.jpg"),
        )
      ).status,
      403,
    );
    assert.equal(denied.calls.uploaded.length, 0);
    const missing = await imageRoute(upload, { found: false });
    assert.equal(
      (
        await missing.POST(
          upload
            ? uploadRequest()
            : urlRequest("https://external.example/a.jpg"),
        )
      ).status,
      404,
    );
    assert.equal(missing.calls.downloads, 0);
    assert.equal(missing.calls.uploaded.length, 0);
  }
  const route = await imageRoute(true);
  assert.equal(
    (await route.POST(uploadRequest(sourceBytes, "camera.png"))).status,
    400,
  );
  assert.equal(
    (
      await route.POST(
        uploadRequest(Buffer.from("<svg><script/></svg>"), "active.svg"),
      )
    ).status,
    400,
  );
  assert.equal(route.calls.uploaded.length, 0);
});

test("remote downloader pins public DNS, resolves relative redirects and caps chunked bytes", async () => {
  const { EventEmitter } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  for (const scenario of ["redirect", "oversize", "loop", "malformed"]) {
    const paths = [];
    const { downloadProductImage } = await loadSource(
      "src/lib/remote-product-image.ts",
      {
        "./image-safety": safety,
        "node:dns/promises": {
          lookup: async () => [{ address: "8.8.8.8", family: 4 }],
        },
        "node:https": {
          request(url, options, callback) {
            paths.push(url.pathname);
            options.lookup(url.hostname, {}, (error, address, family) => {
              assert.equal(error, null);
              assert.equal(address, "8.8.8.8");
              assert.equal(family, 4);
            });
            const req = new EventEmitter();
            req.end = () => {
              const response = new PassThrough();
              response.statusCode =
                scenario === "loop" ||
                scenario === "malformed" ||
                (scenario === "redirect" && paths.length === 1)
                  ? 302
                  : 200;
              response.headers =
                response.statusCode === 302
                  ? {
                      location:
                        scenario === "malformed" ? "https://[" : "/final.jpg",
                    }
                  : { "content-type": "image/jpeg" };
              callback(response);
              if (!response.destroyed)
                response.end(
                  scenario === "oversize"
                    ? Buffer.alloc(5 * 1024 * 1024 + 1)
                    : sourceBytes,
                );
            };
            return req;
          },
        },
      },
    );
    if (scenario === "redirect") {
      assert.ok(
        (
          await downloadProductImage("https://external.example/start.jpg")
        ).equals(sourceBytes),
      );
      assert.deepEqual(paths, ["/start.jpg", "/final.jpg"]);
    } else {
      await assert.rejects(
        downloadProductImage("https://external.example/start.jpg"),
      );
      if (scenario === "loop") assert.equal(paths.length, 4);
    }
  }
});

test("explicit keep-original choice bypasses a configured worker", async () => {
  const { processProductImage } = await processor(undefined, configured);
  const result = await processProductImage(sourceBytes, "jpeg", false);
  assert.strictEqual(result.bytes, sourceBytes);
  assert.equal(result.backgroundRemoval.status, "original");
  assert.equal(result.backgroundRemoval.reason, "user_requested_original");
});

test("uploads and URL imports retain original bytes even with a configured worker and an obsolete removal flag", async () => {
  for (const upload of [true, false]) {
    const route = await imageRoute(upload, { configuredWorker: true });
    let req;
    if (upload) {
      const form = await uploadRequest().formData();
      form.set("remove_background", "true");
      req = new Request(
        "https://miro.example/api/management/product-images/upload",
        { method: "POST", body: form },
      );
    } else {
      req = new Request("https://miro.example/api/management/product-images", {
        method: "POST",
        body: JSON.stringify({
          product_id: productId,
          image_url: "https://external.example/camera.jpg",
          remove_background: true,
        }),
      });
    }
    const response = await route.POST(req);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).background_removal.status, "original");
    assert.ok(route.calls.uploaded[0].bytes.equals(sourceBytes));
    assert.equal(route.calls.uploaded.length, 1);
  }
});

test("busy inference retries once within the same deadline before any write", async () => {
  const signals = [];
  const { processProductImage } = await processor(async (_url, init) => {
    signals.push(init.signal);
    if (signals.length === 1)
      return new Response("busy", {
        status: 503,
        headers: { "Retry-After": "0" },
      });
    return Response.json({
      skipped: false,
      reason: null,
      image_base64: cutout.toString("base64"),
      mode: "processed",
    });
  }, configured);
  const result = await processProductImage(sourceBytes, "jpeg");
  assert.equal(result.backgroundRemoval.status, "processed");
  assert.equal(signals.length, 2);
  assert.equal(signals[0], signals[1]);
});

test("long busy waits and missing worker auth never trigger uncontrolled requests", async () => {
  let requests = 0;
  const { processProductImage } = await processor(async () => {
    requests++;
    return new Response("busy", {
      status: 503,
      headers: { "Retry-After": "60" },
    });
  }, configured);
  assert.equal(
    (await processProductImage(sourceBytes, "jpeg")).backgroundRemoval.status,
    "original",
  );
  assert.equal(requests, 1);
  const unconfigured = await processor(
    () => {
      throw Error("Must not contact an unauthenticated worker");
    },
    { BACKGROUND_REMOVAL_WORKER_URL: configured.BACKGROUND_REMOVAL_WORKER_URL },
  );
  assert.equal(
    (await unconfigured.processProductImage(sourceBytes, "jpeg"))
      .backgroundRemoval.reason,
    "worker_not_configured",
  );
});

test("a false transparency skip or wrong-size cutout preserves the saved original", async () => {
  const wrongSize = await sharp(cutout).resize(10, 10).png().toBuffer();
  for (const body of [
    {
      skipped: true,
      reason: "already transparent",
      image_base64: sourceBytes.toString("base64"),
      mode: "RGB",
    },
    {
      skipped: false,
      reason: null,
      image_base64: wrongSize.toString("base64"),
      mode: "processed",
    },
  ]) {
    const { processProductImage } = await processor(
      async () => Response.json(body),
      configured,
    );
    const result = await processProductImage(sourceBytes, "jpeg");
    assert.equal(result.backgroundRemoval.status, "original");
    assert.strictEqual(result.bytes, sourceBytes);
  }
});

test("busy retry is interrupted by the original deadline", async () => {
  let requests = 0;
  const processing = await loadSource(
    "src/lib/product-image-processing.ts",
    { "./image-safety": safety },
    {
      process: { env: configured },
      AbortSignal: { timeout: () => AbortSignal.timeout(10) },
      fetch: async () => {
        requests++;
        return new Response("busy", {
          status: 503,
          headers: { "Retry-After": "2" },
        });
      },
    },
  );
  const result = await processing.processProductImage(sourceBytes, "jpeg");
  assert.equal(result.backgroundRemoval.status, "original");
  assert.equal(requests, 1);
});
