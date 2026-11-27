import { BrandArtwork } from "@/components/brand/brand-artwork";
import Link from "@/components/motion/motion-link";
import { CompanyRail } from "@/features/store-design/company-rail";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronDown,
  CircuitBoard,
  ClipboardCheck,
  ScanLine,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ProductsClient } from "@/components/products/ProductsClient";
import { CatalogUnavailable } from "@/components/products/catalog-unavailable";
import { ProductSubNav } from "@/components/products/ProductSubNav";
import { StoreTopCategoryNav } from "@/components/products/store-top-category-nav";
import { ProductMovingRail } from "@/features/catalog/product-moving-rail";
import { SecurityComposition } from "@/components/products/ProductVisual";
import { isLocale, withLocale } from "@/lib/i18n";
import { storeCopy } from "@/features/catalog/store-copy";
import type { Metadata } from "next";
import { getSiteUrl, pageMetadata } from "@/lib/seo";
import type { Locale } from "@/lib/i18n";
import { getStorePageData } from "@/lib/store-data";
import { getStorefrontCategoryArtwork } from "@/lib/catalog/storefront-category-artwork-server";
import { StoreLiveRefresh } from "@/features/catalog/store-live-refresh";
import { headers } from "next/headers";

interface ProductsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}

export async function generateMetadata({
  params,
}: ProductsPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.products" });
  return pageMetadata({
    locale: locale as Locale,
    title: t("title"),
    description: t("description"),
  });
}

export default async function ProductsPage({
  params,
  searchParams,
}: ProductsPageProps) {
  const [{ locale: rawLocale }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  const copy = storeCopy[locale];
  const Arrow = locale === "he" ? ArrowLeft : ArrowRight;

  const [{ viewer, catalog }, categoryArtwork] = await Promise.all([
    getStorePageData(locale),
    getStorefrontCategoryArtwork(),
  ]);
  if (catalog.error) return <CatalogUnavailable locale={locale} />;
  const savedProductIds = new Set(viewer.savedProductIds);

  const categories = catalog.categories.map((category) => ({
    ...category,
    href: `/${locale}${category.href}`,
  }));
  const assuranceIcons = [ScanLine, CircuitBoard, ClipboardCheck, Building2];
  const initialQuery = typeof query.q === "string" ? query.q.slice(0, 200) : "";
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${getSiteUrl()}/#website`,
    url: getSiteUrl(),
    name: "MIRO Group",
    alternateName: ["מירו גרופ", "MIRO"],
  };

  return (
    <div className="sf-storefront">
      <script
        nonce={(await headers()).get("x-nonce") ?? undefined}
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <StoreLiveRefresh />
      <StoreTopCategoryNav
        categories={categories}
        artworkById={categoryArtwork}
        locale={locale}
      />
      <CompanyRail locale={locale} />

      <ProductMovingRail products={catalog.products} locale={locale} />

      <section
        className="sf-collection-section"
        id="store-items"
        aria-labelledby="store-title"
      >
        <div className="miro-container">
          <div className="sf-section-heading">
            <div id="collection-title">
              <p className="sf-eyebrow">{copy.catalogLabel}</p>
              <h1 id="store-title">{copy.collection}</h1>
            </div>
            <p>{copy.collectionText}</p>
          </div>
          <ProductsClient
            key={initialQuery}
            products={catalog.products}
            categories={catalog.categories}
            locale={locale}
            initialQuery={initialQuery}
            savedProductIds={Array.from(savedProductIds)}
          />
          <p className="sf-preview-note">
            <span aria-hidden="true" />
            {copy.demo}
          </p>
        </div>
      </section>

      <section className="sf-bundle-section">
        <div className="miro-container">
          <div className="sf-bundle">
            <div className="sf-bundle-copy">
              <p className="sf-eyebrow">{copy.bundleEyebrow}</p>
              <h2>{copy.bundleTitle}</h2>
              <p>{copy.bundleText}</p>
              <div className="sf-bundle-tags">
                {copy.bundleTags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <Link
                href={withLocale(locale, "services")}
                className="miro-button miro-button-primary"
              >
                {copy.bundleAction}
                <Arrow size={17} aria-hidden="true" />
              </Link>
            </div>
            <SecurityComposition />
            <span className="sf-bundle-watermark" aria-hidden="true">
              <BrandArtwork locale={locale} compact />
            </span>
          </div>
          <div className="sf-assurance-grid">
            {copy.assurance.map((item, index) => {
              const Icon = assuranceIcons[index];
              return (
                <div className="sf-assurance" key={item.title}>
                  <Icon size={25} strokeWidth={1.5} aria-hidden="true" />
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="sf-guide-section">
        <div className="miro-container">
          <div className="sf-section-heading">
            <div>
              <p className="sf-eyebrow">
                {locale === "he"
                  ? "מחשבה לפני הטכנולוגיה"
                  : "PURPOSE BEFORE TECHNOLOGY"}
              </p>
              <h2>{copy.quickTitle}</h2>
            </div>
            <p>{copy.quickText}</p>
          </div>
          <div className="sf-guide-grid">
            {copy.buying.map((item) => (
              <article className="sf-guide-card" key={item.number}>
                <span>{item.number}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <div className="sf-guide-rule" aria-hidden="true" />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sf-faq-section">
        <div className="miro-container sf-faq-layout">
          <div>
            <p className="sf-eyebrow">{copy.faqEyebrow}</p>
            <h2>{copy.faqTitle}</h2>
            <Link href={withLocale(locale, "contact")} className="sf-text-link">
              {copy.consult}
              <Arrow size={17} aria-hidden="true" />
            </Link>
          </div>
          <div className="sf-faq-list">
            {copy.faqs.map((item) => (
              <details key={item.question}>
                <summary>
                  {item.question}
                  <ChevronDown size={19} aria-hidden="true" />
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <ProductSubNav
        categories={categories}
        locale={locale}
        ariaLabel={copy.category}
      />
    </div>
  );
}
