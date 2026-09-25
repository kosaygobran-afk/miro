import { getTranslations } from "next-intl/server";
import { isLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { ResetPasswordClient } from "./reset-password-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "metadata.resetPassword",
  });
  return pageMetadata({
    locale,
    path: "reset-password",
    title: t("title"),
    description: t("description"),
    noIndex: true,
  });
}

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  const t = await getTranslations({ locale, namespace: "pages.auth" });

  const noticeTitle = t("noticeTitle");
  const resetPasswordTitle = t("reset-password.title");
  const resetPasswordSubtitle = t("reset-password.subtitle");
  const passwordLabel = t("reset-password.form.password");
  const confirmPasswordLabel = t("reset-password.form.confirmPassword");
  const submitLabel = t("reset-password.form.submit");

  return (
    <ResetPasswordClient
      locale={locale}
      noticeTitle={noticeTitle}
      resetPasswordTitle={resetPasswordTitle}
      resetPasswordSubtitle={resetPasswordSubtitle}
      passwordLabel={passwordLabel}
      confirmPasswordLabel={confirmPasswordLabel}
      submitLabel={submitLabel}
    />
  );
}
