import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const source = await readFile(
  new URL("../../src/lib/management-ordering.ts", import.meta.url),
  "utf8",
);
const exports = {};
runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { exports },
);
const move = (rows, id, delta) => {
  const updates = exports.buildOrderUpdates(rows, id, delta);
  return rows
    .map((row) => ({
      ...row,
      ...updates.find((update) => update.id === row.id),
    }))
    .sort((a, b) => a.sort_order - b.sort_order);
};
test("duplicate ranks move exactly one adjacent row in either direction", () => {
  const rows = [
    { id: "a", sort_order: 1 },
    { id: "b", sort_order: 2 },
    { id: "c", sort_order: 3 },
    { id: "d", sort_order: 3 },
  ];
  assert.deepEqual(
    move(rows, "d", -1).map((row) => row.id),
    ["a", "b", "d", "c"],
  );
  assert.deepEqual(
    move(rows, "b", 1).map((row) => row.id),
    ["a", "c", "b", "d"],
  );
  assert.equal(
    new Set(move(rows, "d", -1).map((row) => row.sort_order)).size,
    4,
  );
});
test("boundaries and invalid moves do not persist changes", () => {
  const rows = [
    { id: "a", sort_order: 10 },
    { id: "b", sort_order: 20 },
  ];
  for (const [id, delta] of [
    ["a", -1],
    ["b", 1],
    ["missing", 1],
    ["a", 2],
    ["a", 0],
  ])
    assert.equal(exports.buildOrderUpdates(rows, id, delta).length, 0);
});
test("a move survives a reload and reversal restores row order", () => {
  const rows = [
    { id: "a", sort_order: 0 },
    { id: "b", sort_order: 0 },
    { id: "c", sort_order: 7 },
  ];
  const moved = move(rows, "a", 1);
  assert.deepEqual(
    moved.map((row) => row.id),
    ["b", "a", "c"],
  );
  assert.deepEqual(
    move(moved, "a", -1).map((row) => row.id),
    ["a", "b", "c"],
  );
});
