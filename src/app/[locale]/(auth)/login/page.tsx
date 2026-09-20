import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { UnavailableAuthForm } from "@/components/auth/unavailable-auth-form";
import { authUnavailableMessage } from "@/lib/auth-state";
import { isLocale, withLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.login" });
  return pageMetadata({ locale, path: "login", title: t("title"), description: t("description"), noIndex: true });
}

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  const t = await getTranslations({ locale, namespace: "pages.auth" });

  return (
    <AuthShell title={t("login.title")} subtitle={t("login.subtitle")} noticeTitle={t("noticeTitle")}>
      <UnavailableAuthForm
        fields={[
          { name: "email", label: t("login.form.email"), type: "email" },
          { name: "password", label: t("login.form.password"), type: "password" },
        ]}
        submitLabel={t("login.form.submit")}
        notice={authUnavailableMessage(locale)}
      />
      <div className="mt-4 flex justify-between gap-3 text-sm">
        <Link className="text-accent-text hover:underline" href={withLocale(locale, "forgot-password")}>
          {t("login.form.forgotPassword")}
        </Link>
        <Link className="text-accent-text hover:underline" href={withLocale(locale, "signup")}>
          {t("signup.title")}
        </Link>
      </div>
    </AuthShell>
  );
}

function AuthShell({ title, subtitle, noticeTitle, children }: { title: string; subtitle: string; noticeTitle: string; children: React.ReactNode }) {
  return (
    <section className="miro-section">
      <div className="miro-container max-w-md">
        <div className="miro-card p-6">
          <p className="mb-3 text-sm font-black uppercase tracking-[0.24em] text-accent-text">{noticeTitle}</p>
          <h1 className="text-3xl font-black">{title}</h1>
          <p className="mb-6 mt-2 text-muted-foreground">{subtitle}</p>
          {children}
        </div>
      </div>
    </section>
  );
}
