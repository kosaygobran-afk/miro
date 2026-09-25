"use client";

import { useEffect, useId, useRef, useState } from "react";
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
} from "lucide-react";
import { ProductVisual } from "@/components/products/ProductVisual";
import { getProductVisualKind } from "@/features/catalog/product-visual-kind";
import { storeCopy, type StoreCopy } from "@/features/catalog/store-copy";
import type { Product, ProductVariant } from "@/features/catalog/product-data";
import {
  trackProductImpression,
  trackProductContactClick,
  trackProductPhoneClick,
  trackProductWhatsAppClick,
} from "@/components/analytics/track";

export type { Product } from "@/features/catalog/product-data";

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
  stockState: Product["stockState"],
  policy: Product["outOfStockPolicy"],
  expectedRestockDate: string | null,
  copy: StoreCopy,
  locale: "he" | "en",
) {
  if (stockState === "out") {
    if (policy === "keep_visible_restock" && expectedRestockDate) {
      return (
        <span className="sf-stock-badge sf-stock-restock" aria-live="polite">
          <Truck size={12} aria-hidden="true" />
          {copy.outOfStockRestock}
          {expectedRestockDate && (
            <time dateTime={expectedRestockDate}>
              {new Date(expectedRestockDate).toLocaleDateString(
                locale === "he" ? "he-IL" : "en-IL",
                { month: "short", day: "numeric" },
              )}
            </time>
          )}
        </span>
      );
    }
    if (policy === "keep_visible_contact") {
      return (
        <span className="sf-stock-badge sf-stock-contact" aria-live="polite">
          <Circle size={12} aria-hidden="true" />
          {copy.outOfStockContact}
        </span>
      );
    }
    return (
      <span className="sf-stock-badge sf-stock-out" aria-live="polite">
        <Circle size={12} aria-hidden="true" />
        {locale === "he" ? "אזל מהמלאי" : "Out of stock"}
      </span>
    );
  }
  if (stockState === "low") {
    return (
      <span className="sf-stock-badge sf-stock-low" aria-live="polite">
        <Truck size={12} aria-hidden="true" />
        {copy.lowStock}
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
}: {
  product: Product;
  index?: number;
  actionLabel?: string;
  locale?: "he" | "en";
  isSaved?: boolean;
}) {
  const copy = storeCopy[locale] as StoreCopy;
  const dialog = useRef<HTMLDialogElement>(null);
  const [saved, setSaved] = useState(isSaved);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    null,
  );
  const [impressionFired, setImpressionFired] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const kind = getProductVisualKind(product);
  const Arrow = locale === "he" ? ArrowLeft : ArrowRight;
  const price = formatPrice(product.priceIls, locale, copy);
  const quoteHref = `/${locale}/contact?product=${encodeURIComponent(product.name)}`;

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

  const openDialog = () => {
    dialog.current?.showModal();
    if (!impressionFired) {
      setImpressionFired(true);
      trackProductImpression(product.id, locale);
    }
  };

  const closeDialog = () => {
    dialog.current?.close();
    setSelectedVariant(null);
  };

  const defaultVariant =
    product.variants.find((v) => v.price !== null) ?? product.variants[0];

  async function handleSave(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const nextSaved = !saved;
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
        setSaved(!nextSaved);
        console.error("Failed to save/unsave product");
      }
    } catch (error) {
      setSaved(!nextSaved);
      console.error("Failed to save/unsave product", error);
    }
  }

  const effectiveVariantPrice =
    selectedVariant?.price ?? defaultVariant?.price ?? null;
  const displayPrice = formatPrice(
    effectiveVariantPrice ?? product.priceIls,
    locale,
    copy,
  );
  const displaySku = selectedVariant?.sku ?? defaultVariant?.sku;

  // Don't render card if product should be hidden from public (handled in store-data, but defensive)
  if (
    product.stockState === "out" &&
    product.outOfStockPolicy === "hide_from_public"
  ) {
    return null;
  }

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
        {getStockBadge(
          product.stockState,
          product.outOfStockPolicy,
          product.expectedRestockDate,
          copy,
          locale,
        )}
        <ProductVisual kind={kind} />
        <span className="sf-product-expand">
          <Plus size={17} aria-hidden="true" />
        </span>
      </button>
      <div className="sf-product-body">
        <p className="sf-product-category">
          {product.categoryLabel ?? product.category}
        </p>
        <h3 dir="auto">{product.name}</h3>
        <p className="sf-product-description" dir="auto">
          {product.description}
        </p>
        <div className="sf-product-price">
          <strong dir="auto">{price}</strong>
          {product.priceIls === null ? null : <span>{copy.demoPrice}</span>}
        </div>
        <div className="sf-product-actions">
          <button
            className="sf-product-action"
            type="button"
            onClick={openDialog}
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
          >
            {saved ? (
              <Heart size={18} className="text-accent-text" />
            ) : (
              <HeartOff size={18} />
            )}
          </button>
        </div>
      </div>
      <dialog
        ref={dialog}
        className="sf-product-dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        dir={locale === "he" ? "rtl" : "ltr"}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
      >
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
            {product.images.length > 0 ? (
              <>
                <Image
                  src={product.images[0].url}
                  alt={
                    locale === "he"
                      ? (product.images[0].altHe ?? product.name)
                      : (product.images[0].altEn ?? product.name)
                  }
                  fill
                  sizes="100%"
                  className="sf-product-visual"
                />
              </>
            ) : (
              <ProductVisual kind={kind} />
            )}
            <p>{copy.illustration}</p>
          </div>
          <div className="sf-dialog-copy">
            <p className="sf-eyebrow">
              {product.categoryLabel ?? product.category}
            </p>
            <h2 id={titleId} dir="auto">
              {product.name}
            </h2>
            <p dir="auto">{product.description}</p>

            {/* Variant selector */}
            {product.variants.length > 0 && (
              <div className="sf-variant-selector">
                <p className="sf-variant-label">
                  {copy.variants} {copy.color}
                </p>
                <div
                  className="sf-variant-chips"
                  role="radiogroup"
                  aria-label={copy.variants}
                >
                  {product.variants.map((variant) => (
                    <button
                      key={variant.id}
                      type="button"
                      role="radio"
                      aria-checked={
                        selectedVariant?.id === variant.id ||
                        (!selectedVariant && variant.id === defaultVariant?.id)
                      }
                      aria-label={`${variant.colorEn} (${variant.sku})${variant.price !== null ? ` - ${new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(variant.price)}` : ""}`}
                      className={`sf-variant-chip ${selectedVariant?.id === variant.id || (!selectedVariant && variant.id === defaultVariant?.id) ? "is-selected" : ""}`}
                      onClick={() => setSelectedVariant(variant)}
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
                    </button>
                  ))}
                </div>
                {displaySku && (
                  <p className="sf-variant-sku" dir="ltr">
                    <span>{locale === "he" ? "מק״ט" : "SKU"}</span>:{" "}
                    {displaySku}
                  </p>
                )}
              </div>
            )}

            <div className="sf-product-price">
              <strong dir="auto">{displayPrice}</strong>
              {effectiveVariantPrice === null ? null : (
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
            <div className="sf-dialog-secondary-actions">
              <a
                href={`tel:+972-00-000-0000`}
                className="sf-dialog-action-link"
                onClick={() => trackProductPhoneClick(product.id, locale)}
                aria-label={copy.callForProduct}
              >
                <Phone size={16} aria-hidden="true" />
                <span>{copy.callForProduct}</span>
              </a>
              <a
                href={`https://wa.me/972000000000?text=${encodeURIComponent(`${copy.whatsappForProduct}: ${product.name}`)}`}
                className="sf-dialog-action-link"
                onClick={() => trackProductWhatsAppClick(product.id, locale)}
                aria-label={copy.whatsappForProduct}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageSquare size={16} aria-hidden="true" />
                <span>{copy.whatsappForProduct}</span>
              </a>
            </div>
            <p className="sf-dialog-note">{copy.demo}</p>
          </div>
        </div>
      </dialog>
    </article>
  );
}
