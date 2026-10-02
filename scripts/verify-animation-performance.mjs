// Local public-page lab comparison. No private account or business mutation.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const before = process.env.PERFORMANCE_BEFORE_URL;
const after = process.env.PERFORMANCE_AFTER_URL || "http://127.0.0.1:3121";
const output =
  process.env.PERFORMANCE_OUTPUT || "/tmp/miro-motion-performance.json";
const browser = await chromium.launch();
const samples = [];

try {
  for (const [version, base] of [
    ["before", before],
    ["after", after],
  ]) {
    if (!base) continue;
    // Warm server-side compilation/caches before recording fresh browser contexts.
    const warm = await browser.newPage();
    await warm.goto(`${base}/en`, { waitUntil: "domcontentloaded" });
    await warm.locator("main h1").waitFor();
    await warm.close();
    for (let run = 0; run < 3; run++) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      const page = await context.newPage();
      await page.addInitScript(() => {
        // Compare the same starting palette and ensure the measured switch changes a theme.
        localStorage.setItem("miro-theme", "dark");
        window.miroLab = {
          lcp: null,
          cls: 0,
          interactions: [],
          themeCommitMs: null,
        };
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            window.miroLab.lcp = entry.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            if (!entry.hadRecentInput) window.miroLab.cls += entry.value;
        }).observe({ type: "layout-shift", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            if (entry.interactionId)
              window.miroLab.interactions.push(entry.duration);
        }).observe({ type: "event", buffered: true, durationThreshold: 16 });
        let clicked = null;
        document.addEventListener(
          "click",
          (event) => {
            if (
              event.target instanceof Element &&
              event.target.closest("[data-theme-option]")
            )
              clicked = performance.now();
          },
          true,
        );
        const themeObserver = new MutationObserver(() => {
          if (clicked !== null) {
            window.miroLab.themeCommitMs = performance.now() - clicked;
            clicked = null;
          }
        });
        const observeTheme = () =>
          themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-theme"],
          });
        // Init scripts can run before <html> exists; bind once the parser creates it.
        if (document.documentElement) observeTheme();
        else
          document.addEventListener("DOMContentLoaded", observeTheme, {
            once: true,
          });
      });
      await page.goto(`${base}/en`, { waitUntil: "domcontentloaded" });
      await page.locator("main h1").waitFor();
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-theme-option="light"]')
            ?.getAttribute("aria-pressed") !== null,
      );
      await page.waitForTimeout(1200);
      const load = await page.evaluate(() => {
        const navigation = performance.getEntriesByType("navigation")[0];
        const scripts = performance
          .getEntriesByType("resource")
          .filter(
            (entry) =>
              entry.name.includes("/_next/") &&
              new URL(entry.name).pathname.endsWith(".js"),
          );
        return {
          lcpMs: window.miroLab.lcp,
          cls: window.miroLab.cls,
          ttfbMs: navigation.responseStart,
          scriptDecodedBytes: scripts.reduce(
            (total, entry) => total + entry.decodedBodySize,
            0,
          ),
          scriptTransferredBytes: scripts.reduce(
            (total, entry) => total + entry.transferSize,
            0,
          ),
          scriptCount: scripts.length,
        };
      });
      await page.locator('[data-theme-option="light"]').click();
      await page.waitForTimeout(600);
      const interactions = await page.evaluate(() => ({
        themeCommitMs: window.miroLab.themeCommitMs,
        largestRecordedInteractionMs: window.miroLab.interactions.length
          ? Math.max(...window.miroLab.interactions)
          : null,
      }));
      samples.push({ version, run: run + 1, ...load, ...interactions });
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const median = (values) => {
  const available = values.filter(
    (value) => typeof value === "number" && Number.isFinite(value),
  );
  return available.length
    ? available.sort((a, b) => a - b)[Math.floor(available.length / 2)]
    : null;
};
const summaries = Object.fromEntries(
  [...new Set(samples.map((sample) => sample.version))].map((version) => {
    const rows = samples.filter((sample) => sample.version === version);
    return [
      version,
      Object.fromEntries(
        [
          "lcpMs",
          "cls",
          "ttfbMs",
          "scriptDecodedBytes",
          "scriptTransferredBytes",
          "scriptCount",
          "themeCommitMs",
          "largestRecordedInteractionMs",
        ].map((key) => [key, median(rows.map((row) => row[key]))]),
      ),
    ];
  }),
);
const evidence = {
  route: "/en",
  viewport: "1440x1000",
  runs: 3,
  startingTheme: "dark",
  measurement:
    "Local Chromium lab, fresh browser contexts, unthrottled; event timing is a sampled interaction, not field INP. Network/database jitter prevents causal LCP/TTFB claims.",
  summaries,
  samples,
};
await mkdir(new URL(".", `file://${output}`).pathname, { recursive: true });
await writeFile(output, JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify({ output, summaries }, null, 2));
