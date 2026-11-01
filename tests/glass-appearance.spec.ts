import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { DEFAULT_ANIMATION_SETTINGS } from "../src/lib/animation-settings";

test.use({ reducedMotion: "reduce" });

type Theme = "dark" | "medium" | "light";

async function prepare(page: Page, theme: Theme = "dark") {
  await page.route("**/api/track", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.addInitScript((theme) => {
    localStorage.setItem("miro-theme", theme);
  }, theme);
}

async function ready(page: Page, path = "/en/services") {
  await page.goto(path);
  await expect(page.locator("html")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );
  await page.evaluate((detail) => {
    window.dispatchEvent(
      new CustomEvent("miro-animation-settings-change", { detail }),
    );
  }, DEFAULT_ANIMATION_SETTINGS);
  await expect(page.locator("html")).toHaveAttribute(
    "data-appearance-version",
    "2",
  );
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("[data-glass-toggle]")).toHaveCount(0);
}

// Disable only the new on-gated rules, keeping every baseline stylesheet and
// preference control in place. This is an executable restoration comparison,
// including nested CSS rules after the production bundler has combined sheets.
async function disableGlassRules(page: Page) {
  return page.evaluate(() => {
    let changed = 0;
    const walk = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (
          rule instanceof CSSStyleRule &&
          /\[data-glass\s*=\s*["']?on["']?\]/.test(rule.selectorText)
        ) {
          rule.selectorText = ":root:not(*)";
          changed += 1;
        } else if ("cssRules" in rule) {
          walk((rule as CSSGroupingRule).cssRules);
        }
      }
    };
    for (const sheet of Array.from(document.styleSheets)) walk(sheet.cssRules);
    return changed;
  });
}

async function visualState(page: Page) {
  return page.evaluate(() => {
    const properties = [
      "color",
      "background-color",
      "background-image",
      "border-top-color",
      "border-right-color",
      "border-bottom-color",
      "border-left-color",
      "box-shadow",
      "backdrop-filter",
      "filter",
      "opacity",
      "border-radius",
      "font-size",
      "font-weight",
      "line-height",
      "padding",
      "gap",
      "transform",
    ];
    return {
      tokens: [
        "--background",
        "--surface",
        "--surface-muted",
        "--foreground",
        "--muted-foreground",
        "--primary",
        "--accent-text",
        "--focus-ring",
      ].map((name) => [
        name,
        getComputedStyle(document.documentElement).getPropertyValue(name),
      ]),
      elements: Array.from(document.querySelectorAll("body *"))
        // Closed native details may retain layout boxes after a CSSOM flush;
        // compare the rendered surface, excluding those hidden answer boxes.
        .filter(
          (element) =>
            element.getClientRects().length > 0 &&
            element.checkVisibility({
              contentVisibilityAuto: true,
              visibilityProperty: true,
            }),
        )
        .map((element) => {
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            tag: element.tagName,
            class: element.getAttribute("class"),
            box: [box.x, box.y, box.width, box.height],
            styles: properties.map((name) => style.getPropertyValue(name)),
            before: [
              "background-color",
              "background-image",
              "box-shadow",
              "opacity",
            ].map((name) =>
              getComputedStyle(element, "::before").getPropertyValue(name),
            ),
            after: [
              "background-color",
              "background-image",
              "box-shadow",
              "opacity",
            ].map((name) =>
              getComputedStyle(element, "::after").getPropertyValue(name),
            ),
          };
        }),
    };
  });
}

async function glassContrast(page: Page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const context = document.createElement("canvas").getContext("2d")!;
    const color = (name: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = style.getPropertyValue(name).trim();
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data).map(
        (channel, index) => (index === 3 ? channel / 255 : channel),
      );
    };
    const over = (front: number[], back: number[]) => [
      ...front
        .slice(0, 3)
        .map(
          (channel, index) => channel * front[3] + back[index] * (1 - front[3]),
        ),
      1,
    ];
    const luminance = (rgb: number[]) => {
      const channels = rgb.slice(0, 3).map((channel) => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const fill = color("--glass-fill");
    const sheen = color("--glass-sheen");
    const backgrounds = [
      [0, 0, 0, 1],
      [255, 255, 255, 1],
    ].flatMap((backdrop) => {
      const base = over(fill, backdrop);
      return [base, over(sheen, base)];
    });
    return {
      fillAlpha: fill[3],
      minimumRatios: [
        "--foreground",
        "--muted-foreground",
        "--accent-text",
      ].map((name) => ({
        name,
        ratio: Math.min(
          ...backgrounds.map((background) => {
            const a = luminance(color(name));
            const b = luminance(background);
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          }),
        ),
      })),
    };
  });
}

