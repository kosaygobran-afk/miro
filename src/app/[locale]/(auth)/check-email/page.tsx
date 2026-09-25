import { getTranslations } from "next-intl/server";
import { isLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { CheckEmailClient } from "./check-email-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "metadata.checkEmail",
  });
  return pageMetadata({
    locale,
    path: "check-email",
    title: t("title"),
    description: t("description"),
    noIndex: true,
  });
}

export default async function CheckEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  const { email: searchEmail } = await searchParams;
  const email = searchEmail ?? "";
  const t = await getTranslations({ locale, namespace: "pages.auth" });

  const title = t("checkEmail.title");
  const subtitle = t("checkEmail.subtitle");
  const stepsInbox = t("checkEmail.steps.inbox");
  const stepsSpam = t("checkEmail.steps.spam");
  const stepsClick = t("checkEmail.steps.click");
  const resendLabel = t("checkEmail.resend");
  const differentEmail = t("checkEmail.differentEmail");
  const backToLogin = t("checkEmail.backToLogin");

  return (
    <section className="miro-section min-h-[70vh] flex items-center justify-center">
      <div className="miro-container max-w-md">
        <CheckEmailClient
          locale={locale}
          email={email}
          title={title}
          subtitle={subtitle}
          stepsInbox={stepsInbox}
          stepsSpam={stepsSpam}
          stepsClick={stepsClick}
          resendLabel={resendLabel}
          differentEmail={differentEmail}
          backToLogin={backToLogin}
        />
      </div>
    </section>
  );
}
