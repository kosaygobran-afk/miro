import {
  expect,
  test,
  type Browser,
  type CDPSession,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  DEFAULT_ANIMATION_SETTINGS,
  type AnimationSettings,
} from "../src/lib/animation-settings";

type CardKind = "grid" | "rail";
type Point = { x: number; y: number };
const gesturePages = new WeakSet<Page>();

function productCard(page: Page, kind: CardKind) {
  return kind === "grid"
    ? page.locator(".sf-product-card").first()
    : page
        .locator(
          '.sf-moving-rail-segment:not([aria-hidden="true"]) .sf-moving-rail-card-shell',
        )
        .first();
}

async function ready(
  page: Page,
  locale: "en" | "he",
  style: AnimationSettings["productPreviewStyle"] = "3d-pop-up-smooth",
) {
  await page.goto(`/${locale}`);
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
    { ...DEFAULT_ANIMATION_SETTINGS, productPreviewStyle: style },
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-product-preview-style",
    style,
  );
}

async function pointOn(target: Locator): Promise<Point> {
  await target.scrollIntoViewIfNeeded();
  if (gesturePages.has(target.page())) {
    // Let the scroll event from bringing the source into view settle before
    // starting a gesture whose contract deliberately cancels on scrolling.
    await target.page().clock.runFor(50);
  }
  // Scrolling a taller card schedules portal remeasurement on the next frame.
  // Require the actual target to become hit-tested after that scroll settles.
  await expect
    .poll(() =>
      target.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        );
        return hit !== null && element.contains(hit);
      }),
    )
    .toBe(true);
  const box = (await target.boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  return point;
}

async function touch(
  session: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel",
  points: Point[],
) {
  await session.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map((point, index) => ({ ...point, id: index + 1 })),
  });
}

async function touchPage(browser: Browser, locale: "en" | "he", width: number) {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    ignoreHTTPSErrors: test.info().project.use.ignoreHTTPSErrors,
    hasTouch: true,
    isMobile: true,
    viewport: { width, height: width < 500 ? 900 : 1180 },
  });
  const page = await context.newPage();
  await ready(page, locale);
  // Pause after hydration so the 499/500ms boundary is measured exactly.
  await page.clock.install({ time: new Date("2026-10-11T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-11T00:01:00Z"));
  gesturePages.add(page);
  const session = await context.newCDPSession(page);
  return { context, page, session };
}

for (const locale of ["en", "he"] as const) {
  test(`${locale}: grid and rail have four distinct sections and subtle dividers`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await ready(page, locale);
    for (const kind of ["grid", "rail"] as const) {
      const card = productCard(page, kind);
      const sections = card.locator("[data-product-section]");
      await expect(sections).toHaveCount(4);
      expect(
        await sections.evaluateAll((elements) =>
          elements.map((element) =>
            element.getAttribute("data-product-section"),
          ),
        ),
      ).toEqual(["image", "details", "pricing", "actions"]);
      const source = card.locator('[data-preview-source="true"]');
      await expect(source).toHaveCount(1);
      await expect(
        source.locator('[data-product-section="actions"]'),
      ).toHaveCount(0);
      expect(
        await sections.evaluateAll((elements) =>
          elements.slice(1).every((element, index) => {
            const previous = elements[index];
            return (
              parseFloat(getComputedStyle(element).borderTopWidth) > 0 ||
              parseFloat(getComputedStyle(previous).borderBottomWidth) > 0
            );
          }),
        ),
      ).toBe(true);
    }
  });
}

