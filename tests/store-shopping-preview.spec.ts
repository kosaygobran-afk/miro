import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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
  await expect(
    page
      .locator(".premium-mobile-navigation")
      .getByRole("link", { name: "Wishlist" }),
  ).toBeVisible();

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
    page.getByText("This wishlist is saved in this browser."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove from wishlist" }),
  ).toHaveCount(1);
  await expect(unavailable).toHaveCount(1);

  available = true;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByText("This wishlist is saved to your account."),
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
