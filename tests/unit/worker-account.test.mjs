import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = await readFile(
  new URL("../../src/lib/roles.ts", import.meta.url),
  "utf8",
);
const exports = {};
runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { exports },
);

test("workers and customers use the same account destination", () => {
  assert.equal(exports.roleHome("worker"), "account");
  assert.equal(exports.roleHome("customer"), "account");
  assert.equal(exports.roleHome("admin"), "admin");
  assert.equal(exports.roleHome("ceo"), "admin");
});
