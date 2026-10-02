import { requireRole } from "@/lib/auth";
import { isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { StoreDesign } from "@/components/management/storefront/store-design";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return pageMetadata({
    locale,
    path: "admin/store-design",
    title: locale === "he" ? "עיצוב החנות" : "Store design",
    noIndex: true,
  });
}
export default async function StoreDesignPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = isLocale(locale) ? locale : "he";
  const actor = await requireRole(safeLocale, ["admin", "ceo"]);
  return <StoreDesign locale={safeLocale} isCeo={actor.role === "ceo"} />;
}