test("visitors receive the shared setting and cannot change it with a legacy local preference", async ({
  page,
}) => {
  await prepare(page);
  await page.addInitScript(() => localStorage.setItem("miro-glass", "off"));
  await ready(page);
  await expect(page.locator("html")).toHaveAttribute("data-glass", "on");
  await expect(page.locator("[data-glass-toggle]")).toHaveCount(0);
  await expect(
    page.getByRole("switch", { name: "Enhanced glass" }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    localStorage.setItem("miro-glass", "on");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "miro-glass",
        newValue: "off",
        storageArea: localStorage,
      }),
    );
  });
  await expect(page.locator("html")).toHaveAttribute("data-glass", "on");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );
  await expect(page.locator("html")).toHaveAttribute("data-glass", "on");
  await page
    .locator('.premium-footer-column a[href="/en/contact"]')
    .first()
    .click();
  await expect(page).toHaveURL(/\/en\/contact$/);
  await expect(page.locator("html")).toHaveAttribute("data-glass", "on");
  await expect(page.locator("[data-glass-toggle]")).toHaveCount(0);
});

test("the server's shared glass value is present before hydration without browser storage", async ({
  page,
}) => {
  await prepare(page, "light");
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("Blocked", "SecurityError");
    };
    Storage.prototype.setItem = () => {
      throw new DOMException("Blocked", "SecurityError");
    };
  });
  await page.route("**/_next/static/**/*.js", (route) => route.abort());
  await page.goto("/en/services", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-glass", "on");
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-motion-ready",
    "true",
  );
  await expect(page.locator("[data-glass-toggle]")).toHaveCount(0);
});

