import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
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
const productCategoryPath = {};
runInNewContext(
  compile(
    await readFile(
      new URL(
        "../../src/features/catalog/product-category-path.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
  {
    exports: productCategoryPath,
    require(name) {
      if (name === "react/jsx-runtime") return jsx;
      throw new Error(`Unexpected import ${name}`);
    },
  },
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

function loadPages(
  category,
  {
    hidden = false,
    unavailable = false,
    subcategoryLabel,
    subcategorySlug,
  } = {},
) {
  const product = {
    id: "product",
    slug: "5586793",
    name: "Fixture product",
    category,
    subcategoryLabel,
    subcategorySlug,
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
    ...(unavailable
      ? { products: [], categories: [], error: "unavailable" }
      : {}),
  };
  const placeholder = () => null;
  const imports = {
    "react/jsx-runtime": jsx,
    "@/lib/catalog/routes": routes,
    "@/features/catalog/product-category-path": productCategoryPath,
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
    "@/lib/catalog/related-products": { getRelatedProducts: () => [] },
    "@/features/catalog/related-products-rail": {
      RelatedProductsRail: placeholder,
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
        if (name === "@/lib/catalog/product-options-server")
          return {
            getProductOptionalOffers: async () => ({ revision: 0, offers: [] }),
          };
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

test("product category paths isolate labels and breadcrumbs encode the literal child slug", async () => {
  const ProductCategoryPath = productCategoryPath.ProductCategoryPath;
  assert.equal(
    renderToStaticMarkup(
      jsx.jsx(ProductCategoryPath, {
        product: {
          category: "root",
          categoryLabel: "Root & label",
          subcategoryLabel: "ילד / Child",
        },
      }),
    ),
    '<span class="sf-category-path"><bdi>Root &amp; label</bdi> / <bdi>ילד / Child</bdi></span>',
  );
  assert.equal(
    renderToStaticMarkup(
      jsx.jsx(ProductCategoryPath, { product: { category: "root" } }),
    ),
    '<span class="sf-category-path"><bdi>root</bdi></span>',
  );

  const hrefs = (node) => {
    if (Array.isArray(node)) return node.flatMap(hrefs);
    if (!node || typeof node !== "object") return [];
    return [
      ...(typeof node.props?.href === "string" ? [node.props.href] : []),
      ...hrefs(node.props?.children),
    ];
  };
  for (const locale of ["he", "en"]) {
    const props = {
      params: Promise.resolve({ locale, category: "tools", slug: "5586793" }),
      searchParams: Promise.resolve({}),
    };
    const detail = loadPages("accessories", {
      subcategoryLabel: "ילד / Child",
      subcategorySlug: "child / & raw",
    })[1];
    const links = hrefs(await detail.default(props));
    assert.ok(
      links.includes(
        `/${locale}/store/accessories?subcategory=child%20%2F%20%26%20raw`,
      ),
    );
    const rootOnly = loadPages("accessories")[1];
    assert.equal(
      hrefs(await rootOnly.default(props)).some((href) =>
        href.includes("?subcategory="),
      ),
      false,
    );
  }
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

test("catalog outages render a localized retry state before category or product 404 checks", async () => {
  for (const locale of ["he", "en"]) {
    for (const page of loadPages("cameras", { unavailable: true })) {
      const result = await page.default({
        params: Promise.resolve({
          locale,
          category: "cameras",
          slug: "5586793",
        }),
        searchParams: Promise.resolve({}),
      });
      assert.equal(result.props.locale, locale);
    }
  }
});
