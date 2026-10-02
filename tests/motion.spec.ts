import { expect, test, type Page } from "@playwright/test";
import {
  ANIMATION_FEATURES,
  DEFAULT_ANIMATION_SETTINGS,
  type AnimationSettings,
} from "../src/lib/animation-settings";

type MotionProbe = {
  viewTransitions: number;
  animations: Array<{
    element: string;
    frames: Keyframe[];
    pseudoElement?: string;
    duration?: number | string;
  }>;
};

declare global {
  interface Window {
    __motionProbe: MotionProbe;
    __slowCategoryHeld?: boolean;
    __releaseSlowCategory?: () => void;
  }
}

async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("html")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );
  await expect(page.locator(".motion-navigation-progress")).toHaveAttribute(
    "data-ready",
    "true",
  );
}

async function observeMotion(page: Page, unsupported = false) {
  await page.addInitScript(
    ({ unsupported }) => {
      window.__motionProbe = { viewTransitions: 0, animations: [] };
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (frames, options) {
        const config = typeof options === "object" ? options : undefined;
        window.__motionProbe.animations.push({
          element: this.id || this.className || this.tagName,
          frames: Array.isArray(frames) ? frames : [],
          pseudoElement: config?.pseudoElement ?? undefined,
          duration:
            typeof config?.duration === "number"
              ? config.duration
              : config?.duration
                ? String(config.duration)
                : undefined,
        });
        return animate.call(this, frames, options);
      };
      if (unsupported) {
        Object.defineProperty(document, "startViewTransition", {
          value: undefined,
        });
      } else if (document.startViewTransition) {
        const start = document.startViewTransition.bind(document);
        document.startViewTransition = function (update) {
          window.__motionProbe.viewTransitions += 1;
          return start(update);
        };
      }
      localStorage.setItem("miro-theme", "dark");
    },
    { unsupported },
  );
}

async function applySettings(page: Page, settings: AnimationSettings) {
  await page.evaluate((detail) => {
    window.dispatchEvent(
      new CustomEvent("miro-animation-settings-change", { detail }),
    );
  }, settings);
  await expect(page.locator("html")).toHaveAttribute(
    "data-motion-enabled",
    String(settings.enabled),
  );
}

