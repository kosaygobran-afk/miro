import { requireRole } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { CategoriesManager } from "@/components/management/categories/categories-manager";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const he = locale === "he";
  return pageMetadata({
    locale,
    path: "admin/categories",
    title: he ? "קטגוריות | מסוף הניהול" : "Categories | Admin console",
    noIndex: true,
  });
}

export default async function CategoriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = (isLocale(locale) ? locale : "he") as Locale;
  await requireRole(safeLocale, ["admin", "ceo"]);

  return <CategoriesManager locale={safeLocale} />;
}
