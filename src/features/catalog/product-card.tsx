"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Heart,
  HeartOff,
  Loader2,
  Eye,
} from "lucide-react";
import { StockIndicator } from "@/features/catalog/stock-indicator";
import { ProductVisual } from "@/components/products/ProductVisual";
import { getProductVisualKind } from "@/features/catalog/product-visual-kind";
import { storeCopy, type StoreCopy } from "@/features/catalog/store-copy";
import type { Product } from "@/features/catalog/product-data";
import { trackProductImpression } from "@/components/analytics/track";
import {
  formatPrice,
  getDiscountPercent,
  priceBeforeVat,
  shouldHideFromPublic,
} from "@/lib/catalog/pricing";
import { ProductHoverPreview } from "@/features/catalog/product-hover-preview";
import { StickerCluster } from "@/features/catalog/product-promo-badge";
import { AddToCartButton } from "@/features/cart/add-to-cart-button";

export type { Product } from "@/features/catalog/product-data";

function getPrimaryImage(product: Product) {
  if (product.images.length > 0) {
    return product.images[0];
  }
  return null;
}

export function ProductCard({
  product,
  locale = "en",
  actionLabel,
  isSaved = false,
}: {
  product: Product;
  index?: number;
  actionLabel?: string;
  locale?: "he" | "en";
  isSaved?: boolean;
}) {
  const copy = storeCopy[locale] as StoreCopy;
  const [saved, setSaved] = useState(isSaved);
  const [impressionFired, setImpressionFired] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showHoverPreview, setShowHoverPreview] = useState(false);
  const [previewOpenedExplicitly, setPreviewOpenedExplicitly] = useState(false);
  const closePreview = useCallback(() => setShowHoverPreview(false), []);
  const keepPreviewOpen = useCallback(() => setShowHoverPreview(true), []);
  const cardRef = useRef<HTMLElement | null>(null);
  const previewButtonRef = useRef<HTMLButtonElement | null>(null);
  const kind = getProductVisualKind(product);
  const Arrow = locale === "he" ? ArrowLeft : ArrowRight;
  const primaryImage = getPrimaryImage(product);

  // Use pre-computed prices from server (already includes role prices and promotions)
  // Do NOT call resolvePrice() again - server already computed final display price
  const effectivePrice = product.priceIls;
  const compareAtPrice = product.compareAtPrice ?? null;
  const discountPercent = getDiscountPercent(compareAtPrice, effectivePrice);
  const formattedPrice = formatPrice(
    effectivePrice,
    locale,
    copy.priceUnpublished,
  );
  const formattedCompareAtPrice = compareAtPrice
    ? formatPrice(compareAtPrice, locale, copy.priceUnpublished)
    : null;

  useEffect(() => {
    const element = cardRef.current;
    if (
      !element ||
      impressionFired ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setImpressionFired(true);
          trackProductImpression(product.id, locale);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [product.id, locale, impressionFired]);

  // Don't render card if product should be hidden from public
  if (shouldHideFromPublic(product.outOfStockPolicy, product.stockQty)) {
    return null;
  }

  async function handleSave(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (isSaving) return;
    const nextSaved = !saved;
    setIsSaving(true);
    setSaveError(null);
    setSaved(nextSaved);

    try {
      const response = await fetch(
        nextSaved
          ? "/api/account/saved-products"
          : `/api/account/saved-products?productId=${encodeURIComponent(product.id)}`,
        nextSaved
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ productId: product.id }),
            }
          : { method: "DELETE" },
      );

      if (!response.ok) {
        // Revert on failure
        setSaved(!nextSaved);
        if (response.status === 401) {
          setSaveError(
            locale === "he"
              ? "יש להתחבר כדי לשמור מוצרים"
              : "Please sign in to save products",
          );
        } else {
          setSaveError(
            locale === "he"
              ? "שמירה נכשלה. נסה שוב."
              : "Failed to save. Please try again.",
          );
        }
      }
    } catch (error) {
      setSaved(!nextSaved);
      setSaveError(
        locale === "he"
          ? "שגיאת רשת. נסה שוב."
          : "Network error. Please try again.",
      );
      console.error("Failed to save/unsave product", error);
    } finally {
      setIsSaving(false);
    }
  }

  const altText =
    locale === "he"
      ? (primaryImage?.altHe ?? product.name)
      : (primaryImage?.altEn ?? product.name);

  const productUrl = `/${locale}/store/${product.category}/${product.slug}`;

  return (
    <article
      ref={cardRef}
      className="sf-product-card"
      data-product-name={product.name}
      data-product-price={product.priceIls ?? 0}
      data-product-stock-state={product.stockState}
      data-preview-intent={showHoverPreview || undefined}
    >
      {/* Hover Preview - portaled to body */}
      <ProductHoverPreview
        product={product}
        locale={locale}
        isOpen={showHoverPreview}
        onClose={closePreview}
        onKeepOpen={keepPreviewOpen}
        triggerRef={cardRef}
        focusOnOpen={previewOpenedExplicitly}
        returnFocusRef={previewButtonRef}
      />

      <div
        className="sf-product-media-shell"
        onMouseEnter={() => setShowHoverPreview(true)}
        onMouseLeave={() => setShowHoverPreview(false)}
        onFocusCapture={() => {
          setPreviewOpenedExplicitly(false);
          setShowHoverPreview(true);
        }}
        onBlurCapture={(event) => {
          const nextTarget = event.relatedTarget;
          const movedIntoPreview =
            nextTarget instanceof Element &&
            nextTarget.closest(".sf-hover-preview") !== null;
          if (!event.currentTarget.contains(nextTarget) && !movedIntoPreview) {
            setShowHoverPreview(false);
          }
        }}
      >
        <Link
          href={productUrl}
          className="sf-product-media"
          aria-label={`${copy.details}: ${product.name}`}
        >
          {product.promoBadges && product.promoBadges.length > 0 && (
            <StickerCluster
              badges={product.promoBadges}
              locale={locale}
              maxVisible={2}
            />
          )}

          {product.badge && (
            <span className="sf-product-badge">{product.badge}</span>
          )}

          {primaryImage ? (
            <Image
              src={primaryImage.url}
              alt={altText}
              fill
              sizes="(max-width: 600px) 100vw, (max-width: 1100px) 50vw, 25vw"
              className="sf-product-visual"
              style={{ objectFit: "contain" }}
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <ProductVisual kind={kind} />
          )}

          {!primaryImage && (
            <span className="sf-product-illustration-caption">
              {copy.illustration}
            </span>
          )}

          <span className="sf-product-expand">
            <ArrowUpRight size={17} aria-hidden="true" />
          </span>
        </Link>

        <button
          ref={previewButtonRef}
          type="button"
          className="sf-product-quick-preview"
          aria-label={`${locale === "he" ? "תצוגה מקדימה" : "Quick preview"}: ${product.name}`}
          aria-haspopup="dialog"
          aria-expanded={showHoverPreview}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setPreviewOpenedExplicitly(true);
            setShowHoverPreview(true);
          }}
        >
          <Eye size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="sf-product-body">
        <p className="sf-product-category">
          {product.categoryLabel ?? product.category}
        </p>
        <h3 dir="auto">
          <Link
            href={productUrl}
            className="sf-product-title-link"
            aria-label={`${copy.details}: ${product.name}`}
          >
            {product.name}
          </Link>
        </h3>
        <p className="sf-product-description" dir="auto">
          {product.description}
        </p>

        {/* Price with promotional display */}
        <div className="sf-product-price">
          <div className="sf-product-price__amount">
            <strong dir="auto">{formattedPrice}</strong>
            {effectivePrice !== null && (
              <small dir="auto">
                {locale === "he" ? "כולל מע״מ" : "incl. VAT"}
              </small>
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
          <StockIndicator quantity={product.stockQty} locale={locale} />
          <div className="sf-product-price__promotion">
            {discountPercent !== null && formattedCompareAtPrice && (
              <>
                <span className="sf-product-compare-at" dir="auto">
                  {formattedCompareAtPrice}
                </span>
                <span
                  className="sf-product-discount"
                  aria-label={`${discountPercent}% off`}
                >
                  -{discountPercent}%
                </span>
              </>
            )}
            {effectivePrice === null && <span>{copy.demoPrice}</span>}
          </div>
        </div>

        <div className="sf-product-actions">
          {/* Details button - now a semantic Link */}
          <Link
            href={productUrl}
            className="sf-product-action"
            aria-label={`${copy.details}: ${product.name}`}
          >
            {actionLabel ?? copy.details}
            <Arrow size={16} aria-hidden="true" />
          </Link>

          {effectivePrice !== null && product.stockState !== "out" ? (
            <AddToCartButton
              compact
              locale={locale}
              item={{
                productId: product.id,
                variantId:
                  (
                    product.variants.find(
                      (variant) => variant.isDefault && variant.stockQty > 0,
                    ) ??
                    product.variants.find((variant) => variant.stockQty > 0)
                  )?.id ?? null,
                slug: product.slug,
                category: product.category,
                name: product.name,
                imageUrl: primaryImage?.url ?? null,
                unitPrice: effectivePrice,
              }}
            />
          ) : null}

          {/* Save/Favorite - independently interactive */}
          <button
            type="button"
            className="miro-button miro-button-secondary sf-save-button"
            onClick={handleSave}
            aria-label={saved ? copy.removeFromSaved : copy.saveForLater}
            aria-pressed={saved}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            ) : saved ? (
              <Heart size={18} className="text-accent-text" />
            ) : (
              <HeartOff size={18} />
            )}
          </button>

          {saveError && (
            <span className="sf-save-error" role="alert" aria-live="polite">
              {saveError}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
