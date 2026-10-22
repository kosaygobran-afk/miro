import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

const read = async (path) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const serviceSource = compile(await read("src/lib/public-services.ts"));
const detailSource = compile(
  await read("src/app/[locale]/(public)/services/[slug]/page.tsx"),
);
const listSource = compile(
  (await read("src/app/[locale]/(public)/services/page.tsx")) +
    "\nexport { PublishedServiceGrid };",
);
const unavailableSource = compile(
  await read("src/components/public/services-unavailable.tsx"),
);

function harness(result, throws = false) {
  const exports = {};
  const filters = [];
  const warnings = [];
  const builder = {
    select() {
      return builder;
    },
    eq(...args) {
      filters.push(args);
      return builder;
    },
    order() {
      return builder;
    },
    maybeSingle() {
      return builder;
    },
    then(resolve, reject) {
      return (
        throws
          ? Promise.reject(
              new TypeError("fetch failed: private transport detail"),
            )
          : Promise.resolve(result)
      ).then(resolve, reject);
    },
  };
  runInNewContext(serviceSource, {
    exports,
    console: { warn: (...args) => warnings.push(args.join(" ")) },
    require(name) {
      if (name === "react") return { cache: (fn) => fn };
      assert.equal(name, "@/lib/supabase/public-server");
      return {
        createPublicServerClient: () => ({
          from: (table) => {
            assert.equal(table, "services");
            return builder;
          },
        }),
      };
    },
  });
  return { exports, filters, warnings };
}

for (const throws of [false, true]) {
  test(`service transport ${throws ? "exception" : "error result"} is sanitized and never empty/missing`, async () => {
    const { exports, warnings } = harness(
      { data: null, error: { message: "private transport detail" } },
      throws,
    );
    await assert.rejects(
      exports.getPublishedServices(),
      exports.PublishedServicesUnavailable,
    );
    await assert.rejects(
      exports.getPublishedServiceBySlug("known-service"),
      exports.PublishedServicesUnavailable,
    );
    assert.equal(warnings.length, 2);
    assert.ok(
      warnings.every(
        (text) => !text.includes("private") && !text.includes("known-service"),
      ),
    );
  });
}

test("successful missing and empty services retain their contracts; only active services are read", async () => {
  const missing = harness({ data: null, error: null });
  assert.equal(
    await missing.exports.getPublishedServiceBySlug("missing"),
    null,
  );
  assert.deepEqual(missing.filters, [
    ["slug", "missing"],
    ["is_active", true],
  ]);
  const empty = harness({ data: [], error: null });
  assert.equal((await empty.exports.getPublishedServices()).length, 0);
  assert.deepEqual(empty.filters, [["is_active", true]]);
  assert.deepEqual(empty.warnings, []);
});

function pages(serviceExports) {
  const exports = {};
  let notFoundCalls = 0;
  const ServicesUnavailable = () => null;
  const imports = {
    "react/jsx-runtime": jsx,
    react: { Suspense: () => null },
    "next/navigation": {
      notFound() {
        notFoundCalls++;
        throw new Error("404");
      },
    },
    "@/lib/i18n": { isLocale: (value) => ["en", "he"].includes(value) },
    "@/lib/seo": { pageMetadata: (input) => input },
    "@/lib/public-services": serviceExports,
    "@/components/public/services-unavailable": { ServicesUnavailable },
  };
  const require = (name) => imports[name] ?? {};
  runInNewContext(detailSource, { exports, require });
  const list = {};
  runInNewContext(listSource, { exports: list, require });
  return {
    exports,
    list,
    ServicesUnavailable,
    notFoundCalls: () => notFoundCalls,
  };
}

test("service detail + metadata and list show retry availability instead of false 404/empty", async () => {
  const { exports } = harness({
    data: null,
    error: { message: "unavailable" },
  });
  const route = pages(exports);
  for (const locale of ["he", "en"]) {
    const props = {
      params: Promise.resolve({ locale, slug: "known-service" }),
    };
    const detail = await route.exports.default(props);
    assert.equal(detail.type, route.ServicesUnavailable);
    assert.equal(detail.props.detail, true);
    assert.equal(detail.props.locale, locale);
    const metadata = await route.exports.generateMetadata(props);
    assert.equal(metadata.noIndex, true);
    assert.doesNotMatch(metadata.title, /not found/i);
    const list = await route.list.PublishedServiceGrid({
      locale,
      services: exports.getPublishedServices(),
    });
    assert.equal(list.type, route.ServicesUnavailable);
    assert.equal(route.notFoundCalls(), 0);
  }
});

test("a genuinely missing service still renders 404 and successful empty listing is announced", async () => {
  const { exports } = harness({ data: null, error: null });
  const route = pages(exports);
  await assert.rejects(
    route.exports.default({
      params: Promise.resolve({ locale: "en", slug: "missing" }),
    }),
    /404/,
  );
  assert.equal(route.notFoundCalls(), 1);
  const empty = await route.list.PublishedServiceGrid({
    locale: "en",
    services: Promise.resolve([]),
  });
  assert.equal(empty.type, "p");
  assert.equal(empty.props.role, "status");
  assert.match(empty.props.children, /No published services/);
});

test("bilingual service retry is announced, guarded while pending and refreshes without navigation", () => {
  for (const locale of ["he", "en"])
    for (const pending of [false, true]) {
      let refreshes = 0;
      const exports = {};
      runInNewContext(unavailableSource, {
        exports,
        require: (name) =>
          ({
            "react/jsx-runtime": jsx,
            react: { useTransition: () => [pending, (action) => action()] },
            "@/components/motion/use-motion-router": {
              useRouter: () => ({ refresh: () => refreshes++ }),
            },
          })[name],
      });
      const tree = exports.ServicesUnavailable({ locale, detail: true });
      const inner = tree.props.children;
      const [heading, , button] = inner.props.children;
      assert.equal(heading.type, "h1");
      assert.equal(button.props.disabled, pending);
      assert.equal(button.props["aria-busy"], pending);
      assert.match(
        renderToStaticMarkup(tree),
        /role="status" aria-live="polite"/,
      );
      assert.match(
        heading.props.children,
        locale === "he" ? /השירותים/ : /Services/,
      );
      button.props.onClick();
      assert.equal(refreshes, 1);
    }
});
