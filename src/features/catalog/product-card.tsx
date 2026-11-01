"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/motion/motion-link";
import { OverflowLabel } from "./overflow-label";
import { ProductMedia } from "./product-media";
import { ProductBadgeRail } from "./product-badge-rail";
import { useAnimationSettings } from "@/components/motion/animation-provider";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Heart,
  HeartOff,
  Loader2,
  Eye,
  Tag,
} from "lucide-react";
import { PriceAmount, DiscountBadge } from "./price-amount";
import { StockIndicator } from "@/features/catalog/stock-indicator";
import {
  ProductIdentifiers,
  getProductIdentifierVariant,
} from "./product-identifiers";

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
import { PRODUCT_PREVIEW_HOVER_ENABLED } from "@/features/catalog/product-preview-triggers";
import { usePreviewHoverDismissal } from "./use-preview-hover-dismissal";
import { usePreviewLongPress } from "./use-preview-long-press";
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
  variant = "grid",
  isDuplicate = false,
  onPreviewVisibilityChange,
}: {
  product: Product;
  index?: number;
  actionLabel?: string;
  locale?: "he" | "en";
  isSaved?: boolean;
  variant?: "grid" | "rail";
  isDuplicate?: boolean;
  onPreviewVisibilityChange?: (open: boolean) => void;
}) {
  const enhancedBadges = useAnimationSettings().appearanceVersion === "2";
  const copy = storeCopy[locale] as StoreCopy;
  const [saved, setSaved] = useState(isSaved);
  const [impressionFired, setImpressionFired] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showHoverPreview, setShowHoverPreview] = useState(false);
  const [previewOpenedExplicitly, setPreviewOpenedExplicitly] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const { canHover, dismissHover, clearDismissal, trackPointer } =
    usePreviewHoverDismissal(sourceRef);
  const openExplicitly = useCallback(() => {
    clearDismissal();
    setPreviewOpenedExplicitly(true);
    setShowHoverPreview(true);
  }, [clearDismissal]);
  const longPress = usePreviewLongPress(sourceRef, openExplicitly);
  const closePreview = useCallback(
    (explicit: boolean) => {
      dismissHover(explicit);
      setShowHoverPreview(false);
    },
    [dismissHover],
  );
  const keepPreviewOpen = useCallback(() => setShowHoverPreview(true), []);
  const previewButtonRef = useRef<HTMLButtonElement | null>(null);
  const Arrow = locale === "he" ? ArrowLeft : ArrowRight;
  const primaryImage = getPrimaryImage(product);
  const identifierVariant = getProductIdentifierVariant(product.variants);

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
      variant === "rail" ||
      isDuplicate ||
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
  }, [product.id, locale, impressionFired, variant, isDuplicate]);

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
  const openOnHover = (event: React.PointerEvent<HTMLElement>) => {
    if (!PRODUCT_PREVIEW_HOVER_ENABLED) return;
    if (
      event.target instanceof Element &&
      event.target.closest(
        ".sf-card-identifiers, .sf-badge-rail, .sf-card-media-tools",
      )
    )
      return;
    if (event.pointerType !== "mouse") return;
    // Portals bubble through the card, but are not fresh source-card intent.
    if (!event.currentTarget.contains(event.target as Node)) return;
    if (!canHover()) return;
    if (showHoverPreview) return;
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      setPreviewOpenedExplicitly(false);
      setShowHoverPreview(true);
    }
  };

  const cartAction =
    effectivePrice !== null && product.stockState !== "out" ? (
      <AddToCartButton
        compact={!enhancedBadges}
        tabIndex={isDuplicate ? -1 : undefined}
        locale={locale}
        item={{
          productId: product.id,
          variantId:
            (
              product.variants.find(
                (variant) => variant.isDefault && variant.stockQty > 0,
              ) ?? product.variants.find((variant) => variant.stockQty > 0)
            )?.id ?? null,
          slug: product.slug,
          category: product.category,
          name: product.name,
          imageUrl: primaryImage?.url ?? null,
          unitPrice: effectivePrice,
        }}
      />
    ) : null;

  const stockIndicator = (
    <StockIndicator
      quantity={product.stockQty}
      locale={locale}
      unconfirmed={product.availabilityUnconfirmed}
      variant={enhancedBadges ? "card" : "default"}
      tabIndex={isDuplicate ? -1 : undefined}
    />
  );

  const priceAmount = (
    <div className="sf-product-price__amount">
      <strong dir="auto">
        {enhancedBadges && effectivePrice !== null ? (
          <PriceAmount amount={effectivePrice} locale={locale} />
        ) : (
          formattedPrice
        )}
      </strong>
      {!enhancedBadges && effectivePrice !== null && (
        <small dir="auto">{locale === "he" ? "כולל מע״מ" : "incl. VAT"}</small>
      )}
      {!enhancedBadges && effectivePrice !== null && (
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
  );
  const pricePromotion = (
    <div className="sf-product-price__promotion">
      {discountPercent !== null && formattedCompareAtPrice && (
        <>
          <del className="sf-product-compare-at" dir="ltr">
            {enhancedBadges && compareAtPrice !== null ? (
              <PriceAmount amount={compareAtPrice} locale={locale} />
            ) : (
              formattedCompareAtPrice
            )}
          </del>
          <DiscountBadge
            percent={discountPercent}
            locale={locale}
            className="sf-product-discount"
          />
        </>
      )}
      {effectivePrice === null && <span>{copy.demoPrice}</span>}
    </div>
  );

  return (
    <article
      ref={cardRef}
      dir={locale === "he" ? "rtl" : "ltr"}
      className={`${variant === "rail" ? "sf-moving-rail-card-shell sf-reference-rail" : "sf-product-card"}${enhancedBadges ? " sf-reference-card" : ""}`}
      data-product-name={product.name}
      data-product-price={product.priceIls ?? undefined}
      data-product-stock-state={product.stockState}
      data-preview-intent={showHoverPreview || undefined}
      data-preview-pressing={longPress.isPressing || undefined}
      onPointerMoveCapture={trackPointer}
      onPointerOutCapture={trackPointer}
    >
      {/* Hover Preview - portaled to body */}
      <ProductHoverPreview
        product={product}
        locale={locale}
        isOpen={showHoverPreview}
        onClose={closePreview}
        onKeepOpen={keepPreviewOpen}
        onVisibilityChange={onPreviewVisibilityChange}
        triggerRef={cardRef}
        hoverSourceRef={sourceRef}
        actionsRef={actionsRef}
        focusOnOpen={previewOpenedExplicitly}
        returnFocusRef={previewButtonRef}
      />

      <div
        ref={sourceRef}
        className={`sf-product-preview-source${variant === "rail" ? " sf-moving-rail-card" : ""}`}
        data-preview-source="true"
        onPointerDown={longPress.onPointerDown}
        onContextMenu={longPress.onContextMenu}
        onPointerEnter={openOnHover}
        onPointerMove={openOnHover}
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse") return;
          if (
            event.relatedTarget instanceof Element &&
            event.relatedTarget.closest(".sf-hover-preview")
          )
            return;
          clearDismissal();
          if (window.matchMedia("(hover: hover) and (pointer: fine)").matches)
            setShowHoverPreview(false);
        }}
        onFocusCapture={(event) => {
          // Native touch focus must not turn an ordinary tap into a preview.
          if (
            !(event.target instanceof Element) ||
            event.target.closest(
              ".sf-card-identifiers, .sf-badge-rail, .sf-card-media-tools",
            ) ||
            !event.target.matches(":focus-visible")
          )
            return;
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
        <div className="sf-product-media-shell" data-product-section="image">
          {enhancedBadges && (
            <ProductBadgeRail
              collection={product.badge}
              badges={product.promoBadges ?? []}
              locale={locale}
              isDuplicate={isDuplicate}
            />
          )}
          <Link
            href={productUrl}
            prefetch={false}
            className={`sf-product-media${variant === "rail" ? " sf-moving-rail-media" : ""}`}
            aria-label={`${copy.details}: ${product.name}`}
            tabIndex={isDuplicate ? -1 : undefined}
          >
            {!enhancedBadges &&
              product.promoBadges &&
              product.promoBadges.length > 0 && (
                <StickerCluster
                  badges={product.promoBadges}
                  locale={locale}
                  maxVisible={2}
                />
              )}
            {!enhancedBadges && product.badge && (
              <span className="sf-product-badge">{product.badge}</span>
            )}

            <ProductMedia
              product={product}
              src={primaryImage?.url}
              alt={altText}
              sizes="(max-width: 600px) 100vw, (max-width: 1100px) 50vw, 25vw"
              className={`sf-product-visual${variant === "rail" ? " sf-moving-rail-image" : ""}`}
            />

            {!enhancedBadges &&
              (!primaryImage ||
                product.images[0]?.url.match(
                  /(?:^\/images\/catalog\/|\/storage\/v1\/object\/public\/product-media\/storefront\/catalog\/)/,
                )) && (
                <span className="sf-product-illustration-caption">
                  {copy.illustration}
                </span>
              )}

            {!enhancedBadges && (
              <span className="sf-product-expand">
                <ArrowUpRight size={17} aria-hidden="true" />
              </span>
            )}
          </Link>
          {enhancedBadges && (
            <div className="sf-card-media-tools">
              {(!primaryImage ||
                product.images[0]?.url.match(
                  /(?:^\/images\/catalog\/|\/storage\/v1\/object\/public\/product-media\/storefront\/catalog\/)/,
                )) && (
                <span className="sf-product-illustration-caption">
                  {copy.illustration}
                </span>
              )}
              <Link
                href={productUrl}
                prefetch={false}
                className="sf-product-expand"
                aria-label={`${copy.details}: ${product.name}`}
                tabIndex={isDuplicate ? -1 : undefined}
              >
                <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>

        <div
          className={`sf-product-body${variant === "rail" ? " sf-moving-rail-content" : ""}`}
        >
          <div
            className={`sf-product-summary${variant === "rail" ? " sf-moving-rail-summary" : ""}`}
            data-product-section="details"
          >
            <p className="sf-product-category">
              {enhancedBadges && <Tag size={14} aria-hidden="true" />}
              {product.categoryLabel ?? product.category}
            </p>
            <h3
              dir={enhancedBadges ? (locale === "he" ? "rtl" : "ltr") : "auto"}
            >
              <Link
                href={productUrl}
                prefetch={false}
                className="sf-product-title-link"
                aria-label={`${copy.details}: ${product.name}`}
                tabIndex={isDuplicate ? -1 : undefined}
              >
                {enhancedBadges ? (
                  <bdi dir="auto">{product.name}</bdi>
                ) : (
                  <OverflowLabel>{product.name}</OverflowLabel>
                )}
              </Link>
            </h3>
            {enhancedBadges ? (
              <>
                {(product.brand || product.modelNumber) && (
                  <p className="sf-card-model-line" dir="ltr">
                    {product.brand && (
                      <bdi title={product.brand}>{product.brand}</bdi>
                    )}
                    {product.brand && product.modelNumber && (
                      <span aria-hidden="true">|</span>
                    )}
                    {product.modelNumber && (
                      <bdi title={product.modelNumber}>
                        {product.modelNumber}
                      </bdi>
                    )}
                  </p>
                )}
              </>
            ) : (
              <>
                <ProductIdentifiers
                  sku={identifierVariant?.sku}
                  barcode={identifierVariant?.barcode}
                  locale={locale}
                  compact
                />
                <p className="sf-product-description" dir="auto">
                  {product.shortDescription || product.description}
                </p>
                {(product.brand || product.modelNumber) && (
                  <dl className="sf-product-facts">
                    {product.brand && (
                      <div>
                        <dt>{locale === "he" ? "מותג" : "Brand"}</dt>
                        <dd dir="auto">{product.brand}</dd>
                      </div>
                    )}
                    {product.modelNumber && (
                      <div>
                        <dt>{locale === "he" ? "דגם" : "Model"}</dt>
                        <dd dir="auto">{product.modelNumber}</dd>
                      </div>
                    )}
                  </dl>
                )}
              </>
            )}
          </div>

          {/* Price with promotional display */}
          <div
            className={`sf-product-price${variant === "rail" ? " sf-moving-rail-price" : ""}`}
            data-product-section="pricing"
          >
            {enhancedBadges ? (
              <>
                <div className="sf-card-price-main">
                  {priceAmount}
                  {pricePromotion}
                  {effectivePrice !== null && (
                    <small className="sf-card-vat" dir="auto">
                      {locale === "he" ? "כולל מע״מ" : "incl. VAT"}
                    </small>
                  )}
                </div>
                <div className="sf-card-price-secondary">
                  <ProductIdentifiers
                    sku={identifierVariant?.sku}
                    barcode={identifierVariant?.barcode}
                    locale={locale}
                    compact
                    className="sf-card-identifiers"
                  />
                  {stockIndicator}
                </div>
              </>
            ) : (
              <>
                {priceAmount}
                {stockIndicator}
                {pricePromotion}
              </>
            )}
          </div>
        </div>
      </div>
      <div
        ref={actionsRef}
        className={`sf-product-actions${variant === "rail" ? " sf-moving-rail-actions" : ""}`}
        data-product-section="actions"
        onPointerEnter={() => {
          longPress.cancel();
          setShowHoverPreview(false);
        }}
        onFocusCapture={() => {
          longPress.cancel();
          setShowHoverPreview(false);
        }}
      >
        {enhancedBadges && cartAction}

        {/* Image and title remain detail links when the cart is the primary action. */}
        {(!enhancedBadges || !cartAction) && (
          <Link
            href={productUrl}
            prefetch={false}
            className="sf-product-action"
            aria-label={`${copy.details}: ${product.name}`}
            tabIndex={isDuplicate ? -1 : undefined}
          >
            <span className="sf-product-action-label">
              {actionLabel ?? copy.details}
            </span>
            <Arrow size={16} aria-hidden="true" />
          </Link>
        )}

        {!enhancedBadges && cartAction}

        {/* Save/Favorite - independently interactive */}
        <button
          type="button"
          className="miro-button miro-button-secondary sf-save-button"
          onClick={handleSave}
          aria-label={saved ? copy.removeFromSaved : copy.saveForLater}
          aria-pressed={saved}
          disabled={isSaving}
          tabIndex={isDuplicate ? -1 : undefined}
        >
          {isSaving ? (
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          ) : saved ? (
            <Heart size={18} className="text-accent-text" />
          ) : enhancedBadges ? (
            <Heart size={18} aria-hidden="true" />
          ) : (
            <HeartOff size={18} aria-hidden="true" />
          )}
        </button>

        <button
          ref={previewButtonRef}
          type="button"
          className={`sf-product-quick-preview${variant === "rail" ? " sf-moving-rail-preview-button" : ""}`}
          aria-label={`${locale === "he" ? "תצוגה מקדימה" : "Quick preview"}: ${product.name}`}
          tabIndex={isDuplicate ? -1 : undefined}
          aria-haspopup="dialog"
          aria-expanded={showHoverPreview}
          onClick={openExplicitly}
        >
          <Eye size={16} aria-hidden="true" />
        </button>

        {saveError && (
          <span className="sf-save-error" role="alert" aria-live="polite">
            {saveError}
          </span>
        )}
      </div>
    </article>
  );
}