for (const locale of ["en", "he"] as const) {
  for (const theme of ["dark", "medium", "light"] as const) {
    test(`${locale} ${theme}: Dark enhancement and unchanged bright themes fit a 320px phone`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await prepare(page, theme);
      await page.setViewportSize({ width: 320, height: 900 });
      await ready(page, `/${locale}/services`);
      await expect(page.locator("html")).toHaveAttribute("data-glass", "on");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator(".premium-header")).toHaveCSS("opacity", "1");
      if (theme === "dark") {
        await expect(page.locator(".premium-header")).toHaveCSS(
          "backdrop-filter",
          "blur(12px) saturate(1.12)",
        );
        const icon = page.locator(".experience-icon").first();
        await expect(icon).toBeVisible();
        const iconOn = await icon.evaluate((node) => {
          const style = getComputedStyle(node);
          return {
            image: style.backgroundImage,
            shadow: style.boxShadow,
            blur: style.backdropFilter,
          };
        });
        expect(iconOn.image).not.toBe("none");
        expect(iconOn.shadow).toContain("inset");
        expect(iconOn.blur).toBe("none");
        await page.evaluate(() => {
          document.documentElement.dataset.glass = "off";
        });
        const iconOff = await icon.evaluate((node) => {
          const style = getComputedStyle(node);
          return { image: style.backgroundImage, shadow: style.boxShadow };
        });
        expect(iconOn.image).not.toBe(iconOff.image);
        expect(iconOn.shadow).not.toBe(iconOff.shadow);
        await page.evaluate(() => {
          document.documentElement.dataset.glass = "on";
        });
        const contrast = await glassContrast(page);
        expect(contrast.fillAlpha).toBeGreaterThanOrEqual(0.93);
        for (const entry of contrast.minimumRatios)
          expect(entry.ratio, entry.name).toBeGreaterThanOrEqual(4.5);
        await test.info().attach("worst-case-glass-contrast", {
          body: JSON.stringify(contrast),
          contentType: "application/json",
        });
      } else {
        // The shared flag must have no visual effect outside Dark mode.
        await page.mouse.move(0, 899);
        const baseline = await visualState(page);
        const pixels = await page.screenshot({
          animations: "disabled",
          caret: "hide",
        });
        await page.evaluate(() => {
          document.documentElement.dataset.glass = "off";
        });
        expect(await visualState(page)).toEqual(baseline);
        expect(
          (
            await page.screenshot({ animations: "disabled", caret: "hide" })
          ).equals(pixels),
        ).toBe(true);
        await page.evaluate(() => {
          document.documentElement.dataset.glass = "on";
        });
        expect(await disableGlassRules(page)).toBeGreaterThan(0);
        expect(await visualState(page)).toEqual(baseline);
        expect(
          (
            await page.screenshot({ animations: "disabled", caret: "hide" })
          ).equals(pixels),
        ).toBe(true);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      const axe = await new AxeBuilder({ page })
        .include(".premium-header")
        .include(".experience-services-hero")
        .include(".experience-category-grid")
        .include(".experience-consultation")
        .include(".premium-footer")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(axe.violations).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

for (const theme of ["dark", "medium", "light"] as const) {
  test(`${theme}: off restores exact baseline pixels and styles, including the category panel`, async ({
    page,
  }) => {
    await prepare(page, theme);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await ready(page);
    // Model the authoritative off value without changing shared owner settings.
    await page.evaluate(() => {
      document.documentElement.dataset.glass = "off";
    });
    await page.mouse.move(0, 999);
    const closedState = await visualState(page);
    const closedPixels = await page.screenshot({
      animations: "disabled",
      caret: "hide",
    });
    const trigger = page.locator(
      ".premium-desktop-nav .premium-disclosure-button",
    );
    await trigger.click();
    await expect(page.locator("#store-navigation")).toBeVisible();
    await page.mouse.move(0, 999);
    const openState = await visualState(page);
    const openPixels = await page.screenshot({
      animations: "disabled",
      caret: "hide",
    });
    expect(await disableGlassRules(page)).toBeGreaterThan(0);
    expect(await visualState(page)).toEqual(openState);
    expect(
      (await page.screenshot({ animations: "disabled", caret: "hide" })).equals(
        openPixels,
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.locator("#store-navigation")).toHaveCount(0);
    // Match the initial unfocused trigger before comparing closed-state pixels.
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    expect(await visualState(page)).toEqual(closedState);
    expect(
      (await page.screenshot({ animations: "disabled", caret: "hide" })).equals(
        closedPixels,
      ),
    ).toBe(true);
  });
}

test("appearance Version 1 ignores the optional enhancement", async ({
  page,
}) => {
  await prepare(page);
  await ready(page);
  await page.evaluate(
    (detail) => {
      window.dispatchEvent(
        new CustomEvent("miro-animation-settings-change", { detail }),
      );
    },
    { ...DEFAULT_ANIMATION_SETTINGS, appearanceVersion: "1" },
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-appearance-version",
    "1",
  );
  await expect(page.locator("[data-glass-toggle]")).toHaveCount(0);
  await page.mouse.move(0, 999);
  const original = await visualState(page);
  expect(await disableGlassRules(page)).toBeGreaterThan(0);
  expect(await visualState(page)).toEqual(original);
});

for (const preference of ["reduced-transparency", "forced-colors"] as const) {
  test(`${preference}: glass surfaces use an opaque accessible fallback`, async ({
    page,
    context,
  }) => {
    await prepare(page);
    if (preference === "forced-colors") {
      await page.emulateMedia({ forcedColors: "active" });
    } else {
      const session = await context.newCDPSession(page);
      await session.send("Emulation.setEmulatedMedia", {
        features: [
          { name: "prefers-reduced-motion", value: "reduce" },
          { name: "prefers-reduced-transparency", value: "reduce" },
        ],
      });
    }
    await ready(page);
    const fallback = await page
      .locator(".premium-header")
      .evaluate((header) => {
        const style = getComputedStyle(header);
        return {
          blur: style.backdropFilter,
          background: style.backgroundColor,
        };
      });
    expect(fallback.blur).toBe("none");
    expect(fallback.background).not.toMatch(
      /rgba\([^)]*,\s*(?:0|0?\.\d+)\s*\)$/,
    );
    await expect(page.locator("[data-glass-toggle]")).toHaveCount(0);
  });
}

for (const theme of ["dark"] as const) {
  test(`${theme}: real grid and rail cards show all four gold edges over footer hover and keyboard focus`, async ({
    page,
  }) => {
    await prepare(page, theme);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await ready(page, "/en");
    for (const kind of ["grid", "rail"] as const) {
      const card = page
        .locator(
          kind === "grid"
            ? ".sf-product-card"
            : '.sf-moving-rail-segment:not([aria-hidden="true"]) .sf-moving-rail-card-shell:has(> [data-preview-source])',
        )
        .first();
      await expect(card).toBeVisible({ timeout: 15000 });
      const footer = card.locator(
        kind === "grid" ? ".sf-product-actions" : ".sf-moving-rail-actions",
      );
      const assertGoldEdges = async () => {
        const edge = await card.evaluate((node) => {
          const probe = document.createElement("span");
          probe.style.cssText = "position:absolute;color:var(--accent-text)";
          node.append(probe);
          const accent = getComputedStyle(probe).color;
          probe.remove();
          const style = getComputedStyle(node);
          return {
            accent,
            shadow: style.boxShadow,
            colors: [
              style.borderTopColor,
              style.borderRightColor,
              style.borderBottomColor,
              style.borderLeftColor,
            ],
            widths: [
              style.borderTopWidth,
              style.borderRightWidth,
              style.borderBottomWidth,
              style.borderLeftWidth,
            ].map(parseFloat),
          };
        });
        expect(edge.colors).toEqual(Array(4).fill(edge.accent));
        expect(edge.shadow).not.toContain("inset");
        expect(edge.widths.every((width) => width >= 1)).toBe(true);
      };
      await footer.hover();
      await assertGoldEdges();
      await page.mouse.move(0, 999);
      await footer.locator("a,button").first().focus();
      await assertGoldEdges();
      await page.evaluate(() =>
        (document.activeElement as HTMLElement)?.blur(),
      );
    }
    const icon = page.locator(".sf-department-icon").first();
    await expect(icon).toBeAttached();
    const on = await icon.evaluate((node) => {
      const style = getComputedStyle(node);
      return [style.backgroundImage, style.boxShadow, style.backdropFilter];
    });
    expect(on[0]).not.toBe("none");
    expect(on[1]).toContain("inset");
    expect(on[2]).toBe("none");
    await page.evaluate(() => {
      document.documentElement.dataset.glass = "off";
    });
    const off = await icon.evaluate((node) => {
      const style = getComputedStyle(node);
      return [style.backgroundImage, style.boxShadow];
    });
    expect(on[0]).not.toBe(off[0]);
    expect(on[1]).not.toBe(off[1]);
  });
}

for (const theme of ["medium", "light"] as const) {
  test(`${theme}: the shared Dark flag leaves storefront cards, rails, tiles and colors exactly unchanged`, async ({
    page,
  }) => {
    await prepare(page, theme);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await ready(page, "/en");
    await expect(page.locator(".sf-product-card").first()).toBeVisible({
      timeout: 15000,
    });
    await page.mouse.move(0, 999);
    const original = await visualState(page);
    const pixels = await page.screenshot({
      animations: "disabled",
      caret: "hide",
    });
    await page.evaluate(() => {
      document.documentElement.dataset.glass = "off";
    });
    expect(await visualState(page)).toEqual(original);
    expect(
      (await page.screenshot({ animations: "disabled", caret: "hide" })).equals(
        pixels,
      ),
    ).toBe(true);
    await page.evaluate(() => {
      document.documentElement.dataset.glass = "on";
    });
    expect(await disableGlassRules(page)).toBeGreaterThan(0);
    expect(await visualState(page)).toEqual(original);
    expect(
      (await page.screenshot({ animations: "disabled", caret: "hide" })).equals(
        pixels,
      ),
    ).toBe(true);
  });
}
