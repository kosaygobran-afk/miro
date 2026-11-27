import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL(
    "../../src/lib/catalog/storefront-category-artwork.ts",
    import.meta.url,
  ),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
});
const { createCategoryArtworkIconUrl, normalizeCategoryArtworkSvg } =
  await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const wrap = (content) => `<svg viewBox="0 0 240 160">${content}</svg>`;

test("every bundled category illustration can be edited as graphics-only SVG", () => {
  const directory = new URL(
    "../../public/images/category-artwork/",
    import.meta.url,
  );
  const assets = readdirSync(directory).filter((file) => file.endsWith(".svg"));
  assert.ok(assets.length >= 12);
  for (const file of assets) {
    const original = readFileSync(new URL(file, directory), "utf8");
    const normalized = normalizeCategoryArtworkSvg(original);
    assert.ok(normalized, file);
    assert.equal(normalizeCategoryArtworkSvg(normalized), normalized, file);
    assert.match(
      createCategoryArtworkIconUrl(normalized),
      /^data:image\/svg\+xml,/,
    );
  }
});

test("category SVG accepts local geometry and strips publication metadata", () => {
  const svg = normalizeCategoryArtworkSvg(
    wrap(
      `<!-- editor note --><defs><linearGradient id="light"><stop offset="0" stop-color="#ffca42"/></linearGradient></defs><path d="M2 2h40v44z" fill="url(#light)"/>`,
    ),
  );
  assert.ok(svg);
  assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /fill="url\(#light\)"/);
  assert.doesNotMatch(svg, /editor note/);
});

test("category SVG rejects active, external, textual and oversized artwork", () => {
  for (const invalid of [
    wrap("<script></script><rect width='20' height='20'/>"),
    wrap("<rect width='20' height='20' onload='invalid'/>"),
    wrap("<foreignObject/><rect width='20' height='20'/>"),
    wrap("<style>rect{fill:red}</style><rect width='20' height='20'/>"),
    wrap(
      "<rect width='20' height='20' fill='url(https://example.invalid/art)'/>",
    ),
    wrap("<text>A product name</text>"),
    wrap("<use href='#product'/><rect id='product' width='20' height='20'/>"),
    wrap("<image href='https://example.invalid/image.png'/>"),
    wrap(
      "<defs><clipPath id='a'><rect clip-path='url(#a)'/></clipPath></defs><rect/>",
    ),
    wrap("<g></g>"),
    wrap("<path d='M1e999 20z'/>"),
    wrap("<circle r='5'/>".repeat(3000)),
    `<!DOCTYPE svg>${wrap("<rect/>")}`,
    "<svg viewBox='0 0 0 160'><rect/></svg>",
  ]) {
    assert.equal(createCategoryArtworkIconUrl(invalid), null);
  }
});
