import Link from "@/components/motion/motion-link";
import {
  ArrowLeft,
  ArrowRight,
  Truck,
  Circle,
  ExternalLink,
} from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getProductVisualKind } from "@/features/catalog/product-visual-kind";
import { storeCopy, type StoreCopy } from "@/features/catalog/store-copy";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { getStoreCatalog, getStoreViewer } from "@/lib/store-data";
import { withLocale, isLocale } from "@/lib/i18n";
import { ProductViewTracker } from "@/components/analytics/ProductViewTracker";
import { ProductDetailInteractive } from "@/components/products/ProductDetailInteractive";
import {
  getPublicContactConfig,
  toPublicContactActions,
} from "@/lib/contact-config";

interface ProductDetailPageProps {
  params: Promise<{ locale: string; category: string; slug: string }>;
}

function normalizeCategory(category: string) {
  return category === "network-gear" ? "networkGear" : category;
}

export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { locale: rawLocale, category, slug } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "he";
  const t = await getTranslations({ locale, namespace: "metadata.products" });
  const catalog = await getStoreCatalog(locale);
  const product = catalog.products.find(
    (p) => p.slug === slug && p.category === normalizeCategory(category),
  );

  if (!product) {
    return pageMetadata({
      locale,
      path: `store/${category}/${slug}`,
      title: t("title"),
      description: t("description"),
    });
  }

  const seoTitle = product.seoTitle ?? product.name;
  const seoDescription =
    product.seoDescription ?? product.shortDescription ?? product.description;

  return pageMetadata({
    locale,
    path: `store/${category}/${slug}`,
    title: seoTitle,
    description: seoDescription,
  });
}

function getStockBadge(
  stockState: "in_stock" | "low" | "out",
  stockQty: number,
  policy:
    | "inherit"
    | "keep_visible_contact"
    | "keep_visible_restock"
    | "hide_from_public",
  expectedRestockDate: string | null,
  copy: StoreCopy,
  locale: "he" | "en",
) {
  if (stockState === "out") {
    if (policy === "keep_visible_restock" && expectedRestockDate) {
      return (
        <span className="sf-stock-badge sf-stock-restock" aria-live="polite">
          <Truck size={14} aria-hidden="true" />
          {copy.outOfStockRestock} · 0 {locale === "he" ? "במלאי" : "in stock"}
          <time dateTime={expectedRestockDate}>
            {new Date(expectedRestockDate).toLocaleDateString(
              locale === "he" ? "he-IL" : "en-IL",
              {
                month: "long",
                day: "numeric",
                year: "numeric",
              },
            )}
          </time>
        </span>
      );
    }
    if (policy === "keep_visible_contact") {
      return (
        <span className="sf-stock-badge sf-stock-contact" aria-live="polite">
          <Circle size={14} aria-hidden="true" />
          {copy.outOfStockContact} · 0 {locale === "he" ? "במלאי" : "in stock"}
        </span>
      );
    }
    return (
      <span className="sf-stock-badge sf-stock-out" aria-live="polite">
        <Circle size={14} aria-hidden="true" />
        {locale === "he" ? "אזל מהמלאי · 0 במלאי" : "Out of stock · 0 in stock"}
      </span>
    );
  }
  if (stockState === "low") {
    return (
      <span className="sf-stock-badge sf-stock-low" aria-live="polite">
        <Truck size={14} aria-hidden="true" />
        {copy.lowStock} · {stockQty} {locale === "he" ? "נותרו" : "left"}
      </span>
    );
  }
  return (
    <span className="sf-stock-badge sf-stock-in" aria-live="polite">
      <Circle size={14} aria-hidden="true" />
      {stockQty} {locale === "he" ? "במלאי" : "in stock"}
    </span>
  );
}

