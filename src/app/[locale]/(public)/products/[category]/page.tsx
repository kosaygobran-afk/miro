import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  mockProducts,
  productCategories,
} from "@/features/catalog/product-data";
import { CategoryClient } from "@/components/products/CategoryClient";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

interface CategoryPageProps {
  params: Promise<{ locale: string; category: string }>;
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { locale, category } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.products" });
  const cat = productCategories.find((c) => c.key === category);
  const catLabel = cat
    ? (await getTranslations({ locale, namespace: "pages.products" }))(
        `categories.${category}`,
      )
    : category;

  return pageMetadata({
    locale,
    path: `products/${category}`,
    title: `${catLabel} - ${t("title")}`,
    description: `Browse ${catLabel.toLowerCase()} from MIRO's security and communications product catalog.`,
  });
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { locale: rawLocale, category } = await params;
  const locale = rawLocale === "he" || rawLocale === "en" ? rawLocale : "he";

  // Validate category
  const catConfig = productCategories.find((c) => c.key === category);
  if (!catConfig) notFound();

  const t = await getTranslations({ locale, namespace: "pages.products" });
  const common = await getTranslations({ locale, namespace: "common" });
  const catLabel = t(`categories.${category}`);

  const categoryProducts = mockProducts.filter((p) => p.category === category);

  return (
    <section className="miro-section min-h-screen">
      <div className="miro-container">
        <p className="text-sm font-black uppercase tracking-[0.35em] text-accent-text">
          {common("developmentPreview")}
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-4xl font-black text-foreground">{catLabel}</h1>
            <p className="mt-2 text-lg text-muted-foreground">
              {categoryProducts.length}{" "}
              {t("showingResults", {
                count: categoryProducts.length,
                total: categoryProducts.length,
              })}
            </p>
          </div>
        </div>

        <CategoryClient
          products={categoryProducts}
          t={{
            searchPlaceholder: t("searchPlaceholder"),
          }}
        />
      </div>
    </section>
  );
}
