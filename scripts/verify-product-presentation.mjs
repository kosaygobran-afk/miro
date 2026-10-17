// Read-only public presentation QA against real products. No catalog writes,
// cart additions or settings saves; analytics requests are fulfilled locally.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";

const base = process.env.ADMIN_BASE_URL || "http://localhost:3000";
const engine = process.env.PRODUCT_PRESENTATION_BROWSER || "chromium";
const browserType = { chromium, firefox, webkit }[engine];
assert.ok(browserType, "Supported engines: chromium, firefox, webkit");
const output =
  process.env.PRODUCT_PRESENTATION_OUTPUT_DIR ||
  join(tmpdir(), `miro-product-presentation-${engine}`);
const baseline = process.env.PRODUCT_PRESENTATION_V1_BASELINE
  ? JSON.parse(
      await readFile(process.env.PRODUCT_PRESENTATION_V1_BASELINE, "utf8"),
    )
  : null;
const products = [
  { key: "5586793", path: "/store/accessories/5586793", multiple: false },
  {
    key: "cat5e",
    path: "/store/cables/cat5e-copper-bulk-cable",
    multiple: true,
  },
];
const checks = [];
const runtimeErrors = [];
let failure;
await mkdir(output, { recursive: true });
const browser = await browserType.launch();

async function imagePixelEvidence(stage, image) {
  const shown = await stage.screenshot({ animations: "disabled" });
  const prior = await image.evaluate((node) => {
    const value = node.style.visibility;
    node.style.visibility = "hidden";
    return value;
  });
  let hidden;
  try {
    hidden = await stage.screenshot({ animations: "disabled" });
  } finally {
    await image.evaluate((node, value) => {
      node.style.visibility = value;
    }, prior);
  }
  const actual = await sharp(shown)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const absent = await sharp(hidden).removeAlpha().raw().toBuffer();
  assert.equal(actual.data.length, absent.length);
  let changed = 0;
  for (
    let index = 0;
    index < actual.data.length;
    index += actual.info.channels
  ) {
    if (
      [0, 1, 2].some(
        (channel) =>
          Math.abs(actual.data[index + channel] - absent[index + channel]) > 12,
      )
    )
      changed++;
  }
  const fraction = changed / (actual.info.width * actual.info.height);
  assert.ok(
    changed > 50 && fraction > 0.005,
    `Image must visibly contribute pixels: ${changed} pixels/${fraction}`,
  );
  return { changed, fraction };
}

