import { expect, test } from "@playwright/test";

for (const locale of ["he", "en"]) {
  for (const area of ["account", "worker", "admin"]) {
    test(`visitor cannot open ${locale}/${area}`, async ({ page }) => {
      await page.goto(`/${locale}/${area}`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/login$`));
    });
  }
}
test("callback rejects external redirect and missing code", async ({
  request,
}) => {
  for (const next of [
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/en/account",
  ]) {
    const response = await request.get(
      `/auth/callback?next=${encodeURIComponent(next)}`,
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(307);
    const location = new URL(response.headers().location);
    expect(location.pathname).toMatch(/^\/(he|en)\/login$/);
  }
});
test("anonymous management and account writes are rejected", async ({
  request,
  baseURL,
}) => {
  expect((await request.get("/api/management/users")).status()).toBe(403);
  expect(
    (
      await request.post("/api/account", {
        headers: { origin: baseURL! },
        data: { action: "profile", full_name: "Attacker", phone: "" },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/account", {
        headers: { origin: "https://example.com" },
        data: {},
      })
    ).status(),
  ).toBe(403);
});
test("reset password without a session offers a fresh link", async ({
  page,
}) => {
  await page.goto("/en/reset-password");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "invalid or has expired",
  );
  await expect(
    page.getByRole("link", { name: "Request a new reset link" }),
  ).toHaveAttribute("href", "/en/forgot-password");
  await expect(page.locator('input[name="password"]')).toHaveCount(0);
});
