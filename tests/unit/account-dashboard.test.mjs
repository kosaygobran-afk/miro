import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createElement, Children } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";

const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const source = await readFile(
  new URL(
    "../../src/components/account/account-dashboard.tsx",
    import.meta.url,
  ),
  "utf8",
);
const presentation = {};
runInNewContext(
  compile(
    await readFile(
      new URL("../../src/lib/account-presentation.ts", import.meta.url),
      "utf8",
    ),
  ),
  { exports: presentation },
);

function loadDashboard({ fail = [], saved = [] } = {}) {
  const started = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const rows = {
    orders: [
      {
        id: "order-id",
        order_number: "QA-123",
        status: "pending",
        total: 123.45,
        currency: "ILS",
        created_at: "2026-10-02T06:00:00Z",
      },
    ],
    service_requests: [
      {
        id: "private-request-uuid",
        service_id: "private-service-uuid",
        status: "waiting_customer",
        created_at: "2026-10-02T06:00:00Z",
      },
    ],
    invoices: [],
  };
  const client = {
    from(table) {
      const query = { table };
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        order() {
          return builder;
        },
        limit(limit) {
          query.limit = limit;
          return builder;
        },
        async then(resolve, reject) {
          started.push(query);
          return gate
            .then(() => ({
              data: fail.includes(table) ? null : rows[table],
              error: fail.includes(table) ? { code: "unavailable" } : null,
            }))
            .then(resolve, reject);
        },
      };
      return builder;
    },
  };
  const icon = () => createElement("svg", { "aria-hidden": true });
  const imports = {
    "react/jsx-runtime": jsx,
    react: { Children },
    "lucide-react": {
      Bookmark: icon,
      ClipboardList: icon,
      Receipt: icon,
      ShoppingBag: icon,
      UserRound: icon,
    },
    "@/components/motion/motion-link": {
      default: (props) =>
        createElement("a", { href: props.href }, props.children),
    },
    "./account-forms": { AccountForms: () => null },
    "./remove-saved-button": { RemoveSavedButton: () => null },
    "@/components/auth/logout-button": { LogoutButton: () => null },
    "@/components/ui/reveal-image": { RevealImage: () => null },
    "@/features/catalog/overflow-label": {
      OverflowLabel: ({ children }) => createElement("span", null, children),
    },
    "@/lib/supabase/server": { createServerSupabaseClient: async () => client },
    "@/lib/i18n": { withLocale: (locale, path = "") => `/${locale}${path}` },
    "@/lib/roles": { roleHome: () => "/workspace" },
    "@/lib/store-data": {
      getSavedProductsWithCanonicalData: async () => {
        started.push({ table: "saved_products", canonical: true });
        await gate;
        return saved;
      },
    },
    "@/lib/catalog/pricing": { formatPrice: () => "Price on request" },
    "@/features/catalog/store-copy": {
      storeCopy: {
        en: { priceUnpublished: "Price on request" },
        he: { priceUnpublished: "מחיר לפי בקשה" },
      },
    },
    "@/lib/account-presentation": presentation,
  };
  const exports = {};
  runInNewContext(compile(source), {
    exports,
    require: (name) => {
      assert.ok(imports[name], name);
      return imports[name];
    },
  });
  const render = async (locale = "en") =>
    renderToStaticMarkup(
      await exports.AccountDashboard({
        locale,
        context: {
          role: "customer",
          user: { id: "customer", email: "account@example.test" },
          profile: { full_name: "QA Customer" },
        },
      }),
    );
  return { render, started, release };
}

test("account canonical data and all three bounded history regions start together", async () => {
  const dashboard = loadDashboard();
  const pending = dashboard.render();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(dashboard.started.map((query) => query.table).sort(), [
    "invoices",
    "orders",
    "saved_products",
    "service_requests",
  ]);
  assert.ok(
    dashboard.started
      .filter((query) => !query.canonical)
      .every((query) => query.limit === 10),
  );
  dashboard.release();
  const html = await pending;
  assert.match(html, /Up to 10 latest entries/);
  assert.match(html, /123\.45/);
  assert.ok(!html.includes("private-service-uuid"));
  assert.ok(!html.includes("private-request-uuid"));
});

test("account failures show unavailable regions rather than fabricated zero counts or empty history", async () => {
  const dashboard = loadDashboard({
    fail: ["orders", "invoices", "service_requests"],
    saved: null,
  });
  dashboard.release();
  const html = await dashboard.render();
  assert.equal((html.match(/>Unavailable</g) ?? []).length, 4);
  assert.equal(
    (html.match(/This information is unavailable/g) ?? []).length,
    4,
  );
  assert.ok(!html.includes("No orders yet"));
  assert.ok(!html.includes("No invoices yet"));
  assert.ok(!html.includes("No service requests yet"));
});

test("one account region failing preserves other real history and Hebrew status text", async () => {
  const dashboard = loadDashboard({ fail: ["orders"] });
  dashboard.release();
  const html = await dashboard.render("he");
  assert.match(html, /ממתינה לתשובתכם/);
  assert.match(html, /אין חשבוניות עדיין/);
  assert.ok(!html.includes("waiting_customer"));
});
