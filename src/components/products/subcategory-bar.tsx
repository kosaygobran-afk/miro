"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "@/components/motion/motion-link";
import { useReducedMotion } from "@/features/store-design/use-reduced-motion";

export type SubcategoryBarItem = {
  id: string;
  label: string;
  href: string;
  count: number;
};

/**
 * Subcategory navigation rendered as its own bar directly under the
 * main-category band. The chips scroll horizontally in one row with edge
 * fades and point-controlled stepping; the active chip is kept in view on
 * mount. All geometry is measured visually, so Hebrew and English behave the
 * same without hardcoding physical sides.
 */
export function SubcategoryBar({
  items,
  activeId,
  rootHref,
  rootLabel,
  rootCount,
  heading,
  scrollStartLabel,
  scrollEndLabel,
  locale,
}: {
  items: SubcategoryBarItem[];
  activeId?: string;
  rootHref: string;
  rootLabel: string;
  rootCount: number;
  heading: string;
  scrollStartLabel: string;
  scrollEndLabel: string;
  locale: "he" | "en";
}) {
  const isRtl = locale === "he";
  const reduced = useReducedMotion();
  const railRef = useRef<HTMLDivElement | null>(null);
  const linksRef = useRef<HTMLDivElement | null>(null);
  const activeChipRef = useRef<HTMLAnchorElement | null>(null);
  const [overflow, setOverflow] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const max = rail.scrollWidth - rail.clientWidth;
    if (max <= 4) {
      setOverflow((prev) =>
        prev.start || prev.end ? { start: false, end: false } : prev,
      );
      return;
    }
    // Reading direction decides which physical side hides overflow.
    const start = isRtl ? rail.scrollLeft < -1 : rail.scrollLeft > 1;
    const end = isRtl ? rail.scrollLeft > -max + 1 : rail.scrollLeft < max - 1;
    setOverflow((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end },
    );
  }, [isRtl]);

  useLayoutEffect(() => {
    measure();
    const rail = railRef.current;
    const links = linksRef.current;
    if (!rail || !links) return;
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    observer.observe(links);
    rail.addEventListener("scroll", measure, { passive: true });
    let disposed = false;
    document.fonts?.ready.then(() => {
      if (!disposed) measure();
    });
    return () => {
      disposed = true;
      observer.disconnect();
      rail.removeEventListener("scroll", measure);
    };
  }, [measure, items, activeId]);

  // Keep the active chip in view without scrolling the page. Chips wider
  // than the rail align to their reading start, so the label's beginning
  // stays visible on very narrow screens.
  useLayoutEffect(() => {
    const rail = railRef.current;
    const chip = activeChipRef.current;
    if (!rail || !chip) return;
    const railRect = rail.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    const delta =
      chipRect.width > railRect.width
        ? isRtl
          ? chipRect.right - railRect.right
          : chipRect.left - railRect.left
        : chipRect.left +
          chipRect.width / 2 -
          (railRect.left + railRect.width / 2);
    if (Math.abs(delta) > 1) {
      rail.scrollLeft += delta;
      measure();
    }
  }, [activeId, isRtl, measure]);

  const step = (toward: "start" | "end") => {
    const rail = railRef.current;
    if (!rail) return;
    const amount = Math.max(rail.clientWidth * 0.8, 180);
    const sign = isRtl ? -1 : 1;
    rail.scrollBy({
      left: toward === "end" ? sign * amount : -sign * amount,
      behavior: reduced ? "auto" : "smooth",
    });
  };

  const fadeLeft = isRtl ? overflow.end : overflow.start;
  const fadeRight = isRtl ? overflow.start : overflow.end;

  return (
    <nav
      className="sf-subcategories"
      aria-label={heading}
      dir={isRtl ? "rtl" : "ltr"}
    >
      <p className="sf-subcategories-label">{heading}</p>
      <div className="sf-subcategory-scroller">
        <div
          className="sf-subcategory-rail"
          ref={railRef}
          data-fade-left={fadeLeft || undefined}
          data-fade-right={fadeRight || undefined}
        >
          <div className="sf-subcategory-links" ref={linksRef}>
            <Link
              href={rootHref}
              prefetch={false}
              aria-current={!activeId ? "page" : undefined}
            >
              {rootLabel}
              <span className="sf-subcategory-count">{rootCount}</span>
            </Link>
            {items.map((item) => (
              <Link
                key={item.id}
                ref={item.id === activeId ? activeChipRef : undefined}
                href={item.href}
                prefetch={false}
                aria-current={item.id === activeId ? "page" : undefined}
              >
                {item.label}
                <span className="sf-subcategory-count">{item.count}</span>
              </Link>
            ))}
          </div>
        </div>
        {overflow.start && (
          <button
            type="button"
            className="sf-subcategory-step"
            data-step="start"
            tabIndex={-1}
            aria-label={scrollStartLabel}
            onClick={() => step("start")}
          >
            {isRtl ? (
              <ChevronRight size={17} aria-hidden="true" />
            ) : (
              <ChevronLeft size={17} aria-hidden="true" />
            )}
          </button>
        )}
        {overflow.end && (
          <button
            type="button"
            className="sf-subcategory-step"
            data-step="end"
            tabIndex={-1}
            aria-label={scrollEndLabel}
            onClick={() => step("end")}
          >
            {isRtl ? (
              <ChevronLeft size={17} aria-hidden="true" />
            ) : (
              <ChevronRight size={17} aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    </nav>
  );
}
