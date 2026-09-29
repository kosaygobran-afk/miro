"use client";

import { useState } from "react";
import Image from "next/image";
import { ProductVisual } from "@/components/products/ProductVisual";
import { ProductDetailActions } from "@/components/analytics/ProductDetailActions";
import { storeCopy, type StoreCopy } from "@/features/catalog/store-copy";
import type {
  ProductImage,
  ProductVariant,
} from "@/features/catalog/product-data";
import type { ProductVisualKind } from "@/features/catalog/product-visual-kind";
import type { PublicContactActions } from "@/lib/contact-config";
import {
  formatPrice,
  getDefaultVariant,
  resolvePrice,
  type PricingInputs,
} from "@/lib/catalog/pricing";

interface ProductDetailInteractiveProps {
  productId: string;
  productSlug: string;
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
  description: React.ReactNode;
  footer: React.ReactNode;
}

export function ProductDetailInteractive({
  productId,
  productSlug,
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
  description,
  footer,
}: ProductDetailInteractiveProps) {
  const copy = storeCopy[locale] as StoreCopy;
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null,
  );

  // Centralized default variant resolution
  const defaultVariant = getDefaultVariant(variants, defaultVariantId);

  // Centralized price resolution
  const pricingInputs: PricingInputs = {
    basePrice,
    variants,
    selectedVariantId,
    defaultVariantId: defaultVariant?.id ?? null,
    roleOverride: null, // Role override handled at catalog fetch level
    variantOverride: null,
  };
  const priceResult = resolvePrice(pricingInputs);
  const displayPrice = formatPrice(priceResult.effectivePrice, locale, copy.priceUnpublished);
  const displaySku = priceResult.pricingVariant?.sku ?? defaultVariant?.sku;
  const activeImage = images[activeImageIndex];

  // Generate distinct thumbnail names
  const getThumbnailLabel = (index: number, image: ProductImage) => {
    const position = index + 1;
    const alt = locale === "he" ? image.altHe : image.altEn;
    const description = alt ?? productName;
    return `${copy.thumbnailLabel} ${position}: ${description}`;
  };

  return (
    <>
      <div className="sf-product-gallery">
        <div className="sf-main-image">
          {activeImage ? (
            <Image
              src={activeImage.url}
              alt={
                locale === "he"
                  ? (activeImage.altHe ?? productName)
                  : (activeImage.altEn ?? productName)
              }
              width={800}
              height={600}
              sizes="(max-width: 1200px) 100vw, 800px"
              priority
              className="sf-product-main-image"
              style={{ objectFit: "contain" }}
            />
          ) : (
            <div className="sf-product-visual-placeholder" aria-hidden="true">
              <ProductVisual kind={visualKind} />
              <p className="sf-illustration-note">{copy.illustration}</p>
            </div>
          )}
        </div>
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
                    className={`sf-thumbnail ${index === activeImageIndex ? "is-active" : ""}`}
                    aria-label={getThumbnailLabel(index, image)}
                    aria-current={index === activeImageIndex ? "true" : "false"}
                    onClick={() => setActiveImageIndex(index)}
                  >
                    <Image
                      src={image.url}
                      alt=""
                      width={120}
                      height={90}
                      className="sf-thumbnail-image"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="sf-product-info">
        {header}

        <div className="sf-product-price-block">
          <div className="sf-price-display" aria-live="polite">
            <strong dir="auto">{displayPrice}</strong>
            {priceResult.effectivePrice !== null && <span>{copy.demoPrice}</span>}
          </div>
          {displaySku && (
            <p className="sf-product-sku" dir="ltr">
              <span>{locale === "he" ? "מק״ט" : "SKU"}</span>: {displaySku}
            </p>
          )}
        </div>

        <div className="sf-product-stock" aria-live="polite">
          {stockBadge}
        </div>

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
                const variantPrice = variant.price !== null ? formatPrice(variant.price, locale, copy.priceUnpublished) : null;
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

        <ProductDetailActions
          productId={productId}
          productSlug={productSlug}
          productName={productName}
          locale={locale}
          variantId={priceResult.pricingVariant?.id ?? defaultVariant?.id ?? null}
          contact={contact}
        />

        {footer}
      </div>
    </>
  );
}
