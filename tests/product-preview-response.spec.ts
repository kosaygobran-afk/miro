import { expect, test, type Locator, type Page } from "@playwright/test";
import { DEFAULT_ANIMATION_SETTINGS } from "../src/lib/animation-settings";

async function openStorefront(page: Page, locale: "he" | "en", path = "") {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/${locale}${path}`);
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
    { ...DEFAULT_ANIMATION_SETTINGS, productPreviewStyle: "3d-pop-up-smooth" },
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-product-preview-style",
    "3d-pop-up-smooth",
  );
}

async function hoverCard(page: Page, card: Locator) {
  await card.locator(".sf-product-media").hover();
  const preview = page.locator('.sf-hover-preview[data-state="open"]');
  await expect(preview).toBeVisible();
  // Enter the body portal before leaving: source-to-portal travel must not
  // accidentally turn an ordinary departure into an explicit dismissal.
  await preview.locator(".sf-hover-preview-title").hover();
  // This helper returns the settled popup. Dedicated animation tests inspect
  // intermediate frames; return-path coordinates need the final geometry.
  await preview.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  });
  return preview;
}

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "Touch uses the explicit preview control");
});

for (const locale of ["en", "he"] as const) {
  test(`${locale}: every hover responds after leaving the previous popup`, async ({
    page,
  }) => {
    await openStorefront(page, locale);
    const card = page.locator(".sf-product-card").first();

    for (let attempt = 0; attempt < 3; attempt++) {
      await hoverCard(page, card);
      await page.mouse.move(0, 0);
      await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
    }
  });

  test(`${locale}: a visible moving-rail loop copy responds to hover`, async ({
    page,
  }) => {
    await openStorefront(page, locale, process.env.PRODUCT_PREVIEW_RAIL_PATH);
    const rail = page.locator(".sf-moving-rail-section");
    const railItems = rail.locator(
      '.sf-moving-rail-segment:not([aria-hidden="true"]) .sf-moving-rail-item',
    );
    if (process.env.PRODUCT_PREVIEW_RAIL_PATH) {
      expect(
        await railItems.count(),
        "The explicit QA fixture must supply a loop",
      ).toBeGreaterThanOrEqual(3);
    }
    test.skip(
      (await railItems.count()) < 3,
      "The owner catalog has fewer than three rail products; loop-copy QA requires a three-product fixture",
    );
    const duplicate = rail.locator(
      '.sf-moving-rail-segment[aria-hidden="true"]',
    );
    await expect(duplicate).toHaveCount(1);
    await rail.scrollIntoViewIfNeeded();

    // Freeze and expose the real loop copy without changing React props or
    // sending synthetic pointer events. Geometry works for both reading directions.
    const point = await rail.evaluate((element) => {
      const viewport = element.querySelector<HTMLElement>(
        ".sf-moving-rail-viewport",
      )!;
      const track = element.querySelector<HTMLElement>(
        ".sf-moving-rail-track",
      )!;
      const copy = element.querySelector<HTMLElement>(
        '.sf-moving-rail-segment[aria-hidden="true"] .sf-moving-rail-card',
      )!;
      track.style.animation = "none";
      track.style.transform = "none";
      const viewportBox = viewport.getBoundingClientRect();
      const copyBox = copy.getBoundingClientRect();
      const centerX = viewportBox.left + viewportBox.width / 2;
      const shift = centerX - (copyBox.left + copyBox.width / 2);
      track.style.transform = `translate3d(${shift}px, 0, 0)`;
      const box = copy.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { x, y, hitCopy: hit !== null && copy.contains(hit) };
    });
    expect(point.hitCopy).toBe(true);
    await expect(duplicate.locator("a").first()).toHaveAttribute(
      "tabindex",
      "-1",
    );
    await page.mouse.move(point.x, point.y);
    const preview = page.locator('.sf-hover-preview[data-state="open"]');
    await expect(preview).toBeVisible();
    await expect(rail.locator(".sf-moving-rail-viewport")).toHaveAttribute(
      "data-paused",
      "true",
    );
    await preview.locator(".sf-hover-preview-title").hover();
    await page.mouse.move(0, 0);
    await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
    await page.mouse.move(point.x, point.y);
    await expect(preview).toBeVisible();
  });
}

for (const dismissal of ["Escape", "close button"] as const) {
  test(`explicit ${dismissal} stays closed until a new hover`, async ({
    page,
  }) => {
    await openStorefront(page, "en");
    const card = page.locator(".sf-product-card").first();
    const preview = await hoverCard(page, card);
    const closeBox = (await preview
      .locator(".sf-hover-preview-close")
      .boundingBox())!;
    const closePoint = {
      x: closeBox.x + closeBox.width / 2,
      y: closeBox.y + closeBox.height / 2,
    };
    if (dismissal === "Escape") {
      await page.keyboard.press("Escape");
    } else {
      await preview.locator(".sf-hover-preview-close").click();
    }
    await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
    // Wait beyond the saved hover-intent delay to catch automatic reopening
    // when removing the portal exposes the source under the stationary pointer.
    await page.waitForTimeout(450);
    await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
    if (dismissal === "close button") {
      const neighborName = await page.evaluate((point) => {
        return document
          .elementFromPoint(point.x, point.y)
          ?.closest(".sf-product-card")
          ?.getAttribute("data-product-name");
      }, closePoint);
      if (
        neighborName &&
        neighborName !== (await card.getAttribute("data-product-name"))
      ) {
        await page.mouse.move(closePoint.x + 1, closePoint.y);
        await expect(page.locator(".sf-hover-preview-title")).toHaveText(
          neighborName,
        );
      }
    }
    await page.mouse.move(0, 0);
    await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
    await hoverCard(page, card);
  });
}

test("returning to the exact dismissed pointer position opens the exposed neighbor", async ({
  page,
}) => {
  await openStorefront(page, "en");
  const card = page.locator(".sf-product-card").first();
  const preview = await hoverCard(page, card);
  const closeBox = (await preview
    .locator(".sf-hover-preview-close")
    .boundingBox())!;
  const closePoint = {
    x: closeBox.x + closeBox.width / 2,
    y: closeBox.y + closeBox.height / 2,
  };
  await preview.locator(".sf-hover-preview-close").click();
  await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
  await page.waitForTimeout(450);
  await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
  const neighborName = await page.evaluate((point) => {
    return document
      .elementFromPoint(point.x, point.y)
      ?.closest(".sf-product-card")
      ?.getAttribute("data-product-name");
  }, closePoint);
  test.skip(
    !neighborName ||
      neighborName === (await card.getAttribute("data-product-name")),
    "The popup close position does not expose a neighboring card in this catalog",
  );
  // Real departure outside every product releases stationary dismissal. The
  // same coordinates become fresh intent when the pointer comes back once.
  await page.mouse.move(0, 0);
  await page.mouse.move(closePoint.x, closePoint.y);
  await expect(page.locator(".sf-hover-preview-title")).toHaveText(
    neighborName!,
  );
});

test("pointer travel from the popup to its source preserves the same open dialog", async ({
  page,
}) => {
  await openStorefront(page, "en");
  const card = page.locator(".sf-product-card").first();
  const preview = await hoverCard(page, card);
  const sourceElement = card.locator('[data-preview-source="true"]');
  const source = (await sourceElement.boundingBox())!;
  const popup = (await preview.boundingBox())!;
  // Natural card content can extend below the viewport. Return to its visible
  // edge so this checks pointer intent rather than hit-testing offscreen.
  const viewportHeight = page.viewportSize()!.height;
  const returnPoint = [
    {
      x: source.x + source.width / 2,
      y: Math.min(source.y + source.height - 2, viewportHeight - 2),
    },
    { x: source.x + source.width / 2, y: source.y + 2 },
    { x: source.x + 2, y: source.y + source.height / 2 },
    { x: source.x + source.width - 2, y: source.y + source.height / 2 },
  ].find(
    ({ x, y }) =>
      x < popup.x ||
      x > popup.x + popup.width ||
      y < popup.y ||
      y > popup.y + popup.height,
  );
  test.skip(
    !returnPoint,
    "The expanded popup fully covers its source at this viewport",
  );
  await preview.evaluate((element) => {
    (element as HTMLElement).dataset.responseIdentity = "same-dialog";
  });
  await preview.locator(".sf-hover-preview-title").hover();
  expect(
    await sourceElement.evaluate((element, location) => {
      const hit = document.elementFromPoint(location.x, location.y);
      return hit !== null && element.contains(hit);
    }, returnPoint!),
  ).toBe(true);
  await page.mouse.move(returnPoint!.x, returnPoint!.y);
  await page.waitForTimeout(500);
  await expect(preview).toHaveAttribute(
    "data-response-identity",
    "same-dialog",
  );
  await preview.locator(".sf-hover-preview-title").hover();
  await expect(preview).toHaveAttribute(
    "data-response-identity",
    "same-dialog",
  );
});

test("moving focus between popup and source preserves the same open dialog", async ({
  page,
}) => {
  await openStorefront(page, "en");
  const card = page.locator(".sf-product-card").first();
  const preview = await hoverCard(page, card);
  await preview.evaluate((element) => {
    (element as HTMLElement).dataset.responseIdentity = "same-focus-dialog";
  });
  await preview.locator(".sf-hover-preview-close").focus();
  await card.locator(".sf-product-media").focus();
  await page.waitForTimeout(500);
  await expect(preview).toHaveAttribute(
    "data-response-identity",
    "same-focus-dialog",
  );
  await preview.locator(".sf-hover-preview-close").focus();
  await expect(preview).toHaveAttribute(
    "data-response-identity",
    "same-focus-dialog",
  );
});

test("Escape during pointer exit restores focus to the explicit preview button", async ({
  page,
}) => {
  await openStorefront(page, "en");
  await page.setViewportSize({ width: 390, height: 850 });
  const trigger = page.locator(".sf-product-quick-preview").first();
  await trigger.click();
  const preview = page.locator(".sf-hover-preview");
  await expect(preview.locator(".sf-hover-preview-close")).toBeFocused();
  await preview.locator(".sf-hover-preview-title").hover();
  await page.mouse.move(0, 0);
  await expect(preview).toHaveAttribute("data-state", "closing");
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("dismissal outside the source allows the first direct return hover", async ({
  page,
}) => {
  await openStorefront(page, "en");
  const card = page.locator(".sf-product-card").first();
  const preview = await hoverCard(page, card);
  const source = (await card.boundingBox())!;
  const popup = (await preview.boundingBox())!;
  const point = [
    { x: popup.x + 8, y: popup.y + popup.height / 2 },
    { x: popup.x + popup.width - 8, y: popup.y + popup.height / 2 },
    { x: popup.x + popup.width / 2, y: popup.y + 8 },
  ].find(
    ({ x, y }) =>
      x < source.x ||
      x > source.x + source.width ||
      y < source.y ||
      y > source.y + source.height,
  );
  expect(
    point,
    "The popup must expose a pointer target outside the source",
  ).toBeDefined();
  await page.mouse.move(point!.x, point!.y);
  expect(
    await preview.evaluate((element, location) => {
      const hit = document.elementFromPoint(location.x, location.y);
      return hit !== null && element.contains(hit);
    }, point!),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator(".sf-hover-preview")).toHaveCount(0);
  // There is no intervening move away from the card. The pointer was already
  // outside when dismissed, so this first return is fresh hover intent.
  await hoverCard(page, card);
});

test("a fresh hover during ordinary exit cancels the close", async ({
  page,
}) => {
  await openStorefront(page, "en");
  const card = page.locator(".sf-product-card").first();
  await hoverCard(page, card);
  const source = (await card.boundingBox())!;
  await page.mouse.move(0, 0);
  await expect(page.locator(".sf-hover-preview")).toHaveAttribute(
    "data-state",
    "closing",
  );
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await expect(
    page.locator('.sf-hover-preview[data-state="open"]'),
  ).toBeVisible();
  await page.waitForTimeout(450);
  await expect(
    page.locator('.sf-hover-preview[data-state="open"]'),
  ).toBeVisible();
});
