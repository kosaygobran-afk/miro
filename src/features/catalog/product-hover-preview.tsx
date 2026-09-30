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
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Circle,
  X,
} from "lucide-react";
import { storeCopy, type StoreCopy } from "@/features/catalog/store-copy";
import type { Product, ProductImage } from "@/features/catalog/product-data";
import { PromoBadge } from "@/features/catalog/product-promo-badge";
import { formatPrice, getDiscountPercent } from "@/lib/catalog/pricing";

interface ProductHoverPreviewProps {
  product: Product;
  locale: "he" | "en";
  isOpen: boolean;
  onClose: () => void;
  onKeepOpen?: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  focusOnOpen?: boolean;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

type PreviewPhase = "closed" | "open" | "closing";

const HOVER_INTENT_MS = 1000;
const CLOSE_GRACE_MS = 220;
const EXIT_MS = 140;
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
  triggerRef,
  focusOnOpen = false,
  returnFocusRef,
}: ProductHoverPreviewProps) {
  const copy = storeCopy[locale] as StoreCopy;
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
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const hasFinePointer = useMediaQuery("(hover: hover) and (pointer: fine)");
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
  );

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
    const gutter = 32;
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
        prefersReducedMotion ? 0 : EXIT_MS,
      );
    },
    [clearTimer, finishClose, onClose, prefersReducedMotion, updatePhase],
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
        hasFinePointer && !focusOnOpen ? HOVER_INTENT_MS : 0,
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
                  <Image src={image.url} alt="" fill sizes="52px" />
                </button>
              ))}
            </div>
          ) : null}
          <div className="sf-hover-preview-media">
            {allImages.length > 0 ? (
              <Image
                key={allImages[activeImageIndex].id}
                src={allImages[activeImageIndex].url}
                alt={
                  locale === "he"
                    ? (allImages[activeImageIndex].altHe ?? product.name)
                    : (allImages[activeImageIndex].altEn ?? product.name)
                }
                fill
                sizes="(max-width: 720px) calc(100vw - 5rem), 360px"
                className="sf-hover-preview-image"
              />
            ) : (
              <div className="sf-hover-preview-placeholder" aria-hidden="true">
                <svg
                  width="72"
                  height="72"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 17" />
                </svg>
              </div>
            )}
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
                  <ChevronLeft size={20} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="sf-hover-preview-arrow sf-hover-preview-arrow-next"
                  onClick={showNextImage}
                  aria-label={locale === "he" ? "התמונה הבאה" : "Next image"}
                >
                  <ChevronRight size={20} aria-hidden="true" />
                </button>
              </>
            ) : null}
            <span className="sf-hover-preview-count" aria-live="polite">
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
            <strong dir="auto">{formattedPrice}</strong>
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

          <div className="sf-hover-preview-footer">
            <span
              className={`sf-hover-preview-stock sf-hover-preview-stock-${product.stockState}`}
            >
              <Circle size={8} fill="currentColor" aria-hidden="true" />
              {product.stockState === "low"
                ? copy.lowStock
                : product.stockState === "out"
                  ? copy.outOfStockContact
                  : locale === "he"
                    ? "במלאי"
                    : "In stock"}
            </span>
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
