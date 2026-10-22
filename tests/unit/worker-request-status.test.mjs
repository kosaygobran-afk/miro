import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

const compiled = ts.transpileModule(
  await readFile(
    new URL("../../src/components/requests/request-list.tsx", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
const exports = {};
runInNewContext(compiled, {
  exports,
  require: (name) =>
    ({
      "react/jsx-runtime": jsx,
      react: { useState: (value) => [value, () => {}] },
      "@/components/motion/use-motion-router": {
        useRouter: () => ({ refresh() {} }),
      },
    })[name],
});
function find(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}
for (const locale of ["he", "en"])
  test(`${locale} worker keeps waiting-customer state and can select every allowed backend transition`, () => {
    for (const status of ["waiting_customer", "closed", "in_progress"]) {
      const tree = exports.RequestList({
        locale,
        manager: false,
        workers: [],
        items: [
          {
            id: "fixture",
            name: "QA",
            message: "QA",
            assigned_to: "fixture-worker",
            status,
          },
        ],
      });
      const select = find(tree, (node) => node.type === "select");
      assert.equal(select.props.defaultValue, status);
      assert.deepEqual(
        [...select.props.children.map((node) => node.props.value)],
        ["in_progress", "waiting_customer", "closed"],
      );
      const waiting = select.props.children.find(
        (node) => node.props.value === "waiting_customer",
      );
      assert.equal(
        waiting.props.children,
        locale === "he" ? "ממתין ללקוח" : "Waiting for customer",
      );
      assert.equal(
        find(
          tree,
          (node) => node.type === "select" && node.props.name === "worker",
        ),
        null,
      );
    }
  });
