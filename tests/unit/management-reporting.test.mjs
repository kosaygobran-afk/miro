import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
async function compile(file, require) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const exports = {};
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { exports, require, Intl, URLSearchParams },
  );
  return exports;
}
const audit = await compile("../../src/lib/management-audit.ts", () => ({ z }));
const reporting = await compile(
  "../../src/lib/management-reporting.ts",
  () => audit,
);

test("report date bounds include Israel business days independently of browser timezone", () => {
  const summer = reporting.reportingRangeParams({
    from: "2026-07-15",
    to: "2026-07-15",
  });
  assert.equal(summer.get("from"), "2026-07-14T21:00:00.000Z");
  assert.equal(summer.get("to"), "2026-07-15T20:59:59.999Z");
  const winter = reporting.reportingRangeParams({
    from: "2026-01-15",
    to: "2026-01-15",
  });
  assert.equal(winter.get("from"), "2026-01-14T22:00:00.000Z");
  assert.equal(winter.get("to"), "2026-01-15T21:59:59.999Z");
});
test("All sends no bounds; DST transition retains a whole calendar day", () => {
  assert.equal(
    reporting.reportingRangeParams({ from: "", to: "" }).toString(),
    "",
  );
  const params = reporting.reportingRangeParams({
    from: "2026-10-25",
    to: "2026-10-25",
  });
  assert.equal(
    new Date(params.get("to")) - new Date(params.get("from")) + 1,
    25 * 60 * 60 * 1000,
  );
});
test("period deltas handle losses and unavailable zero baselines honestly", () => {
  assert.equal(reporting.periodChange(100, 0), null);
  assert.equal(reporting.periodChange(0, 0), null);
  assert.equal(reporting.periodChange(120, 100), 0.2);
  assert.equal(reporting.periodChange(0, 100), -1);
  assert.equal(reporting.periodChange(-50, -100), 0.5);
});
