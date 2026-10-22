"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ZoomIn, ZoomOut } from "lucide-react";
import { ProductMedia, type ProductImageSubject } from "./product-media";

const MIN_ZOOM = 1.25;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.25;
const IMAGE_SIZES = "(max-width: 380px) 600px, 800px";

/** A movable circular lens; pointer motion only updates local CSS variables. */
export function ProductImageMagnifier({
  product,
  src,
  alt,
  locale,
  active,
  counter,
  sizes = IMAGE_SIZES,
  imageClassName = "sf-hover-preview-image",
  fallback,
  annotation,
  fetchPriority,
  escapeScope = "document",
  togglePortalTarget,
}: {
  product: ProductImageSubject;
  src?: string;
  alt: string;
  locale: "he" | "en";
  active: boolean;
  counter?: ReactNode;
  sizes?: string;
  imageClassName?: string;
  fallback?: ReactNode;
  annotation?: ReactNode;
  fetchPriority?: "high" | "low" | "auto";
  escapeScope?: "document" | "local";
  /**
   * Optional toolbar slot. The storefront card preview moves its toggle next to
   * the close button, while the detail page keeps it in the image tools row.
   */
  togglePortalTarget?: HTMLElement | null;
}) {
  const he = locale === "he";
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [zoom, setZoom] = useState(2);
  const zoomRef = useRef(2);
  const stageRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const pointRef = useRef({ x: 50, y: 50 });
  const stageId = useId();
  const helpId = useId();
  const rangeId = useId();
  const zoomed = enabled && ready && active;
  const toggleLabel = zoomed
    ? he
      ? "כיבוי זכוכית המגדלת"
      : "Turn off magnifier"
    : he
      ? "הגדלת התמונה"
      : "Magnify image";
  const formattedZoom = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(zoom);

  const updateLens = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const size = Math.min(144, width * 0.6, height * 0.85);
    const radius = size / 2;
    const x = (pointRef.current.x / 100) * width;
    const y = (pointRef.current.y / 100) * height;
    const centerX = Math.max(radius + 2, Math.min(width - radius - 2, x));
    const centerY = Math.max(radius + 2, Math.min(height - radius - 2, y));
    const variables = {
      "--magnifier-x": `${pointRef.current.x}%`,
      "--magnifier-y": `${pointRef.current.y}%`,
      "--magnifier-scale": String(zoomRef.current),
      "--magnifier-size": `${size}px`,
      "--magnifier-left": `${centerX - radius}px`,
      "--magnifier-top": `${centerY - radius}px`,
      "--magnifier-stage-width": `${width}px`,
      "--magnifier-stage-height": `${height}px`,
      "--magnifier-view-left": `${radius - x * zoomRef.current}px`,
      "--magnifier-view-top": `${radius - y * zoomRef.current}px`,
    };
    for (const [name, value] of Object.entries(variables))
      stage.style.setProperty(name, value);
  }, []);

  const changeZoom = useCallback(
    (value: number) => {
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
      zoomRef.current = next;
      setZoom(next);
      updateLens();
    },
    [updateLens],
  );

  const moveTo = (x: number, y: number) => {
    const point = {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };
    pointRef.current = point;
    updateLens();
  };

  const magnifierToggle = ready ? (
    <button
      ref={buttonRef}
      type="button"
      className="sf-image-magnifier-toggle"
      aria-label={toggleLabel}
      aria-pressed={zoomed}
      aria-controls={stageId}
      onClick={() => {
        moveTo(50, 50);
        setEnabled(!zoomed);
        if (!zoomed) {
          requestAnimationFrame(() =>
            stageRef.current?.focus({ preventScroll: true }),
          );
        }
      }}
    >
      {zoomed ? (
        <ZoomOut size={16} aria-hidden="true" />
      ) : (
        <ZoomIn size={16} aria-hidden="true" />
      )}
      <span
        className="sf-image-magnifier-tooltip"
        aria-hidden="true"
        dir={he ? "rtl" : "ltr"}
      >
        {toggleLabel}
      </span>
    </button>
  ) : null;
  const placedMagnifierToggle =
    magnifierToggle && togglePortalTarget
      ? createPortal(magnifierToggle, togglePortalTarget)
      : magnifierToggle;

  useEffect(() => {
    const stage = stageRef.current;
    if (!zoomed || !stage) return;
    updateLens();
    const observer = new ResizeObserver(updateLens);
    observer.observe(stage);
    const handleWheel = (event: WheelEvent) => {
      // Leave browser pinch/page zoom shortcuts intact.
      if (event.ctrlKey || event.metaKey || event.deltaY === 0) return;
      event.preventDefault();
      event.stopPropagation();
      changeZoom(zoomRef.current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
    };
    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      observer.disconnect();
      stage.removeEventListener("wheel", handleWheel);
    };
  }, [zoomed, updateLens, changeZoom]);

  useEffect(() => {
    if (!zoomed) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (
        escapeScope === "local" &&
        (!(event.target instanceof Node) ||
          (!stageRef.current?.contains(event.target) &&
            !toolsRef.current?.contains(event.target)))
      )
        return;
      // The first Escape leaves magnification; the next closes the preview.
      event.preventDefault();
      event.stopPropagation();
      setEnabled(false);
      buttonRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", handleEscape, true);
    return () => document.removeEventListener("keydown", handleEscape, true);
  }, [zoomed, escapeScope]);

  return (
    <>
      <div
        id={stageId}
        ref={stageRef}
        className="sf-hover-preview-image-stage"
        data-magnified={zoomed || undefined}
        tabIndex={zoomed ? 0 : undefined}
        role="group"
        aria-label={he ? "תמונת המוצר בהגדלה" : "Product image magnifier"}
        aria-describedby={zoomed ? helpId : undefined}
        onPointerDown={(event) => {
          if (!zoomed || !event.isPrimary) return;
          if (event.pointerType !== "mouse") {
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          const box = event.currentTarget.getBoundingClientRect();
          moveTo(
            ((event.clientX - box.left) / box.width) * 100,
            ((event.clientY - box.top) / box.height) * 100,
          );
        }}
        onPointerMove={(event) => {
          if (!zoomed || !event.isPrimary) return;
          if (event.pointerType !== "mouse" && !event.buttons) return;
          const box = event.currentTarget.getBoundingClientRect();
          moveTo(
            ((event.clientX - box.left) / box.width) * 100,
            ((event.clientY - box.top) / box.height) * 100,
          );
        }}
        onKeyDown={(event) => {
          if (!zoomed || event.altKey || event.ctrlKey || event.metaKey) return;
          const deltas: Record<string, [number, number]> = {
            ArrowLeft: [-10, 0],
            ArrowRight: [10, 0],
            ArrowUp: [0, -10],
            ArrowDown: [0, 10],
          };
          const delta = deltas[event.key];
          if (!delta && event.key !== "Home") return;
          event.preventDefault();
          event.stopPropagation();
          moveTo(
            delta ? pointRef.current.x + delta[0] : 50,
            delta ? pointRef.current.y + delta[1] : 50,
          );
        }}
      >
        <ProductMedia
          product={product}
          src={src}
          alt={alt}
          sizes={sizes}
          loading="eager"
          className={imageClassName}
          onImageReadyChange={setReady}
          fallback={fallback}
          fetchPriority={fetchPriority}
        />
        {zoomed ? (
          <div className="sf-image-magnifier-lens" aria-hidden="true">
            <div className="sf-image-magnifier-view">
              <ProductMedia
                product={product}
                src={src}
                alt=""
                sizes={sizes}
                loading="eager"
                className="sf-image-magnifier-image"
              />
            </div>
          </div>
        ) : null}
        {annotation}
      </div>
      {ready || counter ? (
        <div ref={toolsRef} className="sf-hover-preview-image-tools">
          {counter}
          {placedMagnifierToggle}
          {zoomed ? (
            <label
              className="sf-image-magnifier-controls"
              htmlFor={rangeId}
              dir="ltr"
            >
              <span className="sr-only">
                {he ? "רמת ההגדלה" : "Zoom level"}
              </span>
              <input
                id={rangeId}
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={ZOOM_STEP}
                value={zoom}
                aria-label={he ? "רמת ההגדלה" : "Zoom level"}
                aria-valuetext={`${formattedZoom}×`}
                onChange={(event) =>
                  changeZoom(event.currentTarget.valueAsNumber)
                }
                onKeyDown={(event) => {
                  if (
                    [
                      "ArrowLeft",
                      "ArrowRight",
                      "ArrowUp",
                      "ArrowDown",
                      "Home",
                      "End",
                      "PageUp",
                      "PageDown",
                    ].includes(event.key)
                  )
                    event.stopPropagation();
                }}
              />
              <output
                className="sf-image-magnifier-power"
                htmlFor={rangeId}
                aria-hidden="true"
              >
                {formattedZoom}×
              </output>
            </label>
          ) : null}
        </div>
      ) : null}
      <span id={helpId} className="sr-only" role="status">
        {zoomed
          ? he
            ? "בחרו רמת הגדלה במחוון או בגלילה מעל התמונה. הזיזו את זכוכית המגדלת עם הסמן, בגרירה או בחצים. Home מחזיר למרכז; Escape מכבה."
            : "Choose zoom with the slider or scroll over the image. Move the lens with the pointer, drag, or arrow keys. Home recenters; Escape turns it off."
          : ""}
      </span>
    </>
  );
}
