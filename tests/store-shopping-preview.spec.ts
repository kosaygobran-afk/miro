import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { DEFAULT_ANIMATION_SETTINGS } from "../src/lib/animation-settings";

test.setTimeout(60_000);

const owner = "10000000-0000-4000-8000-000000000001";
const cartLink = ".premium-cart-link";
const firstSave = ".sf-product-card:not([aria-hidden]) .sf-save-button";

test("guest wishlist survives locale changes on a small phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 730 });
  await page.goto("/en", { waitUntil: "domcontentloaded" });
  const save = page.locator(firstSave).first();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await page.locator(".premium-mobile-toggle").click();
  const shortcut = page
    .locator(".premium-mobile-navigation")
    .getByRole("link", { name: "Wishlist: 1", exact: true });
  await expect(shortcut.locator(".premium-shopping-count")).toBeVisible();
  await expect(shortcut.locator("[data-wishlist-heart]")).toHaveCSS(
    "fill",
    /^url\(/,
  );

  await page.goto("/he/cart", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "לרשימת המשאלות", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "רשימת משאלות", exact: true }),
  ).toBeVisible();
  const remove = page.getByRole("button", {
    name: "הסרה מרשימת המשאלות",
    exact: true,
  });
  await expect(remove).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(321);
  const results = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await remove.focus();
  await remove.press("Enter");
  await expect(
    page.getByRole("heading", { name: "רשימת המשאלות ריקה" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "רשימת משאלות", exact: true }),
  ).toBeFocused();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "רשימת המשאלות ריקה" }),
  ).toBeVisible();
});

test("cart quantities and unique wishlist selections update their own badges", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en", { waitUntil: "domcontentloaded" });
  const card = page
    .locator(".sf-catalog-grid .sf-product-card")
    .filter({ has: page.locator(".sf-add-cart-button") })
    .first();
  const save = card.locator(".sf-save-button");
  const add = card.locator(".sf-add-cart-button");
  const cart = page.locator(".premium-cart-link");
  const wishlist = page.locator(".premium-wishlist-link");
  await expect(page.locator("html")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );
  await page.evaluate(
    (detail) =>
      window.dispatchEvent(
        new CustomEvent("miro-animation-settings-change", { detail }),
      ),
    DEFAULT_ANIMATION_SETTINGS,
  );
  await expect(add).toBeEnabled();
  const started = page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const onStart = (event: AnimationEvent) => {
          if (event.animationName !== "motion-icon-beat") return;
          document.removeEventListener("animationstart", onStart);
          resolve(event.animationName);
        };
        document.addEventListener("animationstart", onStart);
      }),
  );
  await add.press("Enter");
  await add.press("Enter");
  const cardHeart = save.locator("[data-wishlist-heart]");
  await save.hover();
  await expect(cardHeart).toHaveCSS("animation-name", "motion-heart-pulse");
  await expect
    .poll(() =>
      cardHeart.evaluate((heart) =>
        heart
          .getAnimations()
          .some((animation) => animation.playState === "running"),
      ),
    )
    .toBe(false);
  const savePulsePaint = page.evaluate(
    () =>
      new Promise<
        Record<string, { fill: string; stops: number[][]; start: number }>
      >((resolve) => {
        const paint: Record<
          string,
          { fill: string; stops: number[][]; start: number }
        > = {};
        const context = document.createElement("canvas").getContext("2d")!;
        const onStart = (event: AnimationEvent) => {
          const icon = event.target;
          if (
            event.animationName !== "motion-heart-pulse" ||
            !(icon instanceof SVGElement) ||
            icon.dataset.buttonEffect !== "save"
          )
            return;
          const pulse = icon
            .getAnimations()
            .find(
              (animation) =>
                animation instanceof CSSAnimation &&
                animation.animationName === event.animationName,
            );
          const surface = icon.closest(".premium-wishlist-link")
            ? "navbar"
            : "product";
          paint[surface] = {
            fill: getComputedStyle(icon).fill,
            stops: Array.from(icon.querySelectorAll("stop"), (stop) => {
              context.fillStyle = getComputedStyle(stop).stopColor;
              context.fillRect(0, 0, 1, 1);
              return Array.from(
                context.getImageData(0, 0, 1, 1).data.slice(0, 3),
              );
            }),
            start: Number(pulse?.startTime),
          };
          if (paint.navbar && paint.product) {
            document.removeEventListener("animationstart", onStart);
            resolve(paint);
          }
        };
        document.addEventListener("animationstart", onStart);
      }),
  );
  await save.click();
  await expect(cart).toHaveAccessibleName("Shopping cart: 2");
  await expect(cart.locator(".premium-shopping-count")).toHaveText("2");
  await expect(wishlist.locator(".premium-shopping-count")).toHaveText("1");
  expect(await started).toBe("motion-icon-beat");
  const { navbar, product } = await savePulsePaint;
  for (const heart of [navbar, product]) {
    expect(heart.fill).toMatch(/^url\(/);
    expect(heart.stops).toEqual([
      [229, 36, 73],
      [255, 118, 190],
    ]);
  }
  expect(navbar.fill).not.toBe(product.fill);
  expect(Math.abs(navbar.start - product.start)).toBeLessThanOrEqual(16);
  await expect(save.locator("svg")).not.toHaveAttribute("data-button-effect");
  await expect(wishlist.locator("svg")).not.toHaveAttribute(
    "data-button-effect",
  );
  await expect(wishlist.locator("svg")).toHaveAttribute("data-wishlist-filled");
  for (const heart of [save.locator("svg"), wishlist.locator("svg")]) {
    const stops = await heart
      .locator("stop")
      .evaluateAll((elements) =>
        elements.map((stop) => getComputedStyle(stop).stopColor),
      );
    expect(stops).toHaveLength(2);
    expect(stops[0]).toBe(stops[1]);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await save.press("Space");
  await expect(save.locator("svg")).toHaveCSS("animation-name", "none");
  await expect(wishlist).toHaveAccessibleName("Wishlist: 0");
  await expect(wishlist.locator("svg")).toHaveCSS("fill", "none");
  await expect(wishlist.locator(".premium-shopping-count")).toHaveCount(0);
  await expect(cart.locator(".premium-shopping-count")).toHaveText("2");
});

