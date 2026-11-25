"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Images,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import Image from "next/image";
import { useAnimationSettings } from "@/components/motion/animation-provider";
import { useReducedMotion } from "@/features/store-design/use-reduced-motion";
import type { Locale } from "@/lib/i18n";
import type { WebsiteGallerySettings } from "@/lib/website-images";
import styles from "./website-gallery.module.css";

function subscribeVisibility(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}

export function WebsiteGallery({
  gallery,
  locale,
  preview = false,
  initialIndex = 0,
}: {
  gallery: WebsiteGallerySettings;
  locale: Locale;
  preview?: boolean;
  initialIndex?: number;
}) {
  const he = locale === "he";
  const container = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [index, setIndex] = useState(initialIndex);
  const [sequence, setSequence] = useState(0);
  const [paused, setPaused] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [inView, setInView] = useState(false);
  const [loaded, setLoaded] = useState("");
  const [failed, setFailed] = useState("");
  const settings = useAnimationSettings();
  const reducedMotion = useReducedMotion();
  const motion =
    !reducedMotion &&
    (preview || (settings.enabled && settings.features.ambientMotion));
  const visible = useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => false,
  );
  const count = gallery.images.length;
  const canRotate = !preview && count > 1 && gallery.autoplay && motion;
  const current = count ? index % count : 0;
  const photo = gallery.images[current];
  const slideKey = `${sequence}:${current}:${photo?.url ?? ""}`;

  useEffect(() => {
    const element = container.current;
    if (!canRotate || !element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.15 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [canRotate]);

  useEffect(() => {
    if (!canRotate || !inView || !visible || paused || hovered || focused)
      return;
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % count);
      setSequence((value) => value + 1);
    }, gallery.interval * 1000);
    return () => window.clearInterval(timer);
  }, [
    canRotate,
    count,
    focused,
    gallery.interval,
    hovered,
    inView,
    paused,
    visible,
  ]);

  if (!photo) return null;
  const alt = he ? photo.altHe : photo.altEn;
  const Previous = he ? ChevronRight : ChevronLeft;
  const Next = he ? ChevronLeft : ChevronRight;
  const animate = motion && sequence > 0 && loaded === slideKey;

  function move(direction: number) {
    setPaused(true);
    setIndex((value) => (value + count + direction) % count);
    setSequence((value) => value + 1);
  }

  return (
    <div
      ref={container}
      className={styles.gallery}
      dir={he ? "rtl" : "ltr"}
      role="group"
      aria-label={he ? "גלריית תמונות" : "Photo gallery"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <div
        className={styles.frame}
        data-effect={gallery.effect}
        style={
          {
            "--gallery-radius": `${gallery.radius}px`,
            "--gallery-border": `${gallery.border}px`,
            "--gallery-focus": `${photo.x}% ${photo.y}%`,
            "--gallery-zoom": photo.zoom,
            "--gallery-fit": photo.fit,
          } as CSSProperties
        }
        onTouchStart={(event) => {
          const point = event.touches[0];
          touchStart.current =
            event.touches.length === 1 && point
              ? { x: point.clientX, y: point.clientY }
              : null;
        }}
        onTouchCancel={() => {
          touchStart.current = null;
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          touchStart.current = null;
          const point = event.changedTouches[0];
          if (!start || !point || count < 2 || event.touches.length) return;
          const dx = point.clientX - start.x;
          if (
            Math.abs(dx) < 48 ||
            Math.abs(dx) <= Math.abs(point.clientY - start.y) * 1.3
          )
            return;
          move(dx < 0 !== he ? 1 : -1);
        }}
      >
        {failed === slideKey ? (
          <div className={styles.unavailable} role="img" aria-label={alt}>
            <Images size={22} aria-hidden="true" />
            <span aria-hidden="true">
              {he ? "התמונה אינה זמינה" : "Image unavailable"}
            </span>
          </div>
        ) : (
          <div
            key={slideKey}
            className={styles.slide}
            data-transition={animate ? gallery.animation : undefined}
          >
            <Image
              src={photo.url}
              alt={alt}
              fill
              unoptimized={/^https:/i.test(photo.url)}
              sizes="(max-width: 800px) 100vw, (max-width: 1400px) 52vw, 720px"
              referrerPolicy="no-referrer"
              onLoad={() => setLoaded(slideKey)}
              onError={() => setFailed(slideKey)}
            />
          </div>
        )}
      </div>
      {count > 1 || preview ? (
        <div className={styles.controls}>
          {count > 1 ? (
            <>
              <button
                type="button"
                onClick={() => move(-1)}
                aria-label={he ? "תמונה קודמת" : "Previous image"}
              >
                <Previous aria-hidden="true" size={19} />
              </button>
              <span aria-hidden="true" dir="ltr">
                {current + 1} / {count}
              </span>
              <button
                type="button"
                onClick={() => move(1)}
                aria-label={he ? "תמונה הבאה" : "Next image"}
              >
                <Next aria-hidden="true" size={19} />
              </button>
              <span
                className={styles.status}
                aria-live={canRotate && !paused ? "off" : "polite"}
              >
                {he
                  ? `תמונה ${current + 1} מתוך ${count}`
                  : `Image ${current + 1} of ${count}`}
                . {alt}
              </span>
            </>
          ) : null}
          {canRotate ? (
            <button
              type="button"
              onClick={() => setPaused((value) => !value)}
              aria-label={
                paused
                  ? he
                    ? "הפעלת גלריה"
                    : "Play slideshow"
                  : he
                    ? "השהיית גלריה"
                    : "Pause slideshow"
              }
            >
              {paused ? (
                <Play aria-hidden="true" size={17} />
              ) : (
                <Pause aria-hidden="true" size={17} />
              )}
            </button>
          ) : null}
          {preview ? (
            <button
              type="button"
              onClick={() => setSequence((value) => value + 1)}
            >
              <RotateCcw aria-hidden="true" size={16} />
              {he ? "בדיקת הנפשה" : "Test animation"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
