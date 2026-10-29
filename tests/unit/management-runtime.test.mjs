import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";

async function loadShared({ actor, allowed, createAdmin } = {}) {
  const source = await readFile(
    new URL("../../src/app/api/management/_shared.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  const imports = {
    "@/lib/request-origin": { hasSameOrigin: () => true },
    "@/lib/auth": { getAuthContext: async () => actor },
    "@/lib/supabase/admin": { createAdminClient: createAdmin },
    "@/lib/permissions": { can: () => allowed },
    "next/server": {
      NextResponse: { json: (body, options) => ({ body, ...options }) },
    },
  };
  runInNewContext(compiled, {
    exports,
    console: { error() {} },
    require: (name) => imports[name],
  });
  return exports;
}

const activeCeo = { role: "ceo", status: "active" };
test("authenticated CEO gets a safe 503 when private configuration fails", async () => {
  const { withManagementAuth: auth } = await loadShared({
    actor: activeCeo,
    allowed: true,
    createAdmin: () => {
      throw new Error("sensitive diagnostic");
    },
  });
  const result = await auth({ method: "GET" }, "manageCatalog");
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 503);
  assert.equal(result.response.body.code, "management_configuration");
  assert.doesNotMatch(JSON.stringify(result), /sensitive diagnostic/);
});

test("unauthorized visitors never initialize a privileged client", async () => {
  for (const [actor, allowed] of [
    [null, true],
    [activeCeo, false],
    [{ status: "suspended" }, true],
  ]) {
    const { withManagementAuth: auth } = await loadShared({
      actor,
      allowed,
      createAdmin: () => {
        throw new Error("must not be called");
      },
    });
    const result = await auth({ method: "GET" }, "manageCatalog");
    assert.equal(result.response.status, 403);
  }
});

test("authorized requests retain the actor and privileged client", async () => {
  const client = {};
  const { withManagementAuth: auth } = await loadShared({
    actor: activeCeo,
    allowed: true,
    createAdmin: () => client,
  });
  const result = await auth({ method: "GET" }, "manageCatalog");
  assert.equal(result.ok, true);
  assert.equal(result.actor, activeCeo);
  assert.equal(result.admin, client);
});

test("management rate-limit windows start together before either one completes", async () => {
  const { checkManagementRateLimit } = await loadShared();
  const calls = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const checking = checkManagementRateLimit(
    {
      async rpc(name, args) {
        calls.push({ name, ...args });
        await gate;
        return { data: true, error: null };
      },
    },
    "192.0.2.1",
  );
  try {
    assert.equal(calls.length, 2);
    assert.deepEqual(
      calls.map(({ name, p_key, p_limit, p_window }) => [
        name,
        p_key,
        p_limit,
        p_window,
      ]),
      [
        ["check_rate_limit", "mgmt:read:ip:1m:192.0.2.1", 60, "1 minute"],
        ["check_rate_limit", "mgmt:read:ip:1h:192.0.2.1", 300, "1 hour"],
      ],
    );
  } finally {
    release();
  }
  assert.equal(await checking, "ok");
});

test("either management rate-limit window can deny or fail closed", async () => {
  const { checkManagementRateLimit } = await loadShared();
  for (const failedWindow of ["1 minute", "1 hour"]) {
    for (const [failure, expected] of [
      [{ data: false, error: null }, "limited"],
      [{ data: null, error: null }, "limited"],
      [{ data: null, error: { code: "offline" } }, "error"],
    ]) {
      const result = await checkManagementRateLimit(
        {
          async rpc(_name, args) {
            return args.p_window === failedWindow
              ? failure
              : { data: true, error: null };
          },
        },
        "192.0.2.1",
      );
      assert.equal(result, expected);
    }
  }
});

for (const route of ["requests", "customers", "users", "audit"]) {
  test(`${route} list keeps authorization and shared rate-limit failures ahead of private reads`, async () => {
    const source = await readFile(
      new URL(
        `../../src/app/api/management/${route}/route.ts`,
        import.meta.url,
      ),
      "utf8",
    );
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    for (const outcome of ["unauthorized", "limited", "error"]) {
      const shared = await loadShared();
      let windows = 0;
      let privateReads = 0;
      const admin = {
        async rpc() {
          windows += 1;
          return {
            data: false,
            error: outcome === "error" ? { code: "offline" } : null,
          };
        },
        from() {
          privateReads += 1;
          throw new Error("Private query must follow successful rate checks");
        },
      };
      const exports = {};
      runInNewContext(compiled, {
        exports,
        URL,
        console: { error() {} },
        require(name) {
          if (name === "zod") return { z };
          if (name === "next/server")
            return {
              NextResponse: { json: (body, options) => ({ body, ...options }) },
            };
          if (name === "@/app/api/management/_shared")
            return {
              ...shared,
              withManagementAuth: async () =>
                outcome === "unauthorized"
                  ? { ok: false, response: { status: 403 } }
                  : { ok: true, admin },
            };
          return {};
        },
      });
      const response = await exports.GET(
        new Request(`https://miro.example/api/management/${route}`),
      );
      assert.equal(
        response.status,
        outcome === "unauthorized" ? 403 : outcome === "limited" ? 429 : 503,
      );
      assert.equal(windows, outcome === "unauthorized" ? 0 : 2);
      assert.equal(privateReads, 0);
      if (outcome === "limited") {
        assert.equal(response.body.code, "rate_limited");
        assert.equal(response.headers["Retry-After"], "60");
      }
    }
  });
}