test("guest pickup sends contact details without a shipping address", async ({
  page,
}) => {
  await page.goto("/en", { waitUntil: "domcontentloaded" });
  await page.locator(".sf-product-card .sf-add-cart-button").first().click();
  await expect(page.locator(".premium-cart-count")).toHaveText("1");
  await page.locator(cartLink).click();
  await expect(page).toHaveURL(/\/en\/cart$/);
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page
    .getByLabel("How would you like to receive your order?")
    .selectOption("pickup");
  await expect(page.getByLabel("Street address")).toHaveCount(0);
  await page.getByLabel("Full name").fill("Preview Customer");
  await page.getByLabel("Email").fill("guest@example.test");
  await page.getByLabel("Phone").fill("0500000000");

  let submitted: unknown;
  const attempts: string[] = [];
  await page.route("**/api/enquiries", async (route) => {
    const body = route.request().postDataJSON();
    submitted = body;
    attempts.push(body.submissionId);
    await route.fulfill({
      json:
        attempts.length === 1
          ? { ok: true }
          : { ok: true, requestId: "preview-reference" },
    });
  });
  const submit = page.getByRole("button", { name: "Send checkout request" });
  await submit.click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Checkout is unavailable",
  );
  await expect(page.locator(".sf-checkout-summary li")).toHaveCount(1);
  await submit.click();
  await expect(page.getByText("preview-reference")).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toBeTruthy();
  expect(attempts[0]).toBe(attempts[1]);
  expect(submitted).toMatchObject({
    fulfillment: "pickup",
    name: "Preview Customer",
    email: "guest@example.test",
    phone: "0500000000",
  });
  expect(submitted).not.toHaveProperty("shipping");
  await expect(page.locator(".premium-cart-count")).toHaveCount(0);
});

