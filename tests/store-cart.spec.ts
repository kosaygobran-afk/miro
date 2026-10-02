import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("customer cart and checkout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/store");
    await page.evaluate(() => localStorage.removeItem("miro-cart-v1"));
    await page.reload();
  });

  test("adds a product from a card and updates it in the cart", async ({
    page,
  }) => {
    const addButton = page
      .locator(".sf-product-card .sf-add-cart-button")
      .first();
    await expect(addButton).toBeVisible();
    await addButton.click();

    const headerCart = page.locator(".premium-cart-link");
    await expect(headerCart.locator(".premium-cart-count")).toHaveText("1");
    await headerCart.click();

    await expect(page).toHaveURL(/\/en\/cart$/);
    await expect(page.locator(".sf-cart-item")).toHaveCount(1);
    await page.locator(".sf-cart-stepper button").last().click();
    await expect(page.locator(".sf-cart-stepper output")).toHaveText("2");

    await page.reload();
    await expect(page.locator(".sf-cart-stepper output")).toHaveText("2");
    await expect(page.locator(".premium-cart-count")).toHaveText("2");
  });

  test("continues from cart to the checkout request page", async ({ page }) => {
    await page.locator(".sf-product-card .sf-add-cart-button").first().click();
    await page.locator(".premium-cart-link").click();
    await expect(page).toHaveTitle(/Cart.*MIRO/);
    await page.getByRole("link", { name: "Continue to checkout" }).click();
    await expect(page).toHaveTitle(/Checkout.*MIRO/);

    await expect(page).toHaveURL(/\/en\/checkout$/);
    await expect(
      page.getByRole("heading", { name: "Checkout request" }),
    ).toBeVisible();
    await expect(page.locator(".sf-checkout-summary li")).toHaveCount(1);
    await expect(
      page.getByText(
        "No online payment is collected and no stock is reserved on this page.",
      ),
    ).toBeVisible();
  });

  test("submits a validated checkout request and clears the cart", async ({
    page,
  }) => {
    await page.locator(".sf-product-card .sf-add-cart-button").first().click();
    await page.locator(".premium-cart-link").click();
    await page.getByRole("link", { name: "Continue to checkout" }).click();

    let submittedBody: Record<string, unknown> | null = null;
    await page.route("**/api/enquiries", async (route) => {
      submittedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, requestId: "test-request" }),
      });
    });

    await page.getByLabel("Full name").fill("Test Customer");
    await page.getByLabel("Email").fill("customer@example.com");
    await page.getByLabel("Phone").fill("0500000000");
    await page.getByLabel("Street address").fill("1 Test Street");
    await page.getByLabel("City").fill("Tel Aviv");
    await page.getByRole("button", { name: "Send checkout request" }).click();

    await expect(
      page.getByRole("heading", { name: "Your request was received" }),
    ).toBeVisible();
    expect(submittedBody).toMatchObject({
      source: "checkout_page",
      locale: "en",
      shipping: { address: "1 Test Street", city: "Tel Aviv" },
    });
    await expect(page.locator(".premium-cart-count")).toHaveCount(0);
  });

  test("switching product thumbnails replaces the visible main image", async ({
    page,
  }) => {
    const productHref = await page
      .locator(".sf-product-card .sf-product-media")
      .first()
      .getAttribute("href");
    expect(productHref).toBeTruthy();
    await page.goto(productHref!);
    const mainImage = page.locator(".sf-product-main-image");
    await expect(mainImage).toBeVisible();
    await expect
      .poll(() =>
        mainImage.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);

    const firstSrc = await mainImage.getAttribute("src");
    const thumbnails = page.locator(".sf-thumbnail");
    if ((await thumbnails.count()) > 1) {
      await thumbnails.nth(1).click();
      await expect(thumbnails.nth(1)).toHaveAttribute("aria-current", "true");
      await expect.poll(() => mainImage.getAttribute("src")).not.toBe(firstSrc);
      await expect
        .poll(() =>
          mainImage.evaluate((image: HTMLImageElement) => image.naturalWidth),
        )
        .toBeGreaterThan(0);
    }
  });

  test("cart and checkout do not overflow a small phone viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.locator(".sf-product-card .sf-add-cart-button").first().click();
    await page.locator(".premium-cart-link").click();

    let widths = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);

    await page.getByRole("link", { name: "Continue to checkout" }).click();
    widths = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
  });

  test("store, cart, checkout and product navigation return no server errors", async ({
    page,
  }) => {
    const serverErrors: string[] = [];
    page.on("response", (response) => {
      if (response.status() >= 500) {
        serverErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto("/en/store");
    const productHref = await page
      .locator(".sf-product-card .sf-product-media")
      .first()
      .getAttribute("href");
    expect(productHref).toBeTruthy();
    await page.goto(productHref!);
    await page.goto("/en/cart");
    await page.goto("/en/checkout");

    expect(serverErrors).toEqual([]);
  });

  test("cart and checkout pass automated accessibility checks", async ({
    page,
  }) => {
    await page.locator(".sf-product-card .sf-add-cart-button").first().click();
    await page.locator(".premium-cart-link").click();
    await expect(page).toHaveTitle(/Cart/);
    let results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole("link", { name: "Continue to checkout" }).click();
    await expect(page).toHaveTitle(/Checkout/);
    results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
