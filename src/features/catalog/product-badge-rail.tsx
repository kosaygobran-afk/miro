"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Pause, Play } from "lucide-react";
import { useAnimationFeature } from "@/components/motion/animation-provider";
import { useStoreDesign } from "@/features/store-design/design-context";
import { useReducedMotion } from "@/features/store-design/use-reduced-motion";
import { PromoBadge } from "./product-promo-badge";
import type { PromoBadge as Badge } from "./product-data";

/** One accessible badge list, with a visual loop only when its content overflows. */
export function ProductBadgeRail({
  collection,
  badges,
  locale,
  isDuplicate = false,
}: {
  collection?: string;
  badges: Badge[];
  locale: "he" | "en";
  isDuplicate?: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const segment = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ overflow: false, distance: 0 });
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const ambient = useAnimationFeature("ambientMotion");
  const { products } = useStoreDesign();
  const animated = ambient && !reduced;
  useLayoutEffect(() => {
    const view = viewport.current;
    const group = segment.current;
    if (!view || !group) return;
    let active = true;
    const measure = () => {
      if (!active) return;
      const width = group.getBoundingClientRect().width;
      const distance = width + 12;
      const overflow = width > view.clientWidth + 1;
      setMetrics((previous) =>
        previous.overflow === overflow &&
        Math.abs(previous.distance - distance) < 1
          ? previous
          : { overflow, distance },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(view);
    observer.observe(group);
    document.fonts?.ready.then(measure);
    measure();
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [collection, badges]);
  const looping = animated && metrics.overflow;
  const items = (duplicate: boolean) => (
    <div
      ref={duplicate ? undefined : segment}
      className="sf-badge-rail-group"
      role={duplicate ? undefined : "list"}
      aria-label={
        duplicate ? undefined : locale === "he" ? "תגי המוצר" : "Product labels"
      }
      aria-hidden={duplicate || undefined}
    >
      {collection && (
        <span
          className="sf-card-featured"
          role={duplicate ? undefined : "listitem"}
        >
          {collection}
        </span>
      )}
      {badges.map((badge) => (
        <span
          key={badge.id}
          className="sf-badge-rail-item"
          role={duplicate ? undefined : "listitem"}
        >
          <PromoBadge badge={badge} locale={locale} size="sm" />
        </span>
      ))}
    </div>
  );
  return (
    <div
      className="sf-card-tags sf-badge-rail"
      dir={locale === "he" ? "rtl" : "ltr"}
      data-looping={looping || undefined}
      data-paused={paused || undefined}
      style={
        {
          "--sf-badge-distance": `${locale === "he" ? metrics.distance : -metrics.distance}px`,
          "--sf-badge-duration": `${metrics.distance / products.pixelsPerSecond}s`,
        } as CSSProperties
      }
    >
      <div
        ref={viewport}
        className="sf-badge-rail-viewport"
        tabIndex={metrics.overflow && !isDuplicate ? 0 : undefined}
        role={metrics.overflow ? "group" : undefined}
        aria-label={
          metrics.overflow
            ? locale === "he"
              ? "גלילת תגי המוצר"
              : "Scroll product labels"
            : undefined
        }
        onTouchStart={() => setPaused(true)}
      >
        <div className="sf-badge-rail-track">
          {items(false)}
          {looping && items(true)}
        </div>
      </div>
      {looping && (
        <button
          type="button"
          className="sf-badge-rail-toggle"
          tabIndex={isDuplicate ? -1 : undefined}
          aria-label={
            paused
              ? locale === "he"
                ? "הפעלת תגי המוצר"
                : "Play product labels"
              : locale === "he"
                ? "עצירת תגי המוצר"
                : "Pause product labels"
          }
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? (
            <Play size={12} aria-hidden="true" />
          ) : (
            <Pause size={12} aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}
