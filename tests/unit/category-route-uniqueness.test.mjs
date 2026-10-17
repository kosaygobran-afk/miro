import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const [clientSource, migration] = await Promise.all([
  readFile(new URL("../../src/lib/catalog/routes.ts", import.meta.url), "utf8"),
  readFile(
    new URL(
      "../../supabase/migrations/20261017020000_catalog_root_route_uniqueness.sql",
      import.meta.url,
    ),
    "utf8",
  ),
]);

test("database route uniqueness uses every actual client category alias with identical keys", () => {
  const source = ts.createSourceFile(
    "routes.ts",
    clientSource,
    ts.ScriptTarget.ES2022,
    true,
  );
  const clientAliases = {};
  function inspect(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === "slugMap" &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const property of node.initializer.properties) {
        assert.ok(ts.isPropertyAssignment(property));
        assert.ok(ts.isStringLiteral(property.initializer));
        const name = property.name;
        assert.ok(ts.isStringLiteral(name) || ts.isIdentifier(name));
        clientAliases[name.text] = property.initializer.text;
      }
    }
    ts.forEachChild(node, inspect);
  }
  inspect(source);
  assert.ok(Object.keys(clientAliases).length > 0);
  const sqlAliases = Object.fromEntries(
    [...migration.matchAll(/when '([^']+)' then '([^']+)'/g)].map(
      ([, alias, key]) => [alias, key],
    ),
  );
  assert.deepEqual(sqlAliases, clientAliases);
});
