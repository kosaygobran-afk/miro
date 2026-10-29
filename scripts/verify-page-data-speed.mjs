// Anonymous read-only browser lab. No credentials, response bodies or business writes.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nextEnv from "@next/env";
import { chromium } from "@playwright/test";

nextEnv.loadEnvConfig(process.cwd());
const base = new URL(process.env.BASE_URL || "http://localhost:3000");
assert.ok(["http:", "https:"].includes(base.protocol));
assert.ok(
  !base.username && !base.password,
  "BASE_URL must not contain credentials",
);
const output = process.env.OUTPUT_DIR || join(tmpdir(), "miro-page-data-speed");
const runs = Number(process.env.SPEED_RUNS || 2);
assert.ok(Number.isInteger(runs) && runs >= 1 && runs <= 10);
const timeout = 45_000;
const browser = await chromium.launch();
const samples = [];
const warmups = [];
let sessionCheck;
let productRoute = null;

const rounded = (value) => Math.round(value * 10) / 10;
const counts = () => ({
  total: 0,
  document: 0,
  rsc: 0,
  api: 0,
  session: 0,
  rest: 0,
  image: 0,
  script: 0,
  other: 0,
  blockedWrites: 0,
});
const errorCounts = () => ({
  console: 0,
  uncaught: 0,
  hydration: 0,
  unavailable: 0,
  csp: 0,
  other: 0,
});

async function prepareContext(viewport = { width: 1440, height: 1000 }) {
  // New contexts deliberately have no stored sessions or customer data.
  const context = await browser.newContext({
    viewport,
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => {
    window.miroDataSpeed = { motionReadyMs: null, catalogReadyMs: null };
    const inspect = () => {
      const timing = window.miroDataSpeed;
      if (
        timing.motionReadyMs === null &&
        document.documentElement?.dataset.motionReady === "true"
      )
        timing.motionReadyMs = performance.now();
      if (
        timing.catalogReadyMs === null &&
        document.querySelector(".sf-catalog, .sf-product-detail")
      )
        timing.catalogReadyMs = performance.now();
    };
    new MutationObserver(inspect).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-motion-ready"],
    });
    document.addEventListener("DOMContentLoaded", inspect, { once: true });
  });
  await context.route("**/*", (route) => {
    const request = route.request();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method()))
      return route.continue();
    // Suppress browser analytics and any accidental mutation. GET data stays real.
    if (new URL(request.url()).pathname === "/api/track")
      return route.fulfill({ status: 204 });
    return route.abort("blockedbyclient");
  });
  return context;
}

function instrument(page) {
  let requests = counts();
  let errors = errorCounts();
  page.on("request", (request) => {
    requests.total++;
    const url = new URL(request.url());
    const type = request.resourceType();
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()))
      requests.blockedWrites++;
    if (url.pathname === "/api/auth/session") requests.session++;
    if (request.headers().rsc === "1") requests.rsc++;
    if (type === "document") requests.document++;
    else if (url.pathname.startsWith("/api/")) requests.api++;
    else if (url.pathname.startsWith("/rest/v1/")) requests.rest++;
    else if (type === "image") requests.image++;
    else if (type === "script") requests.script++;
    else requests.other++;
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    errors.console++;
    // Record classifications only: console text can contain URLs or row values.
    const text = message.text();
    if (/hydrat/i.test(text)) errors.hydration++;
    else if (/unavailable|supabase|fetch failed|timeout/i.test(text))
      errors.unavailable++;
    else if (/content.security.policy|\bcsp\b/i.test(text)) errors.csp++;
    else errors.other++;
  });
  page.on("pageerror", () => errors.uncaught++);
  return {
    reset() {
      requests = counts();
      errors = errorCounts();
    },
    snapshot() {
      return { requests: { ...requests }, errors: { ...errors } };
    },
  };
}

async function settle(page) {
  await page.waitForFunction(
    () => {
      const main = document.getElementById("main-content");
      return (
        document.documentElement.dataset.motionReady === "true" &&
        main?.querySelector("h1") &&
        !document.querySelector('[data-route-loading="true"]')
      );
    },
    null,
    { timeout },
  );
  // Streaming can briefly remove a fallback before its final subtree commits.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.waitForFunction(
    () => !document.querySelector('[data-route-loading="true"]'),
    null,
    { timeout },
  );
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const path = location.pathname;
    const catalogRoute = /^\/(en|he)\/?$/.test(path);
    const detailRoute = /^\/(en|he)\/store\/[^/]+\/[^/]+\/?$/.test(path);
    const catalogReady = catalogRoute
      ? Boolean(document.querySelector(".sf-catalog"))
      : detailRoute
        ? Boolean(document.querySelector(".sf-product-detail"))
        : null;
    const servicesUnavailable =
      path.endsWith("/services") &&
      Boolean(document.querySelector("main .sf-empty button"));
    return {
      ttfbMs: navigation?.responseStart ?? null,
      domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? null,
      motionReadyMs: window.miroDataSpeed?.motionReadyMs ?? null,
      catalogReadyMs: window.miroDataSpeed?.catalogReadyMs ?? null,
      routeReadyMs: performance.now(),
      catalogReady,
      dataAvailable: catalogReady !== false && !servicesUnavailable,
    };
  });
}

