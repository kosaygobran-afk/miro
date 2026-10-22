// Read-only presentation QA: renders the real badge components into disposable
// browser fixtures. No catalog, promotion, settings, or authentication writes.
// PROMO_BADGE_OUTPUT_DIR=/tmp/miro-promo-badges node scripts/verify-promotional-badges.mjs
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import ts from "typescript";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const output = process.env.PROMO_BADGE_OUTPUT_DIR || "/tmp/miro-promo-badges";
const widths = (process.env.PROMO_BADGE_WIDTHS || "320,390,1440")
  .split(",")
  .map(Number);
const locales = (process.env.PROMO_BADGE_LOCALES || "en,he").split(",");
const themes = (process.env.PROMO_BADGE_THEMES || "dark,medium,light").split(
  ",",
);
const require = createRequire(import.meta.url);
const modules = new Map();
const styleSources = new Map();
let appearanceVersion = "2";

// Keep CSS-module specificity and selectors while giving server-rendered markup
// deterministic classes. Protect :global selectors before renaming local names.
function moduleStyle(path) {
  const source = readFileSync(path, "utf8");
  const globals = [];
  const css = source
    .replace(/:global\(([^)]+)\)/g, (_, selector) => {
      globals.push(selector);
      return `__PROMO_GLOBAL_${globals.length - 1}__`;
    })
    .replace(/\.([a-zA-Z_][\w-]*)/g, ".qa-promo-$1")
    .replace(/__PROMO_GLOBAL_(\d+)__/g, (_, index) => globals[Number(index)]);
  styleSources.set(path, css);
  return new Proxy({}, { get: (_, key) => `qa-promo-${String(key)}` });
}

function loadComponent(path) {
  if (modules.has(path)) return modules.get(path);
  const exports = {};
  modules.set(path, exports);
  const source = readFileSync(path, "utf8");
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText,
    {
      exports,
      require: (name) => {
        if (name.includes("animation-provider"))
          return { useAnimationSettings: () => ({ appearanceVersion }) };
        if (name.endsWith(".module.css"))
          return {
            __esModule: true,
            default: moduleStyle(resolve(dirname(path), name)),
          };
        if (name.startsWith("."))
          return loadComponent(resolve(dirname(path), `${name}.tsx`));
        return require(name);
      },
    },
    { filename: path },
  );
  return exports;
}

const { PromoBadge, StickerCluster, PROMO_BADGE_ICONS } = loadComponent(
  join(root, "src/features/catalog/product-promo-badge.tsx"),
);
const layout = await readFile(
  join(root, "src/app/[locale]/layout.tsx"),
  "utf8",
);
const globalStyles = await Promise.all(
  [...layout.matchAll(/import\s+"([^"]+\.css)"/g)].map(async ([, name]) => {
    const path = name.startsWith("@/")
      ? join(root, "src", name.slice(2))
      : resolve(root, "src/app/[locale]", name);
    return (await readFile(path, "utf8")).replace(
      /@import\s+"tailwindcss"\s*;/g,
      "",
    );
  }),
);
const css = [...globalStyles, ...styleSources.values()].join("\n");
const definitions = [
  [
    "significant_sale",
    "tag",
    "sale",
    "percent",
    "Significant Sale",
    "מבצע משמעותי",
  ],
  ["best_seller", "burst", "best", "award", "Best Seller", "הנמכר ביותר"],
  ["new", "ticket", "new", "sparkles", "New arrival", "חדש בחנות"],
  ["hot", "ribbon", "hot", "flame", "Hot right now", "לוהט עכשיו"],
  ["limited", "hex", "limited", "clock", "Limited Stock", "מלאי מוגבל"],
];
const render = (Component, props) =>
  renderToStaticMarkup(createElement(Component, props));
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
function badges(locale, long = false) {
  return definitions.map(([key, shape, tone, iconName, en, he], index) => ({
    id: `fixture-${index}`,
    key,
    shape,
    tone,
    iconName,
    label: long
      ? (locale === "he"
          ? "מהדורה מוגבלת של אביזרי אבטחה מקצועיים במיוחד"
          : "Limited edition professional accessories"
        ).slice(0, 40)
      : locale === "he"
        ? he
        : en,
  }));
}

