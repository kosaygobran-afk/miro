import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = await readFile(
  new URL(
    "../../src/components/management/commerce/support-workspaces.tsx",
    import.meta.url,
  ),
  "utf8",
);

function renderSummary(summary, locale) {
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  const components = new Proxy({}, { get: (_, name) => name });
  const imports = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: {
      useState: (initial) => [initial, () => {}],
      useRef: (initial) => ({ current: initial }),
      useEffect: () => {},
    },
    "./commerce-common": {
      ...Object.fromEntries(
        [
          "CommercePage",
          "SectionFeedback",
          "SectionState",
          "SectionCard",
          "FormField",
          "ActionButton",
          "RefreshAction",
          "RecordTable",
        ].map((name) => [name, name]),
      ),
      useCommerceAccess: () => ({ allowed: () => true }),
      useCommerceSection: () => ({
        rows: [],
        payload: { summary },
        loading: false,
      }),
    },
  };
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      Intl,
      require: (name) => imports[name] ?? components,
    },
  );
  const tree = exports.CommerceReadWorkspace({
    locale,
    section: "report",
    variant: "reports",
  });
  function findPre(node) {
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = findPre(child);
        if (found) return found;
      }
    } else if (node && typeof node === "object" && node.props) {
      if (node.type === "pre") return node;
      return findPre(node.props.children);
    }
    return null;
  }
  const pre = findPre(tree);
  assert.ok(pre);
  return pre.props.children.map((row) => row.props.children.at(-1));
}

for (const locale of ["he", "en"]) {
  test(`commerce summary converts minor units using exact ${locale} currency formatting and preserves metadata`, () => {
    const summary = {
      orders_total_agorot: 1,
      expenses_gross_agorot: 100,
      orders_count: 2,
      from: "2026-10-11T00:00:00Z",
      timezone: "Asia/Jerusalem",
      revision: 17,
      reference: "00123",
    };
    const cells = renderSummary(summary, locale);
    const format = new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
      style: "currency",
      currency: "ILS",
    });
    assert.equal(cells[0].type, "AnimatedMetricValue");
    assert.equal(cells[0].props.value, format.format(0.01));
    assert.equal(cells[1].props.value, format.format(1));
    assert.equal(cells[2].props.value, "2");
    assert.deepEqual(
      [...cells.slice(3)],
      ["2026-10-11T00:00:00Z", "Asia/Jerusalem", "17", "00123"],
    );
    assert.equal(summary.orders_total_agorot, 1);
    assert.equal(summary.expenses_gross_agorot, 100);
  });
}

test("commerce summary rejects unsafe or fractional minor-unit amounts", () => {
  const cells = renderSummary(
    {
      orders_total_agorot: 1.5,
      expenses_gross_agorot: Number.MAX_SAFE_INTEGER + 1,
    },
    "en",
  );
  assert.ok(cells.every((cell) => cell.props.value === "—"));
});