export default async function ProductDetailPage({
  params,
}: ProductDetailPageProps) {
  const [{ locale: rawLocale, category: rawCategory, slug }, viewer] =
    await Promise.all([params, getStoreViewer()]);
  const locale = isLocale(rawLocale) ? rawLocale : "he";
  const category = normalizeCategory(rawCategory);
  const copy = storeCopy[locale] as StoreCopy;
  const Arrow = locale === "he" ? ArrowRight : ArrowLeft;
  const [catalog, contactConfig] = await Promise.all([
    getStoreCatalog(locale, viewer.role),
    getPublicContactConfig(),
  ]);
  const product = catalog.products.find(
    (p) => p.slug === slug && p.category === category,
  );

  if (!product) notFound();

  // Check if product should be hidden from public
  if (
    product.stockState === "out" &&
    product.outOfStockPolicy === "hide_from_public"
  ) {
    notFound();
  }

  const defaultVariant =
    product.variants.find((v) => v.isDefault && v.stockQty > 0) ??
    product.variants.find((v) => v.stockQty > 0) ??
    product.variants.find((v) => v.isDefault) ??
    product.variants.find((v) => v.price !== null) ??
    product.variants[0];
  const effectivePrice = defaultVariant?.price ?? product.priceIls;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const productUrl = `${siteUrl}/${locale}/store/${category}/${slug}`;

  // JSON-LD Product schema
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    url: productUrl,
    image:
      product.images.length > 0
        ? product.images.map((img) => img.url)
        : undefined,
    brand: { "@type": "Brand", name: product.brand ?? "MIRO" },
    sku: product.modelNumber ?? product.id,
    mpn: product.modelNumber,
    offers:
      effectivePrice !== null
        ? {
            "@type": "Offer",
            url: productUrl,
            priceCurrency: "ILS",
            price: effectivePrice.toString(),
            availability:
              product.stockState === "in_stock"
                ? "https://schema.org/InStock"
                : product.stockState === "low"
                  ? "https://schema.org/LimitedAvailability"
                  : "https://schema.org/OutOfStock",
            seller: { "@type": "Organization", name: "MIRO" },
          }
        : undefined,
    aggregateRating: undefined,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <ProductViewTracker productId={product.id} locale={locale} />
      <div className="sf-storefront sf-product-detail">
        <section className="sf-product-breadcrumb">
          <div className="miro-container">
            <nav aria-label="Breadcrumb" className="sf-breadcrumb">
              <Link href={withLocale(locale)}>
                {locale === "he" ? "בית" : "Home"}
              </Link>
              <Arrow size={14} aria-hidden="true" />
              <Link href={withLocale(locale)}>{copy.catalogLabel}</Link>
              <Arrow size={14} aria-hidden="true" />
              <Link href={withLocale(locale, `store/${category}`)}>
                {catalog.categories.find((c) => c.key === category)?.label ??
                  category}
              </Link>
              <Arrow size={14} aria-hidden="true" />
              <span aria-current="page">{product.name}</span>
            </nav>
          </div>
        </section>

        <section className="sf-product-main" aria-labelledby="product-title">
          <div className="miro-container sf-product-detail-layout">
            <ProductDetailInteractive
              productId={product.id}
              productSlug={product.slug}
              productCategory={product.category}
              productName={product.name}
              locale={locale}
              basePrice={product.basePriceIls ?? product.priceIls}
              images={product.images}
              variants={product.variants}
              defaultVariantId={defaultVariant?.id ?? null}
              roleOverride={product.rolePrice ?? null}
              publicPromotion={product.publicPromotion ?? null}
              compareAtPrice={product.compareAtPrice ?? null}
              canAddToCart={product.stockState !== "out"}
              visualKind={getProductVisualKind(product)}
              contact={toPublicContactActions(contactConfig)}
              header={
                <>
                  <p className="sf-product-category">
                    {product.categoryLabel ?? product.category}
                  </p>
                  <h1 id="product-title" dir="auto">
                    {product.name}
                  </h1>
                  {product.modelNumber && (
                    <p className="sf-product-model" dir="ltr">
                      {locale === "he" ? "מק״ט" : "Model"}:{" "}
                      {product.modelNumber}
                    </p>
                  )}
                </>
              }
              availabilityUnconfirmed={product.availabilityUnconfirmed}
              stockBadge={
                product.availabilityUnconfirmed ? (
                  <span className="sf-availability-pending">
                    {locale === "he"
                      ? "זמינות לפי בירור"
                      : "Availability on request"}
                  </span>
                ) : (
                  getStockBadge(
                    product.stockState,
                    product.stockQty,
                    product.outOfStockPolicy,
                    product.expectedRestockDate,
                    copy,
                    locale,
                  )
                )
              }
              stockQty={product.stockQty}
              description={
                product.shortDescription ? (
                  <p className="sf-product-short-description" dir="auto">
                    {product.shortDescription}
                  </p>
                ) : null
              }
              footer={
                <>
                  <p className="sf-product-disclaimer">{copy.demo}</p>
                  {product.specifications &&
                    Object.keys(product.specifications).length > 0 && (
                      <details className="sf-product-specs">
                        <summary>
                          {locale === "he" ? "מפרט טכני" : "Specifications"}
                          <ExternalLink size={16} aria-hidden="true" />
                        </summary>
                        <dl className="sf-specs-list">
                          {Object.entries(product.specifications).map(
                            ([key, value]) => (
                              <div key={key} className="sf-spec-row">
                                <dt>{key}</dt>
                                <dd>{value}</dd>
                              </div>
                            ),
                          )}
                        </dl>
                      </details>
                    )}
                  {product.warranty && (
                    <div className="sf-product-warranty">
                      <Circle
                        size={18}
                        aria-hidden="true"
                        className="text-accent-text"
                      />
                      <span>
                        {product.warranty}{" "}
                        {locale === "he" ? "אחריות" : "warranty"}
                      </span>
                    </div>
                  )}
                </>
              }
            />
          </div>
        </section>

        {/* Full Description */}
        <section className="sf-product-description-section">
          <div className="miro-container">
            <h2>{locale === "he" ? "תיאור מלא" : "Full description"}</h2>
            <div className="sf-description-content" dir="auto">
              {product.description.split("\n\n").map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </div>
        </section>

        {/* Related products could go here */}
      </div>
    </>
  );
}
