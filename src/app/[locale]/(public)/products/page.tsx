import { getTranslations } from "next-intl/server";
import { ProductsClient } from "@/components/products/ProductsClient";
import { isLocale } from "@/lib/i18n";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import type { Locale } from "@/lib/i18n";

interface ProductsPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: ProductsPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.products" });
  return pageMetadata({
    locale: locale as Locale,
    path: "products",
    title: t("title"),
    description: t("description"),
  });
}

export default async function ProductsPage({ params }: ProductsPageProps) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  const t = await getTranslations({ locale, namespace: "pages.products" });
  const common = await getTranslations({ locale, namespace: "common" });

  return (
    <section className="miro-section min-h-screen">
      <div className="miro-container">
        <p className="text-sm font-black uppercase tracking-[0.35em] text-accent-text">
          {common("developmentPreview")}
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-black text-foreground">
          {t("title")}
        </h1>
        <p className="mt-4 max-w-3xl text-lg text-muted-foreground">
          {t("subtitle")}
        </p>

        <ProductsClient t={{ searchPlaceholder: t("searchPlaceholder") }} />
      </div>
    </section>
  );
}
