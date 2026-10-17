import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const routes = {};
runInNewContext(
  compile(
    await readFile(
      new URL("../../src/lib/catalog/routes.ts", import.meta.url),
      "utf8",
    ),
  ),
  { exports: routes },
);
const aliases = [
  ["security-cameras", "cameras"],
  ["nvr", "servers"],
  ["network", "routers"],
  ["tools", "accessories"],
  ["network-gear", "networkGear"],
  ["networkgear", "networkGear"],
  ["alarm-systems", "alarms"],
  ["intercom-access", "intercom"],
  ["intercom-and-access", "intercom"],
  ["owner-category", "owner-category"],
];

const pageSources = await Promise.all(
  ["[category]/page.tsx", "[category]/[slug]/page.tsx"].map(async (path) =>
    compile(
      await readFile(
        new URL(
          `../../src/app/[locale]/(public)/store/${path}`,
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  ),
);

function loadPages(category, { hidden = false } = {}) {
  const product = {
    id: "product",
    slug: "5586793",
    name: "Fixture product",
    category,
    description: "Fixture description",
    stockState: "out",
    stockQty: 0,
    outOfStockPolicy: hidden ? "hide_from_public" : "keep_visible_contact",
    priceIls: null,
    variants: [],
    images: [],
  };
  const catalog = {
    products: [product],
    categories: [{ id: "category", key: category, label: "Fixture category" }],
  };
  const placeholder = () => null;
  const imports = {
    "react/jsx-runtime": jsx,
    "@/lib/catalog/routes": routes,
    "next/navigation": {
      notFound() {
        throw new Error("NOT_FOUND");
      },
    },
    "next/headers": { headers: async () => new Headers() },
    "next-intl/server": { getTranslations: async () => (key) => key },
    "@/lib/seo": { pageMetadata: (input) => input },
    "@/lib/store-data": {
      getStoreCatalog: async () => catalog,
      getStorePageData: async () => ({
        catalog,
        viewer: { savedProductIds: [] },
      }),
    },
    "@/lib/i18n": {
      isLocale: (value) => ["he", "en"].includes(value),
      withLocale: (locale, path = "") => `/${locale}/${path}`,
    },
    "@/lib/contact-config": {
      getPublicContactConfig: async () => ({}),
      toPublicContactActions: () => ({}),
    },
    "@/features/catalog/store-copy": { storeCopy: { he: {}, en: {} } },
    "@/features/catalog/product-visual-kind": {
      getProductVisualKind: () => "camera",
    },
  };
  return pageSources.map((source) => {
    const exports = {};
    runInNewContext(source, {
      exports,
      process: { env: {} },
      require(name) {
        if (imports[name]) return imports[name];
        if (name === "lucide-react" || name.startsWith("@/components/")) {
          return new Proxy({}, { get: () => placeholder });
        }
        throw new Error(`Unexpected import ${name}`);
      },
    });
    return exports;
  });
}

test("management product hrefs use the same keys as the catalog for every category alias", () => {
  for (const [slug, category] of aliases) {
    for (const locale of ["he", "en"]) {
      assert.equal(
        routes.getProductStorefrontHref(locale, slug, "5586793"),
        `/${locale}/store/${category}/5586793`,
      );
      assert.equal(routes.getCategoryKeyFromSlug(category), category);
    }
  }
  assert.equal(routes.getCategoryKeyFromSlug("constructor"), "constructor");
  assert.equal(
    routes.getProductStorefrontHref("en", "owner category", "a/b?c"),
    "/en/store/owner%20category/a%2Fb%3Fc",
  );
});

test("category/detail pages and metadata accept both database aliases and catalog keys", async () => {
  for (const [slug, category] of aliases) {
    const pages = loadPages(category);
    for (const locale of ["he", "en"]) {
      for (const pathCategory of new Set([slug, category])) {
        const props = {
          params: Promise.resolve({
            locale,
            category: pathCategory,
            slug: "5586793",
          }),
          searchParams: Promise.resolve({}),
        };
        for (const page of pages) {
          assert.ok(await page.default(props));
          const metadata = await page.generateMetadata(props);
          assert.ok(metadata.title.startsWith("Fixture"));
        }
      }
    }
  }
});

test("route normalization retains wrong-category and hidden-product 404 protections", async () => {
  const props = {
    params: Promise.resolve({
      locale: "en",
      category: "tools",
      slug: "5586793",
    }),
    searchParams: Promise.resolve({}),
  };
  for (const page of loadPages("cameras")) {
    await assert.rejects(page.default(props), /NOT_FOUND/);
  }
  await assert.rejects(
    loadPages("accessories", { hidden: true })[1].default(props),
    /NOT_FOUND/,
  );
});
