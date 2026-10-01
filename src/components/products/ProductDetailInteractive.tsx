"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductVisual } from "@/components/products/ProductVisual";
import { ProductDetailActions } from "@/components/analytics/ProductDetailActions";
import { storeCopy, type StoreCopy } from "@/features/catalog/store-copy";
import type {
  ProductImage,
  ProductVariant,
} from "@/features/catalog/product-data";
import type { ProductVisualKind } from "@/features/catalog/product-visual-kind";
import type { PublicContactActions } from "@/lib/contact-config";
import type { PublicPromotion } from "@/lib/catalog/pricing";
import {
  formatPrice,
  getDiscountPercent,
  getDefaultVariant,
  priceBeforeVat,
  resolvePrice,
  type PricingInputs,
} from "@/lib/catalog/pricing";
import { AddToCartButton } from "@/features/cart/add-to-cart-button";
import { StockIndicator } from "@/features/catalog/stock-indicator";

interface ProductDetailInteractiveProps {
  productId: string;
  productSlug: string;
  productCategory: string;
  productName: string;
  locale: "he" | "en";
  basePrice: number | null;
  images: ProductImage[];
  variants: ProductVariant[];
  defaultVariantId: string | null;
  visualKind: ProductVisualKind;
  contact: PublicContactActions | null;
  header: React.ReactNode;
  stockBadge: React.ReactNode;
  stockQty: number;
  description: React.ReactNode;
  footer: React.ReactNode;
  publicPromotion?: PublicPromotion | null;
  compareAtPrice?: number | null;
  roleOverride?: number | null;
  canAddToCart?: boolean;
}

