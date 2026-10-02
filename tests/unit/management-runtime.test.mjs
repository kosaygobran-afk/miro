import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

async function loadShared({ actor, allowed, createAdmin }) {
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
  runInNewContext(compiled, { exports, require: (name) => imports[name] });
  return exports.withManagementAuth;
}

const activeCeo = { role: "ceo", status: "active" };
test("authenticated CEO gets a safe 503 when private configuration fails", async () => {
  const auth = await loadShared({
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
    const auth = await loadShared({
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
  const auth = await loadShared({
    actor: activeCeo,
    allowed: true,
    createAdmin: () => client,
  });
  const result = await auth({ method: "GET" }, "manageCatalog");
  assert.equal(result.ok, true);
  assert.equal(result.actor, activeCeo);
  assert.equal(result.admin, client);
});
