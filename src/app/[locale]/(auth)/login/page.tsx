import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { isLocale, withLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { LoginClient } from "./login-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.login" });
  return pageMetadata({
    locale,
    path: "login",
    title: t("title"),
    description: t("description"),
    noIndex: true,
  });
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  const { email } = await searchParams;
  const t = await getTranslations({ locale, namespace: "pages.auth" });

  const noticeTitle = t("noticeTitle");
  const loginTitle = t("login.title");
  const loginSubtitle = t("login.subtitle");
  const emailLabel = t("login.form.email");
  const passwordLabel = t("login.form.password");
  const submitLabel = t("login.form.submit");
  const forgotPasswordLabel = t("login.form.forgotPassword");
  const signupTitle = t("signup.title");

  return (
    <section className="miro-section">
      <div className="miro-container max-w-md">
        <div className="miro-card p-6">
          <p className="mb-3 text-sm font-black uppercase tracking-[0.24em] text-accent-text">
            {noticeTitle}
          </p>
          <h1 className="text-3xl font-black">{loginTitle}</h1>
          <p className="mb-6 mt-2 text-muted-foreground">{loginSubtitle}</p>
          <LoginClient
            locale={locale}
            prefilledEmail={email}
            emailLabel={emailLabel}
            passwordLabel={passwordLabel}
            submitLabel={submitLabel}
          />
          <div className="mt-4 flex justify-between gap-3 text-sm">
            <Link
              className="text-accent-text hover:underline"
              href={withLocale(locale, "forgot-password")}
            >
              {forgotPasswordLabel}
            </Link>
            <Link
              className="text-accent-text hover:underline"
              href={withLocale(locale, "signup")}
            >
              {signupTitle}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
