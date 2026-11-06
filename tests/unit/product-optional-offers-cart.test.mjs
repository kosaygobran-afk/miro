import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

function load(file, modules = {}, globals = {}) {
  const exports = {};
  runInNewContext(
    ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      Map,
      Set,
      Intl,
      Number,
      crypto: { randomUUID },
      queueMicrotask,
      require(name) {
        if (name === "server-only") return {};
        if (name in modules) return modules[name];
        throw new Error(`Unexpected import: ${name}`);
      },
      ...globals,
    },
  );
  return exports;
}
const pure = load("src/features/cart/cart-items.ts");
const prices = load("src/lib/catalog/product-options.ts");
const parent = {
  productId: "parent",
  variantId: "pv",
  slug: "parent",
  category: "c",
  name: "Parent",
  imageUrl: null,
  unitPrice: 10.01,
};
const offer = {
  id: "offer",
  revision: 2,
  kind: "complementary",
  label: "Extra",
  productId: "target",
  variantId: "tv",
  slug: "target",
  category: "c",
  name: "Target",
  sku: "T",
  imageUrl: null,
  unitPrice: 9.99,
};

function cartHarness(initial = []) {
  let stored = JSON.stringify(initial);
  const react = {
    createContext: () => ({ Provider: "provider" }),
    useContext: () => null,
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useSyncExternalStore: (subscribe, snapshot) => {
      subscribe(() => {});
      return snapshot();
    },
  };
  const context = load(
    "src/features/cart/cart-context.tsx",
    {
      react,
      "react/jsx-runtime": { jsx: (type, props) => ({ type, props }) },
      "./cart-items": pure,
    },
    {
      window: {
        localStorage: {
          getItem: () => stored,
          setItem: (_, value) => {
            stored = value;
          },
        },
        addEventListener() {},
        removeEventListener() {},
      },
    },
  );
  return {
    read: () => context.CartProvider({ children: null }).props.value,
    stored: () => JSON.parse(stored),
  };
}

test("configured and standalone versions of the same variant remain independent and persist", () => {
  const cart = cartHarness();
  cart.read().addItem(parent);
  cart.read().addItem({ ...parent, optionalOffers: [offer] });
  cart.read().addItem({ ...parent, optionalOffers: [offer] });
  cart
    .read()
    .addItem({ ...parent, optionalOffers: [{ ...offer, id: "other" }] });
  let state = cart.read();
  assert.equal(state.items.length, 3);
  assert.equal(state.itemCount, 7);
  assert.equal(state.subtotal, 70.01);
  const configured = state.items.find(
    (item) => item.optionalOffers?.[0].id === offer.id,
  );
  const id = pure.cartLineId(configured);
  state.updateQuantity(configured.productId, configured.variantId, 3, id);
  state = cart.read();
  assert.equal(state.subtotal, 90.01);
  assert.equal(
    state.items.find((item) => pure.cartLineId(item) === id).lineId,
    id,
  );
  state.removeItem(configured.productId, configured.variantId, id);
  assert.equal(cart.read().items.length, 2);
  assert.equal(
    cart.read().items.find((item) => !item.optionalOffers).quantity,
    1,
  );
  assert.equal(cartHarness(cart.stored()).read().subtotal, 30.01);
});

test("legacy cart lines and legacy quantity controls never mutate configured lines", () => {
  const cart = cartHarness([{ ...parent, quantity: 1 }]);
  cart.read().addItem({ ...parent, optionalOffers: [offer] });
  cart.read().updateQuantity(parent.productId, parent.variantId, 4);
  assert.equal(
    cart.read().items.find((item) => item.optionalOffers).quantity,
    1,
  );
  assert.equal(
    cart.read().items.find((item) => !item.optionalOffers).quantity,
    4,
  );
  cart.read().removeItem(parent.productId, parent.variantId);
  assert.equal(cart.read().items.length, 1);
  assert.equal(cart.read().items[0].optionalOffers[0].id, offer.id);
});

