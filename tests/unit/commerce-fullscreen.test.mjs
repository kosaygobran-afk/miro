import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = await readFile(
  new URL(
    "../../src/components/management/tools/workspace-window-utils.ts",
    import.meta.url,
  ),
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
  { exports },
);

test("workspace Escape ownership follows z-index and rendered tie order", () => {
  const { getFrontmostWorkspaceWindow } = exports;
  assert.equal(getFrontmostWorkspaceWindow([]), null);
  assert.equal(
    getFrontmostWorkspaceWindow([
      { id: "pos", zIndex: 80 },
      { id: "calculator", zIndex: 81 },
    ]),
    "calculator",
  );
  assert.equal(
    getFrontmostWorkspaceWindow([
      { id: "pos", zIndex: 80 },
      { id: "calculator", zIndex: 80 },
    ]),
    "calculator",
  );
});

test("POS manifest declares standalone launch and valid app icons", async () => {
  const manifest = await readFile(
    new URL("../../src/app/manifest.ts", import.meta.url),
    "utf8",
  );
  const files = await Promise.all(
    [
      "../../public/miro-pos-icon-192.png",
      "../../public/miro-pos-icon-512.png",
    ].map((path) => readFile(new URL(path, import.meta.url))),
  );
  assert.match(manifest, /start_url:\s*"\/he\/admin\/pos"/);
  assert.match(manifest, /display:\s*"standalone"/);
  assert.match(manifest, /192x192/);
  assert.match(manifest, /512x512/);
  assert.equal(files[0].readUInt32BE(16), 192);
  assert.equal(files[1].readUInt32BE(16), 512);
});
