import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = await readFile(
  new URL("../../src/components/ui/reveal-image.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function component() {
  const slots = [];
  let index = 0;
  const react = {
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = initial;
      return [
        slots[slot],
        (value) => {
          slots[slot] = value;
        },
      ];
    },
    useRef(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
    useCallback(callback, dependencies) {
      const slot = index++;
      const previous = slots[slot];
      if (
        !previous ||
        dependencies.some((value, i) => value !== previous.dependencies[i])
      )
        slots[slot] = { callback, dependencies };
      return slots[slot].callback;
    },
  };
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime")
        return { jsx: (type, props) => ({ type, props }) };
      if (name === "next/image") return { default: "Image" };
      throw new Error(name);
    },
  });
  return (props = {}) => {
    index = 0;
    return exports.RevealImage({
      src: "/camera.svg",
      alt: "Camera",
      fill: true,
      ...props,
    }).props;
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("cold image stays pending until decode completes and forwards its load event synchronously", async () => {
  const render = component();
  const gate = deferred();
  const element = {
    complete: false,
    naturalWidth: 0,
    isConnected: true,
    decode: () => gate.promise,
  };
  let observed;
  const props = render({
    onLoad: (event) => {
      observed = event.currentTarget;
    },
  });
  props.ref(element);
  assert.equal(props["data-image-ready"], "false");
  const event = { currentTarget: element };
  const loading = props.onLoad(event);
  assert.equal(observed, element);
  event.currentTarget = null;
  assert.equal(render()["data-image-ready"], "false");
  gate.resolve();
  await loading;
  const ready = render();
  assert.equal(ready["data-image-ready"], "true");
  assert.equal(ready["data-image-cached"], undefined);
  assert.equal(
    ready.ref,
    props.ref,
    "state updates must not reclassify a cold load as cached",
  );
});

test("already cached images bypass the fade and retain fill/alt geometry props", () => {
  const render = component();
  render().ref({ complete: true, naturalWidth: 96 });
  const ready = render();
  assert.equal(ready["data-image-ready"], "true");
  assert.equal(ready["data-image-cached"], "true");
  assert.equal(ready.fill, true);
  assert.equal(ready.alt, "Camera");
});

test("a late decode cannot reveal a newer image before its own decode", async () => {
  const render = component();
  const gate = deferred();
  const older = render();
  older.ref({ complete: false });
  const loading = older.onLoad({
    currentTarget: { isConnected: true, decode: () => gate.promise },
  });
  render({ src: "/new-camera.svg" }).ref({ complete: false });
  gate.resolve();
  await loading;
  assert.equal(render({ src: "/new-camera.svg" })["data-image-ready"], "false");
});

test("image failure settles the placeholder and calls the existing fallback handler", () => {
  const render = component();
  let failures = 0;
  const props = render({
    onError: () => {
      failures += 1;
    },
  });
  props.ref({ complete: false });
  props.onError({ currentTarget: {} });
  assert.equal(failures, 1);
  assert.equal(render()["data-image-ready"], "true");
});

test("decode rejection and an unmounted image cannot leave a visible stage waiting forever", async () => {
  const render = component();
  const props = render();
  props.ref({ complete: false });
  await props.onLoad({
    currentTarget: {
      isConnected: true,
      decode: () => Promise.reject(new Error("already decoded")),
    },
  });
  assert.equal(render()["data-image-ready"], "true");
  const detached = component();
  await detached().onLoad({
    currentTarget: { isConnected: false, decode: () => Promise.resolve() },
  });
  assert.equal(detached()["data-image-ready"], "false");
});
