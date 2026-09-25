import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { CategoryClient } from "@/components/products/CategoryClient";
import { ProductSubNav } from "@/components/products/ProductSubNav";
import { ProductVisual } from "@/components/products/ProductVisual";
import { getProductVisualKind } from "@/features/catalog/product-visual-kind";
import { storeCopy } from "@/features/catalog/store-copy";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import {
  getStoreCatalog,
  getFallbackStoreCatalog,
  getStoreViewer,
} from "@/lib/store-data";
import { CategoryViewTracker } from "@/components/analytics/CategoryViewTracker";

interface CategoryPageProps {
  params: Promise<{ locale: string; category: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}
const normalizeCategory = (category: string) =>
  category === "network-gear" ? "networkGear" : category;

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { locale: rawLocale, category } = await params;
  const locale = rawLocale === "en" ? "en" : "he";
  const t = await getTranslations({ locale, namespace: "metadata.products" });
  const catalog = await getStoreCatalog(locale);
  const label =
    [...catalog.categories, ...getFallbackStoreCatalog(locale).categories].find(
      (item) => item.key === normalizeCategory(category),
    )?.label ?? category;
  return pageMetadata({
    locale,
    path: `store/${category}`,
    title: `${label} - ${t("title")}`,
    description:
      locale === "he"
        ? `מגלים את ${label} בקולקציית המיגון והתקשורת של MIRO.`
        : `Explore ${label.toLowerCase()} in the MIRO security and communications collection.`,
  });
}

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps) {
  const [{ locale: rawLocale, category: rawCategory }, query] =
    await Promise.all([params, searchParams]);
  const locale = rawLocale === "en" ? "en" : "he";
  const category = normalizeCategory(rawCategory);
  const viewer = await getStoreViewer();
  const liveCatalog = await getStoreCatalog(locale, viewer.role);
  const catalog = liveCatalog.categories.some((item) => item.key === category)
    ? liveCatalog
    : getFallbackStoreCatalog(locale);
  const selected = catalog.categories.find((item) => item.key === category);
  if (!selected) notFound();
  const products = catalog.products.filter(
    (product) => product.category === category,
  );
  const copy = storeCopy[locale];
  const Arrow = locale === "he" ? ArrowRight : ArrowLeft;
  const initialQuery = typeof query.q === "string" ? query.q.slice(0, 200) : "";

  return (
    <div className="sf-storefront">
      <CategoryViewTracker categoryId={selected.id} locale={locale} />
      <section className="sf-category-hero">
        <div className="miro-container sf-category-hero-inner">
          <div>
            <Link className="sf-text-link" href={`/${locale}/store`}>
              <Arrow size={16} aria-hidden="true" />
              {copy.back}
            </Link>
            <p className="sf-eyebrow">{copy.catalogLabel}</p>
            <h1>{selected.label}</h1>
            <p>{copy.categoryIntro}</p>
          </div>
          <ProductVisual
            kind={getProductVisualKind(
              products[0] ?? { id: category, name: selected.label, category },
            )}
          />
        </div>
      </section>
      <ProductSubNav
        categories={catalog.categories.map((item) => ({
          ...item,
          href: `/${locale}${item.href}`,
        }))}
        ariaLabel={copy.category}
      />
      <section className="sf-collection-section" id="store-items">
        <div className="miro-container">
          <CategoryClient
            key={`${category}-${initialQuery}`}
            products={products}
            category={selected}
            locale={locale}
            initialQuery={initialQuery}
            savedProductIds={viewer.savedProductIds}
          />
          <p className="sf-preview-note">
            <span aria-hidden="true" />
            {copy.demo}
          </p>
        </div>
      </section>
      <section className="sf-category-help">
        <div className="miro-container">
          <h2>{copy.quickTitle}</h2>
          <p>{copy.quickText}</p>
          <Link
            className="miro-button miro-button-primary"
            href={`/${locale}/contact`}
          >
            {copy.consult}
          </Link>
        </div>
      </section>
    </div>
  );
}
