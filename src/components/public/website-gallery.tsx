"use client";

import { playGalleryArrowFeedback } from "@/components/motion/button-feedback";
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
import type {
  WebsiteGalleryImage,
  WebsiteGallerySettings,
} from "@/lib/website-images";
import styles from "./website-gallery.module.css";

type Slide = {
  key: string;
  index: number;
  photo: WebsiteGalleryImage;
  direction: number;
};

type SettledSlide = Slide & { status: "ready" | "failed" };

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
  const outgoingLayer = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [selection, setSelection] = useState({
    index: initialIndex,
    sequence: 0,
    direction: 1,
  });
  const [paused, setPaused] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [inView, setInView] = useState(false);
  const [displayed, setDisplayed] = useState<SettledSlide | null>(null);
  const [outgoing, setOutgoing] = useState<SettledSlide | null>(null);
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
  const index = count ? selection.index % count : 0;
  const photo = gallery.images[index];
  const key = `${selection.sequence}:${index}:${photo?.url ?? ""}`;
  const requested = photo
    ? { key, index, photo, direction: selection.direction }
    : null;
  const [load, setLoad] = useState<{
    key: string;
    status: "loading" | SettledSlide["status"];
  }>({ key, status: "loading" });
  const transition =
    motion && gallery.animation !== "none" ? gallery.animation : null;
  const blending = transition !== null && outgoing !== null;

  // Promote the latest decoded selection after the previous dissolve settles.
  if (load.key !== key) {
    setLoad({ key, status: "loading" });
  } else if (
    requested &&
    displayed?.key !== key &&
    load.status !== "loading" &&
    !blending
  ) {
    setDisplayed({ ...requested, status: load.status });
    setOutgoing(
      transition && load.status === "ready" && displayed?.status === "ready"
        ? displayed
        : null,
    );
  } else if (!transition && outgoing) {
    setOutgoing(null);
  }

  useEffect(() => {
    const layer = outgoingLayer.current;
    if (!blending || !layer) return;
    let active = true;
    void Promise.allSettled(
      layer.getAnimations().map(({ finished }) => finished),
    ).then(() => {
      if (active) setOutgoing(null);
    });
    return () => {
      active = false;
    };
  }, [blending, outgoing, transition]);

  useEffect(() => {
    const element = container.current;
    if (!canRotate || !element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.intersectionRatio >= 0.15),
      { threshold: 0.15 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [canRotate]);

  const settled = displayed?.key === key && !blending;
  useEffect(() => {
    if (
      !canRotate ||
      !inView ||
      !visible ||
      paused ||
      hovered ||
      focused ||
      !settled
    )
      return;
    // Each photo gets its full viewing interval after loading and transition.
    const timer = window.setTimeout(() => {
      setSelection((value) => ({
        index: (value.index + 1) % count,
        sequence: value.sequence + 1,
        direction: 1,
      }));
    }, gallery.interval * 1000);
    return () => window.clearTimeout(timer);
  }, [
    canRotate,
    count,
    focused,
    gallery.interval,
    hovered,
    inView,
    paused,
    settled,
    visible,
  ]);

  if (!requested) return null;
  // Keep the selected node mounted when it moves from loading to visible.
  const shown = displayed?.key === key || !displayed ? requested : displayed;
  const alt = he ? shown.photo.altHe : shown.photo.altEn;
  const Previous = he ? ChevronRight : ChevronLeft;
  const Next = he ? ChevronLeft : ChevronRight;
  const replay = preview && outgoing?.photo.url === shown.photo.url;
  const layers = [
    ...(blending ? [{ slide: outgoing, phase: "outgoing" }] : []),
    { slide: shown, phase: blending ? "incoming" : "current" },
    ...(displayed && displayed.key !== key
      ? [{ slide: requested, phase: "pending" }]
      : []),
  ];

  function move(direction: number) {
    setPaused(true);
    setSelection((value) => ({
      index: (value.index + count + direction) % count,
      sequence: value.sequence + 1,
      direction,
    }));
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
        data-transition={blending ? transition : undefined}
        data-replay={replay || undefined}
        style={{ "--gallery-radius": `${gallery.radius}px` } as CSSProperties}
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
        {displayed?.key === shown.key && displayed.status === "failed" ? (
          <div className={styles.unavailable} role="img" aria-label={alt}>
            <Images size={22} aria-hidden="true" />
            <span aria-hidden="true">
              {he ? "התמונה אינה זמינה" : "Image unavailable"}
            </span>
          </div>
        ) : null}
        {layers.map(({ slide, phase }) => {
          if (displayed?.key === slide.key && displayed.status === "failed")
            return null;
          const image = slide.photo;
          const isRequested = slide.key === key;
          function settle(status: SettledSlide["status"]) {
            setLoad((value) =>
              value.key === slide.key ? { key: slide.key, status } : value,
            );
          }
          return (
            <div
              key={slide.key}
              ref={phase === "outgoing" ? outgoingLayer : undefined}
              className={styles.slide}
              data-phase={phase}
              aria-hidden={
                phase === "pending" || phase === "outgoing" || undefined
              }
              style={
                {
                  "--gallery-focus": `${image.x}% ${image.y}%`,
                  "--gallery-zoom": image.zoom,
                  "--gallery-fit": image.fit,
                  "--gallery-direction": slide.direction,
                } as CSSProperties
              }
            >
              <Image
                src={image.url}
                alt={he ? image.altHe : image.altEn}
                fill
                unoptimized={/^https:/i.test(image.url)}
                sizes="(max-width: 800px) 100vw, (max-width: 1400px) 52vw, 720px"
                loading={phase === "pending" ? "eager" : undefined}
                referrerPolicy="no-referrer"
                onLoad={isRequested ? () => settle("ready") : undefined}
                onError={isRequested ? () => settle("failed") : undefined}
              />
            </div>
          );
        })}
      </div>
      {count > 1 || preview ? (
        <div className={styles.controls}>
          {count > 1 ? (
            <>
              <button
                type="button"
                onClickCapture={playGalleryArrowFeedback}
                onClick={() => move(-1)}
                aria-label={he ? "תמונה קודמת" : "Previous image"}
              >
                <Previous aria-hidden="true" size={19} />
              </button>
              <span aria-hidden="true" dir="ltr">
                {shown.index + 1} / {count}
              </span>
              <button
                type="button"
                onClickCapture={playGalleryArrowFeedback}
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
                  ? `תמונה ${shown.index + 1} מתוך ${count}`
                  : `Image ${shown.index + 1} of ${count}`}
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
              onClick={() =>
                count > 1
                  ? move(1)
                  : setSelection((value) => ({
                      ...value,
                      sequence: value.sequence + 1,
                    }))
              }
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
