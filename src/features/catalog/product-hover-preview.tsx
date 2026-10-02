"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { RevealImage as Image } from "@/components/ui/reveal-image";
import { ProductMedia } from "./product-media";
import { AddToCartButton } from "@/features/cart/add-to-cart-button";
import {
  useAnimationSettings,
  useAnimationFeature,
} from "@/components/motion/animation-provider";
import { useStoreDesign } from "@/features/store-design/design-context";
import Link from "@/components/motion/motion-link";
import { ArrowUpRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import { storeCopy, type StoreCopy } from "@/features/catalog/store-copy";
import type { Product, ProductImage } from "@/features/catalog/product-data";
import { PromoBadge } from "@/features/catalog/product-promo-badge";
import { StockIndicator } from "@/features/catalog/stock-indicator";
import {
  formatPrice,
  getDiscountPercent,
  priceBeforeVat,
} from "@/lib/catalog/pricing";

interface ProductHoverPreviewProps {
  product: Product;
  locale: "he" | "en";
  isOpen: boolean;
  onClose: () => void;
  onKeepOpen?: () => void;
  onVisibilityChange?: (visible: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  focusOnOpen?: boolean;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

type PreviewPhase = "closed" | "open" | "closing";

const CLOSE_GRACE_MS = 220;
const emptySubscribe = () => () => {};

function subscribeToMediaQuery(query: string, callback: () => void) {
  const mediaQuery = window.matchMedia(query);
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (callback) => subscribeToMediaQuery(query, callback),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

function getSortedImages(product: Product): ProductImage[] {
  return [...product.images].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function ProductHoverPreview({
  product,
  locale,
  isOpen,
  onClose,
  onKeepOpen,
  onVisibilityChange,
  triggerRef,
  focusOnOpen = false,
  returnFocusRef,
}: ProductHoverPreviewProps) {
  const copy = storeCopy[locale] as StoreCopy;
  const { products: motion } = useStoreDesign();
  const PreviousArrow = locale === "he" ? ChevronRight : ChevronLeft;
  const NextArrow = locale === "he" ? ChevronLeft : ChevronRight;
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const phaseRef = useRef<PreviewPhase>("closed");
  const openTimerRef = useRef<number | null>(null);
  const graceTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const [phase, setPhase] = useState<PreviewPhase>("closed");
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [position, setPosition] = useState({
    top: 16,
    left: 16,
    sourceScaleX: 0.72,
    sourceScaleY: 0.72,
  });
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const hasFinePointer = useMediaQuery("(hover: hover) and (pointer: fine)");
  const dialogsEnabled = useAnimationFeature("dialogs");
  const animationSettings = useAnimationSettings();
  const systemReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  const prefersReducedMotion = systemReducedMotion || !dialogsEnabled;
  const exitDuration = animationSettings.durations.content;
  const allImages = getSortedImages(product);
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
    onVisibilityChange?.(phase !== "closed");
    return () => onVisibilityChange?.(false);
  }, [phase, onVisibilityChange]);

  const updatePhase = useCallback((next: PreviewPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearTimer = useCallback(
    (timerRef: React.MutableRefObject<number | null>) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  const calculatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const preview = previewRef.current;
    const gutter = 16;
    const width =
      preview?.offsetWidth ?? Math.min(420, window.innerWidth - gutter * 2);
    const height =
      preview?.offsetHeight ?? Math.min(560, window.innerHeight - gutter * 2);
    const left = Math.max(
      gutter,
      Math.min(
        triggerRect.left + triggerRect.width / 2 - width / 2,
        window.innerWidth - width - gutter,
      ),
    );
    const desiredTop = triggerRect.top + triggerRect.height / 2 - height / 2;
    const top = Math.max(
      gutter,
      Math.min(desiredTop, window.innerHeight - height - gutter),
    );
    const sourceScaleX = Math.max(
      0.45,
      Math.min(0.94, triggerRect.width / width),
    );
    const sourceScaleY = Math.max(
      0.45,
      Math.min(0.94, triggerRect.height / height),
    );

    setPosition((current) =>
      current.top === top &&
      current.left === left &&
      current.sourceScaleX === sourceScaleX &&
      current.sourceScaleY === sourceScaleY
        ? current
        : { top, left, sourceScaleX, sourceScaleY },
    );
  }, [triggerRef]);

  const finishClose = useCallback(
    (notifyParent: boolean, restoreFocus: boolean) => {
      updatePhase("closed");
      if (notifyParent) onClose();
      if (restoreFocus) {
        window.setTimeout(() => returnFocusRef?.current?.focus(), 0);
      }
    },
    [onClose, returnFocusRef, updatePhase],
  );

  const beginExit = useCallback(
    (notifyParent: boolean, restoreFocus: boolean) => {
      clearTimer(openTimerRef);
      clearTimer(graceTimerRef);
      clearTimer(exitTimerRef);
      if (phaseRef.current === "closed") {
        if (notifyParent) onClose();
        return;
      }
      updatePhase("closing");
      exitTimerRef.current = window.setTimeout(
        () => finishClose(notifyParent, restoreFocus),
        prefersReducedMotion ? 0 : exitDuration,
      );
    },
    [
      clearTimer,
      finishClose,
      onClose,
      prefersReducedMotion,
      exitDuration,
      updatePhase,
    ],
  );

  const keepOpen = useCallback(() => {
    clearTimer(graceTimerRef);
    clearTimer(exitTimerRef);
    onKeepOpen?.();
    if (phaseRef.current === "closing") updatePhase("open");
  }, [clearTimer, onKeepOpen, updatePhase]);

  const handlePreviewRef = useCallback(
    (node: HTMLDivElement | null) => {
      previewRef.current = node;
      if (node) window.requestAnimationFrame(calculatePosition);
    },
    [calculatePosition],
  );

  useEffect(() => {
    clearTimer(openTimerRef);
    clearTimer(graceTimerRef);

    if (isOpen) {
      if (phaseRef.current !== "closed") {
        keepOpen();
        return;
      }
      openTimerRef.current = window.setTimeout(
        () => {
          calculatePosition();
          setActiveImageIndex(0);
          updatePhase("open");
          openTimerRef.current = null;
        },
        hasFinePointer && !focusOnOpen ? motion.hoverDelayMs : 0,
      );
    } else if (phaseRef.current !== "closed") {
      graceTimerRef.current = window.setTimeout(
        () => beginExit(false, false),
        CLOSE_GRACE_MS,
      );
    }

    return () => {
      clearTimer(openTimerRef);
      clearTimer(graceTimerRef);
    };
  }, [
    beginExit,
    calculatePosition,
    clearTimer,
    focusOnOpen,
    hasFinePointer,
    motion.hoverDelayMs,
    isOpen,
    keepOpen,
    updatePhase,
  ]);

  useEffect(() => {
    if (phase !== "open" || !focusOnOpen) return;
    const timer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [focusOnOpen, phase]);

  useEffect(() => {
    if (phase === "closed") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") beginExit(true, focusOnOpen);
    };
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", calculatePosition);
    window.addEventListener("scroll", calculatePosition, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", calculatePosition);
      window.removeEventListener("scroll", calculatePosition, true);
    };
  }, [beginExit, calculatePosition, focusOnOpen, phase]);

  useEffect(
    () => () => {
      clearTimer(openTimerRef);
      clearTimer(graceTimerRef);
      clearTimer(exitTimerRef);
    },
    [clearTimer],
  );

  if (!isClient || phase === "closed") return null;

  const showPreviousImage = () => {
    setActiveImageIndex((current) =>
      current === 0 ? allImages.length - 1 : current - 1,
    );
  };

  const showNextImage = () => {
    setActiveImageIndex((current) => (current + 1) % allImages.length);
  };

  return createPortal(
    <div
      ref={handlePreviewRef}
      className="sf-hover-preview"
      data-state={phase}
      style={
        {
          top: position.top,
          left: position.left,
          "--sf-preview-source-scale-x": position.sourceScaleX,
          "--sf-preview-source-scale-y": position.sourceScaleY,
        } as React.CSSProperties
      }
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      dir={locale === "he" ? "rtl" : "ltr"}
      onMouseEnter={keepOpen}
      onMouseLeave={() => beginExit(true, false)}
      onAnimationEnd={() => {
        if (phase === "open") calculatePosition();
      }}
      onFocusCapture={keepOpen}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          beginExit(true, false);
        }
      }}
    >
      <div className="sf-hover-preview-inner">
        <button
          ref={closeButtonRef}
          type="button"
          className="sf-hover-preview-close"
          onClick={() => beginExit(true, true)}
          aria-label={copy.close}
        >
          <X size={17} aria-hidden="true" />
        </button>

        <div className="sf-hover-preview-gallery">
          {allImages.length > 1 ? (
            <div className="sf-hover-preview-thumbnails">
              {allImages.map((image, index) => (
                <button
                  key={image.id}
                  type="button"
                  className="sf-hover-preview-thumbnail"
                  data-active={index === activeImageIndex || undefined}
                  onClick={() => setActiveImageIndex(index)}
                  aria-label={`${copy.thumbnailLabel} ${index + 1}`}
                  aria-current={index === activeImageIndex ? "true" : undefined}
                >
                  <Image
                    src={image.url}
                    alt=""
                    fill
                    sizes="52px"
                    unoptimized={image.url.endsWith(".svg")}
                  />
                </button>
              ))}
            </div>
          ) : null}
          <div className="sf-hover-preview-media">
            <ProductMedia
              product={product}
              src={allImages[activeImageIndex]?.url}
              alt={
                locale === "he"
                  ? (allImages[activeImageIndex]?.altHe ?? product.name)
                  : (allImages[activeImageIndex]?.altEn ?? product.name)
              }
              sizes="(max-width: 720px) calc(100vw - 5rem), 360px"
              className="sf-hover-preview-image"
            />
            {allImages.length > 1 ? (
              <>
                <button
                  type="button"
                  className="sf-hover-preview-arrow sf-hover-preview-arrow-previous"
                  onClick={showPreviousImage}
                  aria-label={
                    locale === "he" ? "התמונה הקודמת" : "Previous image"
                  }
                >
                  <PreviousArrow size={20} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="sf-hover-preview-arrow sf-hover-preview-arrow-next"
                  onClick={showNextImage}
                  aria-label={locale === "he" ? "התמונה הבאה" : "Next image"}
                >
                  <NextArrow size={20} aria-hidden="true" />
                </button>
              </>
            ) : null}
            <span
              className="sf-hover-preview-count"
              dir="ltr"
              aria-live="polite"
            >
              {activeImageIndex + 1}/{Math.max(allImages.length, 1)}
            </span>
          </div>
        </div>

        <div className="sf-hover-preview-content">
          <p className="sf-hover-preview-category">
            {product.categoryLabel ?? product.category}
          </p>
          <h3 id={titleId} className="sf-hover-preview-title" dir="auto">
            {product.name}
          </h3>
          <div className="sf-hover-preview-price">
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
            <StockIndicator
              quantity={product.stockQty}
              locale={locale}
              unconfirmed={product.availabilityUnconfirmed}
            />
            {discountPercent !== null && formattedCompareAtPrice ? (
              <>
                <span className="sf-hover-preview-compare-at" dir="auto">
                  {formattedCompareAtPrice}
                </span>
                <span className="sf-hover-preview-discount">
                  -{discountPercent}%
                </span>
              </>
            ) : null}
            {effectivePrice === null ? <span>{copy.demoPrice}</span> : null}
          </div>

          {product.promoBadges && product.promoBadges.length > 0 ? (
            <div
              className="sf-hover-preview-badges"
              aria-label={copy.promoBadgesLabel || "Promotions"}
            >
              {product.promoBadges.slice(0, 2).map((badge) => (
                <PromoBadge
                  key={badge.id}
                  badge={badge}
                  locale={locale}
                  size="sm"
                />
              ))}
              {product.promoBadges.length > 2 ? (
                <span className="sf-hover-preview-badge-more">
                  +{product.promoBadges.length - 2}
                </span>
              ) : null}
            </div>
          ) : null}

          {product.images[0]?.url.match(
            /(?:^\/images\/catalog\/|\/storage\/v1\/object\/public\/product-media\/storefront\/catalog\/)/,
          ) ? (
            <p className="sf-hover-preview-illustration">{copy.illustration}</p>
          ) : null}
          <p className="sf-hover-preview-description" dir="auto">
            {product.shortDescription || product.description}
          </p>
          {Object.keys(product.specifications ?? {}).length ? (
            <dl className="sf-hover-preview-specs">
              {Object.entries(product.specifications ?? {})
                .slice(0, 3)
                .map(([key, value]) => (
                  <div key={key}>
                    <dt dir="auto">{key}</dt>
                    <dd dir="auto">{value}</dd>
                  </div>
                ))}
            </dl>
          ) : null}
          <div className="sf-hover-preview-footer">
            {effectivePrice !== null && product.stockState !== "out" ? (
              <AddToCartButton
                compact
                locale={locale}
                item={{
                  productId: product.id,
                  variantId:
                    (
                      product.variants.find(
                        (v) => v.isDefault && v.stockQty > 0,
                      ) ?? product.variants.find((v) => v.stockQty > 0)
                    )?.id ?? null,
                  slug: product.slug,
                  category: product.category,
                  name: product.name,
                  imageUrl: allImages[0]?.url ?? null,
                  unitPrice: effectivePrice,
                }}
              />
            ) : null}
            <Link
              href={`/${locale}/store/${product.category}/${product.slug}`}
              className="sf-hover-preview-link"
              onClick={() => beginExit(true, false)}
            >
              <span>{copy.details}</span>
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
