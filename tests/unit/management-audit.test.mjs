import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
const source = await readFile(
  new URL("../../src/lib/management-audit.ts", import.meta.url),
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
  { exports, require: () => ({ z }), Intl },
);

test("audit dates cover whole Israel days in winter and summer", () => {
  assert.equal(
    exports.israelDayStart("2026-01-15"),
    "2026-01-14T22:00:00.000Z",
  );
  assert.equal(
    exports.israelDayStart("2026-07-15"),
    "2026-07-14T21:00:00.000Z",
  );
  assert.equal(
    exports.israelDayStart("2026-07-15", true),
    "2026-07-15T21:00:00.000Z",
  );
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    hourCycle: "h23",
  });
  for (const day of ["2026-03-27", "2026-10-25"])
    assert.equal(formatter.format(new Date(exports.israelDayStart(day))), "00");
});
test("audit filters reject excessive pagination, invalid dates and invalid IDs", () => {
  for (const values of [
    { limit: 101 },
    { offset: -1 },
    { from: "2026-02-30" },
    { from: "2026-10-04", to: "2026-10-02" },
    { userId: "unknown" },
    { q: "a".repeat(101) },
    { action: "created,or(id.gt.0)" },
  ])
    assert.equal(exports.auditFiltersSchema.safeParse(values).success, false);
  assert.equal(
    exports.auditFiltersSchema.safeParse({
      from: "2026-10-02",
      to: "2026-10-02",
      limit: 25,
    }).success,
    true,
  );
});
test("search quotes reserved characters and treats wildcards as literal input", () => {
  const query = exports.auditSearchExpression('camera,entity_id.gt.0)"%_');
  assert.match(query, /action\.ilike\."/);
  assert.match(query, /\\"/);
  assert.match(query, /\\\\%/);
  assert.match(query, /\\\\_/);
  assert.equal(
    exports.auditSearchExpression("camera").includes("entity_id.eq"),
    false,
  );
  assert.match(
    exports.auditSearchExpression("11111111-1111-4111-8111-111111111111"),
    /entity_id.eq.11111111/,
  );
});

async function loadRoute(allowed = true) {
  const routeSource = await readFile(
    new URL("../../src/app/api/management/audit/route.ts", import.meta.url),
    "utf8",
  );
  const calls = [];
  const routeExports = {};
  const query = {
    select: (...args) => {
      calls.push(["select", ...args]);
      return query;
    },
    order: (...args) => {
      calls.push(["order", ...args]);
      return query;
    },
    eq: (...args) => {
      calls.push(["eq", ...args]);
      return query;
    },
    gte: (...args) => {
      calls.push(["gte", ...args]);
      return query;
    },
    lt: (...args) => {
      calls.push(["lt", ...args]);
      return query;
    },
    or: (...args) => {
      calls.push(["or", ...args]);
      return query;
    },
    range: (...args) => {
      calls.push(["range", ...args]);
      return Promise.resolve({ data: [], count: 27, error: null });
    },
  };
  const admin = {
    rpc: async () => ({ data: true, error: null }),
    from: (name) => {
      calls.push(["from", name]);
      return query;
    },
  };
  const imports = {
    "@/lib/management-audit": exports,
    "next/server": {
      NextResponse: { json: (body, options) => ({ body, ...options }) },
    },
    "@/app/api/management/_shared": {
      withManagementAuth: async () =>
        allowed
          ? { ok: true, admin }
          : { ok: false, response: { status: 403 } },
      errorResponse: (error, status = 500) => ({ body: { error }, status }),
    },
  };
  runInNewContext(
    ts.transpileModule(routeSource, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { exports: routeExports, require: (name) => imports[name], URL, console },
  );
  return { get: routeExports.GET, calls };
}
test("all audit filters and total count share one bounded query", async () => {
  const { get, calls } = await loadRoute();
  const response = await get(
    new Request(
      "http://localhost/api/management/audit?q=camera&entityType=product&action=product_updated&from=2026-07-15&to=2026-07-15&limit=25&offset=25",
    ),
  );
  assert.equal(response.body.totalCount, 27);
  assert.equal(calls.filter((call) => call[0] === "select").length, 1);
  assert.equal(calls.find((call) => call[0] === "select")[2].count, "exact");
  assert.equal(
    calls.find((call) => call[0] === "gte")[2],
    "2026-07-14T21:00:00.000Z",
  );
  assert.equal(
    calls.find((call) => call[0] === "lt")[2],
    "2026-07-15T21:00:00.000Z",
  );
  assert.deepEqual(
    calls.find((call) => call[0] === "range").slice(1),
    [25, 49],
  );
  assert(calls.some((call) => call[0] === "or"));
});
test("audit authorization and invalid filters never query event rows", async () => {
  const denied = await loadRoute(false);
  assert.equal(
    (await denied.get(new Request("http://localhost/api/management/audit")))
      .status,
    403,
  );
  assert.equal(denied.calls.length, 0);
  const invalid = await loadRoute();
  assert.equal(
    (
      await invalid.get(
        new Request("http://localhost/api/management/audit?limit=10000"),
      )
    ).status,
    400,
  );
  assert.equal(invalid.calls.length, 0);
});

test("date presets use the Israel calendar day across timezone boundaries", async () => {
  const source = await readFile(
    new URL(
      "../../src/components/management/ui/date-range-picker.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const picker = {};
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    { exports: picker, require: () => ({}), Intl },
  );
  const range = picker.resolveDateRange(
    "today",
    new Date("2026-10-01T22:00:00Z"),
  );
  assert.equal(range.from, "2026-10-02");
  assert.equal(range.to, "2026-10-02");
  assert.equal(picker.resolveDateRange("all").from, "");
});
