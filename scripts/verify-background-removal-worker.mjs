// Real, read-only model/HTTP proof. No storage/database writes or owner media edits.
// BACKGROUND_REVIEW_OUTPUT_DIR=/tmp/miro-background-review node scripts/verify-background-removal-worker.mjs
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import nextEnv from "@next/env";
import sharp from "sharp";
import ts from "typescript";
nextEnv.loadEnvConfig(process.cwd());
const output =
  process.env.BACKGROUND_REVIEW_OUTPUT_DIR ||
  "/tmp/miro-background-worker-review";
const nativeRequire = createRequire(import.meta.url);
const safety = {};
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
const globals = {
  Buffer,
  URL,
  TextDecoder,
  AbortSignal,
  FormData,
  Blob,
  fetch,
  setTimeout,
  clearTimeout,
  console,
  process,
};
runInNewContext(compile(await readFile("src/lib/image-safety.ts", "utf8")), {
  ...globals,
  exports: safety,
  require: (name) => (name === "server-only" ? {} : nativeRequire(name)),
});
const processing = {};
runInNewContext(
  compile(await readFile("src/lib/product-image-processing.ts", "utf8")),
  {
    ...globals,
    exports: processing,
    require: (name) =>
      name === "server-only"
        ? {}
        : name === "./image-safety"
          ? safety
          : nativeRequire(name),
  },
);
const url = process.env.BACKGROUND_REMOVAL_WORKER_URL;
assert.ok(
  url && process.env.BACKGROUND_REMOVAL_WORKER_TOKEN,
  "Configure the private worker before running inference QA",
);
await mkdir(output, { recursive: true });
const source = Buffer.from(
  '<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" fill="white"/><rect x="95" y="160" width="320" height="180" rx="30" fill="#acb4bb"/><circle cx="300" cy="250" r="70" fill="#222d3b"/><circle cx="300" cy="250" r="42" fill="#142139"/><path d="M180 340v60h160" stroke="#77818a" stroke-width="25" fill="none"/></svg>',
);
const report = [];
for (const size of [512, 4000]) {
  const bytes = await sharp(source).resize(size, size).jpeg().toBuffer();
  const began = Date.now();
  const result = await processing.processProductImage(bytes, "jpeg");
  assert.equal(result.backgroundRemoval.status, "processed");
  assert.equal(result.type, "png");
  const meta = await sharp(result.bytes).metadata();
  assert.equal(meta.width, size);
  assert.equal(meta.height, size);
  const stats = await sharp(result.bytes).stats();
  assert.equal(stats.channels[3].min, 0);
  assert.ok(stats.channels[3].max > 0);
  await writeFile(`${output}/camera-${size}.png`, result.bytes);
  const skipped = await processing.processProductImage(result.bytes, "png");
  assert.equal(skipped.backgroundRemoval.status, "transparent");
  assert.ok(result.bytes.equals(skipped.bytes));
  report.push({
    size,
    status: result.backgroundRemoval.status,
    seconds: (Date.now() - began) / 1000,
    alpha: [stats.channels[3].min, stats.channels[3].max],
    secondPassPreserved: true,
  });
}
// Concurrent calls exercise lock contention and the client's bounded retry.
const bytes = await sharp(source).jpeg().toBuffer();
const concurrent = await Promise.all([
  processing.processProductImage(bytes, "jpeg"),
  processing.processProductImage(bytes, "jpeg"),
]);
assert.ok(
  concurrent.every((result) => result.backgroundRemoval.status === "processed"),
);
const unauthorized = new FormData();
unauthorized.set("file", new Blob([bytes]), "image.jpg");
assert.equal(
  (
    await fetch(new URL("/remove-background", url), {
      method: "POST",
      body: unauthorized,
    })
  ).status,
  401,
);
report.push({
  concurrentCalls: concurrent.length,
  processed: concurrent.length,
  anonymousDenied: true,
});
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: true, checks: report }));
