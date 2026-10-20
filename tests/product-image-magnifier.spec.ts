import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { DEFAULT_ANIMATION_SETTINGS } from "../src/lib/animation-settings";

const imageFixture = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="#fafafa"/><rect x="100" y="100" width="600" height="400" rx="50" fill="#30343a"/><circle cx="400" cy="300" r="140" fill="#e5bd46"/><path d="M0 300h800M400 0v600" stroke="#fff" stroke-width="8"/></svg>`;

async function openPreview(page: Page, locale: "he" | "en") {
  await page.route("**/api/track", (route) => route.fulfill({ status: 204 }));
  // Deterministic browser-only image bytes. Owner catalog rows remain untouched.
  await page.route("**/_next/image?**", (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: imageFixture }),
  );
  await page.goto(`/${locale}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );
  await page.evaluate(
    (detail) => {
      window.dispatchEvent(
        new CustomEvent("miro-animation-settings-change", { detail }),
      );
    },
    { ...DEFAULT_ANIMATION_SETTINGS, appearanceVersion: "2", enabled: false },
  );
  const trigger = page.locator(".sf-product-quick-preview").first();
  await trigger.click();
  const popup = page.locator('.sf-hover-preview[data-state="open"]');
  await expect(popup.locator(".sf-image-magnifier-toggle")).toBeVisible();
  return { popup, trigger };
}

