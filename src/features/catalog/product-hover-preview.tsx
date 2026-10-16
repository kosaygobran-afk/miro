"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { productPreviewHoverDelay, productPreviewTiming } from "@/lib/motion";
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
  onClose: (explicit: boolean) => void;
  onKeepOpen?: () => void;
  onVisibilityChange?: (visible: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  hoverSourceRef: React.RefObject<HTMLElement | null>;
  actionsRef: React.RefObject<HTMLElement | null>;
  focusOnOpen?: boolean;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

type PreviewPhase = "closed" | "open" | "closing";

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
  hoverSourceRef,
  actionsRef,
  focusOnOpen = false,
  returnFocusRef,
}: ProductHoverPreviewProps) {
  const copy = storeCopy[locale] as StoreCopy;
  const { products: motion } = useStoreDesign();
  const PreviousArrow = locale === "he" ? ChevronRight : ChevronLeft;
  const NextArrow = locale === "he" ? ChevronLeft : ChevronRight;
  const titleId = useId();
  const imageId = useId();
  const thumbnailsRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const phaseRef = useRef<PreviewPhase>("closed");
  const explicitDismissalRef = useRef(false);
  const pendingFocusReturnRef = useRef(false);
  const pointerActivationRef = useRef(false);
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
    sourceScale: 0.72,
    sourceOffsetX: 0,
    sourceOffsetY: 0,
    availableHeight: 600,
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
  const exitDuration = productPreviewTiming(animationSettings).exit;
  const hoverDelay = productPreviewHoverDelay(
    animationSettings,
    motion.hoverDelayMs,
  );
  const enhanced = animationSettings.appearanceVersion === "2";
  const preserveSourceActions = hasFinePointer && !focusOnOpen;
  const allImages = getSortedImages(product);
  const detailRows = [
    ...(product.brand
      ? [[locale === "he" ? "מותג" : "Brand", product.brand]]
      : []),
    ...(product.modelNumber
      ? [[locale === "he" ? "דגם" : "Model", product.modelNumber]]
      : []),
    ...(product.warranty
      ? [[locale === "he" ? "אחריות" : "Warranty", product.warranty]]
      : []),
    ...Object.entries(product.specifications ?? {}),
  ];
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

  useLayoutEffect(() => {
    const strip = thumbnailsRef.current;
    if (!strip) return;
    const revealSelected = () => {
      const selected = strip.querySelector<HTMLElement>("[data-active]");
      if (!selected || !strip.offsetWidth || !strip.offsetHeight) return;
      const frame = strip.getBoundingClientRect();
      const item = selected.getBoundingClientRect();
      const scaleX = frame.width / strip.offsetWidth;
      const scaleY = frame.height / strip.offsetHeight;
      if (!scaleX || !scaleY) return;
      // Client bounds exclude the native scrollbar, including its RTL gutter.
      // Convert screen coordinates back to CSS pixels during popup animations.
      const left = frame.left + strip.clientLeft * scaleX;
      const top = frame.top + strip.clientTop * scaleY;
      const right = left + strip.clientWidth * scaleX;
      const bottom = top + strip.clientHeight * scaleY;
      strip.scrollBy({
        left:
          (item.left < left
            ? item.left - left
            : Math.max(0, item.right - right)) / scaleX,
        top:
          (item.top < top
            ? item.top - top
            : Math.max(0, item.bottom - bottom)) / scaleY,
        behavior: "instant",
      });
    };
    revealSelected();
    const observer = new ResizeObserver(revealSelected);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [activeImageIndex, phase, product.images]);

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
    const mediaRect = trigger
      .querySelector(".sf-product-media, .sf-moving-rail-media")
      ?.getBoundingClientRect();
    const preview = previewRef.current;
    const gutter = 16;
    const width =
      preview?.offsetWidth ?? Math.min(420, window.innerWidth - gutter * 2);
    const sourceScale = Math.min(1, triggerRect.width / width);
    const actionsRect = actionsRef.current?.getBoundingClientRect();
    const separation = 16;
    let bottomLimit =
      preserveSourceActions && actionsRect
        ? Math.min(window.innerHeight - gutter, actionsRect.top - separation)
        : window.innerHeight - gutter;
    // Both the final popup and its scaled first frame must stop above the
    // original buttons. Details scroll inside the height available to them.
    let availableHeight =
      preserveSourceActions && actionsRect
        ? Math.max(
            1,
            Math.min(
              600,
              bottomLimit - gutter,
              (actionsRect.top - separation - triggerRect.top) / sourceScale,
            ),
          )
        : window.innerHeight - gutter * 2;
    let left = Math.max(
      gutter,
      Math.min(
        triggerRect.left + triggerRect.width / 2 - width / 2,
        window.innerWidth - width - gutter,
      ),
    );
    let separatedFallback = false;
    let belowActions = false;
    if (preserveSourceActions && actionsRect && availableHeight < 240) {
      // A card scrolled almost offscreen leaves too little room above it.
      // Prefer a full usable frame beside it, then the larger space below it.
      const rightRoom = window.innerWidth - gutter - actionsRect.right;
      const leftRoom = actionsRect.left - gutter;
      if (Math.max(rightRoom, leftRoom) >= width + separation) {
        left =
          rightRoom >= leftRoom
            ? actionsRect.right + separation
            : actionsRect.left - width - separation;
        availableHeight = Math.min(600, window.innerHeight - gutter * 2);
        bottomLimit = window.innerHeight - gutter;
        separatedFallback = true;
      } else {
        const belowRoom =
          window.innerHeight - gutter - actionsRect.bottom - separation;
        if (belowRoom > availableHeight) {
          availableHeight = Math.min(600, belowRoom);
          bottomLimit = window.innerHeight - gutter;
          belowActions = true;
          separatedFallback = true;
        }
      }
    }
    const height = preserveSourceActions
      ? availableHeight
      : (preview?.offsetHeight ?? Math.min(560, availableHeight));
    const desiredTop = enhanced
      ? (mediaRect?.top ?? triggerRect.top) - 12
      : triggerRect.top + triggerRect.height / 2 - height / 2;
    const top =
      belowActions && actionsRect
        ? actionsRect.bottom + separation
        : Math.max(gutter, Math.min(desiredTop, bottomLimit - height));
    const sourceScaleX = Math.max(
      0.45,
      Math.min(0.94, triggerRect.width / width),
    );
    const sourceScaleY = Math.max(
      0.45,
      Math.min(0.94, triggerRect.height / height),
    );
    // Grow from the source's real width and top edge using one scale for both
    // axes. Translation also handles cards near a viewport edge without a jump.
    const sourceOffsetX = separatedFallback
      ? 0
      : triggerRect.left + triggerRect.width / 2 - (left + width / 2);
    const sourceOffsetY = separatedFallback ? 0 : triggerRect.top - top;

    setPosition((current) =>
      current.top === top &&
      current.left === left &&
      current.sourceScaleX === sourceScaleX &&
      current.sourceScaleY === sourceScaleY &&
      current.sourceScale === sourceScale &&
      current.sourceOffsetX === sourceOffsetX &&
      current.sourceOffsetY === sourceOffsetY &&
      current.availableHeight === availableHeight
        ? current
        : {
            top,
            left,
            sourceScaleX,
            sourceScaleY,
            sourceScale,
            sourceOffsetX,
            sourceOffsetY,
            availableHeight,
          },
    );
  }, [triggerRef, actionsRef, enhanced, preserveSourceActions]);

  const finishClose = useCallback(
    (restoreFocus: boolean) => {
      updatePhase("closed");
      if (restoreFocus || pendingFocusReturnRef.current) {
        window.setTimeout(
          () => returnFocusRef?.current?.focus({ preventScroll: true }),
          0,
        );
      }
      pendingFocusReturnRef.current = false;
    },
    [returnFocusRef, updatePhase],
  );

  const beginExit = useCallback(
    (notifyParent: boolean, restoreFocus: boolean, explicit = false) => {
      if (explicit) explicitDismissalRef.current = true;
      // Late pointer/blur events cannot replace explicit focus restoration.
      // Escape during an ordinary exit still escalates it to a dismissal.
      if (phaseRef.current === "closing") {
        if (explicit) {
          if (notifyParent) onClose(true);
          if (restoreFocus) pendingFocusReturnRef.current = true;
        }
        return;
      }
      pendingFocusReturnRef.current = false;
      clearTimer(openTimerRef);
      clearTimer(graceTimerRef);
      clearTimer(exitTimerRef);
      // Clear source intent when exit starts. A fresh hover during the exit
      // can then reopen it instead of being lost to the old completion timer.
      if (notifyParent) onClose(explicit);
      if (phaseRef.current === "closed") {
        return;
      }
      updatePhase("closing");
      exitTimerRef.current = window.setTimeout(
        () => finishClose(restoreFocus),
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
    // A late focus/mouseenter event during exit cannot cancel an explicit close.
    if (explicitDismissalRef.current) return;
    clearTimer(graceTimerRef);
    clearTimer(exitTimerRef);
    onKeepOpen?.();
    if (phaseRef.current === "closing") updatePhase("open");
  }, [clearTimer, onKeepOpen, updatePhase]);

  // Measure the mounted portal before paint, so its first visible frame never
  // jumps from an estimated box to the actual image/content dimensions.
  useLayoutEffect(() => {
    if (phase !== "closed") calculatePosition();
  }, [phase, calculatePosition]);

  useEffect(() => {
    clearTimer(openTimerRef);
    clearTimer(graceTimerRef);

    if (isOpen) {
      // An explicit button activation or a genuinely new source hover starts
      // a new interaction, including while the prior exit is still running.
      explicitDismissalRef.current = false;
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
        hasFinePointer && !focusOnOpen ? hoverDelay : 0,
      );
    } else if (phaseRef.current !== "closed") {
      beginExit(false, false);
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
    hoverDelay,
    isOpen,
    keepOpen,
    updatePhase,
  ]);

  useEffect(() => {
    if (phase !== "open" || !focusOnOpen) return;
    const timer = window.setTimeout(
      () => closeButtonRef.current?.focus({ preventScroll: true }),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [focusOnOpen, phase]);

  useEffect(() => {
    if (phase === "closed") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") beginExit(true, focusOnOpen, true);
    };
    const trackActivation = (event: PointerEvent) => {
      pointerActivationRef.current =
        previewRef.current?.contains(event.target as Node) ?? false;
    };
    const endActivation = () => {
      pointerActivationRef.current = false;
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", trackActivation, true);
    document.addEventListener("pointerup", endActivation, true);
    document.addEventListener("pointercancel", endActivation, true);
    window.addEventListener("resize", calculatePosition);
    window.addEventListener("scroll", calculatePosition, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", trackActivation, true);
      document.removeEventListener("pointerup", endActivation, true);
      document.removeEventListener("pointercancel", endActivation, true);
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
      ref={previewRef}
      className="sf-hover-preview"
      data-state={phase}
      data-preserve-source-actions={preserveSourceActions || undefined}
      data-compact-source-preview={
        (preserveSourceActions && position.availableHeight < 240) || undefined
      }
      data-minimal-source-preview={
        (preserveSourceActions && position.availableHeight < 160) || undefined
      }
      style={
        {
          top: position.top,
          left: position.left,
          pointerEvents: !isOpen ? "none" : undefined,
          "--sf-preview-available-height": `${position.availableHeight}px`,
          "--sf-preview-source-scale-x": position.sourceScaleX,
          "--sf-preview-source-scale-y": position.sourceScaleY,
          "--sf-preview-source-scale": position.sourceScale,
          "--sf-preview-source-offset-x": `${position.sourceOffsetX}px`,
          "--sf-preview-source-offset-y": `${position.sourceOffsetY}px`,
        } as React.CSSProperties
      }
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      dir={locale === "he" ? "rtl" : "ltr"}
      onMouseEnter={keepOpen}
      onMouseLeave={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          hoverSourceRef.current?.contains(event.relatedTarget)
        ) {
          keepOpen();
          return;
        }
        beginExit(true, false);
      }}
      onFocusCapture={keepOpen}
      onBlurCapture={(event) => {
        // Safari blurs a focused details region before clicking a button that
        // does not take mouse focus. Keep it hit-tested until that click lands.
        if (event.relatedTarget === null && pointerActivationRef.current)
          return;
        if (
          !event.currentTarget.contains(event.relatedTarget) &&
          !hoverSourceRef.current?.contains(event.relatedTarget)
        ) {
          beginExit(true, false);
        }
      }}
    >
      <div className="sf-hover-preview-inner">
        <button
          ref={closeButtonRef}
          type="button"
          className="sf-hover-preview-close"
          onClick={() => beginExit(true, true, true)}
          aria-label={copy.close}
        >
          <X size={17} aria-hidden="true" />
        </button>

        <div
          className="sf-hover-preview-gallery"
          data-multiple-images={allImages.length > 1 || undefined}
          role="group"
          aria-label={locale === "he" ? "תמונות המוצר" : "Product images"}
          onKeyDown={(event) => {
            if (
              allImages.length < 2 ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey
            )
              return;
            const nextKey = locale === "he" ? "ArrowLeft" : "ArrowRight";
            const previousKey = locale === "he" ? "ArrowRight" : "ArrowLeft";
            if (event.key === nextKey || event.key === previousKey) {
              event.preventDefault();
              if (event.key === nextKey) showNextImage();
              else showPreviousImage();
            } else if (event.key === "Home" || event.key === "End") {
              event.preventDefault();
              setActiveImageIndex(
                event.key === "Home" ? 0 : allImages.length - 1,
              );
            }
          }}
        >
          {allImages.length > 1 ? (
            <div ref={thumbnailsRef} className="sf-hover-preview-thumbnails">
              {allImages.map((image, index) => (
                <button
                  key={image.id}
                  type="button"
                  className="sf-hover-preview-thumbnail"
                  data-active={index === activeImageIndex || undefined}
                  onClick={() => setActiveImageIndex(index)}
                  aria-label={`${copy.thumbnailLabel} ${index + 1}`}
                  aria-current={index === activeImageIndex ? "true" : undefined}
                  aria-controls={imageId}
                >
                  <ProductMedia
                    product={product}
                    src={image.url}
                    alt=""
                    sizes="52px"
                    loading="eager"
                  />
                </button>
              ))}
            </div>
          ) : null}
          <div id={imageId} className="sf-hover-preview-media">
            <ProductMedia
              product={product}
              src={allImages[activeImageIndex]?.url}
              alt={
                locale === "he"
                  ? (allImages[activeImageIndex]?.altHe ?? product.name)
                  : (allImages[activeImageIndex]?.altEn ?? product.name)
              }
              sizes="(max-width: 380px) calc(100vw - 5rem), (max-width: 512px) calc(100vw - 9rem), 360px"
              loading="eager"
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
            {allImages.length > 0 ? (
              <span
                className="sf-hover-preview-count"
                dir="ltr"
                aria-live="polite"
                aria-atomic="true"
                aria-label={
                  locale === "he"
                    ? `תמונה ${activeImageIndex + 1} מתוך ${allImages.length}`
                    : `Image ${activeImageIndex + 1} of ${allImages.length}`
                }
              >
                {activeImageIndex + 1} / {allImages.length}
              </span>
            ) : null}
          </div>
        </div>

        <div className="sf-hover-preview-content">
          <div
            className="sf-hover-preview-details"
            tabIndex={enhanced || preserveSourceActions ? 0 : undefined}
            role={enhanced || preserveSourceActions ? "region" : undefined}
            aria-label={
              enhanced || preserveSourceActions
                ? locale === "he"
                  ? "פרטי המוצר"
                  : "Product details"
                : undefined
            }
          >
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
              <p className="sf-hover-preview-illustration">
                {copy.illustration}
              </p>
            ) : null}
            <p className="sf-hover-preview-description" dir="auto">
              {product.description ||
                product.shortDescription ||
                (locale === "he"
                  ? "צריכים מפרט או פרטי תאימות? פתחו את עמוד המוצר לפנייה ולקבלת מידע נוסף."
                  : "Need specifications or compatibility details? Open the product page to enquire.")}
            </p>
            {detailRows.length ? (
              <dl className="sf-hover-preview-specs">
                {detailRows.map(([key, value], index) => (
                  <div key={`${key}-${index}`}>
                    <dt dir="auto">{key}</dt>
                    <dd dir="auto">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
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
