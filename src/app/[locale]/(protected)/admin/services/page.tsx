import { requireRole } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { ServicesManager } from "@/components/management/services/services-manager";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const he = locale === "he";
  return pageMetadata({
    locale,
    path: "admin/services",
    title: he ? "שירותים | מסוף הניהול" : "Services | Admin console",
    noIndex: true,
  });
}

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = (isLocale(locale) ? locale : "he") as Locale;
  await requireRole(safeLocale, ["admin", "ceo"]);

  return <ServicesManager locale={safeLocale} />;
}
