"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import Link from "@/components/motion/motion-link";
import { useAnimationFeature } from "@/components/motion/animation-provider";
import type { Product } from "./product-data";
import { RailProduct } from "./product-moving-rail";
import styles from "./related-products-rail.module.css";

export function RelatedProductsRail({
  products,
  locale,
  categoryUrl,
  categoryLabel,
}: {
  products: Product[];
  locale: "he" | "en";
  categoryUrl: string;
  categoryLabel: string;
}) {
  const rtl = locale === "he";
  const titleId = useId();
  const viewportId = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const manualFrame = useRef(0);
  const travelDirection = useRef(1);
  const track = useRef<HTMLUListElement>(null);
  // Compensate native whole-pixel scrolling with a composited fractional remainder.
  const writeOffset = useCallback(
    (offset: number) => {
      const node = viewport.current;
      const content = track.current;
      if (!node || !content) return;
      const target = rtl ? -offset : offset;
      node.scrollLeft = target;
      content.style.transform = `translate3d(${node.scrollLeft - target}px, 0, 0)`;
    },
    [rtl],
  );
  const clearMotion = useCallback(() => {
    if (track.current) {
      track.current.style.transform = "";
      track.current.style.willChange = "";
    }
  }, []);
  const [paused, setPaused] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [gesturePaused, setGesturePaused] = useState(false);
  const gestureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pauseForGesture = useCallback(() => {
    setGesturePaused(true);
    if (gestureTimer.current) clearTimeout(gestureTimer.current);
    gestureTimer.current = setTimeout(() => setGesturePaused(false), 600);
  }, []);
  useEffect(() => {
    if (!pressed) return;
    const release = () => {
      setPressed(false);
      pauseForGesture();
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, [pressed, pauseForGesture]);
  useEffect(
    () => () => {
      if (gestureTimer.current) clearTimeout(gestureTimer.current);
    },
    [],
  );
  const [interacting, setInteracting] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [edges, setEdges] = useState({ start: true, end: false });
  const ambient = useAnimationFeature("ambientMotion");
  const animatedControls = useAnimationFeature("microInteractions");
  useEffect(() => {
    if (!animatedControls) {
      cancelAnimationFrame(manualFrame.current);
      clearMotion();
      const frame = requestAnimationFrame(() => setNavigating(false));
      return () => cancelAnimationFrame(frame);
    }
  }, [animatedControls, clearMotion]);
  const onPreviewChange = useCallback((id: string, open: boolean) => {
    setPreviews((value) =>
      open
        ? value.includes(id)
          ? value
          : [...value, id]
        : value.filter((item) => item !== id),
    );
  }, []);
  const measure = useCallback(() => {
    const node = viewport.current;
    if (!node) return;
    const max = node.scrollWidth - node.clientWidth;
    const offset = rtl ? -node.scrollLeft : node.scrollLeft;
    setOverflow(max > 2);
    const next = { start: offset <= 2, end: offset >= max - 2 };
    setEdges((previous) =>
      previous.start === next.start && previous.end === next.end
        ? previous
        : next,
    );
  }, [rtl]);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const resize = new ResizeObserver(measure);
    resize.observe(node);
    if (node.firstElementChild) resize.observe(node.firstElementChild);
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    observer.observe(node);
    measure();
    return () => {
      resize.disconnect();
      observer.disconnect();
      cancelAnimationFrame(manualFrame.current);
    };
  }, [measure, products]);
  useEffect(() => {
    const node = viewport.current;
    if (
      !node ||
      !ambient ||
      !overflow ||
      paused ||
      navigating ||
      pressed ||
      gesturePaused ||
      interacting ||
      focused ||
      previews.length ||
      !visible
    )
      return;
    let frame = 0,
      previous = 0;
    let position = rtl ? -node.scrollLeft : node.scrollLeft;
    if (track.current) track.current.style.willChange = "transform";
    const tick = (time: number) => {
      if (!document.hidden && previous) {
        const max = node.scrollWidth - node.clientWidth;
        const offset = position;
        if (offset >= max - 1) travelDirection.current = -1;
        if (offset <= 0) travelDirection.current = 1;
        const next = Math.max(
          0,
          Math.min(
            max,
            offset +
              travelDirection.current * Math.min(time - previous, 50) * 0.014,
          ),
        );
        position = next;
        writeOffset(next);
      }
      previous = time;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      clearMotion();
    };
  }, [
    ambient,
    overflow,
    paused,
    navigating,
    pressed,
    gesturePaused,
    interacting,
    focused,
    previews.length,
    visible,
    rtl,
    writeOffset,
    clearMotion,
  ]);
  const step = (direction: number) => {
    const node = viewport.current;
    if (!node) return;
    cancelAnimationFrame(manualFrame.current);
    clearMotion();
    const start = rtl ? -node.scrollLeft : node.scrollLeft;
    const target = Math.max(
      0,
      Math.min(
        node.scrollWidth - node.clientWidth,
        start + direction * node.clientWidth * 0.8,
      ),
    );
    if (!animatedControls) {
      setNavigating(false);
      node.scrollLeft = rtl ? -target : target;
      return;
    }
    setNavigating(true);
    const began = performance.now();
    if (track.current) track.current.style.willChange = "transform";
    const tick = (time: number) => {
      const progress = Math.min(1, (time - began) / 950);
      const eased =
        progress < 0.5
          ? 2 * progress * progress
          : 1 - (-2 * progress + 2) ** 2 / 2;
      const next = start + (target - start) * eased;
      writeOffset(next);
      if (progress < 1) manualFrame.current = requestAnimationFrame(tick);
      else {
        clearMotion();
        setNavigating(false);
      }
    };
    manualFrame.current = requestAnimationFrame(tick);
  };
  if (!products.length) return null;
  const Previous = rtl ? ArrowRight : ArrowLeft;
  const Next = rtl ? ArrowLeft : ArrowRight;
  const playing = ambient && !paused;
  return (
    <section
      className={styles.section}
      aria-labelledby={titleId}
      dir={rtl ? "rtl" : "ltr"}
      data-related-products
    >
      <div className="miro-container">
        <div className={styles.header}>
          <div className={styles.heading}>
            <p>{rtl ? "ממשיכים לגלות" : "KEEP EXPLORING"}</p>
            <h2 id={titleId}>
              {rtl ? "עוד מוצרים מאותה משפחה" : "More from this collection"}
            </h2>
            <span>
              {rtl
                ? "מוצרים מאותה תת־קטגוריה תחילה, ואחריהם מהקטגוריה הראשית."
                : "Explore the same subcategory first, followed by more from this category."}
            </span>
          </div>
          <Link className={styles.category} href={categoryUrl}>
            {rtl ? "לכל המוצרים ב־" : "Explore "}
            {categoryLabel}
            <Next size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className={styles.toolbar}>
          <span>
            {products.length}{" "}
            {rtl ? "מוצרים להמשך הגילוי" : "products to explore"}
          </span>
          <div className={styles.controls}>
            {overflow && ambient && (
              <button
                type="button"
                aria-controls={viewportId}
                aria-pressed={paused}
                onClick={() => setPaused((value) => !value)}
                aria-label={
                  rtl
                    ? paused
                      ? "הפעלת תנועת המוצרים"
                      : "עצירת תנועת המוצרים"
                    : paused
                      ? "Play related products"
                      : "Pause related products"
                }
              >
                {playing ? (
                  <Pause size={17} aria-hidden="true" />
                ) : (
                  <Play size={17} aria-hidden="true" />
                )}
              </button>
            )}
            <button
              type="button"
              aria-controls={viewportId}
              disabled={!overflow || edges.start}
              onClick={() => step(-1)}
              aria-label={rtl ? "מוצרים קודמים" : "Previous products"}
            >
              <Previous size={19} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-controls={viewportId}
              disabled={!overflow || edges.end}
              onClick={() => step(1)}
              aria-label={rtl ? "מוצרים הבאים" : "Next products"}
            >
              <Next size={19} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div
          id={viewportId}
          ref={viewport}
          className={styles.viewport}
          onScroll={measure}
          onPointerOver={(event) => {
            if (
              event.pointerType === "mouse" &&
              event.target instanceof Element
            )
              setInteracting(
                Boolean(event.target.closest(".sf-moving-rail-card-shell")),
              );
          }}
          onPointerLeave={() => setInteracting(false)}
          onFocusCapture={(event) => {
            if (event.target instanceof Element)
              setFocused(event.target.matches(":focus-visible"));
          }}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              setFocused(false);
          }}
          onPointerDown={() => {
            cancelAnimationFrame(manualFrame.current);
            clearMotion();
            setNavigating(false);
            setPressed(true);
          }}
          onPointerUp={() => {
            setPressed(false);
            pauseForGesture();
          }}
          onPointerCancel={() => {
            setPressed(false);
            pauseForGesture();
          }}
          onWheel={() => {
            cancelAnimationFrame(manualFrame.current);
            clearMotion();
            setNavigating(false);
            pauseForGesture();
          }}
        >
          <ul ref={track} className={styles.track}>
            {products.map((product) => (
              <li key={product.id}>
                <RailProduct
                  product={product}
                  locale={locale}
                  onPreviewChange={onPreviewChange}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
