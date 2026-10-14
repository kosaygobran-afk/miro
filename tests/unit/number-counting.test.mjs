import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createElement, cloneElement, isValidElement } from "react";

const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
const [parserSource, componentSource] = await Promise.all([
  readFile(
    new URL("../../src/lib/number-counting.ts", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../../src/components/motion/animated-number.tsx", import.meta.url),
    "utf8",
  ),
]);
const parser = {};
runInNewContext(compile(parserSource), { exports: parser, Intl });

test("counting preserves localized currency, signs, decimals and the exact final text", () => {
  for (const text of [
    "1,234",
    "₪ 1,234.50",
    "\u200f1,234.50\u00a0₪",
    "-45.25",
    "+12.5%",
    "300+",
  ]) {
    const count = parser.parseCountableNumber(text);
    assert.ok(count, text);
    assert.equal(count.format(1), text);
    assert.equal(count.format(2), text);
    assert.notEqual(count.format(0), text);
  }
  assert.equal(parser.parseCountableNumber("₪ 100.00").format(0), "₪ 0.00");
  assert.equal(parser.parseCountableNumber("100").format(0.5), "87");
});

test("dates, ratios, version numbers, identifiers and invalid amounts remain static", () => {
  for (const text of [
    "2026-10-11",
    "24/7",
    "3 / 10",
    "01",
    "0.1.0",
    "SKU-123",
    "1,23",
    "Infinity",
    "100 cameras",
    "9007199254740992",
    "1.1234567",
  ]) {
    assert.equal(parser.parseCountableNumber(text), null, text);
  }
});

function loadComponent() {
  const refs = [];
  let refIndex = 0;
  let now = 0;
  let frameId = 0;
  let effect;
  let previousDependencies;
  let cleanup;
  const frames = new Map();
  const display = {
    textContent: "",
    style: { removeProperty() {}, minWidth: "" },
    getBoundingClientRect: () => ({ width: 80 }),
  };
  const root = { dataset: {} };
  const controls = {
    reduced: false,
    pathname: "/en/admin",
    settings: {
      enabled: true,
      features: { contentReveal: true },
      durations: { content: 200 },
    },
  };
  const exports = {};
  const imports = {
    react: {
      cloneElement,
      isValidElement,
      useRef(initial) {
        const index = refIndex++;
        return (refs[index] ??= { current: initial });
      },
      useEffect(callback, dependencies) {
        effect = { callback, dependencies };
      },
    },
    "react/jsx-runtime": {
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    },
    "next/navigation": { usePathname: () => controls.pathname },
    "./animation-provider": { useAnimationSettings: () => controls.settings },
    "@/features/store-design/use-reduced-motion": {
      useReducedMotion: () => controls.reduced,
    },
    "@/lib/number-counting": parser,
  };
  runInNewContext(compile(componentSource), {
    exports,
    performance: { now: () => now },
    requestAnimationFrame(callback) {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    require: (name) => imports[name],
  });
  return {
    controls,
    display,
    root,
    frames,
    render(value) {
      refIndex = 0;
      const tree = exports.AnimatedNumber({ value });
      tree.props.ref.current = root;
      tree.props.children[0].props.ref.current = display;
      if (
        !previousDependencies ||
        effect.dependencies.some(
          (value, index) => value !== previousDependencies[index],
        )
      ) {
        cleanup?.();
        previousDependencies = effect.dependencies;
        cleanup = effect.callback();
      }
      return tree;
    },
    metric: (value) => exports.AnimatedMetricValue({ value }),
    advance(time) {
      now = time;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(now));
    },
    unmount: () => cleanup?.(),
  };
}

test("counting is display-only, completes within 400ms and keeps one stable accessible result", () => {
  const component = loadComponent();
  const tree = component.render("₪ 1,000.00");
  assert.equal(tree.props.children[0].props["aria-hidden"], "true");
  assert.equal(tree.props.children[1].props.children, "₪ 1,000.00");
  assert.equal(component.display.textContent, "₪ 0.00");
  component.advance(200);
  assert.equal(component.display.textContent, "₪ 875.00");
  component.advance(400);
  assert.equal(component.display.textContent, "₪ 1,000.00");
  assert.equal(component.root.dataset.counting, "settled");
  assert.equal(component.frames.size, 0);
});

test("reduced motion and both motion switches settle immediately and cancel pending frames", () => {
  for (const disable of ["reduced", "master", "content"]) {
    const component = loadComponent();
    component.render(100);
    if (disable === "reduced") component.controls.reduced = true;
    if (disable === "master") component.controls.settings.enabled = false;
    if (disable === "content")
      component.controls.settings.features.contentReveal = false;
    component.render(100);
    assert.equal(component.display.textContent, "100");
    assert.equal(component.root.dataset.counting, "settled");
    assert.equal(component.frames.size, 0);
  }
});

test("new data and routed revisits restart while unmount and composite values stay safe", () => {
  const component = loadComponent();
  component.render(100);
  component.advance(400);
  component.render(200);
  assert.equal(component.display.textContent, "0");
  component.advance(800);
  component.controls.pathname = "/en/admin/products";
  component.render(200);
  assert.equal(component.display.textContent, "0");
  component.unmount();
  assert.equal(component.frames.size, 0);
  const ratio = createElement("span", null, 3, "/", 10);
  assert.equal(component.metric(ratio), ratio);
  assert.equal(component.metric("24/7"), "24/7");
  const direction = createElement("span", { dir: "ltr" }, "₪ 100.00");
  assert.equal(component.metric(direction).props.dir, "ltr");
});