async function visit(page, route, phase, observer) {
  observer.reset();
  let status = null;
  let timing = null;
  let failure = null;
  try {
    const response =
      phase === "reload"
        ? await page.reload({ waitUntil: "domcontentloaded", timeout })
        : await page.goto(new URL(route, base).href, {
            waitUntil: "domcontentloaded",
            timeout,
          });
    status = response?.status() ?? null;
    timing = await settle(page);
  } catch (error) {
    failure = error.name === "TimeoutError" ? "timeout" : "navigation_failed";
  }
  return {
    route,
    phase,
    status,
    ...(timing &&
      Object.fromEntries(
        Object.entries(timing).map(([key, value]) => [
          key,
          typeof value === "number" ? rounded(value) : value,
        ]),
      )),
    failure,
    ...observer.snapshot(),
  };
}

async function checkSessionCoalescing() {
  const context = await prepareContext({ width: 390, height: 850 });
  const page = await context.newPage();
  let requests = 0;
  let active = 0;
  let peak = 0;
  let release;
  let gate = new Promise((resolve) => {
    release = resolve;
  });
  await context.route("**/api/auth/session", async (route) => {
    requests++;
    peak = Math.max(peak, ++active);
    await gate;
    await route.fulfill({
      json: {
        authenticated: true,
        role: "customer",
        name: "Synthetic speed QA",
      },
    });
    active--;
  });
  const result = {
    synthetic: true,
    overlappingRequests: null,
    freshFocusRequests: null,
    peakInflight: null,
    passed: false,
  };
  try {
    await page.goto(new URL("/en/contact", base).href, {
      waitUntil: "domcontentloaded",
      timeout,
    });
    await settle(page);
    await page.waitForFunction(
      () => document.querySelector(".premium-mobile-toggle"),
      null,
      { timeout },
    );
    await page.locator(".premium-mobile-toggle").click();
    await page
      .locator("#mobile-navigation")
      .waitFor({ state: "visible", timeout });
    await page.evaluate(() => {
      for (let index = 0; index < 5; index++)
        window.dispatchEvent(new Event("focus"));
    });
    await page.waitForTimeout(250);
    result.overlappingRequests = requests;
    release();
    await page.waitForFunction(
      () => document.querySelectorAll(".premium-account-trigger").length === 2,
      null,
      { timeout },
    );
    const before = requests;
    gate = new Promise((resolve) => {
      release = resolve;
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(250);
    result.freshFocusRequests = requests - before;
    result.peakInflight = peak;
    result.passed =
      result.overlappingRequests === 1 &&
      result.freshFocusRequests === 1 &&
      peak === 1;
  } catch (error) {
    result.failure =
      error.name === "TimeoutError" ? "timeout" : "interaction_failed";
  } finally {
    release();
    await context.close();
  }
  return result;
}

try {
  const discoveryContext = await prepareContext();
  const discoveryPage = await discoveryContext.newPage();
  const discoveryObserver = instrument(discoveryPage);
  warmups.push(await visit(discoveryPage, "/en", "warmup", discoveryObserver));
  productRoute = await discoveryPage
    .locator('a[href^="/en/store/"]')
    .evaluateAll((links) => {
      const link = links.find((node) =>
        /^\/en\/store\/[^/]+\/[^/?#]+\/?$/.test(new URL(node.href).pathname),
      );
      return link ? new URL(link.href).pathname : null;
    });
  await discoveryContext.close();
  const routes = [
    "/en",
    "/he",
    "/en/contact",
    "/en/services",
    "/en/login",
    ...(productRoute ? [productRoute] : []),
  ];
  for (const route of routes) {
    const warmContext = await prepareContext();
    const warmPage = await warmContext.newPage();
    warmups.push(await visit(warmPage, route, "warmup", instrument(warmPage)));
    await warmContext.close();
    for (let run = 1; run <= runs; run++) {
      const context = await prepareContext();
      const page = await context.newPage();
      const observer = instrument(page);
      samples.push({ run, ...(await visit(page, route, "initial", observer)) });
      samples.push({ run, ...(await visit(page, route, "reload", observer)) });
      await context.close();
    }
    console.log(JSON.stringify({ route, measuredNavigations: runs * 2 }));
  }
  sessionCheck = await checkSessionCoalescing();
} finally {
  await browser.close();
}

const failures = samples.filter(
  (sample) =>
    sample.failure ||
    sample.status !== 200 ||
    sample.dataAvailable === false ||
    sample.errors.uncaught ||
    sample.errors.hydration,
);
const report = {
  measuredAt: new Date().toISOString(),
  origin: base.origin,
  scope:
    "Anonymous Chromium, 1440x1000, reduced motion, unthrottled. Every route is warmed before measurement; initial is a fresh browser context, reload reuses its context. Playwright request interception disables the browser HTTP cache. Server cold-start and development compilation are not claimed. Images and networkidle are not awaited. Request counts cover the browser only, not server-to-database calls. Analytics writes are suppressed; private sessions and payloads are never recorded.",
  productRouteDiscovered: Boolean(productRoute),
  runs,
  warmups,
  samples,
  sessionCheck,
  passed:
    failures.length === 0 &&
    sessionCheck?.passed === true &&
    Boolean(productRoute),
};
await mkdir(output, { recursive: true });
await writeFile(
  join(output, "page-data-speed.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      output,
      passed: report.passed,
      failedSamples: failures.length,
      productRouteDiscovered: Boolean(productRoute),
      sessionCheck,
    },
    null,
    2,
  ),
);
if (!report.passed) process.exitCode = 1;