async function settledTheme(page: Page, theme: string) {
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-motion-theme-transition",
    "true",
  );
  await expect(page.locator(`[data-theme-option="${theme}"]`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

for (const { width, locale } of [
  { width: 1280, locale: "en" },
  { width: 768, locale: "en" },
  { width: 390, locale: "en" },
  { width: 390, locale: "he" },
]) {
  test(`theme reveal follows the actual ${locale} button at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await observeMotion(page);
    await gotoReady(page, `/${locale}`);
    const button = page.locator('[data-theme-option="light"]');
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    await button.click();
    await settledTheme(page, "light");
    const reveal = await page.evaluate(() => {
      const root = document.documentElement;
      return {
        x: parseFloat(root.style.getPropertyValue("--motion-theme-origin-x")),
        y: parseFloat(root.style.getPropertyValue("--motion-theme-origin-y")),
        probe: window.__motionProbe,
      };
    });
    expect(reveal.x).toBeCloseTo(box!.x + box!.width / 2, 0);
    expect(reveal.y).toBeCloseTo(box!.y + box!.height / 2, 0);
    expect(reveal.probe.viewTransitions).toBeGreaterThan(0);
    const radial = reveal.probe.animations.find(
      (animation) => animation.pseudoElement === "::view-transition-new(root)",
    );
    expect(radial?.duration).toBe(DEFAULT_ANIMATION_SETTINGS.durations.theme);
    expect(radial?.frames[0].clipPath).toContain(
      `at ${reveal.x}px ${reveal.y}px`,
    );
    expect(radial?.frames[1].clipPath).toMatch(/^circle\([\d.]+px at /);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("rapid theme changes settle on the last selection and every mode persists", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await observeMotion(page);
  await gotoReady(page, "/en");
  await page.evaluate(() => {
    for (const theme of ["light", "medium", "dark", "light"]) {
      document
        .querySelector<HTMLButtonElement>(`[data-theme-option="${theme}"]`)!
        .click();
    }
  });
  await settledTheme(page, "light");
  // Stop the initialization probe from overwriting storage on future reloads.
  await page.evaluate(() => localStorage.setItem("miro-theme", "light"));
  for (const theme of ["medium", "dark", "light"]) {
    await page.locator(`[data-theme-option="${theme}"]`).click();
    await settledTheme(page, theme);
    expect(await page.evaluate(() => localStorage.getItem("miro-theme"))).toBe(
      theme,
    );
    const persisted = await page.context().newPage();
    // Initialization scripts intentionally seed only the instrumented page.
    await persisted.goto("/en/contact");
    await expect(persisted.locator("html")).toHaveAttribute(
      "data-theme",
      theme,
    );
    await persisted.reload();
    await expect(persisted.locator("html")).toHaveAttribute(
      "data-theme",
      theme,
    );
    await persisted.close();
  }
});

test("browsers without View Transitions still switch and persist themes", async ({
  page,
}) => {
  await observeMotion(page, true);
  await gotoReady(page, "/en/contact");
  await page.locator('[data-theme-option="medium"]').click();
  await settledTheme(page, "medium");
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-motion-theme-fallback",
    "true",
  );
  expect(await page.evaluate(() => window.__motionProbe.viewTransitions)).toBe(
    0,
  );
  expect(await page.evaluate(() => localStorage.getItem("miro-theme"))).toBe(
    "medium",
  );
});

test("reduced motion switches immediately and keeps navigation feedback functional", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await observeMotion(page);
  await gotoReady(page, "/en/contact");
  await page.locator('[data-theme-option="light"]').click();
  await settledTheme(page, "light");
  expect(await page.evaluate(() => window.__motionProbe.viewTransitions)).toBe(
    0,
  );
  expect(
    await page.evaluate(() => window.__motionProbe.animations.length),
  ).toBe(0);
  await page
    .locator('a[href="/en/services"]')
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/en\/services$/);
  await expect(page.locator(".motion-navigation-progress")).toHaveAttribute(
    "data-state",
    "idle",
  );
  expect(
    await page.evaluate(() => window.__motionProbe.animations.length),
  ).toBe(0);
});

test("all saved feature switches apply live and disabling motion preserves interactions", async ({
  page,
}) => {
  await observeMotion(page);
  await gotoReady(page, "/en/contact");
  const settings = structuredClone(DEFAULT_ANIMATION_SETTINGS);
  for (const feature of ANIMATION_FEATURES)
    settings.features[feature.key] = false;
  settings.durations.theme = 300;
  await applySettings(page, settings);
  for (const feature of ANIMATION_FEATURES) {
    const kebab = feature.key.replace(
      /[A-Z]/g,
      (letter) => `-${letter.toLowerCase()}`,
    );
    await expect(page.locator("html")).toHaveAttribute(
      `data-motion-${kebab}`,
      "false",
    );
  }
  expect(
    await page.evaluate(() =>
      document.documentElement.style.getPropertyValue(
        "--motion-theme-duration",
      ),
    ),
  ).toBe("300ms");
  await page.locator('[data-theme-option="medium"]').click();
  await settledTheme(page, "medium");
  expect(
    await page.evaluate(() => window.__motionProbe.animations.length),
  ).toBe(0);
  const immediate = await page
    .locator('.premium-desktop-nav a[href="/en/services"]')
    .evaluate((link) => {
      (link as HTMLAnchorElement).click();
      return document.querySelector<HTMLElement>(".motion-navigation-progress")!
        .dataset.state;
    });
  expect(immediate).toBe("idle");
  await expect(page).toHaveURL(/\/en\/services$/);
  settings.enabled = false;
  for (const feature of ANIMATION_FEATURES)
    settings.features[feature.key] = true;
  await applySettings(page, settings);
  await page.locator('[data-theme-option="dark"]').click();
  await settledTheme(page, "dark");
  expect(await page.evaluate(() => window.__motionProbe.viewTransitions)).toBe(
    0,
  );
});

test("navigation beam responds immediately and waits for dynamic loading to finish", async ({
  page,
}) => {
  await gotoReady(page, "/en/contact");
  await page.evaluate(() => {
    const marker = document.createElement("span");
    marker.id = "test-pending-region";
    marker.dataset.routeLoading = "true";
    document.body.append(marker);
  });
  const immediate = await page
    .locator('.premium-desktop-nav a[href="/en/services"]')
    .evaluate((link) => {
      (link as HTMLAnchorElement).click();
      return document.querySelector<HTMLElement>(".motion-navigation-progress")!
        .dataset.state;
    });
  expect(immediate).toBe("loading");
  await expect(page).toHaveURL(/\/en\/services$/);
  const beam = page.locator(".motion-navigation-progress");
  await expect(beam).toHaveAttribute("data-state", "loading");
  await applySettings(page, structuredClone(DEFAULT_ANIMATION_SETTINGS));
  await applySettings(page, {
    ...structuredClone(DEFAULT_ANIMATION_SETTINGS),
    features: { ...DEFAULT_ANIMATION_SETTINGS.features, menus: false },
  });
  await expect(page.locator("html")).toHaveAttribute(
    "data-motion-menus",
    "false",
  );
  await expect(beam).toHaveAttribute("data-state", "loading");
  await page.evaluate(() => {
    document.getElementById("test-pending-region")!.remove();
    // Notify the routed-region observer after an independently loading region settles.
    document
      .getElementById("main-content")!
      .append(document.createComment("region-ready"));
  });
  await expect(beam).toHaveAttribute("data-state", "idle");
});

test("navigation cancellation, failure, same-route links and browser history settle", async ({
  page,
}) => {
  await gotoReady(page, "/en/contact");
  const beam = page.locator(".motion-navigation-progress");
  await page.evaluate(async () => {
    const cancelled = document.createElement("a");
    cancelled.href = "/en/services";
    cancelled.addEventListener("click", (event) => event.preventDefault());
    document.body.append(cancelled);
    cancelled.click();
    await Promise.resolve();
    cancelled.remove();
  });
  await expect(beam).toHaveAttribute("data-state", "idle");
  await expect(page).toHaveURL(/\/en\/contact$/);
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("miro-navigation-start", {
        detail: { href: "/en/services" },
      }),
    ),
  );
  await expect(beam).toHaveAttribute("data-state", "loading");
  await page.evaluate(() =>
    window.dispatchEvent(new Event("miro-navigation-end")),
  );
  await expect(beam).toHaveAttribute("data-state", "idle");
  await page
    .locator('a[href="/en/services"]')
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/en\/services$/);
  await expect(beam).toHaveAttribute("data-state", "idle");
  await page
    .locator('a[href="/en/services"]')
    .filter({ visible: true })
    .first()
    .click();
  await expect(beam).toHaveAttribute("data-state", "idle");
  await page.goBack();
  await expect(page).toHaveURL(/\/en\/contact$/);
  await expect(beam).toHaveAttribute("data-state", "idle");
  await page.goForward();
  await expect(page).toHaveURL(/\/en\/services$/);
  await expect(beam).toHaveAttribute("data-state", "idle");
});

test("stalled navigation cancels its beam and leaves the current page usable", async ({
  page,
}) => {
  await gotoReady(page, "/en/contact");
  await page.clock.install();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("miro-navigation-start", {
        detail: { href: "/en/services" },
      }),
    ),
  );
  const beam = page.locator(".motion-navigation-progress");
  await expect(beam).toHaveAttribute("data-state", "loading");
  await page.clock.fastForward(21_000);
  await expect(beam).toHaveAttribute("data-state", "idle");
  await expect(page).toHaveURL(/\/en\/contact$/);
  await expect(page.locator("h1")).toBeVisible();
});

test("rapidly superseded navigation settles when the final destination is the current page", async ({
  page,
}) => {
  await gotoReady(page, "/en/contact");
  await page.evaluate(() => {
    for (const href of ["/en/services", "/en/about", "/en/contact"]) {
      document
        .querySelector<HTMLAnchorElement>(
          `.premium-desktop-nav a[href="${href}"]`,
        )!
        .click();
    }
  });
  await expect(page).toHaveURL(/\/en\/contact$/);
  await expect(page.locator(".motion-navigation-progress")).toHaveAttribute(
    "data-state",
    "idle",
  );
  await expect(page.locator("h1")).toBeVisible();
});

test("hash-only browser history does not start a page navigation beam", async ({
  page,
}) => {
  await gotoReady(page, "/en/contact");
  await page.evaluate(() => history.pushState(null, "", "#main-content"));
  await page.goBack();
  await expect(page).toHaveURL(/\/en\/contact$/);
  await expect(page.locator(".motion-navigation-progress")).toHaveAttribute(
    "data-state",
    "idle",
  );
});

test("slow category navigation exposes a structured route skeleton and settles", async ({
  page,
}) => {
  test.setTimeout(60_000);
  // Exercise an accepted navigation, not an already-prefetched full-page payload.
  // A partial full-page cache entry is not a server loading-boundary response.
  await page.route("**/en/store/cameras?*", async (route) => {
    if (route.request().headers()["next-router-prefetch"] === "1")
      return route.abort();
    return route.continue();
  });
  await page.addInitScript(() => {
    const fetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await fetch(...args);
      const input = args[0];
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
        location.href,
      );
      if (
        url.pathname !== "/en/store/cameras" ||
        !response.headers.get("content-type")?.includes("text/x-component")
      )
        return response;
      const body = await response.text();
      // Preserve the real route/skeleton records, delaying only the final page
      // record. Delaying the entire HTTP response would conceal streaming UI.
      const pageRecord = body
        .split("\n")
        .find(
          (line) =>
            /^[\da-f]+:\[/.test(line) &&
            line.includes('"className":"sf-storefront","children"'),
        );
      if (!pageRecord)
        return new Response(body, {
          status: response.status,
          headers: response.headers,
        });
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            // Flight records may arrive in any order. Deliver all module/loading
            // dependencies even if the optimized build emitted them after the page.
            controller.enqueue(
              encoder.encode(body.replace(`${pageRecord}\n`, "")),
            );
            window.__slowCategoryHeld = true;
            window.__releaseSlowCategory = () => {
              controller.enqueue(encoder.encode(`${pageRecord}\n`));
              controller.close();
              window.__slowCategoryHeld = false;
            };
          },
        }),
        { status: response.status, headers: response.headers },
      );
    };
  });
  await gotoReady(page, "/en");
  const link = page
    .locator('a[href="/en/store/cameras"]')
    .filter({ visible: true })
    .first();
  await expect(link).toBeVisible();
  await link.click();
  await expect
    .poll(() => page.evaluate(() => window.__slowCategoryHeld))
    .toBe(true);

  await expect(page.locator(".motion-navigation-progress")).toHaveAttribute(
    "data-state",
    "loading",
  );
  await expect(
    page.locator('[data-route-loading="true"]').first(),
  ).toBeVisible();
  await page.evaluate(() => window.__releaseSlowCategory?.());
  await expect(page).toHaveURL(/\/en\/store\/cameras$/);
  await expect(page.locator('[data-route-loading="true"]')).toHaveCount(0);
  await expect(page.locator(".motion-navigation-progress")).toHaveAttribute(
    "data-state",
    "idle",
  );
  await expect(page.locator("h1")).toContainText(/Cameras/i);
});

test("GET search receives immediate navigation feedback for its query", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await gotoReady(page, "/en");
  const search = page.locator(".premium-header-search");
  await search.locator('input[name="q"]').fill("camera");
  const immediate = await search.evaluate(async (form) => {
    (form as HTMLFormElement).requestSubmit();
    await Promise.resolve();
    return document.querySelector<HTMLElement>(".motion-navigation-progress")!
      .dataset.state;
  });
  expect(immediate).toBe("loading");
  await expect(page).toHaveURL(/\/en\?q=camera#store-items$/);
  await expect(page.locator(".motion-navigation-progress")).toHaveAttribute(
    "data-state",
    "idle",
  );
  await expect(page.locator("h1")).toBeVisible();
});
