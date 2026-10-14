// Run only with POS_REVIEW=1 python3 scripts/verify-commerce-integration.py.
// Actual Next APIs + disposable PostgreSQL; no linked accounts/catalog/payments.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  chromium,
  firefox,
  webkit,
  expect as baseExpect,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const expect = baseExpect.configure({ timeout: 20000 });

const base = process.env.COMMERCE_NEXT_URL;
const fixture = process.env.COMMERCE_FIXTURE_URL;
const actors = JSON.parse(process.env.COMMERCE_TEST_ACTORS || "{}");
assert.ok(
  base?.startsWith("http://127.0.0.1:") &&
    fixture?.startsWith("http://127.0.0.1:"),
);
const actor = actors.ceo;
const session = {
  access_token: actor.token,
  refresh_token: "refresh-fixture",
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
const cookie = {
  name: "sb-127-auth-token",
  value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
  url: base,
  httpOnly: true,
  sameSite: "Lax",
};
const evidence =
  process.env.COMMERCE_OUTPUT_DIR ||
  path.join(os.tmpdir(), `miro-pos-review-${Date.now()}`);
await mkdir(evidence, { recursive: true });
const report = {
  matrix: [],
  flows: [],
  axe: [],
  runtimeErrors: [],
  requests: [],
};
const engines = process.env.POS_ENGINES?.split(",") || [
  "chromium",
  "firefox",
  "webkit",
];
const implementations = { chromium, firefox, webkit };
async function effects() {
  const response = await fetch(`${fixture}/fixture/pos-effects`);
  assert.equal(response.status, 200);
  return response.json();
}
function headers() {
  return { origin: base, "content-type": "application/json" };
}
let stage = "start";
try {
  for (const engine of engines) {
    const browser = await implementations[engine].launch({ headless: true });
    try {
      const context = await browser.newContext({ reducedMotion: "reduce" });
      await context.addCookies([cookie]);
      await context.addInitScript(() => {
        const theme = new URL(location.href).searchParams.get("__qa_theme");
        if (theme) localStorage.setItem("miro-theme", theme);
      });
      const page = await context.newPage();
      page.on("console", (message) => {
        if (message.type() === "error")
          report.requests.push({ engine, error: message.text() });
      });
      page.on("pageerror", (error) =>
        report.runtimeErrors.push({ engine, message: error.message }),
      );
      page.on("requestfailed", (request) =>
        report.requests.push({
          engine,
          url: request.url(),
          failure: request.failure()?.errorText,
        }),
      );
      page.on("dialog", (dialog) => dialog.accept());
      // Customer search is a browser fixture; guest snapshot persists through the real sale API.
      await context.route("**/api/management/customers?**", (route) =>
        route.fulfill({ json: { customers: [], total: 0 } }),
      );
      for (const locale of process.env.POS_FAST ? ["en"] : ["en", "he"])
        for (const theme of process.env.POS_FAST
          ? ["dark"]
          : ["dark", "medium", "light"])
          for (const width of process.env.POS_FAST
            ? [1440]
            : [320, 390, 768, 1440]) {
            stage = `${engine} ${locale} ${theme} ${width}`;
            await page.setViewportSize({
              width,
              height: width === 1440 ? 1000 : 850,
            });
            await page.goto(`${base}/${locale}/admin/pos?__qa_theme=${theme}`, {
              waitUntil: "domcontentloaded",
            });
            const shell = page.locator('[data-pos-shell="true"]');
            await page.waitForLoadState("networkidle");
            if (!(await shell.isVisible()))
              await page
                .getByRole("button", {
                  name: locale === "he" ? "פתיחת קופה" : "Open POS",
                  exact: true,
                })
                .last()
                .click();
            await shell
              .waitFor({ state: "visible", timeout: 10000 })
              .catch(async (error) => {
                await page.screenshot({
                  path: path.join(evidence, "failure.png"),
                });
                await writeFile(
                  path.join(evidence, "failure.html"),
                  await page.content(),
                );
                report.requests.push({
                  debug: await page.evaluate(() => ({
                    storage: Object.keys(localStorage).map((key) => ({
                      key,
                      value: key.startsWith("miro.management.tools")
                        ? localStorage.getItem(key)
                        : "",
                    })),
                    pos: document
                      .querySelector("[data-pos-shell]")
                      ?.getBoundingClientRect()
                      .toJSON(),
                    bodyText: document.body.innerText.slice(-2500),
                  })),
                });
                throw error;
              });
            await expect(
              shell.getByRole("button", {
                name: /Test security camera|מצלמת אבטחה לבדיקה/,
              }),
            ).toBeVisible({ timeout: 20000 });
            assert.equal(
              await page.locator("html").getAttribute("data-theme"),
              theme,
            );
            assert.equal(
              await shell.getAttribute("dir"),
              locale === "he" ? "rtl" : "ltr",
            );
            const overflow = await shell.evaluate((el) => ({
              client: el.clientWidth,
              scroll: el.scrollWidth,
              height: el.clientHeight,
              body: document.documentElement.scrollWidth,
              viewport: innerWidth,
            }));
            assert.ok(
              overflow.scroll <= overflow.client + 1,
              `${stage} POS overflow ${JSON.stringify(overflow)}`,
            );
            assert.ok(
              overflow.body <= overflow.viewport + 1,
              `${stage} page overflow ${JSON.stringify(overflow)}`,
            );
            const mobile = overflow.client <= 740;
            assert.equal(
              await shell
                .getByRole("button", {
                  name:
                    locale === "he"
                      ? "פתיחת עגלה ותשלום"
                      : "Open cart and payment",
                })
                .isVisible(),
              mobile,
            );
            await shell
              .getByRole("button", {
                name: locale === "he" ? "תפריט הקופה" : "POS menu",
                exact: true,
              })
              .click();
            await expect(
              shell.getByRole("heading", {
                name:
                  locale === "he"
                    ? "הכל מתחיל כאן"
                    : "Ready for your next sale",
              }),
            ).toBeVisible();
            const tileCount = await shell
              .locator("nav[aria-label]")
              .last()
              .locator("a,button")
              .count();
            assert.equal(tileCount, 8);
            if (
              engine === "chromium" &&
              locale === "en" &&
              theme === "dark" &&
              [390, 1440].includes(width)
            ) {
              await page.screenshot({
                path: path.join(evidence, `pos-menu-${width}.png`),
              });
            }
            if (width === 320 && locale === "en") {
              const hubAxe = await new AxeBuilder({ page })
                .include('[data-pos-shell="true"]')
                .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
                .analyze();
              report.axe.push({
                engine,
                locale,
                theme,
                width,
                surface: "menu",
                violations: hubAxe.violations.map((v) => ({
                  id: v.id,
                  nodes: v.nodes.map((n) => n.target),
                })),
              });
              assert.equal(
                hubAxe.violations.length,
                0,
                `${stage} menu axe ${hubAxe.violations.map((v) => v.id)}`,
              );
            }
            await shell
              .getByRole("button", {
                name:
                  locale === "he"
                    ? "מכירה מוצרים, עגלה ותשלום"
                    : "Sale Products, cart & payment",
                exact: true,
              })
              .click();
            await expect(
              shell.getByRole("button", {
                name: /Test security camera|מצלמת אבטחה לבדיקה/,
              }),
            ).toBeVisible();
            if (width === 320 || width === 1440) {
              await shell
                .getByRole("button", {
                  name: /Test access reader|קורא כניסה לבדיקה/,
                })
                .click();
              if (mobile)
                await shell
                  .getByRole("button", {
                    name:
                      locale === "he"
                        ? "פתיחת עגלה ותשלום"
                        : "Open cart and payment",
                  })
                  .click();
              const matrixCart = shell.getByRole("region", {
                name: locale === "he" ? "העגלה והתשלום" : "Cart and payment",
              });
              await expect(
                matrixCart.getByText(
                  locale === "he" ? "קורא כניסה לבדיקה" : "Test access reader",
                  { exact: true },
                ),
              ).toBeVisible();
              const scan = await new AxeBuilder({ page })
                .include('[data-pos-shell="true"]')
                .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
                .analyze();
              report.axe.push({
                engine,
                locale,
                theme,
                width,
                surface: "filled cart",
                violations: scan.violations.map((v) => ({
                  id: v.id,
                  help: v.help,
                  nodes: v.nodes.map((n) => n.target),
                })),
              });
              assert.equal(
                scan.violations.length,
                0,
                `${stage} axe ${JSON.stringify(scan.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))}`,
              );
              if (engine === "chromium" && locale === "en" && theme === "dark")
                await page.screenshot({
                  path: path.join(evidence, `pos-cart-${width}.png`),
                });
              await matrixCart
                .getByRole("button", {
                  name: locale === "he" ? "נקה" : "Clear",
                  exact: true,
                })
                .click();
              await page
                .getByRole("dialog")
                .filter({
                  has: page.getByRole("heading", {
                    name:
                      locale === "he" ? "לנקות את העגלה?" : "Clear the cart?",
                    exact: true,
                  }),
                })
                .getByRole("button", {
                  name: locale === "he" ? "נקה עגלה" : "Clear cart",
                  exact: true,
                })
                .click();
              if (mobile)
                await shell
                  .getByRole("button", {
                    name: locale === "he" ? "חזרה למוצרים" : "Back to products",
                    exact: true,
                  })
                  .click();
            }
            if (
              engine === "chromium" &&
              locale === "en" &&
              theme === "dark" &&
              [390, 1440].includes(width)
            )
              await page.screenshot({
                path: path.join(evidence, `pos-${width}.png`),
                fullPage: false,
              });
            report.matrix.push({ engine, locale, theme, width, passed: true });
          }
      // Per-engine search/filter/paging, keyboard, variant and customer overlay.
      stage = `${engine} interaction flow`;
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`${base}/en/admin/pos?__qa_theme=dark`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForLoadState("networkidle");
      const shell = page.locator('[data-pos-shell="true"]');
      await expect(
        shell.getByRole("button", { name: /Test security camera/ }),
      ).toBeVisible();
      await shell
        .getByRole("button", { name: "Load more products", exact: true })
        .click();
      await expect(
        shell.getByRole("list", { name: "Products" }).locator("li"),
      ).toHaveCount(33);
      await expect(
        shell.getByRole("button", { name: /Test accessory 31, Price needed/ }),
      ).toBeDisabled();
      await shell
        .getByRole("button", { name: "Access control", exact: true })
        .click();
      await expect(
        shell.getByRole("list", { name: "Products" }).locator("li"),
      ).toHaveCount(1);
      const search = shell.getByRole("searchbox", {
        name: "Search name, SKU or barcode",
      });
      await search.fill("camera");
      await expect(
        shell.getByText("No products found", { exact: true }),
      ).toBeVisible();
      // Exact code lookup bypasses category/page and uses the selected variant.
      await search.fill("POS-CAMERA-02");
      await search.press("Enter");
      await expect(
        shell.getByText("Test security camera", { exact: true }).first(),
      ).toBeVisible();
      const cart = shell.getByRole("region", { name: "Cart and payment" });
      await expect(
        cart.getByText("POS-CAMERA-02", { exact: true }),
      ).toBeVisible();
      await shell.getByRole("button", { name: "All", exact: true }).click();
      await shell.getByRole("button", { name: "All", exact: true }).focus();
      await page.keyboard.type("POS-CAMERA-02", { delay: 5 });
      await page.keyboard.press("Enter");
      await expect(
        cart.getByLabel("Quantity: Test security camera", { exact: true }),
      ).toHaveValue("2");
      await search.fill("access reader");
      await expect(
        shell.getByRole("list", { name: "Products" }).locator("li"),
      ).toHaveCount(1);
      await search.fill("");
      await expect(
        shell.getByRole("button", {
          name: /Test security camera.*Choose variant/,
        }),
      ).toBeVisible();
      await shell
        .getByRole("button", { name: /Test security camera.*Choose variant/ })
        .click();
      const variant = page.getByRole("dialog").filter({
        has: page.getByRole("heading", {
          name: "Test security camera",
          exact: true,
        }),
      });
      await variant.waitFor({ state: "visible" });
      const overlayAxe = await new AxeBuilder({ page })
        .include('[role="dialog"][aria-modal="true"]')
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      assert.equal(
        overlayAxe.violations.length,
        0,
        `Variant axe ${JSON.stringify(overlayAxe.violations.map((v) => v.id))}`,
      );
      await page.keyboard.press("Escape");
      await expect(variant).toBeHidden();
      await expect(shell).toBeVisible();
      await cart
        .getByRole("button", { name: "Select customer", exact: true })
        .click();
      const customer = page.getByRole("dialog").filter({
        has: page.getByRole("heading", {
          name: "Customer details",
          exact: true,
        }),
      });
      await customer.getByLabel("Name", { exact: true }).fill("Named walk-in");
      await customer
        .getByRole("button", { name: "Use these details", exact: true })
        .click();
      await expect(customer).toBeHidden();
      await expect(
        cart.getByText("Named walk-in", { exact: true }),
      ).toBeVisible();
      // Overlay-free menu and fullscreen fallback preserve the selected cart.
      await shell
        .getByRole("button", { name: "Fullscreen", exact: true })
        .click();
      await expect(page.locator('[data-pos-viewport="true"]')).toBeVisible();
      await expect(
        cart.getByText("POS-CAMERA-02", { exact: true }),
      ).toBeVisible();
      await shell
        .getByRole("button", { name: "Exit fullscreen", exact: true })
        .click();
      await cart.getByRole("button", { name: "Clear", exact: true }).click();
      await page
        .getByRole("dialog")
        .filter({
          has: page.getByRole("heading", {
            name: "Clear the cart?",
            exact: true,
          }),
        })
        .getByRole("button", { name: "Clear cart", exact: true })
        .click();
      report.flows.push({
        engine,
        flow: "search-category-pagination-barcode-variant-customer-fullscreen-keyboard",
        passed: true,
      });
      if (engine === "chromium") {
        stage = "actual cash sale with unknown response";
        const opened = await page.request.post(
          `${base}/api/management/commerce/cash`,
          {
            headers: headers(),
            data: {
              action: "cash_open",
              payload: { opening_float_agorot: 10000 },
            },
          },
        );
        assert.equal(opened.status(), 200, await opened.text());
        await shell.getByRole("button", { name: /Test access reader/ }).click();
        const amount = cart.getByLabel("Amount to record", { exact: true });
        await amount.fill("59.01");
        await expect(
          cart.getByRole("button", { name: "Complete sale", exact: true }),
        ).toBeDisabled();
        await amount.fill("59");
        await cart
          .getByLabel("Cash received (for change)", { exact: true })
          .fill("100");
        await expect(cart.getByText(/41\.00/).first()).toBeVisible();
        const before = await effects();
        let releaseScan;
        let startedScan;
        const scanStarted = new Promise((resolve) => {
          startedScan = resolve;
        });
        const scanReleased = new Promise((resolve) => {
          releaseScan = resolve;
        });
        await context.route(
          "**/api/management/pos/catalog?**",
          async (route) => {
            const url = new URL(route.request().url());
            if (
              url.searchParams.get("q") !== "POS-CAMERA-02" ||
              url.searchParams.get("limit") !== "100"
            )
              return route.continue();
            const response = await route.fetch();
            startedScan();
            await scanReleased;
            await route.fulfill({ response }).catch(() => {});
          },
        );
        await search.fill("POS-CAMERA-02");
        await search.press("Enter");
        await scanStarted;
        let dropped = false;
        let tenderCalls = 0;
        await context.route(
          "**/api/management/commerce/tenders",
          async (route) => {
            tenderCalls++;
            if (!dropped) {
              dropped = true;
              const response = await route.fetch();
              const body = await response.text();
              report.requests.push({
                stage: "committed tender response",
                status: response.status(),
                body: body.slice(0, 1500),
              });
              await route.abort("failed");
              assert.equal(response.status(), 200, body);
            } else await route.continue();
          },
        );
        await cart
          .getByRole("button", { name: "Complete sale", exact: true })
          .click();
        await expect(shell.getByRole("alert")).toBeVisible();
        releaseScan();
        await expect(
          cart.getByText("Test security camera", { exact: true }),
        ).toHaveCount(0);
        const pendingId = await page.evaluate(() => {
          const key = Object.keys(sessionStorage).find(
            (key) =>
              key.startsWith("miro.management.tools.draft.") &&
              key.endsWith(".pos"),
          );
          return key
            ? JSON.parse(sessionStorage.getItem(key)).pendingIntent?.id
            : null;
        });
        assert.match(pendingId, /^[0-9a-f-]{36}$/);
        await page.goto(`${base}/en/pay/${pendingId}`, {
          waitUntil: "networkidle",
        });
        await expect(
          page.getByText("Payment confirmed", { exact: true }),
        ).toBeVisible();
        // Payment return must open POS even when saved window state is closed.
        await page.evaluate((actorId) => {
          const key = `miro.management.tools.${actorId}`;
          const saved = JSON.parse(localStorage.getItem(key) || "{}");
          saved.pos = { ...saved.pos, open: false };
          localStorage.setItem(key, JSON.stringify(saved));
        }, actor.id);
        await page
          .getByRole("link", {
            name: "Return to POS and check sale",
            exact: true,
          })
          .click();
        await expect(shell).toBeVisible();
        await expect(
          cart.getByRole("button", {
            name: "Check / finish pending sale",
            exact: true,
          }),
        ).toBeEnabled();
        await cart
          .getByRole("button", {
            name: "Check / finish pending sale",
            exact: true,
          })
          .click();
        await expect(
          page.getByText(/Sale recorded.*Order/).first(),
        ).toBeVisible();
        const after = await effects();
        assert.equal(
          tenderCalls,
          1,
          "A captured unknown tender was sent twice",
        );
        assert.equal(after.orders - before.orders, 1);
        assert.equal(after.payments - before.payments, 1);
        assert.equal(after.movements - before.movements, 1);
        assert.equal(before.stock - after.stock, 1);
        assert.equal(after.outbox - before.outbox, 1);
        await expect(
          cart.getByText(
            "Choose a product or scan a barcode to start a sale.",
            { exact: true },
          ),
        ).toBeVisible();
        report.flows.push({
          engine,
          flow: "UI→API→SQL cash/change/order/stock/outbox + lost-response replay",
          passed: true,
          before,
          after,
          tenderCalls,
        });
        // Safe API authorization and input boundaries.
        const noAuth = await context.request.get(
          `${base}/api/management/pos/catalog`,
          { headers: { cookie: "" } },
        );
        assert.equal(noAuth.status(), 403);
        const invalid = await page.request.get(
          `${base}/api/management/pos/catalog?limit=101`,
        );
        assert.equal(invalid.status(), 400);
        const hostile = await page.request.get(
          `${base}/api/management/pos/catalog?q=${encodeURIComponent("camera),id.neq.0")}`,
        );
        assert.equal(hostile.status(), 200);
        report.flows.push({
          engine,
          flow: "catalog auth/bounds/filter metacharacters",
          passed: true,
        });
        // Explicit browser-only provider readiness/response fixtures exercise
        // uncertainty UI. They are never evidence of a real provider charge.
        stage = "payment page uncertainty (browser-only HTTP fixture)";
        let failStatus = false;
        let wrongIntent = false;
        const attemptedLegs = [];
        const mockStatus = {
          intent: {
            id: pendingId,
            status: "reserved",
            total_agorot: 5900,
            remaining_agorot: 5900,
            channel: "website",
            read_only_expired: false,
            order_number: null,
            currency: "ILS",
            expires_at: new Date(Date.now() + 600000).toISOString(),
            order_id: null,
          },
          resume_pos_url: null,
          attempts: [],
          readiness: {
            configured: true,
            environment: "sandbox",
            capabilities: {
              hostedCard: "enabled",
              bit: "enabled",
              installments: "enabled",
            },
          },
        };
        await context.route(`**/api/commerce/intents/${pendingId}`, (route) =>
          route.fulfill(
            failStatus
              ? { status: 503, json: { error: "fixture unavailable" } }
              : {
                  json: {
                    ...mockStatus,
                    intent: {
                      ...mockStatus.intent,
                      id: wrongIntent
                        ? "11111111-1111-4111-8111-111111111111"
                        : pendingId,
                    },
                  },
                },
          ),
        );
        await context.route("**/api/commerce/attempts", (route) => {
          attemptedLegs.push(route.request().postDataJSON());
          failStatus = attemptedLegs.length === 1;
          return route.fulfill({
            status: 503,
            json: { error: "fixture unknown outcome" },
          });
        });
        await page.goto(`${base}/en/pay/${pendingId}`, {
          waitUntil: "networkidle",
        });
        await page
          .getByLabel("Installments", { exact: true })
          .selectOption("3");
        await page
          .getByRole("button", { name: "Pay by card", exact: true })
          .click();
        await expect(page.getByRole("alert")).toContainText(
          "Payment status could not be verified",
        );
        assert.equal(attemptedLegs.length, 1);
        await expect(
          page.getByRole("button", {
            name: /Pay by card|Pay with bit|Resume card request|Resume bit request/,
          }),
        ).toHaveCount(0);
        await page.reload({ waitUntil: "networkidle" });
        await expect(page.getByRole("alert")).toContainText(
          "Payment status could not be verified",
        );
        failStatus = false;
        await page
          .getByRole("button", { name: "Check status", exact: true })
          .click();
        await expect(
          page.getByRole("button", {
            name: "Resume card request",
            exact: true,
          }),
        ).toBeEnabled();
        await expect(
          page.getByRole("button", { name: "Resume bit request", exact: true }),
        ).toBeDisabled();
        await expect(
          page.getByLabel("Installments", { exact: true }),
        ).toBeDisabled();
        await page
          .getByRole("button", { name: "Resume card request", exact: true })
          .click();
        await expect(
          page.getByRole("button", {
            name: "Resume card request",
            exact: true,
          }),
        ).toBeEnabled();
        assert.equal(attemptedLegs.length, 2);
        assert.deepEqual(attemptedLegs[1], attemptedLegs[0]);
        wrongIntent = true;
        await page
          .getByRole("button", { name: "Check status", exact: true })
          .click();
        await expect(page.getByRole("alert")).toContainText(
          "Payment status could not be verified",
        );
        await expect(
          page.getByRole("button", {
            name: /Resume card request|Resume bit request/,
          }),
        ).toHaveCount(0);
        await context.unroute(`**/api/commerce/intents/${pendingId}`);
        await context.unroute("**/api/commerce/attempts");
        report.flows.push({
          engine,
          flow: "browser fixture: failed reconciliation freezes methods; reload resumes only same leg/key; wrong intent denied",
          passed: true,
          attemptCalls: attemptedLegs.length,
        });
      }
      // Phone landscape and 200% equivalent content width.
      for (const dimensions of [
        { width: 740, height: 360 },
        { width: 320, height: 500 },
      ]) {
        await page.setViewportSize(dimensions);
        await page.goto(`${base}/he/admin/pos?__qa_theme=light`, {
          waitUntil: "domcontentloaded",
        });
        await expect(shell).toBeVisible();
        const width = await shell.evaluate((e) => [
          e.clientWidth,
          e.scrollWidth,
        ]);
        assert.ok(width[1] <= width[0] + 1);
      }
      await context.close();
    } catch (error) {
      const pages = browser.contexts().flatMap((context) => context.pages());
      if (pages[0]) {
        await pages[0]
          .screenshot({ path: path.join(evidence, "failure.png") })
          .catch(() => {});
        await writeFile(
          path.join(evidence, "failure.html"),
          await pages[0].content(),
        ).catch(() => {});
      }
      throw error;
    } finally {
      await browser.close();
    }
  }
  assert.equal(
    report.runtimeErrors.length,
    0,
    JSON.stringify(report.runtimeErrors),
  );
  await writeFile(
    path.join(evidence, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    `PASS POS ${report.matrix.length} responsive theme/locale/engine cases, ${report.flows.length} flows, ${report.axe.length} axe scans; evidence ${evidence}`,
  );
} catch (error) {
  await writeFile(
    path.join(evidence, "report.json"),
    JSON.stringify(
      { ...report, failedStage: stage, error: String(error) },
      null,
      2,
    ),
  );
  throw new Error(`${stage}: ${error.message}`);
}