test("moves guest selections after sign-in, retries the same import and hides account data on sign-out", async ({
  page,
}) => {
  let signedIn = false;
  let failImport = true;
  const imports: string[] = [];
  let data = { cart: [] as unknown[], wishlist: [] as string[] };

  await page.route("**/api/account/shopping", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: {
          account: signedIn
            ? {
                id: owner,
                contact: {
                  name: "Account Customer",
                  email: "account@example.test",
                  phone: "0500000142",
                },
              }
            : null,
          data,
        },
      });
    }
    const body = route.request().postDataJSON();
    expect(body.owner).toBe(owner);
    expect(body.operation.action).toBe("import");
    imports.push(body.operation.id);
    if (failImport) {
      failImport = false;
      return route.fulfill({
        status: 503,
        json: { error: "shopping_unavailable" },
      });
    }
    data = body.operation.data;
    return route.fulfill({ json: { data } });
  });

  await page.goto("/en", { waitUntil: "domcontentloaded" });
  await page.locator(".sf-product-card .sf-add-cart-button").first().click();
  await page.locator(firstSave).first().click();
  await expect(page.locator(".premium-cart-count")).toHaveText("1");

  signedIn = true;
  await page.goto("/en/checkout", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByText("Your cart or wishlist has changes waiting to sync."),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("miro-cart-v1") ?? "[]"),
    ),
  ).toHaveLength(1);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByLabel("Full name")).toHaveValue("Account Customer");
  await expect(page.getByLabel("Email")).toHaveValue("account@example.test");
  await expect(page.getByLabel("Phone")).toHaveValue("0500000142");
  await expect(page.locator(".sf-checkout-summary li")).toHaveCount(1);
  expect(data.wishlist).toHaveLength(1);
  expect(imports).toHaveLength(2);
  expect(imports[0]).toBe(imports[1]);
  expect(
    await page.evaluate(() => localStorage.getItem("miro-cart-v1")),
  ).toBeNull();

  await page.reload();
  await expect(page.locator(".sf-checkout-summary li")).toHaveCount(1);
  expect(imports).toHaveLength(2);
  signedIn = false;
  await page.evaluate(() =>
    window.dispatchEvent(new Event("miro:account-session-refresh")),
  );
  await expect(
    page.getByRole("heading", { name: "Your cart is empty" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveCount(0);
  await page.goto("/en/wishlist", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Your wishlist is empty" }),
  ).toBeVisible();
});

test("the cart and wishlist fit at the first desktop breakpoint in both languages", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 820 });
  for (const locale of ["en", "he"]) {
    await page.goto(`/${locale}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".premium-wishlist-link")).toBeVisible();
    await expect(page.locator(cartLink)).toBeVisible();
    const width = await page
      .locator(".premium-header")
      .evaluate((header) => header.scrollWidth);
    expect(width).toBeLessThanOrEqual(1201);
  }
});

test("populated cart controls, totals and wishlist navigation fit in both reading directions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.route("**/api/track", (route) => route.fulfill({ status: 204 }));
  await page.goto("/en/store", { waitUntil: "domcontentloaded" });
  const product = page
    .locator(".sf-product-card")
    .filter({ has: page.locator(".sf-add-cart-button") })
    .first();
  await product.locator(".sf-add-cart-button").click();
  await product.locator(".sf-save-button").click();

  for (const locale of ["en", "he"]) {
    const he = locale === "he";
    await page.goto(`/${locale}/cart`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      he ? "rtl" : "ltr",
    );
    await expect(page.locator(".sf-cart-item-total")).toContainText(
      he ? "סך הכול לפריט" : "Item total",
    );
    await expect(page.locator(".sf-cart-unit-price")).toContainText(
      he ? "ליחידה" : "Per unit",
    );
    const plus = page.getByRole("button", {
      name: he ? "הגדלת כמות" : "Increase quantity",
    });
    const minus = page.getByRole("button", {
      name: he ? "הפחתת כמות" : "Decrease quantity",
    });
    expect((await plus.boundingBox())?.width).toBeGreaterThanOrEqual(44);
    await plus.press("Enter");
    await expect(page.locator(".sf-cart-stepper output")).toHaveText("2");
    await minus.press("Enter");
    await expect(page.locator(".sf-cart-stepper output")).toHaveText("1");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(321);
    await page
      .getByRole("link", {
        name: he ? "לרשימת המשאלות" : "View wishlist",
        exact: true,
      })
      .click();
    await expect(
      page.locator("main .sf-catalog-grid .sf-product-card"),
    ).toHaveCount(1);
    await page
      .getByRole("link", { name: he ? "לסל הקניות" : "View cart", exact: true })
      .click();
    await expect(page.locator(".sf-cart-stepper output")).toHaveText("1");
  }

  await page.getByRole("button", { name: "הסרה", exact: true }).press("Enter");
  await expect(
    page.getByRole("heading", { name: "סל הקניות ריק", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "סל הקניות שלכם", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("link", { name: "לכל המוצרים", exact: true }),
  ).toHaveAttribute("href", "/he/store");
});

test("keeps browser cart and wishlist usable while the account read is unavailable", async ({
  page,
}) => {
  let available = false;
  let imported: { cart: unknown[]; wishlist: string[] } | undefined;
  await page.route("**/api/account/shopping", async (route) => {
    if (route.request().method() === "GET") {
      if (!available) {
        return route.fulfill({
          status: 503,
          json: { error: "shopping_unavailable" },
        });
      }
      return route.fulfill({
        json: {
          account: { id: owner, contact: { name: "", email: "", phone: "" } },
          data: imported ?? { cart: [], wishlist: [] },
        },
      });
    }
    const { operation } = route.request().postDataJSON();
    expect(available).toBe(true);
    expect(operation.action).toBe("import");
    imported = operation.data;
    return route.fulfill({ json: { data: imported } });
  });

  const unavailable = page.getByText(
    "Account sync is temporarily unavailable. You can keep shopping in this browser.",
  );
  await page.goto("/en", { waitUntil: "domcontentloaded" });
  await expect(unavailable).toHaveCount(1);
  await page.locator(".sf-product-card .sf-add-cart-button").first().click();
  await page.locator(firstSave).first().click();
  await expect(page.locator(".premium-cart-count")).toHaveText("1");
  await page.goto("/en/wishlist", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByText("Saved in this browser.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove from wishlist" }),
  ).toHaveCount(1);
  await expect(unavailable).toHaveCount(1);

  available = true;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByText("Saved to your account.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove from wishlist" }),
  ).toBeEnabled();
  await expect(unavailable).toHaveCount(0);
  expect(imported?.cart).toHaveLength(1);
  expect(imported?.wishlist).toHaveLength(1);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("miro-wishlist-v1")))
    .toBeNull();
});