function fixture(locale, theme) {
  const short = badges(locale);
  const long = badges(locale, true);
  const enhanced = appearanceVersion === "2";
  const singleSamples = ["sm", "md", "lg"]
    .map(
      (size) => `
    <section class="qa-samples" aria-label="${size} badges">
      ${[...short, ...long]
        .map(
          (badge) => `<div class="qa-sample" data-size="${size}">
        ${render(PromoBadge, { badge, locale, size })}</div>`,
        )
        .join("")}
    </section>`,
    )
    .join("");
  const cards = short
    .map((badge, index) => {
      const ordered = [
        badge,
        long[(index + 1) % long.length],
        ...short.slice(0, 3),
      ];
      const cluster = render(StickerCluster, {
        badges: ordered,
        locale,
        maxVisible: 2,
      });
      return `<article class="sf-product-card"><div class="sf-product-media-shell" data-fixture-frame="card">
        ${enhanced ? cluster : ""}
      <a class="sf-product-media" href="#fixture">
        ${enhanced ? "" : cluster}
        <span class="sf-product-badge">${locale === "he" ? "נבחר" : "Featured"}</span>
        <span class="qa-product" aria-hidden="true"></span>
        <span class="sf-product-expand" aria-hidden="true">↗</span>
      </a></div></article>`;
    })
    .join("");
  const rails = short
    .map((badge) => {
      const cluster = render(StickerCluster, {
        badges: [badge, long[0], ...short.slice(1)],
        locale,
        maxVisible: 2,
      });
      return `<article class="sf-moving-rail-card qa-rail-card" data-fixture-frame="rail">
      ${enhanced ? cluster : ""}
    <div class="sf-moving-rail-media">
      ${enhanced ? "" : cluster}
      <span class="qa-product" aria-hidden="true"></span>
      <span class="sf-moving-rail-open" aria-hidden="true">↗</span>
    </div></article>`;
    })
    .join("");
  const stress = [130, 143, 160]
    .map((width) => {
      const cluster = render(StickerCluster, {
        badges: [...long],
        locale,
        maxVisible: 2,
      });
      return `<article class="sf-product-card" style="width:${width}px;flex:none"><div class="sf-product-media-shell" data-fixture-frame="card">
        ${enhanced ? cluster : ""}
      <a class="sf-product-media" href="#fixture">
        ${enhanced ? "" : cluster}
        <span class="sf-product-badge">${locale === "he" ? "נבחר" : "Featured"}</span>
        <span class="qa-product" aria-hidden="true"></span>
        <span class="sf-product-expand" aria-hidden="true">↗</span>
      </a></div></article>`;
    })
    .join("");
  return `<!doctype html><html lang="${locale}" dir="${locale === "he" ? "rtl" : "ltr"}"
    data-theme="${theme}" data-appearance-version="${appearanceVersion}"><head>
    <meta charset="utf-8"><title>Promotional badge fixture</title><style>${css}</style>
    <style>
      *,*::before,*::after{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}
      .qa-main{margin:12px;max-width:1120px;color:var(--foreground)}
      .qa-main h1{font-size:1rem}.qa-samples{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:12px;margin-block:16px}
      .qa-sample{display:flex;align-items:flex-start;min-width:0;max-width:100%}
      .qa-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-block:20px}
      .qa-rails{display:flex;flex-wrap:wrap;gap:12px}.qa-rail-card{width:184px;flex:none}
      .qa-stress{display:flex;flex-wrap:wrap;gap:12px;margin-block:20px}
      .qa-product{position:absolute;inset:27% 25% 20%;border:1px solid var(--border-subtle);border-radius:12px;background:var(--surface-muted)}
      .qa-preview{max-width:416px;padding:12px;border:1px solid var(--border-subtle);margin-block:20px}
      @media(min-width:800px){.qa-cards{grid-template-columns:repeat(4,minmax(0,1fr))}}
    </style></head><body><main class="qa-main"><h1>${escape(`${locale} / ${theme} / appearance ${appearanceVersion}`)}</h1>
      ${singleSamples}<section class="qa-cards" aria-label="Catalog fixtures">${cards}</section>
      <section class="qa-stress" aria-label="Two long badge labels at narrow card sizes">${stress}</section>
      <section class="qa-rails" aria-label="Rail fixtures">${rails}</section>
      <section class="qa-preview" aria-label="Preview fixture"><div class="sf-hover-preview-badges">
        ${short.map((badge) => render(PromoBadge, { badge, locale, size: "sm" })).join("")}
        <span class="sf-hover-preview-badge-more">+3</span>
      </div></section></main></body></html>`;
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const checks = [];
const failures = [];
try {
  const iconSvg = (badge) =>
    render(PromoBadge, { badge }).match(
      /class="qa-promo-icon"[^>]*>([\s\S]*?)<\/span>/,
    )?.[1];
  const symbols = new Set();
  for (const { name, Icon } of PROMO_BADGE_ICONS) {
    const actual = iconSvg({ ...badges("en")[0], iconName: name });
    assert.equal(
      actual,
      render(Icon, {
        size: 16,
        strokeWidth: 1.8,
        "aria-hidden": "true",
        focusable: "false",
      }),
      `${name} must render its actual exported icon`,
    );
    symbols.add(actual.replace(/^<svg\b[^>]*>|<\/svg>$/g, ""));
  }
  assert.equal(PROMO_BADGE_ICONS.length, 12);
  assert.equal(
    symbols.size,
    12,
    "Each icon choice must use a distinct SVG symbol",
  );
  for (const badge of badges("en"))
    for (const iconName of [null, "unknown-fixture-icon"])
      assert.equal(
        iconSvg({ ...badge, iconName }),
        iconSvg(badge),
        `${badge.tone} must fall back to its own default icon`,
      );
  checks.push({
    label: "icon-rendering-and-fallback",
    choices: 12,
    distinctSymbols: symbols.size,
    toneFallbacks: 10,
  });
  console.log(
    "PASS icon-rendering-and-fallback: 12 distinct SVG symbols, 10 tone fallbacks",
  );
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  // A fixture is self-contained; unexpected requests cannot reach the business.
  await page.route("**/*", (route) => route.abort());
  for (const locale of locales)
    for (const reversed of [false, true]) {
      await page.setViewportSize({ width: 390, height: 700 });
      const positionBadges = badges(locale);
      if (reversed) positionBadges.reverse();
      const singletons = reversed
        ? ""
        : `<section style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-block:20px">${badges(
            locale,
          )
            .map(
              (badge) =>
                `<article class="sf-product-card qa-singleton"><div class="sf-product-media-shell">${render(StickerCluster, { badges: [badge], locale, maxVisible: 2 })}<div class="sf-product-media"><span class="qa-product" aria-hidden="true"></span></div></div></article>`,
            )
            .join("")}</section>`;
      const scene = `<main class="qa-main"><h1>Five semantic badge positions</h1><article class="sf-product-card" style="max-width:480px"><div class="sf-product-media-shell">
      ${render(StickerCluster, { badges: positionBadges, locale, maxVisible: 5 })}
      <div class="sf-product-media"><span class="qa-product" aria-hidden="true"></span></div>
    </div></article>${singletons}</main>`;
      await page.setContent(
        fixture(locale, "dark").replace(
          /<main class="qa-main">[\s\S]*<\/main>/,
          scene,
        ),
      );
      const evidence = await page.evaluate(() => {
        const cluster = document.querySelector(".qa-promo-cluster");
        const frame = cluster.getBoundingClientRect();
        const positions = Object.fromEntries(
          [...cluster.querySelectorAll(".qa-promo-badge")].map((badge) => {
            const rect = badge.getBoundingClientRect();
            return [
              badge.dataset.promoPosition,
              {
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                center: rect.left + rect.width / 2,
              },
            ];
          }),
        );
        const expected = [
          "top-start",
          "top-end",
          "bottom-start",
          "bottom-end",
          "center",
        ];
        const problems = [];
        if (
          Object.keys(positions).length !== 5 ||
          expected.some((key) => !positions[key])
        )
          problems.push({
            kind: "semantic-position-identity",
            actual: Object.keys(positions),
          });
        else {
          const rtl = document.documentElement.dir === "rtl";
          for (const key of ["top-start", "bottom-start"])
            if (
              Math.abs(
                rtl
                  ? positions[key].right - frame.right
                  : positions[key].left - frame.left,
              ) > 1
            )
              problems.push({ kind: "semantic-reading-start", key });
          for (const key of ["top-end", "bottom-end"])
            if (
              Math.abs(
                rtl
                  ? positions[key].left - frame.left
                  : positions[key].right - frame.right,
              ) > 1
            )
              problems.push({ kind: "semantic-reading-end", key });
          if (
            Math.abs(positions.center.center - frame.left - frame.width / 2) > 1
          )
            problems.push({ kind: "semantic-center-alignment" });
          if (
            Math.max(
              positions["top-start"].bottom,
              positions["top-end"].bottom,
            ) >
              positions.center.top + 1 ||
            positions.center.bottom >
              Math.min(
                positions["bottom-start"].top,
                positions["bottom-end"].top,
              ) +
                1
          )
            problems.push({ kind: "semantic-row-order" });
        }
        const singletonPositions = {};
        for (const card of document.querySelectorAll(".qa-singleton")) {
          const badge = card.querySelector(".qa-promo-badge");
          const bounds = badge.getBoundingClientRect();
          const frame = card
            .querySelector(".qa-promo-cluster")
            .getBoundingClientRect();
          const position = badge.dataset.promoPosition;
          singletonPositions[position] = {
            top: +(bounds.top - frame.top).toFixed(1),
            bottom: +(frame.bottom - bounds.bottom).toFixed(1),
          };
          const rtl = document.documentElement.dir === "rtl";
          if (
            position.endsWith("start") &&
            Math.abs(
              rtl ? bounds.right - frame.right : bounds.left - frame.left,
            ) > 1
          )
            problems.push({ kind: "singleton-reading-start", position });
          if (
            position.endsWith("end") &&
            Math.abs(
              rtl ? bounds.left - frame.left : bounds.right - frame.right,
            ) > 1
          )
            problems.push({ kind: "singleton-reading-end", position });
          if (
            position.startsWith("top-") &&
            Math.abs(bounds.top - frame.top) > 1
          )
            problems.push({ kind: "singleton-top", position });
          if (
            position.startsWith("bottom-") &&
            Math.abs(bounds.bottom - frame.bottom) > 1
          )
            problems.push({ kind: "singleton-bottom", position });
          if (
            position === "center" &&
            (Math.abs(
              bounds.top + bounds.height / 2 - frame.top - frame.height / 2,
            ) > 1 ||
              Math.abs(
                bounds.left + bounds.width / 2 - frame.left - frame.width / 2,
              ) > 1)
          )
            problems.push({ kind: "singleton-center" });
        }
        return { positions, singletonPositions, problems };
      });
      const label = `semantic-positions-${locale}${reversed ? "-reversed" : ""}`;
      checks.push({ label, ...evidence });
      if (evidence.problems.length)
        failures.push({ label, problems: evidence.problems });
      await page.screenshot({
        path: join(output, `${label}.png`),
        fullPage: true,
      });
      console.log(
        `${evidence.problems.length ? "FAIL" : "PASS"} ${label}: five distinct semantic positions`,
      );
    }
  for (const locale of locales)
    for (const theme of themes)
      for (const width of widths) {
        appearanceVersion = "2";
        await page.setViewportSize({ width, height: 1000 });
        await page.setContent(fixture(locale, theme));
        const evidence = await page.evaluate(() => {
          const problems = [];
          const contrasts = [];
          const clusterGeometry = [];
          const tonePalettes = {};
          const luminance = (color) => {
            if (!/^#[a-f\d]{6}$/i.test(color)) return null;
            const values = color
              .slice(1)
              .match(/../g)
              .map((value) => parseInt(value, 16) / 255)
              .map((value) =>
                value <= 0.04045
                  ? value / 12.92
                  : ((value + 0.055) / 1.055) ** 2.4,
              );
            return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
          };
          const selector = ".qa-promo-badge";
          const all = [...document.querySelectorAll(selector)];
          const box = (node) => node.getBoundingClientRect();
          const inside = (inner, outer, tolerance = 1) =>
            inner.left >= outer.left - tolerance &&
            inner.right <= outer.right + tolerance &&
            inner.top >= outer.top - tolerance &&
            inner.bottom <= outer.bottom + tolerance;
          for (const badge of all) {
            const frame = box(badge);
            const style = getComputedStyle(badge);
            const tone = [...badge.classList].find((name) =>
              name.startsWith("qa-promo-tone"),
            );
            tonePalettes[tone] = [
              style.getPropertyValue("--promo-fill").trim(),
              style.getPropertyValue("--promo-ink").trim(),
            ].join("/");
            const ink = luminance(style.getPropertyValue("--promo-ink").trim());
            const fill = luminance(
              style.getPropertyValue("--promo-fill").trim(),
            );
            if (ink === null || fill === null)
              problems.push({
                kind: "unresolved-contrast-palette",
                label: badge.textContent,
              });
            else {
              const ratio =
                (Math.max(ink, fill) + 0.05) / (Math.min(ink, fill) + 0.05);
              contrasts.push(ratio);
              if (ratio < 4.5)
                problems.push({
                  kind: "text-contrast",
                  ratio,
                  label: badge.textContent,
                });
            }
            const label = badge.querySelector(".qa-promo-label");
            if (!label || !inside(box(label), frame))
              problems.push({
                kind: "label-outside-badge",
                label: badge.textContent,
              });
            if (label) {
              const range = document.createRange();
              range.selectNodeContents(label);
              if (!inside(range.getBoundingClientRect(), frame))
                problems.push({
                  kind: "text-outside-badge",
                  label: label.textContent,
                });
              if (label.scrollWidth > label.clientWidth + 1)
                problems.push({
                  kind: "label-overflow",
                  label: label.textContent,
                });
            }
            if (
              [...badge.querySelectorAll("svg")].some(
                (svg) =>
                  svg.getAttribute("aria-hidden") !== "true" ||
                  svg.getAttribute("focusable") === "true",
              )
            )
              problems.push({
                kind: "decorative-svg-accessibility",
                label: badge.textContent,
              });
            if (getComputedStyle(badge).clipPath !== "none")
              problems.push({
                kind: "text-silhouette-clipping",
                label: badge.textContent,
              });
          }
          const clusters = [...document.querySelectorAll(".qa-promo-cluster")];
          for (const cluster of clusters) {
            const frame = cluster.closest("[data-fixture-frame]");
            const media = frame.querySelector(
              ".sf-product-media,.sf-moving-rail-media",
            );
            clusterGeometry.push({
              surface: frame?.dataset.fixtureFrame,
              width: +box(frame).width.toFixed(1),
              frameHeight: +box(frame).height.toFixed(1),
              clusterHeight: +box(cluster).height.toFixed(1),
              bottomGap: +(box(frame).bottom - box(cluster).bottom).toFixed(1),
              photoGap: +(box(media).top - box(cluster).bottom).toFixed(1),
            });
            if (box(cluster).bottom > box(media).top + 1)
              problems.push({
                kind: "cluster-overlaps-photo",
                surface: frame.dataset.fixtureFrame,
              });
            if (!frame || !inside(box(cluster), box(frame)))
              problems.push({
                kind: "cluster-outside-media",
                surface: frame?.dataset.fixtureFrame,
              });
            const children = [...cluster.children];
            for (const child of children)
              if (!inside(box(child), box(frame)))
                problems.push({
                  kind: "badge-outside-media",
                  surface: frame?.dataset.fixtureFrame,
                  label: child.textContent,
                });
            const start =
              document.documentElement.dir === "rtl"
                ? box(frame).right - box(cluster).right
                : box(cluster).left - box(frame).left;
            if (start < 2 || start > 18)
              problems.push({ kind: "cluster-reading-start-position", start });
            if (
              cluster.querySelector(".qa-promo-more")?.textContent.trim() !==
                "+3" &&
              frame?.dataset.fixtureFrame === "card"
            )
              problems.push({ kind: "hidden-count" });
            const legacy = frame.querySelector(".sf-product-badge");
            if (legacy)
              for (const child of children) {
                const a = box(child),
                  b = box(legacy);
                if (
                  Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
                  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
                )
                  problems.push({
                    kind: "legacy-badge-overlap",
                    label: child.textContent,
                  });
              }
          }
          if (document.documentElement.scrollWidth > innerWidth + 1)
            problems.push({
              kind: "page-overflow",
              actual: document.documentElement.scrollWidth,
              width: innerWidth,
            });
          if (
            Object.keys(tonePalettes).length !== 5 ||
            new Set(Object.values(tonePalettes)).size !== 5
          )
            problems.push({ kind: "tone-palette-cascade", tonePalettes });
          const sizes = Object.fromEntries(
            ["sm", "md", "lg"].map((size) => [
              size,
              parseFloat(
                getComputedStyle(
                  document.querySelector(
                    `.qa-sample[data-size="${size}"] .qa-promo-badge`,
                  ),
                ).fontSize,
              ),
            ]),
          );
          if (!(sizes.sm < sizes.md && sizes.md < sizes.lg))
            problems.push({ kind: "size-cascade", sizes });
          return {
            badgeCount: all.length,
            clusterCount: clusters.length,
            minimumContrast: +Math.min(...contrasts).toFixed(2),
            clusterGeometry,
            tonePalettes,
            sizes,
            problems,
          };
        });
        const label = `${locale}-${theme}-${width}`;
        if (evidence.badgeCount !== 61)
          evidence.problems.push({
            kind: "fixture-badge-count",
            actual: evidence.badgeCount,
            expected: 61,
          });
        if (evidence.clusterCount !== 13)
          evidence.problems.push({
            kind: "fixture-cluster-count",
            actual: evidence.clusterCount,
            expected: 13,
          });
        const axe = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        const violations = axe.violations.map(({ id, nodes }) => ({
          id,
          nodes: nodes.map(({ target, failureSummary }) => ({
            target,
            failureSummary,
          })),
        }));
        if (violations.length)
          evidence.problems.push({ kind: "accessibility", violations });
        checks.push({ label, ...evidence });
        if (evidence.problems.length)
          failures.push({ label, problems: evidence.problems });
        await page.screenshot({
          path: join(output, `${label}.png`),
          fullPage: true,
        });
        console.log(
          `${evidence.problems.length ? "FAIL" : "PASS"} ${label}: ${evidence.badgeCount} badges, ${evidence.clusterCount} clusters`,
        );
      }
  appearanceVersion = "1";
  await page.setContent(fixture("en", "dark"));
  const legacy = await page.evaluate(() => ({
    originalBadges: document.querySelectorAll(".sf-promo-badge").length,
    redesignedBadges: document.querySelectorAll(".qa-promo-badge").length,
    originalCluster: document.querySelectorAll(".sf-sticker-cluster").length,
    redesignedCluster: document.querySelectorAll(".qa-promo-cluster").length,
    originalPlacement: [
      ...document.querySelectorAll(".sf-sticker-cluster"),
    ].every(
      (cluster) =>
        getComputedStyle(cluster).position === "absolute" &&
        cluster.offsetParent?.matches(
          ".sf-product-media,.sf-moving-rail-media",
        ),
    ),
  }));
  assert.deepEqual(legacy, {
    originalBadges: 61,
    redesignedBadges: 0,
    originalCluster: 13,
    redesignedCluster: 0,
    originalPlacement: true,
  });
  checks.push({ label: "version-1-runtime", ...legacy });
  console.log(
    "PASS version-1-runtime: protected original badge and cluster markup",
  );
} finally {
  await browser.close();
  await writeFile(
    join(output, "report.json"),
    JSON.stringify(
      {
        coverage:
          "Actual TSX and CSS module, global stylesheet source in layout order, deterministic browser-only cards/rail/preview. Animation context mocked only for appearance version. Arial fallback metrics; no live product/editor/auth state, image occlusion judgement or physical-device approval.",
        checks,
        failures,
      },
      null,
      2,
    ),
  );
}
assert.equal(
  failures.length,
  0,
  `${failures.length} badge fixture scenarios failed; see ${join(output, "report.json")}`,
);
