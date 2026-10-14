import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Load the sales-channel module
const source = await readFile(
  new URL("../../src/lib/sales-channel.ts", import.meta.url),
  "utf8",
);
const salesChannel = {};
runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  {
    exports: salesChannel,
  },
);

// Destructure what we need
const {
  SALES_CHANNELS,
  normalizeSalesChannel,
  channelDbValues,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  SALES_CHANNEL_LABELS,
} = salesChannel;

test("normalizeSalesChannel handles POS channels", () => {
  assert.equal(normalizeSalesChannel("pos"), "pos");
  assert.equal(normalizeSalesChannel("POS"), "pos");
  assert.equal(normalizeSalesChannel("  pos  "), "pos");
  assert.equal(normalizeSalesChannel("management"), "pos"); // legacy management-console sale
  assert.equal(normalizeSalesChannel("MANAGEMENT"), "pos");
  assert.equal(normalizeSalesChannel("  Management  "), "pos");
});

test("normalizeSalesChannel handles Website channels", () => {
  assert.equal(normalizeSalesChannel("website"), "website");
  assert.equal(normalizeSalesChannel("WEBSITE"), "website");
  assert.equal(normalizeSalesChannel("  website  "), "website");
  assert.equal(normalizeSalesChannel("storefront"), "website"); // legacy
  assert.equal(normalizeSalesChannel("STOREFRONT"), "website");
  assert.equal(normalizeSalesChannel("  StoreFront  "), "website");
});

test("normalizeSalesChannel handles legacy/other channels", () => {
  assert.equal(normalizeSalesChannel("import"), "legacy");
  assert.equal(normalizeSalesChannel("IMPORT"), "legacy");
  assert.equal(normalizeSalesChannel(""), "legacy");
  assert.equal(normalizeSalesChannel("   "), "legacy");
  assert.equal(normalizeSalesChannel(null), "legacy");
  assert.equal(normalizeSalesChannel(undefined), "legacy");
  assert.equal(normalizeSalesChannel("garbage"), "legacy");
  assert.equal(normalizeSalesChannel("unknown"), "legacy");
  assert.equal(normalizeSalesChannel("123"), "legacy");
});

test("channelDbValues returns correct values for all filters", () => {
  // 'all' should return null (no filter)
  assert.equal(channelDbValues("all"), null);

  // 'pos' should return ['pos', 'management']
  const posValues = channelDbValues("pos");
  assert.deepEqual([...posValues], ["pos", "management"]);

  // 'website' should return ['website', 'storefront']
  const websiteValues = channelDbValues("website");
  assert.deepEqual([...websiteValues], ["website", "storefront"]);
});

test("channelDbValues throws for unknown filter", () => {
  assert.throws(() => {
    // @ts-expect-error intentionally invalid filter value
    channelDbValues("invalid");
  }, /Unknown sales channel filter/);
});

test("PAYMENT_METHODS constant is correct", () => {
  assert.deepEqual(
    [...PAYMENT_METHODS],
    ["cash", "credit_card", "bank_transfer", "bit", "check", "other"],
  );
});

test("PAYMENT_METHOD_LABELS has all payment methods with non-empty labels", () => {
  for (const method of PAYMENT_METHODS) {
    const label = PAYMENT_METHOD_LABELS[method];
    assert.ok(
      label.he.length > 0,
      `Payment method ${method} has empty Hebrew label`,
    );
    assert.ok(
      label.en.length > 0,
      `Payment method ${method} has empty English label`,
    );
  }

  // Spot check specific values
  assert.equal(PAYMENT_METHOD_LABELS.cash.he, "מזומן");
  assert.equal(PAYMENT_METHOD_LABELS.cash.en, "Cash");
  assert.equal(PAYMENT_METHOD_LABELS.credit_card.he, "כרטיס אשראי");
  assert.equal(PAYMENT_METHOD_LABELS.credit_card.en, "Credit Card");
  assert.equal(PAYMENT_METHOD_LABELS.bank_transfer.he, "העברה בנקאית");
  assert.equal(PAYMENT_METHOD_LABELS.bank_transfer.en, "Bank Transfer");
  assert.equal(PAYMENT_METHOD_LABELS.bit.he, "ביט");
  assert.equal(PAYMENT_METHOD_LABELS.bit.en, "Bit");
  assert.equal(PAYMENT_METHOD_LABELS.check.he, "צ'ק");
  assert.equal(PAYMENT_METHOD_LABELS.check.en, "Check");
  assert.equal(PAYMENT_METHOD_LABELS.other.he, "אחר");
  assert.equal(PAYMENT_METHOD_LABELS.other.en, "Other");
});

test("SALES_CHANNEL_LABELS has all sales channels (including legacy) with non-empty labels", () => {
  // Check SalesChannels
  for (const channel of SALES_CHANNELS) {
    const label = SALES_CHANNEL_LABELS[channel];
    assert.ok(
      label.he.length > 0,
      `Sales channel ${channel} has empty Hebrew label`,
    );
    assert.ok(
      label.en.length > 0,
      `Sales channel ${channel} has empty English label`,
    );
  }

  // Check legacy
  const legacyLabel = SALES_CHANNEL_LABELS.legacy;
  assert.ok(legacyLabel.he.length > 0, `Legacy channel has empty Hebrew label`);
  assert.ok(
    legacyLabel.en.length > 0,
    `Legacy channel has empty English label`,
  );

  // Spot check specific values
  assert.equal(SALES_CHANNEL_LABELS.pos.he, "קופה");
  assert.equal(SALES_CHANNEL_LABELS.pos.en, "POS");
  assert.equal(SALES_CHANNEL_LABELS.website.he, "אתר");
  assert.equal(SALES_CHANNEL_LABELS.website.en, "Website");
  assert.equal(SALES_CHANNEL_LABELS.legacy.he, "מדור קודם");
  assert.equal(SALES_CHANNEL_LABELS.legacy.en, "Legacy");
});
