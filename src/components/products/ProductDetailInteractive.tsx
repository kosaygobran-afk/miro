"use client";

import { getVariantImages } from "@/lib/catalog/variant-media";
import { VariantChoices } from "@/features/catalog/variant-choices";
import { useState } from "react";
import { RevealImage as Image } from "@/components/ui/reveal-image";
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
import { ProductIdentifiers } from "@/features/catalog/product-identifiers";
import { ProductImageMagnifier } from "@/features/catalog/product-image-magnifier";
import { useAnimationSettings } from "@/components/motion/animation-provider";
import {
  ProductOptionalOffers,
  optionalOfferCanBeSelected,
  MAX_SELECTED_OPTIONAL_OFFERS,
} from "@/features/catalog/product-optional-offers";
import type {
  CartOptionalOffer,
  PublicOptionalOffer,
} from "@/lib/catalog/product-options";

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
  availabilityUnconfirmed?: boolean;
  optionalOffers?: PublicOptionalOffer[];
  optionalOffersUnavailable?: boolean;
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
  availabilityUnconfirmed = false,
  optionalOffers = [],
  optionalOffersUnavailable = false,
}: ProductDetailInteractiveProps) {
  const copy = storeCopy[locale] as StoreCopy;
  const enhanced = useAnimationSettings().appearanceVersion === "2";
  const PreviousArrow = locale === "he" ? ChevronRight : ChevronLeft;
  const NextArrow = locale === "he" ? ChevronLeft : ChevronRight;
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

  const visibleImages = getVariantImages(images, selectedVariant?.id ?? null);
  const selectVariant = (id: string) => {
    setSelectedVariantId(id);
    setActiveImageIndex(0);
  };

  // Centralized price resolution with public promotion
  const pricingInputs: PricingInputs = {
    basePrice,
    variants,
    selectedVariantId: selectedVariant?.id ?? null,
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
  const parentAvailableForOptions =
    canAddToCart &&
    !optionalOffersUnavailable &&
    !availabilityUnconfirmed &&
    effectivePrice !== null &&
    effectivePrice > 0 &&
    displayedStock > 0;
  const eligibleOffers = parentAvailableForOptions
    ? optionalOffers.filter(optionalOfferCanBeSelected)
    : [];
  const eligibleKeys = new Set(
    eligibleOffers.map((offer) => `${offer.id}:${offer.revision}`),
  );
  const optionalSelectionScope = JSON.stringify([
    productId,
    parentAvailableForOptions,
    optionalOffers.map((offer) => [
      offer.id,
      offer.revision,
      optionalOfferCanBeSelected(offer),
    ]),
  ]);
  const [optionalSelection, setOptionalSelection] = useState<{
    scope: string;
    keys: string[];
  }>(() => ({ scope: optionalSelectionScope, keys: [] }));
  const selectedKeys = optionalSelection.keys.filter((key) =>
    eligibleKeys.has(key),
  );
  if (optionalSelection.scope !== optionalSelectionScope) {
    // Prune removed, revised or unavailable offers before they can reach the cart.
    setOptionalSelection({ scope: optionalSelectionScope, keys: selectedKeys });
  }
  const selectedOptionalOffers = eligibleOffers.filter((offer) =>
    selectedKeys.includes(`${offer.id}:${offer.revision}`),
  );
  const selectedOptionalIds = new Set(
    selectedOptionalOffers.map((offer) => offer.id),
  );
  const cartOptionalOffers: CartOptionalOffer[] = selectedOptionalOffers.map(
    (offer) => ({
      id: offer.id,
      kind: offer.kind,
      revision: offer.revision,
      label: offer.label,
      productId: offer.productId,
      variantId: offer.variantId,
      name: offer.name,
      sku: offer.sku,
      slug: offer.slug,
      category: offer.category,
      imageUrl: offer.imageUrl,
      unitPrice: offer.unitPrice!,
    }),
  );
  const toggleOptionalOffer = (id: string, selected: boolean) => {
    const offer = eligibleOffers.find((item) => item.id === id);
    if (!offer) return;
    const key = `${offer.id}:${offer.revision}`;
    setOptionalSelection((current) => {
      const keys = current.keys.filter((item) => eligibleKeys.has(item));
      if (
        selected &&
        !keys.includes(key) &&
        keys.length >= MAX_SELECTED_OPTIONAL_OFFERS
      ) {
        return current;
      }
      return {
        scope: optionalSelectionScope,
        keys: selected
          ? keys.includes(key)
            ? keys
            : [...keys, key]
          : keys.filter((item) => item !== key),
      };
    });
  };
  const resolvedActiveImageIndex = Math.min(
    activeImageIndex,
    Math.max(visibleImages.length - 1, 0),
  );
  const activeImage = visibleImages[resolvedActiveImageIndex];
  const activeImageFailed = activeImage
    ? failedImageIds.has(activeImage.id)
    : false;

  const showPreviousImage = () => {
    setActiveImageIndex((current) =>
      current <= 0 || current >= visibleImages.length
        ? visibleImages.length - 1
        : current - 1,
    );
  };

  const showNextImage = () => {
    setActiveImageIndex((current) => (current + 1) % visibleImages.length);
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
  const imageFallback = (
    <div className="sf-product-visual-placeholder" aria-hidden="true">
      <ProductVisual kind={visualKind} />
      <p className="sf-illustration-note">{copy.illustration}</p>
    </div>
  );
  const imageAnnotation = activeImage?.url.match(
    /(?:^\/images\/catalog\/|\/storage\/v1\/object\/public\/product-media\/storefront\/catalog\/)/,
  ) ? (
    <p className="sf-illustration-note sf-reference-image-note">
      {copy.illustration}
    </p>
  ) : null;

  return (
    <>
      <div className="sf-product-gallery">
        {visibleImages.length > 1 && (
          <div
            className="sf-thumbnail-strip"
            aria-label={copy.productImagesLabel}
          >
            <ul className="sf-thumbnail-list" role="list">
              {visibleImages.map((image, index) => (
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
                      unoptimized={image.url.endsWith(".svg")}
                      className="sf-thumbnail-image"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="sf-main-image">
          {enhanced ? (
            <div className="sf-detail-magnifier">
              <ProductImageMagnifier
                key={productId}
                imageKey={activeImage?.id}
                product={{
                  id: productId,
                  name: productName,
                  category: productCategory,
                }}
                src={activeImage?.url}
                alt={
                  locale === "he"
                    ? (activeImage?.altHe ?? productName)
                    : (activeImage?.altEn ?? productName)
                }
                locale={locale}
                active
                sizes="(max-width: 1200px) 100vw, 800px"
                imageClassName="sf-product-main-image"
                fetchPriority="high"
                escapeScope="local"
                fallback={imageFallback}
                annotation={imageAnnotation}
                counter={
                  activeImage ? (
                    <span
                      className="sf-hover-preview-count sf-gallery-position"
                      dir="ltr"
                      aria-live="polite"
                      aria-atomic="true"
                      aria-label={
                        locale === "he"
                          ? `תמונה ${resolvedActiveImageIndex + 1} מתוך ${visibleImages.length}`
                          : `Image ${resolvedActiveImageIndex + 1} of ${visibleImages.length}`
                      }
                    >
                      {resolvedActiveImageIndex + 1}/{visibleImages.length}
                    </span>
                  ) : null
                }
              />
            </div>
          ) : activeImage && !activeImageFailed ? (
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
            imageFallback
          )}
          {!enhanced ? imageAnnotation : null}
          {visibleImages.length > 1 ? (
            <>
              <button
                type="button"
                className="sf-gallery-arrow sf-gallery-arrow-previous"
                onClick={showPreviousImage}
                aria-label={
                  locale === "he" ? "התמונה הקודמת" : "Previous image"
                }
              >
                <PreviousArrow size={24} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="sf-gallery-arrow sf-gallery-arrow-next"
                onClick={showNextImage}
                aria-label={locale === "he" ? "התמונה הבאה" : "Next image"}
              >
                <NextArrow size={24} aria-hidden="true" />
              </button>
              {!enhanced ? (
                <span
                  className="sf-gallery-position"
                  dir="ltr"
                  aria-live="polite"
                >
                  {resolvedActiveImageIndex + 1}/{visibleImages.length}
                </span>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div
        className="sf-product-info"
        data-selected-variant={selectedVariant?.id}
      >
        <div className="sf-detail-heading">{header}</div>

        <div
          className="sf-product-price-block"
          data-price-published={effectivePrice !== null}
        >
          <p className="sf-detail-section-label">
            {locale === "he" ? "מחיר וזמינות" : "Price & availability"}
          </p>
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
          <StockIndicator
            unconfirmed={availabilityUnconfirmed}
            quantity={displayedStock}
            locale={locale}
          />
          {displaySku && (
            <p className="sf-product-sku" dir="ltr">
              <span>{locale === "he" ? "מק״ט" : "SKU"}</span>: {displaySku}
            </p>
          )}
          <ProductIdentifiers
            sku={displaySku}
            barcode={selectedVariant?.barcode}
            locale={locale}
            className="sf-detail-identifiers"
          />
        </div>

        {displayedStock <= 0 && (
          <div className="sf-product-stock" aria-live="polite">
            {selectedVariant
              ? locale === "he"
                ? "הווריאנט שנבחר אזל מהמלאי"
                : "The selected variant is out of stock"
              : stockBadge}
          </div>
        )}

        <VariantChoices
          variants={variants}
          selectedId={selectedVariant?.id ?? null}
          onSelect={selectVariant}
          locale={locale}
          pricing={pricingInputs}
        />

        <ProductOptionalOffers
          offers={optionalOffers}
          locale={locale}
          selectedIds={selectedOptionalIds}
          onToggle={toggleOptionalOffer}
          parentAvailable={parentAvailableForOptions}
          basePrice={effectivePrice}
          unavailable={optionalOffersUnavailable}
        />

        {description}

        <div className="sf-detail-purchase">
          {effectivePrice !== null && (
            <AddToCartButton
              locale={locale}
              disabled={
                !canAddToCart ||
                availabilityUnconfirmed ||
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
                ...(cartOptionalOffers.length > 0
                  ? { optionalOffers: cartOptionalOffers }
                  : {}),
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
        </div>

        <div className="sf-detail-footer">{footer}</div>
      </div>
    </>
  );
}