for (const kind of ["grid", "rail"] as const) {
  test(`${kind}: hover opens only image, details and pricing sections`, async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Touch uses hold or the explicit preview button");
    await page.setViewportSize({ width: 1440, height: 1100 });
    await ready(page, "en");
    const card = productCard(page, kind);
    for (const section of ["image", "details", "pricing"] as const) {
      await card.locator(`[data-product-section="${section}"]`).hover();
      await expect(
        page.locator('.sf-hover-preview[data-state="open"]'),
      ).toBeVisible();
      await page.mouse.move(0, 0);
      await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
    }
    await card.locator('[data-product-section="actions"]').hover();
    await page.waitForTimeout(400);
    await expect(card).not.toHaveAttribute("data-preview-intent", "true");
    await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
  });

  test(`${kind}: bottom actions stay hit-tested and clickable when the popup is open`, async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Desktop verifies physical hover-to-footer travel");
    await page.setViewportSize({ width: 1440, height: 1100 });
    for (const style of [
      "soft-reveal",
      "3d-pop-up",
      "3d-pop-up-smooth",
    ] as const) {
      await ready(page, "en", style);
      const card = productCard(page, kind);
      const image = card.locator('[data-product-section="image"]');
      await image.scrollIntoViewIfNeeded();
      await image.hover();
      const preview = page.locator('.sf-hover-preview[data-state="open"]');
      await expect(preview).toBeVisible();
      const actions = card.locator('[data-product-section="actions"]');
      const footerTop = (await actions.boundingBox())!.y;
      const animationBounds = await preview.evaluate((element) => {
        const animation = element.getAnimations()[0];
        const duration = Number(animation.effect!.getTiming().duration);
        animation.pause();
        return [0, duration / 2, duration].map((time) => {
          animation.currentTime = time;
          return { time, bottom: element.getBoundingClientRect().bottom };
        });
      });
      for (const frame of animationBounds) {
        expect(
          frame.bottom,
          `${kind} ${style} at ${frame.time}ms covers the original actions`,
        ).toBeLessThanOrEqual(footerTop + 0.5);
      }
      const link = actions.locator("a").first();
      const destination = new URL(
        (await link.getAttribute("href"))!,
        page.url(),
      ).href;
      await pointOn(link);
      // Actual activation also verifies that the portal cannot steal the click.
      await link.click();
      await expect(page).toHaveURL(destination);
      // A streamed route can commit its URL before the detail page mounts.
      await expect(
        page.locator(".sf-product-detail #product-title"),
      ).toBeVisible();
      await expect(page.locator('[data-route-loading="true"]')).toHaveCount(0);
    }
  });
}

test("a 320×240 fine-pointer viewport keeps compact details, close and original actions usable", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "This compact layout exercises fine-pointer hover");
  await page.setViewportSize({ width: 320, height: 240 });
  await ready(page, "en");
  const card = productCard(page, "grid");
  // Place the real card's footer near the top to reproduce the tightest room
  // without depending on the catalog's changing height or surrounding content.
  await card.evaluate((element) => {
    const cardElement = element as HTMLElement;
    Object.assign(cardElement.style, {
      position: "fixed",
      left: "16px",
      top: "0px",
      width: "288px",
      zIndex: "999",
      transform: "none",
    });
    const actions = cardElement.querySelector(
      '[data-product-section="actions"]',
    )!;
    cardElement.style.top = `${100 - actions.getBoundingClientRect().top}px`;
  });
  const actions = card.locator('[data-product-section="actions"]');
  await expect
    .poll(async () => (await actions.boundingBox())!.y)
    .toBeCloseTo(100, 0);
  const pricing = card.locator('[data-product-section="pricing"]');
  const box = (await pricing.boundingBox())!;
  const hoverPoint = {
    x: box.x + box.width / 2,
    y: Math.max(24, Math.min(76, box.y + box.height - 16)),
  };
  expect(
    await pricing.evaluate((element, point) => {
      const hit = document.elementFromPoint(point.x, point.y);
      return hit !== null && element.contains(hit);
    }, hoverPoint),
  ).toBe(true);
  await page.mouse.move(hoverPoint.x, hoverPoint.y);
  const preview = page.locator('.sf-hover-preview[data-state="open"]');
  await expect(preview).toHaveAttribute("data-compact-source-preview", "true");
  await expect(preview).toHaveAttribute("data-minimal-source-preview", "true");
  await page.waitForTimeout(400);
  const details = preview.getByRole("region", { name: "Product details" });
  await expect(details).toBeVisible();
  expect((await details.boundingBox())!.height).toBeGreaterThan(20);
  await details.focus();
  await details.press("End");
  await expect
    .poll(() => details.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await pointOn(actions.locator("a").first());
  const close = preview.locator(".sf-hover-preview-close");
  await pointOn(close);
  await close.click();
  await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
});

for (const { name, width, locale, kind } of [
  { name: "phone grid", width: 390, locale: "en", kind: "grid" },
  { name: "tablet grid", width: 820, locale: "he", kind: "grid" },
  { name: "phone rail", width: 390, locale: "en", kind: "rail" },
] as const) {
  test(`${name}: a native 500ms hold previews with feedback and release does not navigate`, async ({
    browser,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Native held touch uses Chromium CDP",
    );
    const { context, page, session } = await touchPage(browser, locale, width);
    try {
      const card = productCard(page, kind);
      const source = card.locator('[data-preview-source="true"]');
      const point = await pointOn(
        card.locator('[data-product-section="image"]'),
      );
      const originalUrl = page.url();
      await touch(session, "touchStart", [point]);
      await expect(card).toHaveAttribute("data-preview-pressing", "true");
      await expect
        .poll(() =>
          source.evaluate((element) => getComputedStyle(element).transform),
        )
        .not.toBe("none");
      await page.clock.fastForward(499);
      await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
      await page.clock.fastForward(1);
      await page.clock.runFor(20);
      await expect(
        page.locator('.sf-hover-preview[data-state="open"]'),
      ).toBeVisible();
      await touch(session, "touchEnd", []);
      await page.clock.runFor(400);
      await expect(page).toHaveURL(originalUrl);
      await expect(
        page.locator('.sf-hover-preview[data-state="open"]'),
      ).toBeVisible();
      await expect(card).not.toHaveAttribute("data-preview-pressing", "true");
    } finally {
      await context.close();
    }
  });
}