export function ProductDetailInteractive({
  productId,
  productSlug,
  productCategory,
  productName,
  locale,
  basePrice,
  images,
  variants,
  defaultVariantId,
  visualKind,
  contact,
  header,
  stockBadge,
  stockQty,
  description,
  footer,
  publicPromotion = null,
  compareAtPrice = null,
  roleOverride = null,
  canAddToCart = true,
}: ProductDetailInteractiveProps) {
  const copy = storeCopy[locale] as StoreCopy;
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    () => {
      const preferred = getDefaultVariant(variants, defaultVariantId);
      return (
        (preferred?.stockQty
          ? preferred
          : variants.find((variant) => variant.stockQty > 0)
        )?.id ??
        preferred?.id ??
        null
      );
    },
  );

  // Centralized default variant resolution
  const defaultVariant = getDefaultVariant(variants, defaultVariantId);
  const selectedVariant =
    variants.find((variant) => variant.id === selectedVariantId) ??
    defaultVariant;

  // Centralized price resolution with public promotion
  const pricingInputs: PricingInputs = {
    basePrice,
    variants,
    selectedVariantId,
    defaultVariantId: defaultVariant?.id ?? null,
    roleOverride,
    variantOverride: null,
    publicPromotion,
  };
  const priceResult = resolvePrice(pricingInputs);
  const effectivePrice = priceResult.effectivePrice;
  const promoCompareAtPrice = priceResult.compareAtPrice ?? compareAtPrice;
  const discountPercent = getDiscountPercent(
    promoCompareAtPrice,
    effectivePrice,
  );
  const displayPrice = formatPrice(
    effectivePrice,
    locale,
    copy.priceUnpublished,
  );
  const displaySku = selectedVariant?.sku;
  const displayedStock = selectedVariant?.stockQty ?? stockQty;
  const resolvedActiveImageIndex = Math.min(
    activeImageIndex,
    Math.max(images.length - 1, 0),
  );
  const activeImage = images[resolvedActiveImageIndex];
  const activeImageFailed = activeImage
    ? failedImageIds.has(activeImage.id)
    : false;

  const showPreviousImage = () => {
    setActiveImageIndex((current) =>
      current <= 0 || current >= images.length
        ? images.length - 1
        : current - 1,
    );
  };

  const showNextImage = () => {
    setActiveImageIndex((current) => (current + 1) % images.length);
  };

  // Generate distinct thumbnail names
  const getThumbnailLabel = (index: number, image: ProductImage) => {
    const position = index + 1;
    const alt = locale === "he" ? image.altHe : image.altEn;
    const description = alt ?? productName;
    return `${copy.thumbnailLabel} ${position}: ${description}`;
  };

  const formattedCompareAtPrice = promoCompareAtPrice
    ? formatPrice(promoCompareAtPrice, locale, copy.priceUnpublished)
    : null;

  return (
    <>
      <div className="sf-product-gallery">
        {images.length > 1 && (
          <div
            className="sf-thumbnail-strip"
            aria-label={copy.productImagesLabel}
          >
            <ul className="sf-thumbnail-list" role="list">
              {images.map((image, index) => (
                <li key={image.id} className="sf-thumbnail-item">
                  <button
                    type="button"
                    className={`sf-thumbnail ${index === resolvedActiveImageIndex ? "is-active" : ""}`}
                    aria-label={getThumbnailLabel(index, image)}
                    aria-current={
                      index === resolvedActiveImageIndex ? "true" : undefined
                    }
                    onClick={() => setActiveImageIndex(index)}
                  >
                    <Image
                      src={image.url}
                      alt=""
                      fill
                      sizes="80px"
                      className="sf-thumbnail-image"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="sf-main-image">
          {activeImage && !activeImageFailed ? (
            <Image
              key={activeImage.id}
              src={activeImage.url}
              alt={
                locale === "he"
                  ? (activeImage.altHe ?? productName)
                  : (activeImage.altEn ?? productName)
              }
              fill
              sizes="(max-width: 1200px) 100vw, 800px"
              priority
              className="sf-product-main-image"
              unoptimized={activeImage.url.toLowerCase().includes(".svg")}
              onError={() =>
                setFailedImageIds((current) => {
                  const next = new Set(current);
                  next.add(activeImage.id);
                  return next;
                })
              }
            />
          ) : (
            <div className="sf-product-visual-placeholder" aria-hidden="true">
              <ProductVisual kind={visualKind} />
              <p className="sf-illustration-note">{copy.illustration}</p>
            </div>
          )}
          {images.length > 1 ? (
            <>
              <button
                type="button"
                className="sf-gallery-arrow sf-gallery-arrow-previous"
                onClick={showPreviousImage}
                aria-label={
                  locale === "he" ? "התמונה הקודמת" : "Previous image"
                }
              >
                <ChevronLeft size={24} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="sf-gallery-arrow sf-gallery-arrow-next"
                onClick={showNextImage}
                aria-label={locale === "he" ? "התמונה הבאה" : "Next image"}
              >
                <ChevronRight size={24} aria-hidden="true" />
              </button>
              <span className="sf-gallery-position" aria-live="polite">
                {resolvedActiveImageIndex + 1}/{images.length}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="sf-product-info">
        {header}

        <div className="sf-product-price-block">
          <div className="sf-price-display" aria-live="polite">
            <div className="sf-price-display__amount">
              <strong dir="auto">{displayPrice}</strong>
              {effectivePrice !== null && (
                <small>{locale === "he" ? "כולל מע״מ" : "incl. VAT"}</small>
              )}
              {effectivePrice !== null && (
                <small dir="auto">
                  {formatPrice(
                    priceBeforeVat(effectivePrice),
                    locale,
                    copy.priceUnpublished,
                  )}{" "}
                  {locale === "he" ? "ללא מע״מ" : "excl. VAT"}
                </small>
              )}
            </div>
            {discountPercent !== null && formattedCompareAtPrice && (
              <>
                <span className="sf-price-compare-at" dir="auto">
                  {formattedCompareAtPrice}
                </span>
                <span
                  className="sf-price-discount"
                  aria-label={`${discountPercent}% off`}
                >
                  -{discountPercent}%
                </span>
              </>
            )}
            {effectivePrice !== null && <span>{copy.demoPrice}</span>}
          </div>
          <StockIndicator quantity={displayedStock} locale={locale} />
          {displaySku && (
            <p className="sf-product-sku" dir="ltr">
              <span>{locale === "he" ? "מק״ט" : "SKU"}</span>: {displaySku}
            </p>
          )}
        </div>

        {displayedStock <= 0 && (
          <div className="sf-product-stock" aria-live="polite">
            {stockBadge}
          </div>
        )}

        {variants.length > 0 && (
          <fieldset className="sf-variant-fieldset">
            <legend>
              {copy.variants} {copy.color}
            </legend>
            <div
              className="sf-variant-chips"
              role="radiogroup"
              aria-label={copy.variants}
            >
              {variants.map((variant) => {
                const isSelected = selectedVariantId === variant.id;
                const variantPrice =
                  variant.price !== null
                    ? formatPrice(variant.price, locale, copy.priceUnpublished)
                    : null;
                return (
                  <label key={variant.id} className="sf-variant-chip-label">
                    <input
                      type="radio"
                      name={`variant-${productId}`}
                      value={variant.id}
                      checked={isSelected}
                      className="sr-only"
                      onChange={() => setSelectedVariantId(variant.id)}
                    />
                    <span
                      className="sf-variant-chip"
                      style={
                        {
                          "--variant-color": variant.colorHex,
                        } as React.CSSProperties
                      }
                    >
                      <span className="sf-variant-swatch" aria-hidden="true" />
                      <span className="sf-variant-name">
                        {locale === "he" ? variant.colorHe : variant.colorEn}
                      </span>
                      <span className="sf-variant-stock">
                        {variant.stockQty}{" "}
                        {locale === "he" ? "במלאי" : "in stock"}
                      </span>
                      {variant.price !== null &&
                        variant.price !== priceResult.effectivePrice && (
                          <span className="sf-variant-price-diff">
                            {variantPrice}
                          </span>
                        )}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {description}

        {effectivePrice !== null && (
          <AddToCartButton
            locale={locale}
            disabled={
              !canAddToCart ||
              (variants.length > 0 && (selectedVariant?.stockQty ?? 0) <= 0)
            }
            item={{
              productId,
              variantId: selectedVariant?.id ?? null,
              slug: productSlug,
              category: productCategory,
              name: productName,
              imageUrl: activeImage?.url ?? images[0]?.url ?? null,
              unitPrice: effectivePrice,
            }}
          />
        )}

        <ProductDetailActions
          productId={productId}
          productSlug={productSlug}
          productName={productName}
          locale={locale}
          variantId={selectedVariant?.id ?? null}
          contact={contact}
        />

        {footer}
      </div>
    </>
  );
}
