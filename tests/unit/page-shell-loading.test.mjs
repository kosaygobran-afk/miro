import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

test("cold navigation labels, nonce and appearance reads start together without blocking on labels", async () => {
  const started = [];
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const read = (name, value) => async () => {
    started.push(name);
    await gate;
    return value;
  };
  const dependencies = {
    "react/jsx-runtime": jsxRuntime,
    react: { Suspense: "Suspense" },
    "next/font/google": { Heebo: () => ({ variable: "font" }) },
    "next/navigation": {
      notFound: () => {
        throw Error("not found");
      },
    },
    "next/headers": { headers: read("nonce", new Headers()) },
    "@/lib/storefront-design-server": {
      getPublicStorefrontDesign: read("design", {}),
    },
    "@/lib/animation-settings-server": {
      getPublicAnimationSettings: read("animation", {}),
    },
    "@/lib/glass-settings-server": {
      getPublicGlassSettings: read("glass", { enabled: false }),
    },
    "@/lib/store-data": {
      getStoreNavigationCategories: () => {
        started.push("navigation");
        // The header consumes this request-cached work after the shell renders.
        return new Promise(() => {});
      },
    },
    "@/lib/i18n": {
      isLocale: (value) => value === "en",
      getDirection: () => "ltr",
    },
    "@/lib/motion": { motionAttributes: () => ({}), motionStyle: () => ({}) },
  };
  const source = await readFile(
    new URL("../../src/app/[locale]/layout.tsx", import.meta.url),
    "utf8",
  );
  const exports = {};
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      process: { env: {} },
      require: (name) => {
        if (name.endsWith(".css")) return {};
        if (name in dependencies) return dependencies[name];
        assert.ok(
          name.startsWith("@/components/") ||
            name.startsWith("@/features/") ||
            name === "@/lib/seo",
        );
        return new Proxy({}, { get: () => () => null });
      },
    },
  );
  const result = exports.default({
    children: "page",
    params: Promise.resolve({ locale: "en" }),
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started.sort(), [
    "animation",
    "design",
    "glass",
    "navigation",
    "nonce",
  ]);
  release();
  const html = await result;
  assert.equal(html.type, "html");
  assert.equal(html.props["data-glass"], "off");
});
