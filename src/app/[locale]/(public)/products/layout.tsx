import { getTranslations } from "next-intl/server";
import { ProductSubNav } from "@/components/products/ProductSubNav";
import { productCategories } from "@/features/catalog/product-data";
import type { Locale } from "@/lib/i18n";
import { isLocale } from "@/lib/i18n";

interface ProductsLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function ProductsLayout({
  children,
  params,
}: ProductsLayoutProps) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  const t = await getTranslations({ locale, namespace: "pages.products" });

  const categories = productCategories.map((cat) => ({
    key: cat.key,
    href: `/${locale}${cat.href}`,
    label: t(`categories.${cat.key}`),
  }));

  return (
    <>
      <ProductSubNav categories={categories} />
      {children}
    </>
  );
}
