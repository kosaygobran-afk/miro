import { expect, test, type Locator, type Page } from "@playwright/test";
import { DEFAULT_ANIMATION_SETTINGS } from "../src/lib/animation-settings";

async function ready(
  page: Page,
  locale: "he" | "en",
  appearanceVersion: "1" | "2",
) {
  await page.route("**/api/track", (route) => route.fulfill({ status: 204 }));
  await page.goto(`/${locale}`);
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
      enabled: true,
      appearanceVersion,
    },
  );
  const rail = page.locator(".sf-moving-rail-section");
  await expect(rail.locator(".sf-moving-rail-viewport")).not.toHaveAttribute(
    "data-static",
    "true",
  );
  return rail;
}

async function inspectLoop(rail: Locator) {
  return rail.locator(".sf-moving-rail-track").evaluate((element) => {
    const animation = element
      .getAnimations()
      .find(
        (a) =>
          a instanceof CSSAnimation && a.animationName === "sf-rail-scroll",
      )!;
    animation.pause();
    const duration = Number(animation.effect!.getTiming().duration);
    const shift = parseFloat(
      getComputedStyle(element).getPropertyValue("--sf-rail-shift"),
    );
    const viewport = element.parentElement!;
    const bounds = viewport.getBoundingClientRect();
    const padding = getComputedStyle(viewport);
    const left = bounds.left + parseFloat(padding.paddingLeft);
    const right = bounds.right - parseFloat(padding.paddingRight);
    const samples = [0, 0.5, 0.9999, 1.0001, 2.5].map((phase) => {
      animation.currentTime = phase * duration;
      const segments = Array.from(element.children, (child) =>
        child.getBoundingClientRect(),
      );
      return {
        covered:
          Math.min(...segments.map((r) => r.left)) <= left + 1 &&
          Math.max(...segments.map((r) => r.right)) >= right - 1,
        cards: Array.from(
          element.querySelectorAll<HTMLElement>(".sf-moving-rail-item"),
          (card) => ({
            href: card.querySelector("a")!.getAttribute("href"),
            x: card.getBoundingClientRect().left,
            width: card.getBoundingClientRect().width,
          }),
        ).filter(
          (card) =>
            card.width > 0 && card.x >= left + 20 && card.x <= right - 20,
        ),
      };
    });
    const beforeWrap = samples[2].cards;
    const afterWrap = samples[3].cards;
    const tolerance = Math.abs(shift) * 0.0002 + 1;
    return {
      shift,
      speed: Math.abs(shift) / (duration / 1000),
      infinite: animation.effect!.getTiming().iterations === Infinity,
      covered: samples.every((sample) => sample.covered),
      seam:
        beforeWrap.length > 0 &&
        beforeWrap.every((a) =>
          afterWrap.some(
            (b) => a.href === b.href && Math.abs(a.x - b.x) < tolerance,
          ),
        ),
    };
  });
}

for (const locale of ["he", "en"] as const) {
  for (const appearanceVersion of ["1", "2"] as const) {
    for (const width of [390, 1672]) {
      test(`${locale} v${appearanceVersion}: product rail stays filled across repeated loops at ${width}px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 1000 });
        const rail = await ready(page, locale, appearanceVersion);
        const track = rail.locator(".sf-moving-rail-track");
        let speed: number | undefined;
        for (const count of [null, 1, 2]) {
          // Browser-only short-group geometry; never edits the owner's catalog.
          const style = count
            ? await page.addStyleTag({
                content: `.sf-moving-rail-segment > .sf-moving-rail-item:nth-child(n + ${count + 1}) { display: none; }`,
              })
            : null;
          await expect
            .poll(async () =>
              track.evaluate((element) => {
                const segment =
                  element.firstElementChild!.getBoundingClientRect();
                const gap = parseFloat(getComputedStyle(element).columnGap);
                const stride = segment.width + gap;
                const shift = Math.abs(
                  parseFloat(
                    getComputedStyle(element).getPropertyValue(
                      "--sf-rail-shift",
                    ),
                  ),
                );
                return (
                  Math.abs(stride - shift) < 1 &&
                  element.children.length >=
                    Math.ceil(element.parentElement!.clientWidth / stride) + 1
                );
              }),
            )
            .toBe(true);
          const result = await inspectLoop(rail);
          expect(Math.sign(result.shift)).toBe(locale === "he" ? 1 : -1);
          expect(result.infinite).toBe(true);
          expect(result.covered).toBe(true);
          expect(result.seam).toBe(true);
          if (speed === undefined) speed = result.speed;
          else expect(result.speed).toBeCloseTo(speed, 1);
          await expect(
            rail.locator(
              '.sf-moving-rail-segment[aria-hidden="true"] [tabindex="0"]',
            ),
          ).toHaveCount(0);
          await style?.evaluate((node) => {
            node.parentNode?.removeChild(node);
          });
        }
      });
    }
  }
  test(`${locale}: loop retains pause, popup and static-motion alternatives`, async ({
    page,
  }) => {
    const rail = await ready(page, locale, "2");
    const viewport = rail.locator(".sf-moving-rail-viewport");
    const track = rail.locator(".sf-moving-rail-track");
    const initialTransform = await track.evaluate(
      (e) => getComputedStyle(e).transform,
    );
    await expect
      .poll(() => track.evaluate((e) => getComputedStyle(e).transform))
      .not.toBe(initialTransform);
    await rail.locator(".sf-moving-rail-toggle").click();
    await expect(viewport).toHaveAttribute("data-paused", "true");
    expect(
      await track.evaluate((e) => getComputedStyle(e).animationPlayState),
    ).toBe("paused");
    await rail.locator(".sf-moving-rail-toggle").click();
    await viewport.hover({ position: { x: 100, y: 40 } });
    await expect(viewport).toHaveAttribute("data-paused", "true");
    const preview = rail
      .locator(
        '.sf-moving-rail-segment:not([aria-hidden="true"]) .sf-moving-rail-preview-button',
      )
      .first();
    await preview.click();
    await expect(
      page.locator('.sf-hover-preview[data-state="open"]'),
    ).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(viewport).toHaveAttribute("data-paused", "true");
    await page.keyboard.press("Escape");
    await expect(preview).toBeFocused();
    await rail.locator(".sf-moving-rail-toggle").focus();
    await page.mouse.move(0, 0);
    await expect(viewport).not.toHaveAttribute("data-paused", "true");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(viewport).toHaveAttribute("data-static", "true");
    await expect(rail.locator(".sf-moving-rail-segment")).toHaveCount(1);
    expect(await track.evaluate((e) => getComputedStyle(e).animationName)).toBe(
      "none",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(viewport).not.toHaveAttribute("data-static", "true");
    await page.evaluate(
      (detail) =>
        window.dispatchEvent(
          new CustomEvent("miro-animation-settings-change", { detail }),
        ),
      { ...DEFAULT_ANIMATION_SETTINGS, enabled: false },
    );
    await expect(viewport).toHaveAttribute("data-static", "true");
    await expect(rail.locator(".sf-moving-rail-segment")).toHaveCount(1);
  });
}
