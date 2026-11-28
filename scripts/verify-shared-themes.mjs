// THEME_REVIEW=1 python3 scripts/verify-commerce-integration.py
// The parent harness supplies an isolated app and synthetic customer/CEO accounts.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";

const base = process.env.COMMERCE_NEXT_URL;
const actors = JSON.parse(process.env.COMMERCE_TEST_ACTORS || "{}");
assert.ok(
  base &&
    new URL(base).hostname === "127.0.0.1" &&
    actors.customer &&
    actors.ceo,
);
const output = process.env.COMMERCE_OUTPUT_DIR;
if (output) await mkdir(output, { recursive: true });

const pages = [
  {
    route: "services",
    region: '[aria-labelledby="buyer-title"]',
    title: "#buyer-title",
    action: 'a[href="#expertise"]',
  },
  {
    route: "account",
    actor: actors.customer,
    region: ".account-profile-header",
    title: ".account-profile-header h1",
    action: ".account-dashboard .miro-button-primary",
  },
  {
    route: "admin",
    actor: actors.ceo,
    region: ".mgmt-page-header",
    title: ".mgmt-page-header h1",
    action: ".mgmt-page-header .mgmt-button--primary",
  },
];
const themes = ["dark", "medium", "light"];
const paletteRoles = [
  "canvas",
  "surface",
  "raised",
  "inset",
  "hover",
  "text",
  "muted",
  "subtle",
  "gold",
  "gold-hover",
  "on-gold",
  "accent",
  "focus",
  "control-border",
  "success",
  "success-bg",
  "danger",
  "danger-bg",
  "warning",
  "warning-bg",
  "info",
  "info-bg",
];

function fixtureCookie(actor) {
  const session = {
    access_token: actor.token,
    refresh_token: "fixture-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: actor.id,
      aud: "authenticated",
      role: "authenticated",
      email: actor.email,
      app_metadata: {},
      user_metadata: { full_name: actor.name },
    },
  };
  return {
    name: "sb-127-auth-token",
    value:
      "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
    url: base,
    httpOnly: true,
  };
}

function luminance([red, green, blue]) {
  const linear = (channel) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return linear(red) * 0.2126 + linear(green) * 0.7152 + linear(blue) * 0.0722;
}
function ratio(a, b) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function checkPair(front, back, threshold, label) {
  const measured = ratio(front, back);
  assert.ok(
    measured >= threshold,
    label + " contrast " + measured.toFixed(2) + ":1",
  );
  return measured;
}

async function paletteAt(locator) {
  return locator.evaluate((node, roles) => {
    const style = getComputedStyle(node);
    const ctx = document.createElement("canvas").getContext("2d");
    return Object.fromEntries(
      roles.map((role) => {
        const value = style.getPropertyValue("--miro-" + role).trim();
        if (!CSS.supports("color", value))
          throw new Error("Missing color --miro-" + role);
        ctx.fillStyle = value;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        if (a !== 255) throw new Error("Expected opaque --miro-" + role);
        return [role, [r, g, b]];
      }),
    );
  }, paletteRoles);
}
const cssColor = (rgb) => "rgb(" + rgb.join(", ") + ")";