function near(actual, expected, message, tolerance = 1.5) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: ${actual} vs ${expected}`,
  );
}

try {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await page.route("**/api/track", (route) => route.fulfill({ status: 204 }));
  for (const product of products) {
    for (const locale of ["en", "he"]) {
      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        const response = await page.goto(`${base}/${locale}${product.path}`, {
          waitUntil: "networkidle",
        });
        assert.equal(response.status(), 200);
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          locale === "he" ? "rtl" : "ltr",
        );
        const gallery = page.locator(".sf-product-gallery");
        const stage = gallery.locator(".sf-main-image");
        const image = stage.locator("img");
        const thumbnails = gallery.locator(".sf-thumbnail");
        await expect(image).toHaveCount(1);
        await image.evaluate((node) => node.decode());
        if (product.multiple) {
          assert.ok(
            (await thumbnails.count()) > 1,
            "Use an actual public multiimage product",
          );
          const initialSource = await image.getAttribute("src");
          await thumbnails.last().click();
          await expect(thumbnails.last()).toHaveAttribute(
            "aria-current",
            "true",
          );
          await expect(image).not.toHaveAttribute("src", initialSource);
          await gallery.locator(".sf-gallery-arrow-next").click();
          await expect(thumbnails.first()).toHaveAttribute(
            "aria-current",
            "true",
          );
          await gallery.locator(".sf-gallery-arrow-previous").click();
          await expect(thumbnails.last()).toHaveAttribute(
            "aria-current",
            "true",
          );
          await thumbnails.first().click();
          await image.evaluate((node) => node.decode());
        }
        for (const version of ["1", "2"]) {
          for (const theme of ["dark", "medium", "light"]) {
            const label = `${product.key}/${locale}/appearance${version}/${theme}/${width}`;
            await page.evaluate(
              ({ version, theme }) => {
                document.documentElement.dataset.appearanceVersion = version;
                document.documentElement.dataset.theme = theme;
              },
              { version, theme },
            );
            const geometry = await page
              .locator(".sf-product-detail-layout")
              .evaluate((node) => {
                const box = (element) => {
                  const { x, y, width, height } =
                    element.getBoundingClientRect();
                  return {
                    x,
                    y,
                    width,
                    height,
                    scrollWidth: element.scrollWidth,
                    clientWidth: element.clientWidth,
                  };
                };
                return {
                  gallery: box(node.querySelector(".sf-product-gallery")),
                  stage: box(node.querySelector(".sf-main-image")),
                  info: box(node.querySelector(".sf-product-info")),
                  overflow: document.documentElement.scrollWidth - innerWidth,
                  wrappers: [
                    ...node.querySelectorAll(
                      ".sf-detail-heading,.sf-detail-purchase,.sf-detail-footer",
                    ),
                  ].map((element) => getComputedStyle(element).display),
                };
              });
            assert.ok(
              geometry.overflow <= 1,
              `${label}: document overflow ${geometry.overflow}`,
            );
            for (const part of ["gallery", "stage", "info"]) {
              // Legacy stock-indicator decoration can extend its local scroll
              // metrics by a few pixels in RTL. Preserve that v1 presentation;
              // document fitting and exact baseline geometry still apply.
              if (version === "2")
                assert.ok(
                  geometry[part].scrollWidth <= geometry[part].clientWidth + 1,
                  `${label}: ${part} content overflows`,
                );
              assert.ok(
                geometry[part].width > 200,
                `${label}: ${part} has a substantial visible width`,
              );
            }
            if (width >= 1101) {
              if (version === "2") {
                near(
                  geometry.gallery.width,
                  geometry.info.width,
                  `${label}: desktop panels have equal width`,
                );
                near(
                  geometry.gallery.height,
                  geometry.info.height,
                  `${label}: desktop panels have equal height`,
                );
              } else {
                near(
                  geometry.gallery.width / geometry.info.width,
                  1.1,
                  `${label}: v1 retains its original column ratio`,
                  0.015,
                );
              }
            } else {
              assert.ok(
                geometry.info.y >=
                  geometry.gallery.y + geometry.gallery.height - 1,
                `${label}: stacked panels do not overlap`,
              );
            }
            if (version === "1") {
              assert.ok(
                geometry.wrappers.every((display) => display === "contents"),
                `${label}: v2 sections preserve v1 flow`,
              );
              const expected = baseline?.find(
                (entry) =>
                  entry.locale === locale &&
                  entry.productPath === product.path &&
                  entry.width === width,
              );
              if (expected) {
                for (const [part, selector] of [
                  ["gallery", ".sf-product-gallery"],
                  ["stage", ".sf-main-image"],
                  ["info", ".sf-product-info"],
                ]) {
                  for (const dimension of ["width", "height"])
                    near(
                      geometry[part][dimension],
                      expected.geometry[selector][dimension],
                      `${label}: ${part} v1 ${dimension} stays unchanged`,
                    );
                }
              }
            }
            await expect(image).toBeVisible();
            await image.evaluate((node) => node.decode());
            const pixels =
              version === "2" ? await imagePixelEvidence(stage, image) : null;
            if (version === "2" && [1440, 320].includes(width)) {
              await page.screenshot({
                path: join(
                  output,
                  `${product.key}-${locale}-${theme}-${width}.png`,
                ),
                fullPage: true,
                animations: "disabled",
              });
            }
            if (version === "2" && width === 320) {
              const axe = await new AxeBuilder({ page })
                .include(".sf-product-detail-layout")
                .analyze();
              if (axe.violations.length)
                await writeFile(
                  join(output, `axe-${product.key}-${locale}-${theme}.json`),
                  JSON.stringify(axe.violations, null, 2),
                );
              assert.deepEqual(
                axe.violations.map(({ id, impact }) => ({ id, impact })),
                [],
                `${label}: detail accessibility`,
              );
            }
            checks.push({ label, geometry, pixels });
            console.log(`PASS ${label}`);
          }
        }
      }
    }
  }
  assert.deepEqual(runtimeErrors, []);
} catch (error) {
  failure = error;
} finally {
  await browser.close();
  await writeFile(
    join(output, "results.json"),
    JSON.stringify(
      { engine, base, checks, runtimeErrors, error: failure?.message },
      null,
      2,
    ),
  );
}
console.log(`Evidence: ${output}`);
if (failure) throw failure;
