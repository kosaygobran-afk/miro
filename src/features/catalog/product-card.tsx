"use client";

import { useEffect, useId, useRef, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  X,
  Heart,
  HeartOff,
  Circle,
  Truck,
  Phone,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { ProductVisual } from "@/components/products/ProductVisual";
import { getProductVisualKind } from "@/features/catalog/product-visual-kind";
import { storeCopy, type StoreCopy } from "@/features/catalog/store-copy";
import type { Product, ProductVariant } from "@/features/catalog/product-data";
import type { PublicContactActions } from "@/lib/contact-config";
import {
  trackProductImpression,
  trackProductContactClick,
  trackProductPhoneClick,
  trackProductWhatsAppClick,
} from "@/components/analytics/track";
import {
  formatPrice,
  getDefaultVariant,
  resolvePrice,
  getStockBadgeConfig,
  shouldHideFromPublic,
  type StockBadgeConfig,
} from "@/lib/catalog/pricing";

export type { Product } from "@/features/catalog/product-data";

function getPrimaryImage(product: Product) {
  // Use the first image (sort_order 0) as primary, or first in array
  if (product.images.length > 0) {
    return product.images[0];
  }
  return null;
}

function renderStockBadge(config: StockBadgeConfig | null) {
  if (!config) return null;

  if (config.type === "restock") {
    return (
      <span className="sf-stock-badge sf-stock-restock" aria-live="polite">
        <Truck size={12} aria-hidden="true" />
        {config.label}
      </span>
    );
  }
  if (config.type === "contact") {
    return (
      <span className="sf-stock-badge sf-stock-contact" aria-live="polite">
        <Circle size={12} aria-hidden="true" />
        {config.label}
      </span>
    );
  }
  if (config.type === "out") {
    return (
      <span className="sf-stock-badge sf-stock-out" aria-live="polite">
        <Circle size={12} aria-hidden="true" />
        {config.label}
      </span>
    );
  }
  if (config.type === "low") {
    return (
      <span className="sf-stock-badge sf-stock-low" aria-live="polite">
        <Truck size={12} aria-hidden="true" />
        {config.label}
      </span>
    );
  }
  return null;
}

export function ProductCard({
  product,
  locale = "en",
  actionLabel,
  isSaved = false,
  contact = null,
}: {
  product: Product;
  index?: number;
  actionLabel?: string;
  locale?: "he" | "en";
  isSaved?: boolean;
  /** Config-driven contact channels; null/absent hides the actions. */
  contact?: PublicContactActions | null;
}) {
  const copy = storeCopy[locale] as StoreCopy;
  const dialog = useRef<HTMLDialogElement>(null);
  const [saved, setSaved] = useState(isSaved);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    null,
  );
  const [impressionFired, setImpressionFired] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const kind = getProductVisualKind(product);
  const Arrow = locale === "he" ? ArrowLeft : ArrowRight;
  const primaryImage = getPrimaryImage(product);
  const defaultVariant = getDefaultVariant(product.variants, null);

  // Centralized price resolution for card display (uses base price as fallback)
  const cardPriceResult = resolvePrice({
    basePrice: product.priceIls,
    variants: product.variants,
    selectedVariantId: null,
    defaultVariantId: defaultVariant?.id ?? null,
    roleOverride: product.rolePrice ?? null,
    variantOverride: null,
  });
  const price = formatPrice(
    cardPriceResult.effectivePrice,
    locale,
    copy.priceUnpublished,
  );

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

  const openDialog = useCallback(() => {
    dialog.current?.showModal();
    if (!impressionFired) {
      setImpressionFired(true);
      trackProductImpression(product.id, locale);
    }
  }, [product.id, locale, impressionFired]);

  const closeDialog = useCallback(() => {
    dialog.current?.close();
    setSelectedVariant(null);
    setSaveError(null);
  }, []);

  // Handle native dialog close events (Escape, backdrop click)
  useEffect(() => {
    const dialogEl = dialog.current;
    if (!dialogEl) return;

    const handleClose = () => {
      closeDialog();
    };

    dialogEl.addEventListener("close", handleClose);
    return () => dialogEl.removeEventListener("close", handleClose);
  }, [closeDialog]);

  // Dialog variant price resolution
  const dialogPriceResult = resolvePrice({
    basePrice: product.priceIls,
    variants: product.variants,
    selectedVariantId: selectedVariant?.id ?? null,
    defaultVariantId: defaultVariant?.id ?? null,
    roleOverride: product.rolePrice ?? null,
    variantOverride: null,
  });
  const displayPrice = formatPrice(
    dialogPriceResult.effectivePrice,
    locale,
    copy.priceUnpublished,
  );
  const displaySku =
    dialogPriceResult.pricingVariant?.sku ?? defaultVariant?.sku;

  const quoteParams = new URLSearchParams({
    product: product.id,
    item: product.slug,
  });
  const quoteVariantId =
    dialogPriceResult.pricingVariant?.id ?? defaultVariant?.id;
  if (quoteVariantId) quoteParams.set("variant", quoteVariantId);
  const quoteHref = `/${locale}/contact?${quoteParams.toString()}`;

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

  return (
    <article
      ref={cardRef}
      className="sf-product-card"
      data-product-name={product.name}
      data-product-price={product.priceIls ?? 0}
      data-product-stock-state={product.stockState}
    >
      <button
        type="button"
        className="sf-product-media"
        onClick={openDialog}
        aria-label={`${copy.details}: ${product.name}`}
      >
        {product.badge && (
          <span className="sf-product-badge">{product.badge}</span>
        )}
        {renderStockBadge(
          getStockBadgeConfig(
            product.stockState,
            product.outOfStockPolicy,
            product.expectedRestockDate,
            locale,
            {
              lowStock: copy.lowStock,
              outOfStockContact: copy.outOfStockContact,
              outOfStockRestock: copy.outOfStockRestock,
              expectedRestock: copy.expectedRestock,
            },
          ),
        )}
        {primaryImage ? (
          <>
            <Image
              src={primaryImage.url}
              alt={altText}
              fill
              sizes="(max-width: 600px) 100vw, (max-width: 1100px) 50vw, 25vw"
              className="sf-product-visual"
              style={{ objectFit: "contain" }}
              onError={(e) => {
                // Fallback to placeholder on image error
                e.currentTarget.style.display = "none";
              }}
            />
          </>
        ) : (
          <ProductVisual kind={kind} />
        )}
        {!primaryImage && (
          <span className="sf-product-illustration-caption">
            {copy.illustration}
          </span>
        )}
        <span className="sf-product-expand">
          <Plus size={17} aria-hidden="true" />
        </span>
      </button>
      <div className="sf-product-body">
        <p className="sf-product-category">
          {product.categoryLabel ?? product.category}
        </p>
        <h3 dir="auto">
          <Link
            href={`/${locale}/store/${product.category}/${product.slug}`}
            className="sf-product-title-link"
            aria-label={`${copy.details}: ${product.name}`}
          >
            {product.name}
          </Link>
        </h3>
        <p className="sf-product-description" dir="auto">
          {product.description}
        </p>
        <div className="sf-product-price">
          <strong dir="auto">{price}</strong>
          {cardPriceResult.effectivePrice === null ? null : (
            <span>{copy.demoPrice}</span>
          )}
        </div>
        <div className="sf-product-actions">
          <button
            type="button"
            className="sf-product-action"
            onClick={openDialog}
            aria-label={`${copy.details}: ${product.name}`}
          >
            {actionLabel ?? copy.details}
            <Arrow size={16} aria-hidden="true" />
          </button>
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
      <dialog
        ref={dialog}
        className="sf-product-dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        dir={locale === "he" ? "rtl" : "ltr"}
      >
        <form method="dialog">
          <div className="sf-product-dialog-inner">
            <button
              type="button"
              className="sf-dialog-close"
              aria-label={copy.close}
              onClick={closeDialog}
              autoFocus
            >
              <X size={21} aria-hidden="true" />
            </button>
            <div className="sf-dialog-visual">
              {primaryImage ? (
                <>
                  <Image
                    src={primaryImage.url}
                    alt={altText}
                    fill
                    sizes="(max-width: 600px) 100vw, 40vw"
                    className="sf-product-visual"
                    style={{ objectFit: "contain" }}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </>
              ) : (
                <ProductVisual kind={kind} />
              )}
              {!primaryImage && <p>{copy.illustration}</p>}
            </div>
            <div className="sf-dialog-copy">
              <p className="sf-eyebrow">
                {product.categoryLabel ?? product.category}
              </p>
              <h2 id={titleId} dir="auto">
                {product.name}
              </h2>
              <p dir="auto">{product.description}</p>

              {/* Variant selector - using native radio inputs for accessibility */}
              {product.variants.length > 0 && (
                <fieldset className="sf-variant-selector">
                  <legend className="sf-variant-label">
                    {copy.variants} {copy.color}
                  </legend>
                  <div
                    className="sf-variant-chips"
                    role="radiogroup"
                    aria-label={copy.variants}
                  >
                    {product.variants.map((variant) => {
                      const isSelected =
                        selectedVariant?.id === variant.id ||
                        (!selectedVariant && variant.id === defaultVariant?.id);
                      const variantPrice =
                        variant.price !== null
                          ? formatPrice(
                              variant.price,
                              locale,
                              copy.priceUnpublished,
                            )
                          : null;
                      return (
                        <label
                          key={variant.id}
                          className="sf-variant-chip-label"
                        >
                          <input
                            type="radio"
                            name={`variant-${product.id}`}
                            value={variant.id}
                            checked={isSelected}
                            onChange={() => setSelectedVariant(variant)}
                            className="sf-variant-radio"
                            aria-label={`${locale === "he" ? variant.colorHe : variant.colorEn} (${variant.sku})${variantPrice ? ` - ${variantPrice}` : ""}`}
                          />
                          <span
                            className={`sf-variant-chip ${isSelected ? "is-selected" : ""}`}
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
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {displaySku && (
                    <p className="sf-variant-sku" dir="ltr">
                      <span>{locale === "he" ? "מק״ט" : "SKU"}</span>:{" "}
                      {displaySku}
                    </p>
                  )}
                </fieldset>
              )}

              <div className="sf-product-price">
                <strong dir="auto">{displayPrice}</strong>
                {dialogPriceResult.effectivePrice === null ? null : (
                  <span>{copy.demoPrice}</span>
                )}
              </div>
              <Link
                href={quoteHref}
                className="miro-button miro-button-primary"
                onClick={() => {
                  trackProductContactClick(product.id, locale);
                  closeDialog();
                }}
              >
                {copy.quote}
                <Arrow size={17} aria-hidden="true" />
              </Link>
              {contact?.phoneHref || contact?.whatsapp ? (
                <div className="sf-dialog-secondary-actions">
                  {contact.phoneHref ? (
                    <a
                      href={`tel:${contact.phoneHref}`}
                      className="sf-dialog-action-link"
                      onClick={() => trackProductPhoneClick(product.id, locale)}
                      aria-label={copy.callForProduct}
                    >
                      <Phone size={16} aria-hidden="true" />
                      <span>{copy.callForProduct}</span>
                    </a>
                  ) : null}
                  {contact.whatsapp ? (
                    <a
                      href={`https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(`${copy.whatsappForProduct}: ${product.name}`)}`}
                      className="sf-dialog-action-link"
                      onClick={() =>
                        trackProductWhatsAppClick(product.id, locale)
                      }
                      aria-label={copy.whatsappForProduct}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageSquare size={16} aria-hidden="true" />
                      <span>{copy.whatsappForProduct}</span>
                    </a>
                  ) : null}
                </div>
              ) : null}
              <p className="sf-dialog-note">{copy.demo}</p>
            </div>
          </div>
        </form>
      </dialog>
    </article>
  );
}