const palettes = {};
const browser = await chromium.launch();
try {
  for (const surface of pages) {
    const context = await browser.newContext({
      reducedMotion: "reduce",
      viewport: { width: 1440, height: 950 },
    });
    if (surface.actor) await context.addCookies([fixtureCookie(surface.actor)]);
    const page = await context.newPage();
    await page.route("**/api/track", (route) => route.fulfill({ status: 204 }));
    for (const locale of ["en", "he"]) {
      await page.goto(base + "/" + locale + "/" + surface.route, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      const region = page.locator(surface.region);
      await expect(region).toBeVisible({ timeout: 30000 });
      await expect(page.locator("html")).toHaveAttribute(
        "data-motion-ready",
        "true",
      );
      const buttons = page.locator("[data-theme-option]:visible");
      assert.deepEqual(
        await buttons.evaluateAll((nodes) =>
          nodes.map((n) => n.dataset.themeOption),
        ),
        themes,
      );
      for (const theme of themes) {
        const label = [locale, surface.route, theme].join("-");
        await page
          .locator('[data-theme-option="' + theme + '"]:visible')
          .click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const palette = await paletteAt(region);
        if (palettes[theme])
          assert.deepEqual(
            palette,
            palettes[theme],
            label + " shares the storefront palette",
          );
        else palettes[theme] = palette;
        let minimumReading = Infinity;
        for (const bg of ["canvas", "surface", "raised", "inset", "hover"]) {
          for (const fg of ["text", "muted", "subtle", "accent"]) {
            minimumReading = Math.min(
              minimumReading,
              checkPair(
                palette[fg],
                palette[bg],
                4.5,
                label + " " + fg + "/" + bg,
              ),
            );
          }
          checkPair(palette.focus, palette[bg], 3, label + " focus/" + bg);
          checkPair(
            palette["control-border"],
            palette[bg],
            3,
            label + " control/" + bg,
          );
        }
        for (const tone of ["success", "danger", "warning", "info"])
          checkPair(
            palette[tone],
            palette[tone + "-bg"],
            4.5,
            label + " " + tone,
          );
        await expect(page.locator(surface.title)).toHaveCSS(
          "color",
          cssColor(palette.text),
        );
        const action = page.locator(surface.action).first();
        await expect(action).toHaveCSS("color", cssColor(palette["on-gold"]));
        const { data, info } = await sharp(
          await action.screenshot({ animations: "disabled" }),
        )
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const sample = (x, y) =>
          Array.from(
            data.subarray(
              (y * info.width + x) * 3,
              (y * info.width + x) * 3 + 3,
            ),
          );
        const buttonFill = sample(Math.floor(info.width / 2), 4);
        const actionRatio = checkPair(
          palette["on-gold"],
          buttonFill,
          4.5,
          label + " painted action",
        );
        assert.ok(
          buttonFill[0] >= buttonFill[1] && buttonFill[1] > buttonFill[2] + 30,
          label + " action is gold",
        );
        await page.keyboard.press("Tab");
        await action.focus();
        const indicator = await action.evaluate((node) => {
          const style = getComputedStyle(node);
          return {
            width: parseFloat(style.outlineWidth),
            color: style.outlineColor,
          };
        });
        assert.ok(indicator.width >= 2, label + " keyboard focus outline");
        const ring = indicator.color.match(/[\d.]+/g).map(Number);
        checkPair(ring, palette.surface, 3, label + " painted focus/surface");
        const axe = new AxeBuilder({ page })
          .include(surface.region)
          .withRules(["color-contrast"]);
        if (surface.route === "admin") {
          await expect(page.locator(".mgmt-shell")).toHaveCSS(
            "background-color",
            cssColor(palette.canvas),
          );
          await page.locator(".mgmt-account__trigger").click();
          const menu = page.locator(
            "#mgmt-overlay-portal-host .mgmt-account__popover",
          );
          await expect(menu).toBeVisible();
          assert.deepEqual(
            await paletteAt(menu),
            palette,
            label + " portaled menu palette",
          );
          axe.include(".mgmt-account__popover");
        }
        const results = await axe.analyze();
        assert.deepEqual(
          results.violations.flatMap((v) =>
            v.nodes.map((n) => [n.target, n.failureSummary]),
          ),
          [],
          label + " reading contrast",
        );
        if (surface.route === "admin") await page.keyboard.press("Escape");
        await page.evaluate(() => {
          document.activeElement?.blur();
          window.scrollTo(0, 0);
        });
        if (output)
          await page.screenshot({
            path: path.join(output, label + ".png"),
            animations: "disabled",
          });
        console.log(
          "PASS",
          label,
          "reading",
          minimumReading.toFixed(2),
          "painted CTA",
          actionRatio.toFixed(2),
        );
      }
    }
    await context.close();
  }
  assert.ok(
    luminance(palettes.dark.canvas) < luminance(palettes.medium.canvas) &&
      luminance(palettes.medium.canvas) < luminance(palettes.light.canvas),
    "Three progressively lighter canvases",
  );
} finally {
  await browser.close();
}
