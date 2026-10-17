// Public, read-only browser QA. The actual product image is fetched normally.
// Empty/multiple-image layout variants are temporary DOM fixtures, never catalog writes.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import sharp from "sharp";

const engine = process.env.PRODUCT_DETAIL_REVIEW_BROWSER || "chromium";
const browserType = { chromium, firefox, webkit }[engine];
assert.ok(browserType, "Supported engines: chromium, firefox, webkit");
const base = process.env.ADMIN_BASE_URL || "http://localhost:3000";
const productPath =
  process.env.PRODUCT_DETAIL_REVIEW_PATH || "/store/accessories/5586793";
assert.ok(
  productPath.startsWith("/store/"),
  "Use a locale-free /store/category/product path",
);
const output =
  process.env.PRODUCT_DETAIL_REVIEW_OUTPUT_DIR ||
  join(tmpdir(), `miro-product-detail-${engine}`);
await mkdir(output, { recursive: true });
const browser = await browserType.launch();
const checks = [];
const imageRequests = [];
const runtimeErrors = [];
let failure;

function record(label, evidence) {
  checks.push({ label, ...evidence });
  console.log(`PASS ${label}`);
}

async function visibleImagePixels(stage, image) {
  const visible = await stage.screenshot({ animations: "disabled" });
  const priorVisibility = await image.evaluate((node) => {
    const prior = node.style.visibility;
    node.style.visibility = "hidden";
    return prior;
  });
  let hidden;
  try {
    hidden = await stage.screenshot({ animations: "disabled" });
  } finally {
    await image.evaluate((node, prior) => {
      node.style.visibility = prior;
    }, priorVisibility);
  }
  const actual = await sharp(visible)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const withoutImage = await sharp(hidden).removeAlpha().raw().toBuffer();
  assert.equal(actual.data.length, withoutImage.length);
  let changedPixels = 0;
  for (
    let index = 0;
    index < actual.data.length;
    index += actual.info.channels
  ) {
    if (
      [0, 1, 2].some(
        (channel) =>
          Math.abs(
            actual.data[index + channel] - withoutImage[index + channel],
          ) > 12,
      )
    )
      changedPixels++;
  }
  const ratio = changedPixels / (actual.info.width * actual.info.height);
  assert.ok(
    changedPixels > 50 && ratio > 0.005,
    `A decoded image must visibly contribute pixels: ${changedPixels} pixels, ${(ratio * 100).toFixed(2)}% of its stage`,
  );
  return { changedPixels, ratio };
}

try {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("response", (response) => {
    if (response.request().resourceType() === "image")
      imageRequests.push({ url: response.url(), status: response.status() });
  });
  page.on("requestfailed", (request) => {
    if (request.resourceType() === "image")
      imageRequests.push({
        url: request.url(),
        error: request.failure()?.errorText,
      });
  });
  for (const locale of ["en", "he"]) {
    for (const width of [1440, 900, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      const response = await page.goto(`${base}/${locale}${productPath}`, {
        waitUntil: "networkidle",
      });
      assert.equal(response.status(), 200);
      const gallery = page.locator(".sf-product-gallery");
      const stage = gallery.locator(".sf-main-image");
      await expect(gallery).toHaveCount(1);
      const image = stage.locator("img");
      await expect(image).toHaveCount(1);
      await image.evaluate((node) => node.decode());
      await gallery.evaluate((node) => {
        globalThis.__miroImageGalleryBaseline = node.cloneNode(true);
      });
      for (const version of ["1", "2"]) {
        await page.evaluate((version) => {
          document.documentElement.dataset.appearanceVersion = version;
          document.documentElement.dataset.theme = "light";
        }, version);
        for (const variant of ["single", "multiple", "empty"]) {
          await gallery.evaluate((node, variant) => {
            node.replaceChildren(
              ...[...globalThis.__miroImageGalleryBaseline.childNodes].map(
                (child) => child.cloneNode(true),
              ),
            );
            node.querySelector(".sf-thumbnail-strip")?.remove();
            const main = node.querySelector(".sf-main-image");
            if (variant === "multiple") {
              const strip = document.createElement("div");
              strip.className = "sf-thumbnail-strip";
              const list = document.createElement("ul");
              list.className = "sf-thumbnail-list";
              for (let index = 0; index < 2; index++) {
                const item = document.createElement("li");
                item.className = "sf-thumbnail-item";
                const button = document.createElement("button");
                button.className = "sf-thumbnail";
                button.setAttribute("aria-label", `QA thumbnail ${index + 1}`);
                const image = main.querySelector("img").cloneNode(true);
                image.className = "sf-thumbnail-image";
                image.alt = "";
                button.append(image);
                item.append(button);
                list.append(item);
              }
              strip.append(list);
              node.prepend(strip);
            } else if (variant === "empty") {
              const placeholder = document.createElement("div");
              placeholder.className = "sf-product-visual-placeholder";
              placeholder.textContent = "QA illustration placeholder";
              main.replaceChildren(placeholder);
            }
          }, variant);
          const bounds = await gallery.boundingBox();
          const stageBounds = await stage.boundingBox();
          assert.ok(
            stageBounds.width >=
              bounds.width *
                (variant === "multiple" && width > 600 ? 0.6 : 0.98),
            `${variant} image stage must use the available gallery width, got ${stageBounds.width}/${bounds.width}`,
          );
          assert.ok(
            stageBounds.height >= stageBounds.width * 0.95,
            "Main image must retain its substantial square stage",
          );
          assert.ok(
            stageBounds.x >= bounds.x - 1 &&
              stageBounds.x + stageBounds.width <= bounds.x + bounds.width + 1,
          );
          if (variant === "multiple") {
            const thumbnails = await gallery
              .locator(".sf-thumbnail-strip")
              .boundingBox();
            assert.ok(
              width <= 600
                ? thumbnails.y >= stageBounds.y + stageBounds.height - 1
                : thumbnails.x + thumbnails.width <= stageBounds.x + 1 ||
                    stageBounds.x + stageBounds.width <= thumbnails.x + 1,
              "Thumbnail strip must occupy its own column on desktop and sit below the stage on phones",
            );
          }
          let pixels;
          let imageState;
          if (variant === "single") {
            await image.evaluate((node) => node.decode());
            imageState = await image.evaluate((node) => {
              const style = getComputedStyle(node);
              return {
                src: node.src,
                currentSrc: node.currentSrc,
                complete: node.complete,
                naturalWidth: node.naturalWidth,
                naturalHeight: node.naturalHeight,
                display: style.display,
                opacity: style.opacity,
                visibility: style.visibility,
              };
            });
            assert.ok(imageState.complete && imageState.naturalWidth > 0);
            await expect(image).toBeVisible();
            pixels = await visibleImagePixels(stage, image);
            if (version === "2" && [1440, 320].includes(width)) {
              await page.screenshot({
                path: join(output, `${locale}-${width}-actual.png`),
                fullPage: true,
                animations: "disabled",
              });
            }
          }
          record(`${locale}/appearance${version}/${width}/${variant}`, {
            bounds,
            stageBounds,
            imageState,
            pixels,
            domFixture: variant !== "single",
          });
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
      {
        engine,
        base,
        productPath,
        checks,
        imageRequests,
        runtimeErrors,
        error: failure?.message,
      },
      null,
      2,
    ),
  );
}
console.log(`Evidence: ${output}`);
if (failure) throw failure;
