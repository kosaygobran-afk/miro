import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Truck,
  Circle,
  ExternalLink,
} from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProductVisual } from "@/components/products/ProductVisual";
import { getProductVisualKind } from "@/features/catalog/product-visual-kind";
import { storeCopy, type StoreCopy } from "@/features/catalog/store-copy";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import {
  getStoreCatalog,
  getFallbackStoreCatalog,
  getStoreViewer,
} from "@/lib/store-data";
import { withLocale, isLocale } from "@/lib/i18n";
import { ProductViewTracker } from "@/components/analytics/ProductViewTracker";
import { ProductDetailActions } from "@/components/analytics/ProductDetailActions";

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
  const fallbackCatalog = getFallbackStoreCatalog(locale);
  const allProducts = [...catalog.products, ...fallbackCatalog.products];
  const product = allProducts.find(
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

function formatPrice(
  price: number | null,
  locale: "he" | "en",
  copy: StoreCopy,
) {
  if (price === null || price === undefined) return copy.priceUnpublished;
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(price);
}

function getStockBadge(
  stockState: "in_stock" | "low" | "out",
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
          {copy.outOfStockRestock}
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
          {copy.outOfStockContact}
        </span>
      );
    }
    return (
      <span className="sf-stock-badge sf-stock-out" aria-live="polite">
        <Circle size={14} aria-hidden="true" />
        {locale === "he" ? "אזל מהמלאי" : "Out of stock"}
      </span>
    );
  }
  if (stockState === "low") {
    return (
      <span className="sf-stock-badge sf-stock-low" aria-live="polite">
        <Truck size={14} aria-hidden="true" />
        {copy.lowStock}
      </span>
    );
  }
  return (
    <span className="sf-stock-badge sf-stock-in" aria-live="polite">
      <Circle size={14} aria-hidden="true" />
      {locale === "he" ? "במלאי" : "In stock"}
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
  const catalog = await getStoreCatalog(locale, viewer.role);
  const fallbackCatalog = getFallbackStoreCatalog(locale);
  const allProducts = [...catalog.products, ...fallbackCatalog.products];

  const product = allProducts.find(
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
    product.variants.find((v) => v.isDefault) ??
    product.variants.find((v) => v.price !== null) ??
    product.variants[0];
  const effectivePrice = defaultVariant?.price ?? product.priceIls;
  const displayPrice = formatPrice(effectivePrice, locale, copy);
  const displaySku = defaultVariant?.sku;

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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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
              <Link href={withLocale(locale, "store")}>
                {copy.catalogLabel}
              </Link>
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
          <div className="miro-container sf-product-grid">
            {/* Gallery */}
            <div className="sf-product-gallery">
              <div className="sf-main-image">
                {product.images.length > 0 ? (
                  <Image
                    src={product.images[0].url}
                    alt={
                      locale === "he"
                        ? (product.images[0].altHe ?? product.name)
                        : (product.images[0].altEn ?? product.name)
                    }
                    width={800}
                    height={600}
                    sizes="(max-width: 1200px) 100vw, 800px"
                    priority
                    className="sf-product-main-image"
                  />
                ) : (
                  <div
                    className="sf-product-visual-placeholder"
                    aria-hidden="true"
                  >
                    <ProductVisual kind={getProductVisualKind(product)} />
                    <p className="sf-illustration-note">{copy.illustration}</p>
                  </div>
                )}
              </div>
              {product.images.length > 1 && (
                <div
                  className="sf-thumbnail-strip"
                  role="list"
                  aria-label="Product images"
                >
                  {product.images.map((image, index) => (
                    <button
                      key={image.id}
                      role="listitem"
                      className={`sf-thumbnail ${index === 0 ? "is-active" : ""}`}
                      aria-label={`${locale === "he" ? (image.altHe ?? product.name) : (image.altEn ?? product.name)}`}
                      aria-current={index === 0 ? "true" : "false"}
                    >
                      <Image
                        src={image.url}
                        alt=""
                        width={120}
                        height={90}
                        className="sf-thumbnail-image"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Info */}
            <div className="sf-product-info">
              <p className="sf-product-category">
                {product.categoryLabel ?? product.category}
              </p>
              <h1 id="product-title" dir="auto">
                {product.name}
              </h1>
              {product.modelNumber && (
                <p className="sf-product-model" dir="ltr">
                  {locale === "he" ? "מק״ט" : "Model"}: {product.modelNumber}
                </p>
              )}

              <div className="sf-product-price-block">
                <div className="sf-price-display">
                  <strong dir="auto">{displayPrice}</strong>
                  {effectivePrice !== null && <span>{copy.demoPrice}</span>}
                </div>
                {displaySku && (
                  <p className="sf-product-sku" dir="ltr">
                    <span>{locale === "he" ? "מק״ט" : "SKU"}</span>:{" "}
                    {displaySku}
                  </p>
                )}
              </div>

              {/* Stock badge */}
              <div className="sf-product-stock" aria-live="polite">
                {getStockBadge(
                  product.stockState,
                  product.outOfStockPolicy,
                  product.expectedRestockDate,
                  copy,
                  locale,
                )}
              </div>

              {/* Variant selector */}
              {product.variants.length > 0 && (
                <fieldset className="sf-variant-fieldset">
                  <legend>
                    {copy.variants} {copy.color}
                  </legend>
                  <div
                    className="sf-variant-chips"
                    role="radiogroup"
                    aria-label={copy.variants}
                  >
                    {product.variants.map((variant) => (
                      <label key={variant.id} className="sf-variant-chip-label">
                        <input
                          type="radio"
                          name={`variant-${product.id}`}
                          value={variant.id}
                          defaultChecked={variant.id === defaultVariant?.id}
                          className="sr-only"
                          onChange={() => {}}
                        />
                        <span
                          className="sf-variant-chip"
                          style={
                            {
                              "--variant-color": variant.colorHex,
                            } as React.CSSProperties
                          }
                        >
                          <span
                            className="sf-variant-swatch"
                            aria-hidden="true"
                          />
                          <span className="sf-variant-name">
                            {locale === "he"
                              ? variant.colorHe
                              : variant.colorEn}
                          </span>
                          {variant.price !== null &&
                            variant.price !== effectivePrice && (
                              <span className="sf-variant-price-diff">
                                {formatPrice(variant.price, locale, copy)}
                              </span>
                            )}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              {product.shortDescription && (
                <p className="sf-product-short-description" dir="auto">
                  {product.shortDescription}
                </p>
              )}

              <ProductDetailActions
                productId={product.id}
                productSlug={product.slug}
                productName={product.name}
                locale={locale}
              />

              <p className="sf-product-disclaimer">{copy.demo}</p>

              {/* Specifications */}
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
                    {product.warranty} {locale === "he" ? "אחריות" : "warranty"}
                  </span>
                </div>
              )}
            </div>
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
