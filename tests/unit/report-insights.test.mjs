import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = await readFile(
  new URL("../../src/lib/report-insights.ts", import.meta.url),
  "utf8",
);
const exports = {};
runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  { exports },
);

test("daily pace uses equal UTC-day windows, includes missing zero days and keeps an odd middle day out of comparisons", () => {
  const summary = exports.summarizeDailyActivity([
    { day: "2026-09-27", events: 6 },
    { day: "2026-09-21", events: 3 },
    { day: "2026-09-24", events: 100 },
  ]);
  assert.equal(summary.calendarDays, 7);
  assert.equal(summary.activeDays, 3);
  assert.equal(summary.total, 109);
  assert.equal(summary.average, 109 / 7);
  assert.equal(summary.peak.day, "2026-09-24");
  assert.equal(summary.comparison.windowDays, 3);
  assert.equal(summary.comparison.earlier.from, "2026-09-21");
  assert.equal(summary.comparison.earlier.to, "2026-09-23");
  assert.equal(summary.comparison.recent.from, "2026-09-25");
  assert.equal(summary.comparison.recent.to, "2026-09-27");
  assert.equal(summary.comparison.earlier.total, 3);
  assert.equal(summary.comparison.recent.total, 6);
  assert.equal(summary.comparison.change, 1);
});

test("empty/single-day coverage and zero baselines never invent a trend percentage", () => {
  assert.equal(exports.summarizeDailyActivity([]), null);
  assert.equal(
    exports.summarizeDailyActivity([{ day: "invalid", events: 8 }]),
    null,
  );
  assert.equal(
    exports.summarizeDailyActivity([{ day: "2026-10-02", events: 5 }])
      .comparison,
    null,
  );
  const summary = exports.summarizeDailyActivity([
    { day: "2026-10-01", events: 0 },
    { day: "2026-10-02", events: 8 },
  ]);
  assert.equal(summary.comparison.change, null);
  assert.equal(summary.comparison.recent.total, 8);
});

test("search coverage distinguishes zero search data from paired events and flags inconsistent counters", () => {
  assert.equal(exports.searchCoverage(10, 2).matched, 8);
  assert.equal(exports.searchCoverage(10, 2).noResultRate, 0.2);
  assert.equal(exports.searchCoverage(0, 0).noResultRate, null);
  for (const [searches, noResults] of [
    [2, 3],
    [-1, 0],
    [Infinity, 1],
  ]) {
    const result = exports.searchCoverage(searches, noResults);
    assert.equal(result.valid, false);
    assert.equal(result.matched, null);
    assert.equal(result.noResultRate, null);
  }
});

test("channel mix ignores the aggregate total projection, preserves ties and produces no positive share for zero events", () => {
  const result = exports.contactChannelMix({
    phone: 4,
    whatsapp: 4,
    contact: 2,
    total: 10,
  });
  assert.equal(result.total, 10);
  assert.equal(result.entries.length, 3);
  assert.equal(result.leaders.length, 2);
  assert.equal(result.entries[0].share, 0.4);
  assert.equal(result.entries[2].share, 0.2);
  const empty = exports.contactChannelMix({
    phone: 0,
    whatsapp: 0,
    contact: 0,
    total: 0,
  });
  assert.equal(empty.leaders.length, 0);
  assert.equal(
    empty.entries.every((entry) => entry.share === 0),
    true,
  );
});

test("finance ratios preserve signed figures and do not divide by absent orders or zero net revenue", () => {
  const empty = exports.financeRatios({
    orderCount: 0,
    revenueGross: 0,
    revenueNet: 0,
    grossProfit: 0,
    unitsSold: 0,
  });
  assert.equal(empty.averageOrder, null);
  assert.equal(empty.unitsPerOrder, null);
  assert.equal(empty.grossMargin, null);
  const signed = exports.financeRatios({
    orderCount: 2,
    revenueGross: -100,
    revenueNet: -80,
    grossProfit: -20,
    unitsSold: 4,
  });
  assert.equal(signed.averageOrder, -50);
  assert.equal(signed.unitsPerOrder, 2);
  assert.equal(signed.grossMargin, 0.25);
});
