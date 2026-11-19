import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { DEFAULT_ANIMATION_SETTINGS } from "../src/lib/animation-settings";

// Synthetic content guarantees overflow without changing the owner's catalog.
const styles = [
  "src/styles/storefront.css",
  "src/styles/customer-refinement.css",
  "src/styles/category-hierarchy.css",
  "src/styles/customer-evolution.css",
  "src/styles/product-card-sections.css",
  "src/styles/public-refinement.css",
  "src/components/management/tools/pos/pos-window.module.css",
]
  .map((path) => readFileSync(path, "utf8"))
  .concat([
    readFileSync(
      "src/components/management/commerce/commerce.module.css",
      "utf8",
    ).replaceAll(/\.sectionNav\b/g, ".commerceNav"),
  ])
  .join("\n");

for (const direction of ["ltr", "rtl"] as const) {
  for (const width of [320, 1440]) {
    test(`scrolling controls keep scrollbar clearance: ${direction}/${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.setContent(`
        <html dir="${direction}" data-appearance-version="2">
          <body>
            <div class="sf-departments"><div class="sf-department-grid"></div></div>
            <div class="sf-catalog" data-catalog-scope="all"><div class="sf-category-filters"></div></div>
            <nav class="commerceNav"></nav>
            <div style="container-type: inline-size; width: 300px"><nav class="discoveryTabs"></nav></div>
          </body>
        </html>`);
      await page.addStyleTag({ content: styles });
      await page.addStyleTag({
        content: `
        .sf-department-grid, .sf-category-filters, .commerceNav, .discoveryTabs { width: 280px; max-width: 100%; }
        .sf-department, .sf-category-filters button, .commerceNav button, .discoveryTabs button { flex: 0 0 110px; height: 44px; }
      `,
      });
      await page.evaluate(() => {
        for (const selector of [
          ".sf-department-grid",
          ".sf-category-filters",
          ".commerceNav",
          ".discoveryTabs",
        ]) {
          const region = document.querySelector(selector)!;
          for (let index = 0; index < 8; index++) {
            const button = document.createElement("button");
            button.className =
              selector === ".sf-department-grid"
                ? "sf-department"
                : selector === ".discoveryTabs"
                  ? "tab"
                  : "";
            button.textContent = `Item ${index + 1}`;
            region.append(button);
          }
        }
      });
      for (const selector of [
        ".sf-department-grid",
        ".sf-category-filters",
        ".commerceNav",
        ".discoveryTabs",
      ]) {
        const region = page.locator(selector);
        const geometry = await region.evaluate((element) => {
          const item = element.firstElementChild!.getBoundingClientRect();
          const box = element.getBoundingClientRect();
          return {
            overflow: element.scrollWidth > element.clientWidth,
            direction: getComputedStyle(element).flexDirection,
            scrollbarWidth: getComputedStyle(element).scrollbarWidth,
            widths: [element.scrollWidth, element.clientWidth],
            clearance:
              box.top + element.clientTop + element.clientHeight - item.bottom,
          };
        });
        expect(
          geometry.overflow,
          `${selector}: ${JSON.stringify(geometry)}`,
        ).toBe(true);
        expect(geometry.clearance, selector).toBeGreaterThanOrEqual(12);
        if (selector !== ".discoveryTabs") {
          expect(geometry.scrollbarWidth, selector).toBe("auto");
        }
        await region.locator("button").last().focus();
        await expect(region.locator("button").last()).toBeFocused();
        const visible = await region
          .locator("button")
          .last()
          .evaluate((item) => {
            const child = item.getBoundingClientRect();
            const parent = item.parentElement!.getBoundingClientRect();
            return (
              child.left >= parent.left - 1 && child.right <= parent.right + 1
            );
          });
        expect(visible, selector).toBe(true);
      }
    });
  }
}

test("compact preview thumbnails retain room for scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.setContent(`
    <html data-appearance-version="2"><body>
      <div class="sf-hover-preview-gallery" data-multiple-images>
        <div class="sf-hover-preview-media"></div>
        <div class="sf-hover-preview-thumbnails">${Array.from({ length: 8 }, () => '<button class="sf-hover-preview-thumbnail">Image</button>').join("")}</div>
      </div>
    </body></html>`);
  await page.addStyleTag({ content: styles });
  await page.addStyleTag({
    content:
      ".sf-hover-preview-gallery { width: 280px; height: 240px; max-height: none; }",
  });
  const geometry = await page
    .locator(".sf-hover-preview-thumbnails")
    .evaluate((element) => {
      const item = element.firstElementChild!.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      return {
        overflow: element.scrollWidth > element.clientWidth,
        bottom:
          bounds.top + element.clientTop + element.clientHeight - item.bottom,
        top: item.top - bounds.top,
      };
    });
  expect(geometry.overflow).toBe(true);
  expect(geometry.bottom).toBeGreaterThanOrEqual(10);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
});

for (const locale of ["he", "en"] as const) {
  test(`${locale}: active category stays in view after narrowing the storefront`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/track", (route) => route.fulfill({ status: 204 }));
    await page.goto(`/${locale}`);
    const rail = page.locator(".sf-department-grid");
    const categories = rail.locator(".sf-department");
    await expect(categories.first()).toBeVisible();
    const href = (await categories.last().getAttribute("href"))!;
    await page.goto(href);
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-motion-ready", "true");
    await page.evaluate(
      (detail) =>
        window.dispatchEvent(
          new CustomEvent("miro-animation-settings-change", { detail }),
        ),
      { ...DEFAULT_ANIMATION_SETTINGS, enabled: false, appearanceVersion: "2" },
    );

    const selected = rail.locator('[aria-current="page"]');
    const isSelectedInsideRail = () =>
      selected.evaluate((chip) => {
        const bounds = chip.parentElement!.getBoundingClientRect();
        const item = chip.getBoundingClientRect();
        return item.left >= bounds.left - 1 && item.right <= bounds.right + 1;
      });
    await expect.poll(isSelectedInsideRail).toBe(true);
    await page.setViewportSize({ width: 320, height: 900 });
    await expect.poll(isSelectedInsideRail).toBe(true);

    const position = () => rail.evaluate((element) => element.scrollLeft);
    await rail.hover();
    const beforeWheel = Math.abs(await position());
    await page.mouse.wheel(locale === "he" ? 200 : -200, 0);
    await expect
      .poll(async () => Math.abs(await position()))
      .toBeLessThan(beforeWheel);
    await selected.focus();
    await expect.poll(isSelectedInsideRail).toBe(true);
  });
}
