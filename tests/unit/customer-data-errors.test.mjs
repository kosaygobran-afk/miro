import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = await readFile(
  new URL("../../src/app/api/management/customers/route.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const id = "00000000-0000-4000-8000-000000000001";

function harness({
  failedTable,
  missingProfile = false,
  authLookupError = false,
  authorized = true,
} = {}) {
  const queried = [];
  const profile = { id, full_name: "QA customer", account_status: "active" };
  const db = {
    rpc: async () => ({ data: true, error: null }),
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: { email: "qa@example.test", last_sign_in_at: null } },
          error: authLookupError
            ? { message: "private auth diagnostic" }
            : null,
        }),
      },
    },
    from(table) {
      queried.push(table);
      let single = false;
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        range: () => query,
        in: () => query,
        maybeSingle() {
          single = true;
          return query;
        },
        then(resolve, reject) {
          const data =
            table === "profiles"
              ? missingProfile
                ? null
                : single
                  ? profile
                  : [profile]
              : table === "user_roles"
                ? single
                  ? { role: "customer" }
                  : [{ user_id: id, role: "customer" }]
                : [];
          return Promise.resolve({
            data,
            count: 1,
            error:
              failedTable === table
                ? { message: "private database diagnostic" }
                : null,
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const exports = {};
  runInNewContext(compiled, {
    exports,
    URL,
    console: { error() {} },
    require(name) {
      if (name === "next/server")
        return {
          NextResponse: {
            json: (body, options) => ({ body, status: options?.status ?? 200 }),
          },
        };
      assert.equal(name, "@/app/api/management/_shared");
      return {
        withManagementAuth: async () =>
          authorized
            ? { ok: true, admin: db }
            : { ok: false, response: { status: 403 } },
        errorResponse: (message, status = 500) => ({
          body: { error: message },
          status,
        }),
        tooManyRequests: () => ({ status: 429 }),
      };
    },
  });
  return {
    get: (query = `id=${id}`) =>
      exports.GET(
        new Request(`http://localhost/api/management/customers?${query}`),
      ),
    queried,
  };
}

for (const table of [
  "profiles",
  "user_roles",
  "orders",
  "service_requests",
  "analytics_events",
]) {
  test(`failed customer detail ${table} projection is unavailable, not empty or 404`, async () => {
    const response = await harness({ failedTable: table }).get();
    assert.equal(response.status, 503);
    assert.equal(response.body.customer, undefined);
    assert.doesNotMatch(
      JSON.stringify(response.body),
      /private database diagnostic/,
    );
  });
}
test("a genuinely missing customer is 404; successful empty activity remains valid", async () => {
  assert.equal((await harness({ missingProfile: true }).get()).status, 404);
  const response = await harness().get();
  assert.equal(response.status, 200);
  assert.equal(response.body.customer.id, id);
  assert.equal(response.body.orders.length, 0);
});
test("malformed customer IDs and unauthorized requests do not query customer records", async () => {
  const malformed = harness();
  assert.equal((await malformed.get("id=not-a-uuid")).status, 400);
  assert.equal(malformed.queried.length, 0);
  const denied = harness({ authorized: false });
  assert.equal((await denied.get()).status, 403);
  assert.equal(denied.queried.length, 0);
});
test("failed account contact lookups are not represented as blank email addresses", async () => {
  const failed = await harness({ authLookupError: true }).get("limit=20");
  assert.equal(failed.status, 503);
  assert.doesNotMatch(JSON.stringify(failed.body), /private auth diagnostic/);
  assert.equal((await harness().get("limit=20")).status, 200);
});
