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
    namespace: "metadata.homeServices",
  });
  return pageMetadata({
    locale,
    path: "services/home",
    title: t("title"),
    description: t("description"),
  });
}

export default async function HomeServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  return <SolutionDetail locale={locale} kind="home" />;
}