async function openDetail(page: Page, locale: "he" | "en") {
  const { popup } = await openPreview(page, locale);
  const href = await popup
    .locator(".sf-hover-preview-link")
    .getAttribute("href");
  await page.goto(href!, { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );
  await page.evaluate(
    (detail) =>
      window.dispatchEvent(
        new CustomEvent("miro-animation-settings-change", { detail }),
      ),
    {
      ...DEFAULT_ANIMATION_SETTINGS,
      appearanceVersion: "2",
      enabled: false,
    },
  );
  await expect(page.locator('[data-route-loading="true"]')).toHaveCount(0);
  // Next may briefly keep a hidden streaming copy outside the live main region.
  const gallery = page.locator("#main-content .sf-product-gallery");
  await expect(gallery.locator(".sf-image-magnifier-toggle")).toBeVisible();
  return gallery;
}

for (const locale of ["en", "he"] as const) {
  for (const width of [1440, 390, 320]) {
    test(`${locale}: product-page photos share the adjustable magnifier at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      const gallery = await openDetail(page, locale);
      const toggle = gallery.locator(".sf-image-magnifier-toggle");
      const stage = gallery.locator(".sf-hover-preview-image-stage");
      const counter = gallery.locator(".sf-gallery-position");
      for (const theme of ["dark", "medium", "light"]) {
        await page.evaluate(
          (theme) => (document.documentElement.dataset.theme = theme),
          theme,
        );
        await toggle.focus();
        await page.keyboard.press("Enter");
        await expect(stage).toBeFocused();
        await expect(toggle).toHaveAttribute("aria-pressed", "true");
        const slider = gallery.getByRole("slider");
        await slider.focus();
        await page.keyboard.press("End");
        await expect(slider).toHaveValue("5");
        const geometry = await gallery.evaluate((el) => {
          const controls = el
            .querySelector(".sf-hover-preview-image-tools")!
            .getBoundingClientRect();
          const counter = el
            .querySelector(".sf-gallery-position")!
            .getBoundingClientRect();
          const toggle = el
            .querySelector(".sf-image-magnifier-toggle")!
            .getBoundingClientRect();
          const stage = el
            .querySelector(".sf-hover-preview-image-stage")!
            .getBoundingClientRect();
          const lens = el
            .querySelector(".sf-image-magnifier-lens")!
            .getBoundingClientRect();
          const gallery = el.getBoundingClientRect();
          const main = el
            .querySelector(".sf-main-image")!
            .getBoundingClientRect();
          const info = el
            .parentElement!.querySelector(".sf-product-info")!
            .getBoundingClientRect();
          const image = el.querySelector<HTMLImageElement>(
            ".sf-product-main-image",
          )!;
          const imageBox = image.getBoundingClientRect();
          return {
            centered:
              Math.abs(
                counter.left + counter.right - controls.left - controls.right,
              ) < 2,
            left: toggle.left < counter.left,
            bounded:
              lens.left >= stage.left &&
              lens.right <= stage.right &&
              lens.top >= stage.top &&
              lens.bottom <= stage.bottom,
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            balanced:
              innerWidth <= 1100 ||
              (Math.abs(gallery.width - info.width) < 2 &&
                Math.abs(gallery.height - info.height) < 2),
            fullWidthMobile:
              innerWidth > 600 || Math.abs(main.width - gallery.width) < 2,
            renderedImage:
              image.naturalWidth > 0 &&
              imageBox.width > 50 &&
              imageBox.height > 50,
          };
        });
        expect(geometry).toEqual({
          centered: true,
          left: true,
          bounded: true,
          overflow: false,
          balanced: true,
          fullWidthMobile: true,
          renderedImage: true,
        });
        await page.keyboard.press("Escape");
        await expect(toggle).toBeFocused();
        await expect(toggle).toHaveAttribute("aria-pressed", "false");
      }
      const count = await counter.textContent();
      const next = gallery.locator(".sf-gallery-arrow-next");
      if (await next.count()) {
        await toggle.click();
        await next.click();
        await expect(counter).not.toHaveText(count!);
        await expect(toggle).toHaveAttribute("aria-pressed", "false");
        await toggle.click();
        await expect(gallery.getByRole("slider")).toHaveValue("2");
        await page.keyboard.press("Escape");
      }
      if (width === 390) {
        await expect(toggle).toHaveAttribute("aria-pressed", "false");
        await toggle.click();
        const accessibility = await new AxeBuilder({ page })
          .include("#main-content .sf-product-gallery")
          .analyze();
        expect(accessibility.violations).toEqual([]);
        await page.keyboard.press("Escape");
      }
      await page.evaluate(
        (detail) =>
          window.dispatchEvent(
            new CustomEvent("miro-animation-settings-change", { detail }),
          ),
        {
          ...DEFAULT_ANIMATION_SETTINGS,
          appearanceVersion: "1",
          enabled: false,
        },
      );
      await expect(gallery.locator(".sf-detail-magnifier")).toHaveCount(0);
      await expect(gallery.locator(".sf-product-main-image")).toBeVisible();
    });
  }
}

test("a product-page magnifier yields Escape to an account overlay outside its controls", async ({
  page,
}) => {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        authenticated: true,
        role: "customer",
        name: "Synthetic session",
      },
    }),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  const gallery = await openDetail(page, "en");
  const toggle = gallery.locator(".sf-image-magnifier-toggle");
  await toggle.click();
  await page
    .locator(".premium-header-actions .premium-account-trigger")
    .click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await gallery.locator(".sf-hover-preview-image-stage").focus();
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});

test("a single-image product has magnification", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.route("**/api/track", (route) => route.fulfill({ status: 204 }));
  await page.route("**/_next/image?**", (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: imageFixture }),
  );
  await page.goto("/en/store/accessories/5586793", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator('[data-route-loading="true"]')).toHaveCount(0);
  const gallery = page.locator("#main-content .sf-product-gallery");
  await expect(gallery.locator(".sf-image-magnifier-toggle")).toBeVisible();
  await expect(gallery.locator(".sf-thumbnail")).toHaveCount(0);
  await expect(gallery.locator(".sf-gallery-position")).toHaveText("1/1");
  const widths = await gallery.evaluate((el) => ({
    gallery: el.getBoundingClientRect().width,
    main: el.querySelector(".sf-main-image")!.getBoundingClientRect().width,
    image: el.querySelector(".sf-product-main-image")!.getBoundingClientRect()
      .width,
  }));
  expect(widths.main).toBeCloseTo(widths.gallery, 0);
  expect(widths.image).toBeGreaterThan(100);
  await gallery.locator(".sf-image-magnifier-toggle").click();
  await expect(gallery.locator(".sf-image-magnifier-lens")).toBeVisible();
});

test("failed detail media has no active magnifier", async ({ page }) => {
  await page.route("**/api/track", (route) => route.fulfill({ status: 204 }));
  let failedRequests = 0;
  // A fresh browser context avoids WebKit reusing the successful image on reload.
  await page.route("**/_next/image?**", (route) => {
    failedRequests += 1;
    return route.abort();
  });
  await page.goto("/en/store/accessories/5586793", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator('[data-route-loading="true"]')).toHaveCount(0);
  const gallery = page.locator("#main-content .sf-product-gallery");
  await expect(gallery.locator(".sf-product-visual-placeholder")).toBeVisible({
    timeout: 12_000,
  });
  expect(failedRequests).toBeGreaterThan(0);
  await expect(gallery.locator(".sf-image-magnifier-toggle")).toHaveCount(0);
});

for (const locale of ["en", "he"] as const) {
  for (const width of [1440, 390, 320]) {
    test(`${locale}: aligned metadata and keyboard magnifier at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const { popup, trigger } = await openPreview(page, locale);
      const stage = popup.locator(".sf-hover-preview-image-stage");
      const toggle = popup.locator(".sf-image-magnifier-toggle");
      for (const theme of ["dark", "medium", "light"]) {
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        const geometry = await popup.evaluate((element) => {
          const stage = element
            .querySelector(".sf-hover-preview-image-stage")!
            .getBoundingClientRect();
          const counter = element
            .querySelector(".sf-hover-preview-count")!
            .getBoundingClientRect();
          const identifiers = element.querySelector(".product-identifiers")!;
          const tools = element
            .querySelector(".sf-hover-preview-image-tools")!
            .getBoundingClientRect();
          const toggle = element
            .querySelector(".sf-image-magnifier-toggle")!
            .getBoundingClientRect();
          return {
            counterOutside: counter.top >= stage.bottom + 2,
            counterCentered:
              Math.abs(
                counter.left + counter.right - tools.left - tools.right,
              ) < 2,
            magnifierLeft: toggle.left < counter.left,
            aligned: Array.from(identifiers.children).every((row) => {
              const label = row.querySelector("dt")!.getBoundingClientRect();
              const value = row.querySelector("dd")!.getBoundingClientRect();
              return identifiers.clientWidth > 250
                ? Math.abs(label.top - value.top) < 8
                : value.top >= label.bottom;
            }),
            fit: getComputedStyle(
              element.querySelector(".sf-hover-preview-image")!,
            ).objectFit,
            position: getComputedStyle(
              element.querySelector(".sf-hover-preview-image")!,
            ).objectPosition,
          };
        });
        expect(geometry).toEqual({
          counterOutside: true,
          counterCentered: true,
          magnifierLeft: true,
          aligned: true,
          fit: "contain",
          position: "50% 50%",
        });
        await toggle.focus();
        await expect(popup.locator('input[type="range"]')).toHaveCount(0);
        await expect(
          toggle.locator(".sf-image-magnifier-tooltip"),
        ).toBeVisible();
        await page.keyboard.press("Enter");
        await expect(toggle).toHaveAttribute("aria-pressed", "true");
        await expect(stage).toBeFocused();
        await expect(stage.locator(":scope > .sf-product-image-fit")).toHaveCSS(
          "transform",
          "none",
        );
        await expect(stage.locator(".sf-image-magnifier-view")).toHaveCSS(
          "transform",
          "matrix(2, 0, 0, 2, 0, 0)",
        );
        const lens = stage.locator(".sf-image-magnifier-lens");
        await expect(lens).toHaveCSS("border-radius", "50%");
        const bounds = (await lens.boundingBox())!;
        expect(bounds.width).toBeCloseTo(bounds.height, 1);
        expect(bounds.width).toBeGreaterThan(24);
        const counterBefore = await popup
          .locator(".sf-hover-preview-count")
          .textContent();
        await page.keyboard.press("ArrowRight");
        await expect(stage).toHaveCSS("--magnifier-x", "60%");
        await expect(popup.locator(".sf-hover-preview-count")).toHaveText(
          counterBefore!,
        );
        await page.keyboard.press("Home");
        await expect(stage).toHaveCSS("--magnifier-x", "50%");
        await page.keyboard.press("Escape");
        await expect(toggle).toHaveAttribute("aria-pressed", "false");
        await expect(lens).toHaveCount(0);
        await expect(popup.locator(".sf-image-magnifier-power")).toHaveCount(0);
        await expect(toggle).toBeFocused();
        await expect(popup).toBeVisible();
      }
      if (width === 390) {
        const accessibility = await new AxeBuilder({ page })
          .include(".sf-hover-preview")
          .analyze();
        expect(accessibility.violations).toEqual([]);
      }
      await page.keyboard.press("Escape");
      await expect(popup).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  }

  test(`${locale}: pointer zoom resets on image navigation`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const { popup } = await openPreview(page, locale);
    const toggle = popup.locator(".sf-image-magnifier-toggle");
    const stage = popup.locator(".sf-hover-preview-image-stage");
    await toggle.click();
    const slider = popup.getByRole("slider");
    await slider.focus();
    await page.keyboard.press("End");
    await expect(slider).toHaveValue("5");
    const box = (await stage.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.25);
    expect(
      await stage.evaluate((node) =>
        Number.parseFloat(node.style.getPropertyValue("--magnifier-x")),
      ),
    ).toBeCloseTo(75, 0);
    expect(
      await stage.evaluate((node) =>
        Number.parseFloat(node.style.getPropertyValue("--magnifier-y")),
      ),
    ).toBeCloseTo(25, 0);
    const next = popup.locator(".sf-hover-preview-arrow-next");
    expect(await next.count(), "Sample must include multiple images").toBe(1);
    await next.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(stage).not.toHaveAttribute("data-magnified");
    await toggle.click();
    await expect(popup.getByRole("slider")).toHaveValue("2");
    // The same compact icon toggles the magnifier off on its second press.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  });
}

test("the active keyboard magnifier fits its stage after resizing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { popup } = await openPreview(page, "en");
  // Park the pointer before reopening by keyboard: a viewport resize can move
  // the hover-owned popup away from the old cursor and legitimately dismiss it.
  await popup.locator(".sf-hover-preview-close").click();
  await expect(popup).toHaveCount(0);
  await page.mouse.move(0, 0);
  await page.locator(".sf-product-quick-preview").first().focus();
  await page.keyboard.press("Enter");
  await expect(popup.locator(".sf-hover-preview-close")).toBeFocused();
  const toggle = popup.locator(".sf-image-magnifier-toggle");
  await toggle.focus();
  await page.keyboard.press("Enter");
  const slider = popup.getByRole("slider");
  await slider.focus();
  await page.keyboard.press("End");
  await expect(slider).toHaveValue("5");
  // Resume image inspection after choosing the level. Native range editors
  // may blur on viewport resize, whereas the image owns the lens keyboard mode.
  await popup.locator(".sf-hover-preview-image-stage").focus();
  for (const width of [390, 320, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(slider).toHaveValue("5");
    await expect
      .poll(() =>
        popup.locator(".sf-hover-preview-image-stage").evaluate((el) => {
          const bounds = el.getBoundingClientRect();
          const lens = el
            .querySelector(".sf-image-magnifier-lens")!
            .getBoundingClientRect();
          return (
            lens.width > 24 &&
            lens.left >= bounds.left &&
            lens.right <= bounds.right &&
            lens.top >= bounds.top &&
            lens.bottom <= bounds.bottom
          );
        }),
      )
      .toBe(true);
  }
});

test("slider and wheel adjust only the circular lens, with bounded zoom and no gallery navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { popup } = await openPreview(page, "en");
  const toggle = popup.locator(".sf-image-magnifier-toggle");
  const stage = popup.locator(".sf-hover-preview-image-stage");
  const count = popup.locator(".sf-hover-preview-count");
  const countBefore = await count.textContent();
  await toggle.hover();
  await expect(toggle.locator(".sf-image-magnifier-tooltip")).toBeVisible();
  await expect(toggle).toHaveAccessibleName("Magnify image");
  await expect(toggle.locator("svg")).toHaveCount(1);
  await toggle.click();
  const slider = popup.getByRole("slider", { name: "Zoom level" });
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("2.25");
  await expect(slider).toHaveAttribute("aria-valuetext", "2.25×");
  await expect(count).toHaveText(countBefore!);
  await page.keyboard.press("End");
  await expect(slider).toHaveValue("5");
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("5");
  const scrollBefore = await page.evaluate(() => scrollY);
  const box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 100);
  await expect(slider).toHaveValue("4.75");
  expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
  await expect(stage.locator(".sf-image-magnifier-view")).toHaveCSS(
    "transform",
    "matrix(4.75, 0, 0, 4.75, 0, 0)",
  );
  await expect(stage.locator(":scope > .sf-product-image-fit")).toHaveCSS(
    "transform",
    "none",
  );
  await slider.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowLeft");
  await expect(slider).toHaveValue("1.25");
  const modifiedWheel = await stage.evaluate((el) => {
    const event = new WheelEvent("wheel", {
      deltaY: -100,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(modifiedWheel).toBe(false);
  await expect(slider).toHaveValue("1.25");
  const activeAccessibility = await new AxeBuilder({ page })
    .include(".sf-hover-preview")
    .analyze();
  expect(activeAccessibility.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await expect(popup.getByRole("slider")).toHaveCount(0);
  const offWheel = await stage.evaluate((el) => {
    const event = new WheelEvent("wheel", {
      deltaY: -100,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(offWheel).toBe(false);
  await expect(count).toHaveText(countBefore!);
});

test("failed image selection uses the illustration without offering magnification", async ({
  page,
}) => {
  const { popup } = await openPreview(page, "en");
  await page.route("**/_next/image?**", (route) => route.abort());
  await popup.locator(".sf-hover-preview-arrow-next").click();
  await expect(
    popup.locator(".sf-hover-preview-image-stage > .sf-product-visual"),
  ).toBeVisible();
  await expect(popup.locator(".sf-image-magnifier-toggle")).toHaveCount(0);
  await expect(
    popup.locator(".sf-hover-preview-image-stage"),
  ).not.toHaveAttribute("data-magnified");
});

test("touch dragging pans only while magnification is enabled", async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Native touch input uses Chromium CDP");
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const { popup } = await openPreview(page, "en");
  const stage = popup.locator(".sf-hover-preview-image-stage");
  const toggle = popup.locator(".sf-image-magnifier-toggle");
  expect(
    await stage.evaluate((node) => getComputedStyle(node).touchAction),
  ).toBe("auto");
  await toggle.tap();
  await expect(stage).toHaveCSS("touch-action", "none");
  const box = (await stage.boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const before = await page.evaluate(() => scrollY);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x + box.width * 0.25, y: box.y + box.height * 0.5 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: box.x + box.width * 0.75, y: box.y + box.height * 0.75 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect(
    await stage.evaluate((node) =>
      Number.parseFloat(node.style.getPropertyValue("--magnifier-x")),
    ),
  ).toBeCloseTo(75, 0);
  expect(await page.evaluate(() => scrollY)).toBe(before);
  await toggle.tap();
  await expect(stage).toHaveCSS("touch-action", "auto");
  await context.close();
});
