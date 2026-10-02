"use client";
import { useAnimationFeature } from "@/components/motion/animation-provider";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { OverflowLabel } from "./overflow-label";
import { ProductMedia } from "./product-media";
import { AddToCartButton } from "@/features/cart/add-to-cart-button";
import { useStoreDesign } from "@/features/store-design/design-context";
import Link from "@/components/motion/motion-link";
import { ArrowUpRight, Eye, Pause, Play } from "lucide-react";
import { storeCopy } from "@/features/catalog/store-copy";
import type { Product } from "@/features/catalog/product-data";
import {
  formatPrice,
  getDiscountPercent,
  priceBeforeVat,
} from "@/lib/catalog/pricing";
import { StickerCluster } from "@/features/catalog/product-promo-badge";
import { ProductHoverPreview } from "@/features/catalog/product-hover-preview";

interface ProductMovingRailProps {
  products: Product[];
  locale: "he" | "en";
  className?: string;
}

function subscribeToReducedMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

function RailProduct({
  product,
  locale,
  isDuplicate = false,
  onPreviewChange,
}: {
  product: Product;
  locale: "he" | "en";
  isDuplicate?: boolean;
  onPreviewChange: (id: string, open: boolean) => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const closePreview = useCallback(() => setShowPreview(false), []);
  const keepPreviewOpen = useCallback(() => setShowPreview(true), []);
  const onVisibilityChange = useCallback(
    (open: boolean) => onPreviewChange(product.id, open),
    [product.id, onPreviewChange],
  );

  const [openedExplicitly, setOpenedExplicitly] = useState(false);
  const cardRef = useRef<HTMLAnchorElement | null>(null);
  const previewButtonRef = useRef<HTMLButtonElement | null>(null);
  const copy = storeCopy[locale];
  const primaryImage = product.images[0] ?? null;
  const effectivePrice = product.priceIls;
  const compareAtPrice = product.compareAtPrice ?? null;
  const discountPercent = getDiscountPercent(compareAtPrice, effectivePrice);
  const formattedPrice = formatPrice(
    effectivePrice,
    locale,
    copy.priceUnpublished,
  );
  const altText =
    locale === "he"
      ? (primaryImage?.altHe ?? product.name)
      : (primaryImage?.altEn ?? product.name);

  return (
    <div
      className="sf-moving-rail-card-shell"
      data-preview-intent={showPreview || undefined}
      onMouseEnter={() => {
        if (isDuplicate) return;
        setOpenedExplicitly(false);
        setShowPreview(true);
      }}
      onMouseLeave={() => setShowPreview(false)}
      onFocusCapture={() => {
        if (!isDuplicate) {
          setOpenedExplicitly(false);
          setShowPreview(true);
        }
      }}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        const movedIntoPreview =
          nextTarget instanceof Element &&
          nextTarget.closest(".sf-hover-preview") !== null;
        if (!event.currentTarget.contains(nextTarget) && !movedIntoPreview) {
          setShowPreview(false);
        }
      }}
    >
      {!isDuplicate ? (
        <ProductHoverPreview
          product={product}
          locale={locale}
          isOpen={showPreview}
          onClose={closePreview}
          onKeepOpen={keepPreviewOpen}
          onVisibilityChange={onVisibilityChange}
          triggerRef={cardRef}
          focusOnOpen={openedExplicitly}
          returnFocusRef={previewButtonRef}
        />
      ) : null}
      <Link
        ref={cardRef}
        href={`/${locale}/store/${product.category}/${product.slug}`}
        className="sf-moving-rail-card"
        aria-label={`${product.name}, ${formattedPrice}`}
        tabIndex={isDuplicate ? -1 : undefined}
        prefetch={!isDuplicate}
        dir={locale === "he" ? "rtl" : "ltr"}
      >
        <div className="sf-moving-rail-media">
          <ProductMedia
            product={product}
            src={primaryImage?.url}
            alt={altText}
            sizes="(max-width: 600px) 11.5rem, 14.5rem"
            className="sf-moving-rail-image"
          />
          {product.promoBadges && product.promoBadges.length > 0 ? (
            <StickerCluster
              badges={product.promoBadges}
              locale={locale}
              maxVisible={2}
            />
          ) : null}
          <span className="sf-moving-rail-open" aria-hidden="true">
            <ArrowUpRight size={15} />
          </span>
        </div>
        <div className="sf-moving-rail-content">
          <p className="sf-moving-rail-category" dir="auto">
            {product.categoryLabel ?? product.category}
          </p>
          <h3 className="sf-moving-rail-title" dir="auto">
            <OverflowLabel>{product.name}</OverflowLabel>
          </h3>
          <div className="sf-moving-rail-price">
            <div className="sf-price-display__amount">
              <strong dir="auto">{formattedPrice}</strong>
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
            {discountPercent !== null && compareAtPrice ? (
              <>
                <span className="sf-moving-rail-compare-at" dir="auto">
                  {formatPrice(compareAtPrice, locale, copy.priceUnpublished)}
                </span>
                <span className="sf-moving-rail-discount">
                  -{discountPercent}%
                </span>
              </>
            ) : null}
            {effectivePrice === null ? <span>{copy.demoPrice}</span> : null}
          </div>
        </div>
      </Link>
      {!isDuplicate &&
      effectivePrice !== null &&
      product.stockState !== "out" ? (
        <div className="sf-moving-rail-cart">
          <AddToCartButton
            compact
            locale={locale}
            item={{
              productId: product.id,
              variantId:
                (
                  product.variants.find((v) => v.isDefault && v.stockQty > 0) ??
                  product.variants.find((v) => v.stockQty > 0)
                )?.id ?? null,
              slug: product.slug,
              category: product.category,
              name: product.name,
              imageUrl: primaryImage?.url ?? null,
              unitPrice: effectivePrice,
            }}
          />
        </div>
      ) : null}
      {!isDuplicate ? (
        <button
          ref={previewButtonRef}
          type="button"
          className="sf-moving-rail-preview-button"
          aria-label={`${locale === "he" ? "תצוגה מקדימה" : "Quick preview"}: ${product.name}`}
          aria-haspopup="dialog"
          aria-expanded={showPreview}
          onClick={() => {
            setOpenedExplicitly(true);
            setShowPreview(true);
          }}
        >
          <Eye size={15} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export function ProductMovingRail({
  products,
  locale,
  className = "",
}: ProductMovingRailProps) {
  const isRtl = locale === "he";
  const { products: motion } = useStoreDesign();
  const [previews, setPreviews] = useState<string[]>([]);
  const onPreviewChange = useCallback(
    (id: string, open: boolean) =>
      setPreviews((current) =>
        open
          ? current.includes(id)
            ? current
            : [...current, id]
          : current.includes(id)
            ? current.filter((key) => key !== id)
            : current,
      ),
    [],
  );
  const featuredProducts = products
    .filter(
      (product) =>
        product.railSortOrder !== null && product.railSortOrder !== undefined,
    )
    .sort((a, b) => (a.railSortOrder ?? 0) - (b.railSortOrder ?? 0));
  const prefersReducedMotion = usePrefersReducedMotion();
  const ambientMotion = useAnimationFeature("ambientMotion");
  const shouldAnimate =
    ambientMotion && !prefersReducedMotion && featuredProducts.length >= 3;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const segmentRef = useRef<HTMLDivElement | null>(null);
  const [manualPaused, setManualPaused] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const isPaused = manualPaused || interactionPaused || previews.length > 0;

  const updateAnimationMetrics = useCallback(() => {
    const track = trackRef.current;
    const segment = segmentRef.current;
    if (!track || !segment) return;
    const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
    const shift = segment.getBoundingClientRect().width + gap;
    const duration = Math.max(15, shift / motion.pixelsPerSecond);
    track.style.setProperty("--sf-rail-shift", `-${shift}px`);
    track.style.setProperty("--sf-rail-duration", `${duration}s`);
  }, [motion.pixelsPerSecond]);

  useEffect(() => {
    if (!shouldAnimate) return;
    const viewport = viewportRef.current;
    const segment = segmentRef.current;
    if (!viewport || !segment) return;
    const observer = new ResizeObserver(updateAnimationMetrics);
    observer.observe(viewport);
    observer.observe(segment);
    updateAnimationMetrics();
    return () => observer.disconnect();
  }, [shouldAnimate, updateAnimationMetrics]);

  if (featuredProducts.length === 0) return null;

  const eyebrow = isRtl ? "בחירת MIRO" : "MIRO SELECTION";
  const title = isRtl ? "מוצרים שכדאי להכיר" : "Products worth knowing";
  const description = isRtl
    ? "מוצרים נבחרים, רבי־מכר ומבצעים עדכניים — בתנועה רגועה שאפשר לעצור בכל רגע."
    : "Selected products, best sellers and current offers in a calm rail you can pause at any time.";
  const pauseLabel = isRtl ? "עצירת פס המוצרים" : "Pause product rail";
  const playLabel = isRtl ? "הפעלת פס המוצרים" : "Play product rail";

  const renderSegment = (duplicate: boolean) => (
    <div
      ref={duplicate ? undefined : segmentRef}
      className="sf-moving-rail-segment"
      aria-hidden={duplicate || undefined}
    >
      {featuredProducts.map((product) => (
        <div key={product.id} className="sf-moving-rail-item" role="listitem">
          <RailProduct
            product={product}
            locale={locale}
            isDuplicate={duplicate}
            onPreviewChange={onPreviewChange}
          />
        </div>
      ))}
    </div>
  );

  return (
    <section
      className={`sf-moving-rail-section ${className}`}
      aria-labelledby="featured-products-title"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="miro-container">
        <div className="sf-moving-rail-header">
          <div>
            <p className="sf-eyebrow">{eyebrow}</p>
            <h2 id="featured-products-title">{title}</h2>
            <p className="sf-moving-rail-description">{description}</p>
          </div>
          {shouldAnimate ? (
            <button
              type="button"
              className="sf-moving-rail-toggle"
              onClick={() => setManualPaused((paused) => !paused)}
              aria-label={manualPaused ? playLabel : pauseLabel}
              aria-pressed={manualPaused}
            >
              {manualPaused ? (
                <Play size={15} aria-hidden="true" />
              ) : (
                <Pause size={15} aria-hidden="true" />
              )}
              <span>{manualPaused ? playLabel : pauseLabel}</span>
            </button>
          ) : null}
        </div>

        <div
          ref={viewportRef}
          className="sf-moving-rail-viewport"
          data-paused={isPaused || undefined}
          data-static={!shouldAnimate || undefined}
          onMouseEnter={() => setInteractionPaused(true)}
          onMouseLeave={() => setInteractionPaused(false)}
          onFocusCapture={() => setInteractionPaused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setInteractionPaused(false);
            }
          }}
        >
          <div
            ref={trackRef}
            className="sf-moving-rail-track"
            role="list"
            aria-label={title}
          >
            {renderSegment(false)}
            {shouldAnimate ? renderSegment(true) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