test("a native short tap keeps normal product navigation", async ({
  browser,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Native touch sequence uses Chromium CDP",
  );
  const { context, page, session } = await touchPage(browser, "en", 390);
  try {
    const media = productCard(page, "grid").locator(".sf-product-media");
    const destination = new URL((await media.getAttribute("href"))!, page.url())
      .href;
    const point = await pointOn(media);
    await touch(session, "touchStart", [point]);
    await page.clock.fastForward(100);
    await touch(session, "touchEnd", []);
    await expect(page).toHaveURL(destination);
    await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

for (const cancellation of [
  "movement",
  "scroll",
  "pointer cancellation",
  "multitouch",
] as const) {
  test(`${cancellation} cancels native touch hold without opening a popup`, async ({
    browser,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Native cancellation and contacts use Chromium CDP",
    );
    const { context, page, session } = await touchPage(browser, "en", 390);
    try {
      const card = productCard(page, "grid");
      const point = await pointOn(
        card.locator('[data-product-section="image"]'),
      );
      const originalUrl = page.url();
      await touch(session, "touchStart", [point]);
      await expect(card).toHaveAttribute("data-preview-pressing", "true");
      await page.clock.fastForward(200);
      if (cancellation === "movement") {
        await touch(session, "touchMove", [{ x: point.x + 30, y: point.y }]);
      } else if (cancellation === "scroll") {
        await page.evaluate(() => window.scrollBy(0, 80));
      } else if (cancellation === "pointer cancellation") {
        await touch(session, "touchCancel", []);
      } else {
        await touch(session, "touchStart", [
          point,
          { x: point.x + 25, y: point.y + 25 },
        ]);
      }
      await page.clock.runFor(700);
      await expect(card).not.toHaveAttribute("data-preview-pressing", "true");
      await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
      if (cancellation !== "pointer cancellation") {
        await touch(session, "touchCancel", []);
      }
      await expect(page).toHaveURL(originalUrl);
    } finally {
      await context.close();
    }
  });
}

test("holding bottom actions never starts preview and release still activates their link", async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Native held touch uses Chromium CDP");
  const { context, page, session } = await touchPage(browser, "en", 390);
  try {
    const card = productCard(page, "grid");
    const link = card.locator('[data-product-section="actions"] a').first();
    const destination = new URL((await link.getAttribute("href"))!, page.url())
      .href;
    const point = await pointOn(link);
    await touch(session, "touchStart", [point]);
    await page.clock.runFor(700);
    await expect(card).not.toHaveAttribute("data-preview-pressing", "true");
    await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
    await touch(session, "touchEnd", []);
    await expect(page).toHaveURL(destination);
  } finally {
    await context.close();
  }
});

test("pen pointer hold uses the same 500ms preview feedback", async ({
  browser,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "The tablet fixture runs alongside native touch coverage",
  );
  const { context, page, session } = await touchPage(browser, "he", 820);
  try {
    const card = productCard(page, "grid");
    const source = card.locator('[data-preview-source="true"]');
    const point = await pointOn(card.locator('[data-product-section="image"]'));
    // Chromium's protocol provides a genuine pen pointer even though the
    // higher-level Playwright mouse/touch APIs cannot specify pointerType.
    await session.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      pointerType: "pen",
      button: "left",
      buttons: 1,
      clickCount: 1,
      ...point,
    });
    await expect(card).toHaveAttribute("data-preview-pressing", "true");
    await expect
      .poll(() =>
        source.evaluate((element) => getComputedStyle(element).transform),
      )
      .not.toBe("none");
    await page.clock.fastForward(499);
    await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
    await page.clock.fastForward(1);
    await page.clock.runFor(20);
    await expect(
      page.locator('.sf-hover-preview[data-state="open"]'),
    ).toBeVisible();
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      pointerType: "pen",
      button: "left",
      buttons: 0,
      clickCount: 1,
      ...point,
    });
    await expect(card).not.toHaveAttribute("data-preview-pressing", "true");
  } finally {
    await context.close();
  }
});
