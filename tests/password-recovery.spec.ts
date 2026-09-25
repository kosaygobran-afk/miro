import {
  expect,
  test,
  type Page,
  type APIRequestContext,
} from "@playwright/test";

const authServer = "http://127.0.0.1:54331";
type Message = { code: string; redirect: string };

async function requestReset(
  page: Page,
  request: APIRequestContext,
  locale: string,
  resend = false,
) {
  const email = `recovery-${crypto.randomUUID()}@example.test`;
  await page.goto(`/${locale}/forgot-password`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('main button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/check-email`));
  if (resend) {
    const response = page.waitForResponse((r) =>
      r.url().includes("/api/auth/resend-reset"),
    );
    await page
      .getByRole("button", {
        name: locale === "he" ? "שלח שוב" : /resend/i,
      })
      .click();
    expect((await response).ok()).toBeTruthy();
  }
  const messages: Message[] = await (
    await request.get(`${authServer}/test/messages?email=${email}`)
  ).json();
  expect(messages).toHaveLength(resend ? 2 : 1);
  const message = messages.at(-1)!;
  const link = new URL(message.redirect);
  expect(link.origin).toBe(new URL(page.url()).origin);
  expect(link.pathname).toBe("/auth/callback");
  expect(link.searchParams.get("next")).toBe(`/${locale}/reset-password`);
  link.searchParams.set("code", message.code);
  return { email, link };
}

for (const locale of ["en", "he"]) {
  for (const resend of [false, true]) {
    test(`${locale}: ${resend ? "resent" : "initial"} recovery link allows a password change`, async ({
      page,
      request,
    }) => {
      const { email, link } = await requestReset(page, request, locale, resend);
      await page.goto(link.toString());
      await expect(page).toHaveURL(new RegExp(`/${locale}/reset-password$`));
      expect(new URL(page.url()).origin).toBe(link.origin);
      const password = page.locator('input[name="password"]');
      const confirm = page.locator('input[name="confirmPassword"]');
      await expect(password).toHaveAttribute("minlength", "8");
      await expect(confirm).toHaveAttribute("required", "");
      await password.fill("New-Password-123!");
      await confirm.fill("Does-Not-Match-123!");
      await page.locator('main button[type="submit"]').click();
      await expect(page.locator("main").getByRole("status")).toContainText(
        locale === "he" ? "הסיסמאות אינן תואמות" : "Passwords do not match",
      );
      await confirm.fill("New-Password-123!");
      await page.locator('main button[type="submit"]').click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/login\\?email=`));
      const login = await request.post(
        `${authServer}/auth/v1/token?grant_type=password`,
        { data: { email, password: "New-Password-123!" } },
      );
      expect(login.ok()).toBeTruthy();
      // Consumed codes cannot be reused, even after an earlier valid session.
      await page.goto(link.toString());
      await expect(page.locator("main").getByRole("alert")).toBeVisible();
      await expect(page.locator('input[name="password"]')).toHaveCount(0);
    });
  }

  test(`${locale}: PKCE recovery falling back to homepage reaches reset`, async ({
    page,
    request,
  }) => {
    const { link } = await requestReset(page, request, locale);
    link.pathname = locale === "en" ? "/en" : "/";
    link.searchParams.delete("next");
    await page.goto(link.toString());
    await expect(page).toHaveURL(new RegExp(`/${locale}/reset-password$`));
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test(`${locale}: implicit recovery on homepage reaches reset and clears tokens`, async ({
    page,
    request,
  }) => {
    const session = await (
      await request.post(`${authServer}/test/session`, {
        data: { email: "implicit@example.test" },
      })
    ).json();
    const hash = new URLSearchParams({ ...session, type: "recovery" });
    hash.delete("user");
    await page.goto(`/${locale}#${hash}`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/reset-password$`));
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });
}

test("token-hash email template opens the password form", async ({ page }) => {
  await page.goto(
    "/auth/verify?token_hash=valid-test-hash&type=recovery&locale=en",
  );
  await expect(page).toHaveURL(/\/en\/reset-password$/);
  await expect(page.locator('input[name="password"]')).toBeVisible();
});

test("expired hash link on homepage gives a usable error without exposing tokens", async ({
  page,
}) => {
  await page.goto(
    "/en#error=access_denied&error_code=otp_expired&error_description=expired",
  );
  await expect(page).toHaveURL(/\/en\/reset-password$/);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "invalid or has expired",
  );
  await expect(
    page.getByRole("link", { name: "Request a new reset link" }),
  ).toBeVisible();
});

test("recovery without the originating browser verifier shows an error", async ({
  page,
}) => {
  await page.goto(
    "/auth/callback?code=missing-verifier&next=/en/reset-password",
  );
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "same browser",
  );
  await expect(page.locator('input[name="password"]')).toHaveCount(0);
});
