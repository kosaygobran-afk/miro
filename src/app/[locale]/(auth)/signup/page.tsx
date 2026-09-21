import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LiveAuthForm } from "@/components/auth/live-auth-form";
import { isLocale, withLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.signup" });
  return pageMetadata({
    locale,
    path: "signup",
    title: t("title"),
    description: t("description"),
    noIndex: true,
  });
}

export default async function SignupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  const t = await getTranslations({ locale, namespace: "pages.auth" });

  return (
    <section className="miro-section">
      <div className="miro-container max-w-md">
        <div className="miro-card p-6">
          <p className="mb-3 text-sm font-black uppercase tracking-[0.24em] text-accent-text">
            {t("noticeTitle")}
          </p>
          <h1 className="text-3xl font-black">{t("signup.title")}</h1>
          <p className="mb-6 mt-2 text-muted-foreground">
            {t("signup.subtitle")}
          </p>
          <LiveAuthForm
            locale={locale}
            mode="signup"
            fields={[
              { name: "name", label: t("signup.form.name"), type: "text" },
              { name: "email", label: t("signup.form.email"), type: "email" },
              {
                name: "password",
                label: t("signup.form.password"),
                type: "password",
              },
            ]}
            submitLabel={t("signup.form.submit")}
            initialNotice={
              locale === "he"
                ? "יצירת חשבון דרך Supabase פעילה."
                : "Supabase sign-up is active."
            }
          />
          <Link
            className="mt-4 block text-sm text-accent-text hover:underline"
            href={withLocale(locale, "login")}
          >
            {t("login.title")}
          </Link>
        </div>
      </div>
    </section>
  );
}
