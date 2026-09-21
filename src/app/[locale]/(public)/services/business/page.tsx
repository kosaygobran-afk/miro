import { getTranslations } from "next-intl/server";
import { isLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { SolutionDetail } from "@/components/public/solution-detail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "metadata.businessServices",
  });
  return pageMetadata({
    locale,
    path: "services/business",
    title: t("title"),
    description: t("description"),
  });
}

export default async function BusinessServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  return <SolutionDetail locale={locale} kind="business" />;
}
