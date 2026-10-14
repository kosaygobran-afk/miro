import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_ANIMATION_SETTINGS } from "../src/lib/animation-settings";

const settings = (enabled: boolean, contentReveal = true) => ({
  ...DEFAULT_ANIMATION_SETTINGS,
  enabled,
  features: { ...DEFAULT_ANIMATION_SETTINGS.features, contentReveal },
});

async function pauseAnimationClock(page: Page) {
  const start = new Date("2026-10-11T12:00:00.000Z");
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 10_000));
}

test("catalog counts animate quickly on load and reload with a stable accessible value", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await pauseAnimationClock(page);
  await page.goto("/en", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );
  const button = page.locator(".sf-category-filters button").first();
  const counter = button.locator("[data-count-target]");
  const target = await counter.getAttribute("data-count-target");
  expect(Number(target)).toBeGreaterThan(0);
  await page.evaluate(
    (detail) =>
      window.dispatchEvent(
        new CustomEvent("miro-animation-settings-change", { detail }),
      ),
    settings(true),
  );
  await expect(counter).toHaveAttribute("data-counting", "running");
  await expect(counter.locator(".sr-only")).toHaveText(target!);
  await expect(counter.locator("[data-count-display]")).toHaveText("0");
  await expect(button).toHaveAccessibleName(new RegExp(`${target}$`));
  await page.clock.runFor(450);
  await expect(counter).toHaveAttribute("data-counting", "settled");
  await expect(counter.locator("[data-count-display]")).toHaveText(target!);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );
  await expect(counter).toHaveAttribute("data-counting", "running");
  await page.clock.runFor(450);
  await expect(counter.locator("[data-count-display]")).toHaveText(target!);
});

test("loaded count updates preserve live-region text and settings disable counting immediately", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await pauseAnimationClock(page);
  await page.goto("/en");
  await expect(page.locator("html")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );
  await page.evaluate(
    (detail) =>
      window.dispatchEvent(
        new CustomEvent("miro-animation-settings-change", { detail }),
      ),
    settings(true),
  );
  // Choose a populated category and dispatch its ordinary click handler while
  // the animation clock is paused (actionability checks themselves use RAF).
  await page
    .locator(
      '.sf-category-filters button:has([data-count-target]:not([data-count-target="0"]))',
    )
    .nth(1)
    .evaluate((button) => (button as HTMLButtonElement).click());
  const summary = page.locator(".sf-catalog-summary [data-count-target]");
  const target = await summary.getAttribute("data-count-target");
  expect(Number(target)).toBeGreaterThan(0);
  await expect(summary).toHaveAttribute("data-counting", "running");
  await expect(summary.locator(".sr-only")).toHaveText(target!);
  await page.evaluate(
    (detail) =>
      window.dispatchEvent(
        new CustomEvent("miro-animation-settings-change", { detail }),
      ),
    settings(true, false),
  );
  await expect(summary).toHaveAttribute("data-counting", "settled");
  await expect(summary.locator("[data-count-display]")).toHaveText(target!);
  await page.evaluate(
    (detail) =>
      window.dispatchEvent(
        new CustomEvent("miro-animation-settings-change", { detail }),
      ),
    settings(false),
  );
  await expect(summary).toHaveAttribute("data-counting", "settled");
});

for (const locale of ["en", "he"]) {
  test(`offscreen counter text stays clipped at phone widths: ${locale}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 850 });
      await page.goto(`/${locale}`);
      await expect(page.locator("html")).toHaveAttribute(
        "data-motion-ready",
        "true",
      );
      await expect(
        page.locator(".sf-category-filters [data-count-target]").first(),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      const finalButton = page.locator(".sf-category-filters button").last();
      await finalButton.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
    }
  });
}

test("reduced motion renders exact counts immediately", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/he");
  await expect(page.locator("html")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );
  await page.evaluate(
    (detail) =>
      window.dispatchEvent(
        new CustomEvent("miro-animation-settings-change", { detail }),
      ),
    settings(true),
  );
  const counters = page.locator(".sf-category-filters [data-count-target]");
  expect(await counters.count()).toBeGreaterThan(0);
  for (const counter of await counters.all()) {
    await expect(counter).toHaveAttribute("data-counting", "settled");
    await expect(counter.locator("[data-count-display]")).toHaveText(
      (await counter.getAttribute("data-count-target"))!,
    );
  }
});
