import { expect, test } from "@playwright/test";

function enquiryPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Playwright Tester",
    email: "playwright.tester@example.com",
    phone: "",
    message: "I would like a quote for a security camera installation.",
    locale: "en",
    source: "contact_page",
    ...overrides,
  };
}

// The API rate limit is an in-memory per-IP bucket and the suite runs
// fullyParallel, so each test claims its own client IP to stay isolated.
function uniqueIp() {
  const part = () => Math.floor(Math.random() * 256);
  return `198.${part()}.${part()}.${part()}`;
}

test.describe("enquiry flow", () => {
  test("/en/contact renders the enquiry form", async ({ page }) => {
    const response = await page.goto("/en/contact");

    expect(response?.status()).toBe(200);

    const form = page.locator("form.miro-contact-form");
    await expect(form).toBeVisible();
    await expect(form.locator('input[name="name"]')).toBeVisible();
    await expect(form.locator('input[name="email"]')).toBeVisible();
    await expect(form.locator('input[name="phone"]')).toBeVisible();
    await expect(form.locator('textarea[name="message"]')).toBeVisible();
    await expect(
      form.getByRole("button", { name: "Send enquiry" }),
    ).toBeVisible();
    // The honeypot is kept bot-plausible (off-screen 1px clip, not
    // display:none), so assert invisibility to humans/AT instead:
    const honeypot = form.locator('input[name="company"]');
    await expect(honeypot).toHaveAttribute("tabindex", "-1");
    await expect(honeypot.locator("..").locator("..")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  test("invalid input is flagged client-side before submission", async ({
    page,
  }) => {
    await page.goto("/en/contact");

    const form = page.locator("form.miro-contact-form");
    await form.locator('input[name="name"]').fill("Playwright Tester");
    await form.locator('input[name="email"]').fill("not-an-email");
    await form.locator('textarea[name="message"]').fill("Hello MIRO.");
    await form.getByRole("button", { name: "Send enquiry" }).click();

    await expect(form.locator("#contact-error-summary")).toContainText(
      "Some details are missing or invalid",
    );
    await expect(form.locator("#contact-error-email")).toContainText(
      "valid email",
    );
    await expect(form.locator('input[name="email"]')).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(form.locator("#contact-success")).toHaveCount(0);
  });

  test("invalid submission returns the 400 error envelope", async ({
    request,
    baseURL,
  }) => {
    const response = await request.post("/api/enquiries", {
      headers: { origin: baseURL!, "x-forwarded-for": uniqueIp() },
      data: enquiryPayload({ name: "", email: "not-an-email", message: "" }),
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("invalid_input");
    expect(typeof body.message).toBe("string");
    expect(body.issues).toEqual(
      expect.arrayContaining(["name", "email", "message"]),
    );
  });

  // No Supabase service client exists in the test fixtures, so the missing
  // service_requests insert is covered only by the fake-success contract.
  test("honeypot submission returns a fake success", async ({
    request,
    baseURL,
  }) => {
    const response = await request.post("/api/enquiries", {
      headers: { origin: baseURL!, "x-forwarded-for": uniqueIp() },
      data: enquiryPayload({ company: "Spam Bot Industries" }),
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("cross-origin submission is rejected with 403", async ({ request }) => {
    const response = await request.post("/api/enquiries", {
      headers: { origin: "https://example.com" },
      data: enquiryPayload(),
    });

    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("unavailable");
  });

  test("the sixth submission in a minute is rate limited", async ({
    request,
    baseURL,
  }) => {
    const ip = uniqueIp();
    // Invalid bodies fail validation after the rate check, so the first five
    // requests exercise the bucket without writing service_requests rows.
    const data = enquiryPayload({ email: "not-an-email" });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request.post("/api/enquiries", {
        headers: { origin: baseURL!, "x-forwarded-for": ip },
        data,
      });
      expect(response.status()).toBe(400);
    }

    const limited = await request.post("/api/enquiries", {
      headers: { origin: baseURL!, "x-forwarded-for": ip },
      data,
    });

    expect(limited.status()).toBe(429);
    const body = await limited.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("rate_limited");
    expect(typeof body.message).toBe("string");
  });
});
