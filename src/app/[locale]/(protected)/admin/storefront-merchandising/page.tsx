import { requireRole } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { StorefrontMerchandising } from "@/components/management/storefront/storefront-merchandising";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const he = locale === "he";
  return pageMetadata({
    locale,
    path: "admin/storefront-merchandising",
    title: he
      ? "מוצרים בבר הזז | מסוף הניהול"
      : "Moving product rail | Admin console",
    noIndex: true,
  });
}

export default async function StorefrontMerchandisingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = (isLocale(locale) ? locale : "he") as Locale;
  await requireRole(safeLocale, ["admin", "ceo"]);

  return <StorefrontMerchandising locale={safeLocale} />;
}
