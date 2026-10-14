import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";

const source = await readFile(
  new URL(
    "../../src/app/api/management/calculator-history/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function load({ authorized = true, error = null } = {}) {
  const history = [{ id: "own-row", expression: "2+2", result: 4 }];
  let sessionClients = 0;
  const exports = {};
  const imports = {
    "next/server": {
      NextResponse: {
        json: (body, options) => ({ body, status: 200, ...options }),
      },
    },
    zod: { z },
    "@/app/api/management/_shared": {
      withManagementAuth: async () =>
        authorized
          ? {
              ok: true,
              admin: {
                rpc: () => {
                  throw new Error("History must use the actor session");
                },
              },
            }
          : { ok: false, response: { status: 403 } },
      checkManagementRateLimit: async () => "allowed",
      getClientIp: () => "127.0.0.1",
      errorResponse: (message, status) => ({
        body: { error: message },
        status,
      }),
    },
    "@/lib/supabase/server": {
      createServerSupabaseClient: async () => {
        sessionClients++;
        return {
          rpc: (name, args) => {
            assert.equal(name, "get_calculator_history");
            assert.equal(args.p_limit, 20);
            return { returns: async () => ({ data: history, error }) };
          },
        };
      },
    },
    "@/lib/calculator": {},
  };
  runInNewContext(compiled, { exports, URL, require: (name) => imports[name] });
  return { GET: exports.GET, history, sessionClients: () => sessionClients };
}

test("calculator history reads with the actor session rather than the privileged client", async () => {
  const route = load();
  const response = await route.GET(
    new Request("http://localhost/api/management/calculator-history"),
  );
  assert.equal(response.status, 200);
  assert.equal(response.body.history, route.history);
  assert.equal(route.sessionClients(), 1);
});

test("calculator history denies unauthorized reads before creating the session client", async () => {
  const route = load({ authorized: false });
  const response = await route.GET(
    new Request("http://localhost/api/management/calculator-history"),
  );
  assert.equal(response.status, 403);
  assert.equal(route.sessionClients(), 0);
});

test("calculator history read failures remain errors instead of empty history", async () => {
  const route = load({ error: { message: "private database diagnostic" } });
  const response = await route.GET(
    new Request("http://localhost/api/management/calculator-history"),
  );
  assert.equal(response.status, 500);
  assert.doesNotMatch(
    JSON.stringify(response.body),
    /private database diagnostic/,
  );
});
