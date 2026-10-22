import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const copy = {};
runInNewContext(
  compile(
    await readFile(
      new URL("../../src/features/catalog/store-copy.ts", import.meta.url),
      "utf8",
    ),
  ),
  { exports: copy },
);
const source = compile(
  await readFile(
    new URL(
      "../../src/components/products/catalog-unavailable.tsx",
      import.meta.url,
    ),
    "utf8",
  ),
);

function render(locale, pending = false) {
  let refreshes = 0;
  let transitions = 0;
  const exports = {};
  const imports = {
    "react/jsx-runtime": jsx,
    react: {
      useTransition: () => [
        pending,
        (action) => {
          transitions++;
          action();
        },
      ],
    },
    "@/components/motion/use-motion-router": {
      useRouter: () => ({
        refresh: () => {
          refreshes++;
        },
      }),
    },
    "@/features/catalog/store-copy": copy,
  };
  runInNewContext(source, { exports, require: (name) => imports[name] });
  const tree = exports.CatalogUnavailable({ locale });
  function button(node) {
    if (!node || typeof node !== "object") return null;
    if (node.type === "button") return node;
    for (const child of [node.props?.children].flat()) {
      const found = button(child);
      if (found) return found;
    }
    return null;
  }
  return {
    html: renderToStaticMarkup(tree),
    button: button(tree).props,
    counts: () => ({ refreshes, transitions }),
  };
}

for (const locale of ["he", "en"]) {
  test(`${locale} outage state announces availability and retries using a fresh server render`, () => {
    const view = render(locale);
    assert.ok(view.html.includes(copy.storeCopy[locale].catalogUnavailable));
    assert.match(view.html, /role="status"/);
    assert.match(view.html, /aria-live="polite"/);
    assert.equal(view.button.disabled, false);
    view.button.onClick();
    assert.deepEqual(view.counts(), { refreshes: 1, transitions: 1 });
    const pending = render(locale, true);
    assert.equal(pending.button.disabled, true);
    assert.equal(pending.button["aria-busy"], true);
    assert.equal(
      pending.button.children,
      copy.storeCopy[locale].catalogRetrying,
    );
  });
}
