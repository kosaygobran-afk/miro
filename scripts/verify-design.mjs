import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

// Run against a production server: DESIGN_BASE_URL=http://127.0.0.1:3101 node scripts/verify-design.mjs
const baseURL = (
  process.env.DESIGN_BASE_URL || "http://localhost:3000"
).replace(/\/$/, "");
const output = process.env.DESIGN_OUTPUT_DIR || "/tmp/miro-design-review";
const themes = ["dark", "medium", "light"];
const widths = [320, 390, 768, 1440, 1920];
const routes = ["", "/store"];
const browserErrors = new Set();
const failures = [];
let combinations = 0;
let accessibilityChecks = 0;

await mkdir(output, { recursive: true });
const browser = await chromium.launch();

function watchErrors(page) {
  page.on("pageerror", (error) => {
    browserErrors.add(`${page.url()}: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.add(`${page.url()}: ${message.text()}`);
    }
  });
}

async function ready(page) {
  await expect(page.locator("main h1")).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Only wait for finite entrance effects; an accidental perpetual animation
    // must not prevent the verification command from finishing.
    const animations = document.getAnimations().filter((animation) => {
      return animation.effect?.getComputedTiming().iterations !== Infinity;
    });
    await Promise.race([
      Promise.all(
        animations.map((animation) => animation.finished.catch(() => {})),
      ),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  });
}

async function checkLayout(page) {
  const dimensions = await page.evaluate(() => {
    const title = document.querySelector("main h1").getBoundingClientRect();
    const clippedHeaderControls = Array.from(
      document.querySelectorAll("header a, header button"),
    ).flatMap((element) => {
      const rect = element.getBoundingClientRect();
      if (
        !rect.width ||
        !rect.height ||
        (rect.left >= -1 && rect.right <= innerWidth + 1)
      ) {
        return [];
      }
      return [
        {
          label:
            element.getAttribute("aria-label") || element.textContent.trim(),
          left: rect.left,
          right: rect.right,
        },
      ];
    });
    return {
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      titleLeft: title.left,
      titleRight: title.right,
      clippedHeaderControls,
    };
  });
  assert(
    dimensions.scrollWidth <= dimensions.width + 1,
    `Horizontal overflow: ${JSON.stringify(dimensions)}`,
  );
  assert(
    dimensions.titleLeft >= -1 && dimensions.titleRight <= dimensions.width + 1,
    `Clipped heading: ${JSON.stringify(dimensions)}`,
  );
  assert.deepEqual(
    dimensions.clippedHeaderControls,
    [],
    "Header controls extend beyond the viewport",
  );
  await expect(page.locator("header").first()).toBeVisible();
  await expect(page.locator("footer").first()).toBeVisible();
  const failedImages = await page
    .locator("main img")
    .evaluateAll((images) =>
      images
        .filter((image) => image.complete && image.naturalWidth === 0)
        .map((image) => image.getAttribute("src")),
    );
  assert.deepEqual(failedImages, [], "Broken content images");
}

async function screenshot(page, name) {
  // Reveal actual lazy image slots before capturing the complete document.
  for (const image of await page.locator("main img").all()) {
    if (!(await image.isVisible())) continue;
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(
        () =>
          image.evaluate(
            (element) => element.complete && element.naturalWidth > 0,
          ),
        {
          message: `Content image did not load on ${page.url()}`,
          timeout: 15_000,
        },
      )
      .toBe(true);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
}

async function checkAccessibility(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  accessibilityChecks += 1;
  assert.deepEqual(
    results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        reason: node.failureSummary,
      })),
    })),
    [],
    `Accessibility violations: ${label}`,
  );
}

async function checkInteractions() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  watchErrors(page);
  try {
    await page.goto(`${baseURL}/en`);
    await ready(page);
    await page.keyboard.press("Tab");
    assert(
      await page.evaluate(() => document.activeElement !== document.body),
      "Keyboard focus does not reach the page",
    );

    for (const theme of themes) {
      const control = page.locator(`button[data-theme-option="${theme}"]`);
      await control.click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(control).toHaveAttribute("aria-pressed", "true");
      assert.equal(
        await page.evaluate(() => localStorage.getItem("miro-theme")),
        theme,
      );
      await page.reload();
      await ready(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(control).toHaveAttribute("aria-pressed", "true");
    }

    const menu = page.locator('button[aria-controls="mobile-navigation"]');
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#mobile-navigation")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#mobile-navigation")).toBeHidden();
    await expect(menu).toBeFocused();
    await menu.click();
    await page
      .locator('#mobile-navigation a[href="/en/store"]')
      .first()
      .click();
    await expect(page).toHaveURL(`${baseURL}/en/store`);
    await expect(page.locator("#mobile-navigation")).toBeHidden();

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${baseURL}/en`);
    await ready(page);
    const movingElements = await page
      .locator("header *, main *, footer *")
      .evaluateAll((elements) => {
        const seconds = (duration) =>
          duration.endsWith("ms")
            ? parseFloat(duration) / 1000
            : parseFloat(duration);
        return elements
          .filter((element) => {
            const style = getComputedStyle(element);
            return [
              ...style.animationDuration.split(","),
              ...style.transitionDuration.split(","),
            ].some((duration) => seconds(duration.trim()) > 0.001);
          })
          .slice(0, 8)
          .map((element) => element.className);
      });
    assert.deepEqual(
      movingElements,
      [],
      "Reduced-motion preference leaves extended animations or transitions",
    );

    // Small landscape and zoom/reflow were previously hidden behind a warning.
    await page.setViewportSize({ width: 667, height: 375 });
    await checkLayout(page);
    await page.setViewportSize({ width: 768, height: 960 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await checkLayout(page);
    await screenshot(page, "en-light-200-percent-text");

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${baseURL}/en`);
    await ready(page);
    const departments = page.getByRole("button", {
      name: "Store categories",
      exact: true,
    });
    await departments.focus();
    await page.keyboard.press("Enter");
    await expect(departments).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#store-navigation")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(departments).toHaveAttribute("aria-expanded", "false");
    await expect(departments).toBeFocused();
    await page
      .getByRole("searchbox", { name: "Search the store", exact: true })
      .fill("camera");
    await page
      .getByRole("searchbox", { name: "Search the store", exact: true })
      .press("Enter");
    await expect(page).toHaveURL(`${baseURL}/en/store?q=camera#store-items`);
    await expect(
      page.getByTestId("store-catalog").getByRole("searchbox"),
    ).toHaveValue("camera");
  } finally {
    await context.close();
  }
}

async function checkStoreInteractions() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  watchErrors(page);
  try {
    for (const locale of ["he", "en"]) {
      const labels =
        locale === "he"
          ? {
              search: "חיפוש מוצרים או קטגוריות",
              clear: "ניקוי החיפוש",
              sort: "מיון מוצרים",
              category: "קטגוריה",
              reset: "איפוס סינון",
              details: "לפרטי המוצר",
              quote: "לשיחה על המוצר",
            }
          : {
              search: "Search products or categories",
              clear: "Clear search",
              sort: "Sort products",
              category: "Category",
              reset: "Reset filters",
              details: "Explore product",
              quote: "Ask about this product",
            };
      await page.goto(`${baseURL}/${locale}/store`);
      await ready(page);
      const catalog = page.getByTestId("store-catalog");
      const cards = catalog.locator(".sf-product-card");
      await expect.poll(() => cards.count()).toBeGreaterThan(0);
      const initialCount = await cards.count();
      const firstName = await cards.first().getAttribute("data-product-name");
      const search = catalog.getByRole("searchbox", { name: labels.search });

      await search.fill("zzzz-no-such-miro-product-zzzz");
      await expect(cards).toHaveCount(0);
      await expect(catalog.getByRole("status")).toContainText("0");
      await catalog
        .getByRole("button", { name: labels.clear, exact: true })
        .click();
      await expect(cards).toHaveCount(initialCount);
      await search.fill(firstName);
      await expect.poll(() => cards.count()).toBeGreaterThan(0);
      await expect(cards.first().getByRole("heading", { level: 3 })).toHaveText(
        firstName,
      );
      await catalog
        .getByRole("button", { name: labels.reset, exact: true })
        .first()
        .click();

      const sort = catalog.getByRole("combobox", { name: labels.sort });
      for (const direction of ["low", "high"]) {
        await sort.selectOption(direction);
        const prices = await cards.evaluateAll((elements) =>
          elements.map((element) => Number(element.dataset.productPrice)),
        );
        assert(
          prices.every(
            (price, index) =>
              index === 0 ||
              (direction === "low"
                ? prices[index - 1] <= price
                : prices[index - 1] >= price),
          ),
          `${locale}: price order does not follow ${direction}`,
        );
      }

      const categories = catalog
        .getByRole("group", { name: labels.category })
        .getByRole("button");
      if ((await categories.count()) > 1) {
        await categories.nth(1).click();
        await expect(categories.nth(1)).toHaveAttribute("aria-pressed", "true");
        await expect(categories.first()).toHaveAttribute(
          "aria-pressed",
          "false",
        );
      }
      await catalog
        .getByRole("button", { name: labels.reset, exact: true })
        .first()
        .click();
      await expect(cards).toHaveCount(initialCount);
      await expect(categories.first()).toHaveAttribute("aria-pressed", "true");

      const productName = await cards.first().getAttribute("data-product-name");
      const details = cards
        .first()
        .getByRole("button", { name: labels.details, exact: true });
      await details.click();
      const dialog = page.getByRole("dialog", {
        name: productName,
        exact: true,
      });
      await expect(dialog).toBeVisible();
      await checkAccessibility(page, `${locale}-product-dialog`);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(details).toBeFocused();
      await details.click();
      const quote = dialog.getByRole("link", {
        name: labels.quote,
        exact: true,
      });
      const destination = new URL(await quote.getAttribute("href"), baseURL);
      assert.equal(destination.pathname, `/${locale}/contact`);
      assert.equal(destination.searchParams.get("product"), productName);
      await quote.click();
      await expect(page).toHaveURL(destination.href);
      await ready(page);

      // A shared search URL should initialize the same visible catalog query.
      await page.goto(
        `${baseURL}/${locale}/store?q=${encodeURIComponent(firstName)}`,
      );
      await ready(page);
      await expect(search).toHaveValue(firstName);
      await expect(cards.first().getByRole("heading", { level: 3 })).toHaveText(
        firstName,
      );
    }
  } finally {
    await context.close();
  }
}

try {
  for (const width of widths) {
    for (const locale of ["he", "en"]) {
      for (const theme of themes) {
        const context = await browser.newContext({
          viewport: { width, height: 960 },
          reducedMotion: "reduce",
        });
        await context.addInitScript(
          (value) => localStorage.setItem("miro-theme", value),
          theme,
        );
        const page = await context.newPage();
        watchErrors(page);
        try {
          for (const route of routes) {
            const label = `${width}-${locale}-${theme}-${route ? "store" : "home"}`;
            try {
              const response = await page.goto(`${baseURL}/${locale}${route}`);
              assert.equal(
                response?.status(),
                200,
                `${label} did not return HTTP 200`,
              );
              await ready(page);
              await expect(page.locator("html")).toHaveAttribute(
                "lang",
                locale,
              );
              await expect(page.locator("html")).toHaveAttribute(
                "dir",
                locale === "he" ? "rtl" : "ltr",
              );
              await expect(page.locator("html")).toHaveAttribute(
                "data-theme",
                theme,
              );
              await checkLayout(page);

              // Each route/theme is scanned in Hebrew on mobile and English on desktop.
              if (
                (width === 390 && locale === "he") ||
                (width === 1440 && locale === "en")
              ) {
                await checkAccessibility(page, label);
              }
              if (
                width === 390 ||
                width === 1440 ||
                (width === 320 && locale === "en" && theme === "light")
              ) {
                await screenshot(page, label);
              }
              combinations += 1;
              console.log(`PASS ${label}`);
            } catch (error) {
              failures.push(
                new Error(`${label}: ${error.message}`, { cause: error }),
              );
              console.error(`FAIL ${label}: ${error.message}`);
              await page
                .screenshot({
                  path: `${output}/failure-${label}.png`,
                  fullPage: true,
                })
                .catch(() => {});
            }
          }
        } finally {
          await context.close();
        }
      }
    }
  }

  try {
    await checkInteractions();
    console.log(
      "PASS theme persistence, mobile navigation/focus, keyboard menus, header search, reduced motion, landscape and text zoom",
    );
  } catch (error) {
    failures.push(error);
    console.error(`FAIL interactions: ${error.message}`);
  }
  try {
    await checkStoreInteractions();
    console.log(
      "PASS Hebrew/English catalog search, empty/reset, price sorting, categories, dialog Escape/focus, inquiry links and shared search URLs",
    );
  } catch (error) {
    failures.push(error);
    console.error(`FAIL store interactions: ${error.message}`);
  }
  if (browserErrors.size) {
    failures.push(
      new Error(`Browser errors:\n${[...browserErrors].join("\n")}`),
    );
  }
  if (failures.length) {
    throw new AggregateError(
      failures,
      `${failures.length} design verification check(s) failed; screenshots: ${output}`,
    );
  }
  console.log(
    `PASS: ${combinations} route/viewport/language/theme combinations, ${accessibilityChecks} automated accessibility scans, interaction checks; screenshots: ${output}`,
  );
} finally {
  await browser.close();
}