test("selections flatten to bound identities and quantities without sending money", () => {
  const result = pure.checkoutCartLines([
    { ...parent, quantity: 3, lineId: "line", optionalOffers: [offer] },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[1].parent_line_id, "line");
  assert.equal(result[1].offer_id, offer.id);
  assert.equal(result[1].offer_revision, 2);
  assert.equal(result[1].quantity, 3);
  assert.ok(
    result.every(
      (line) => !Object.keys(line).some((key) => /price|discount/.test(key)),
    ),
  );
  assert.equal(
    pure.cartUnitTotal({ ...parent, quantity: 1, optionalOffers: [offer] }),
    20,
  );
  assert.match(pure.formatCartPrice(0.01, "en", "—"), /0\.01/);
});

test("optional prices use exact integer units and never invent a positive or unpublished price", () => {
  assert.equal(
    prices.optionalOfferPrice(9.99, {
      pricing_mode: "percent",
      discount_bps: 1000,
      fixed_price_agorot: null,
    }),
    8.99,
  );
  assert.equal(
    prices.optionalOfferPrice(9.99, {
      pricing_mode: "fixed",
      discount_bps: null,
      fixed_price_agorot: 1234,
    }),
    12.34,
  );
  assert.equal(
    prices.optionalOfferPrice(null, {
      pricing_mode: "fixed",
      discount_bps: null,
      fixed_price_agorot: 1234,
    }),
    null,
  );
  assert.equal(
    prices.optionalOfferPrice(0.01, {
      pricing_mode: "percent",
      discount_bps: 9500,
      fixed_price_agorot: null,
    }),
    null,
  );
});

const catalog = [
  {
    id: "parent",
    availabilityUnconfirmed: false,
    variants: [{ id: "pv", stockQty: 10 }],
  },
  {
    id: "target",
    availabilityUnconfirmed: false,
    variants: [{ id: "tv", stockQty: 3 }],
  },
];
const configured = {
  revision: 2,
  offers: [{ ...offer, stockQty: 3, availabilityUnconfirmed: false }],
};
function verifier(read = async () => configured) {
  return load("src/lib/catalog/product-options-cart-server.ts", {
    "./product-options-server": { getProductOptionalOffers: read },
  });
}
const baseLines = [
  {
    line_id: "parent-line",
    product_id: "parent",
    variant_id: "pv",
    quantity: 1,
  },
  {
    line_id: "offer-line",
    product_id: "target",
    variant_id: "tv",
    quantity: 1,
    offer_id: "offer",
    parent_line_id: "parent-line",
    offer_revision: 2,
  },
];

test("server offer verification rejects forged context, stale revisions and orphaned selections", async () => {
  const verify = verifier();
  const valid = await verify.resolveCartOptionalOffers(
    baseLines,
    catalog,
    "en",
  );
  assert.equal(valid.get("offer-line").unitPrice, 9.99);
  for (const patch of [
    { offer_id: "forged" },
    { parent_line_id: "missing" },
    { offer_revision: 1 },
    { quantity: 2 },
    { product_id: "parent" },
    { variant_id: "pv" },
    { line_id: "parent-line" },
  ]) {
    await assert.rejects(
      () =>
        verify.resolveCartOptionalOffers(
          [baseLines[0], { ...baseLines[1], ...patch }],
          catalog,
          "en",
        ),
      verify.OptionalOfferCartChanged,
    );
  }
  await assert.rejects(() =>
    verifier(async () => ({
      revision: 2,
      offers: [],
    })).resolveCartOptionalOffers(baseLines, catalog, "en"),
  );
});

test("server stock verification sums standalone and configured uses of the same target variant", async () => {
  const verify = verifier();
  const lines = [
    ...baseLines,
    {
      line_id: "standalone",
      product_id: "target",
      variant_id: "tv",
      quantity: 2,
    },
  ];
  assert.equal(
    (await verify.resolveCartOptionalOffers(lines, catalog, "he")).size,
    1,
  );
  await assert.rejects(
    () =>
      verify.resolveCartOptionalOffers(
        [...baseLines, { ...lines[2], quantity: 3 }],
        catalog,
        "he",
      ),
    verify.OptionalOfferCartChanged,
  );
  await assert.rejects(
    () =>
      verify.resolveCartOptionalOffers(
        [...baseLines, { ...baseLines[1], line_id: "second-offer" }],
        catalog,
        "he",
      ),
    verify.OptionalOfferCartChanged,
  );
});

test("failed offer reads never substitute browser prices or silently remove a selection", async () => {
  const failure = new Error("Unavailable");
  await assert.rejects(
    () =>
      verifier(async () => {
        throw failure;
      }).resolveCartOptionalOffers(baseLines, catalog, "en"),
    (error) => error === failure,
  );
  assert.equal(
    (await verifier().resolveCartOptionalOffers([baseLines[0]], catalog, "en"))
      .size,
    0,
  );
});
