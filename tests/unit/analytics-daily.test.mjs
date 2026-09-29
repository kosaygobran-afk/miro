import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(
  new URL("../../src/lib/analytics-daily.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { aggregateDailyEvents } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("daily counts include all products without overwriting matching event types", () => {
  assert.deepEqual(
    aggregateDailyEvents([
      {
        day: "2026-09-29T00:00:00+00:00",
        event_type: "product_view",
        events: 12,
      },
      {
        day: "2026-09-29T00:00:00+00:00",
        event_type: "product_view",
        events: 8,
      },
      { day: "2026-09-29", event_type: "product_search", events: 3 },
      { day: "2026-09-28", event_type: "product_view", events: 2 },
    ]),
    {
      "2026-09-29": {
        product_view: { events: 20 },
        product_search: { events: 3 },
      },
      "2026-09-28": { product_view: { events: 2 } },
    },
  );
});
test("empty and undated rows cannot invent plotted activity", () => {
  assert.deepEqual(aggregateDailyEvents([]), {});
  assert.deepEqual(
    aggregateDailyEvents([{ day: null, event_type: null, events: 5 }]),
    {},
  );
  assert.deepEqual(
    aggregateDailyEvents([
      { day: "2026-09-29", event_type: null, events: null },
    ]),
    { "2026-09-29": { unknown: { events: 0 } } },
  );
});
