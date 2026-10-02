"use client";
import { useAnimationFeature } from "@/components/motion/animation-provider";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { useStoreDesign } from "./design-context";
import { useReducedMotion } from "./use-reduced-motion";
function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}
export function StoreHeroBackdrop({ locale }: { locale: "he" | "en" }) {
  const { hero } = useStoreDesign();
  const slides = hero.slides.filter((slide) => slide.enabled);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [focused, setFocused] = useState(false);
  const ambientMotion = useAnimationFeature("ambientMotion");
  const reduceMotion = useReducedMotion() || !ambientMotion;
  const visible = useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => true,
  );
  const current = index % slides.length;
  const canRotate = hero.enabled && slides.length > 1;
  useEffect(() => {
    if (!canRotate || paused || focused || reduceMotion || !visible) return;
    const timer = window.setInterval(
      () => setIndex((i) => (i + 1) % slides.length),
      hero.intervalSeconds * 1000,
    );
    return () => window.clearInterval(timer);
  }, [
    canRotate,
    paused,
    focused,
    reduceMotion,
    visible,
    hero.intervalSeconds,
    slides.length,
  ]);
  const he = locale === "he";
  const Previous = he ? ChevronRight : ChevronLeft;
  const Next = he ? ChevronLeft : ChevronRight;
  return (
    <>
      <div
        className="sf-hero-image sf-hero-slideshow"
        data-transition={reduceMotion ? "none" : hero.transition}
        style={
          { "--sf-slide-duration": `${hero.transitionMs}ms` } as CSSProperties
        }
        aria-hidden="true"
      >
        {slides.map((slide, i) => (
          <div
            key={slide.id}
            className="sf-hero-slide"
            data-active={i === current}
          >
            <Image
              src={slide.imageUrl}
              alt=""
              fill
              sizes="100vw"
              preload={i === 0}
              unoptimized={slide.imageUrl.endsWith(".svg")}
            />
          </div>
        ))}
      </div>
      {canRotate ? (
        <div
          className="sf-hero-controls"
          onFocusCapture={() => setFocused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              setFocused(false);
          }}
        >
          <button
            type="button"
            onClick={() => {
              setIndex((i) => (i + slides.length - 1) % slides.length);
              setPaused(true);
            }}
            aria-label={he ? "רקע קודם" : "Previous background"}
          >
            <Previous size={17} />
          </button>
          <span dir="ltr" aria-label={he ? "מספר רקע" : "Background number"}>
            {String(current + 1).padStart(2, "0")}{" "}
            <small>/ {String(slides.length).padStart(2, "0")}</small>
          </span>
          <button
            type="button"
            onClick={() => {
              setIndex((i) => (i + 1) % slides.length);
              setPaused(true);
            }}
            aria-label={he ? "רקע הבא" : "Next background"}
          >
            <Next size={17} />
          </button>
          {!reduceMotion ? (
            <button
              type="button"
              aria-pressed={paused}
              onClick={() => setPaused((p) => !p)}
              aria-label={
                paused
                  ? he
                    ? "הפעלת הרקעים"
                    : "Play backgrounds"
                  : he
                    ? "עצירת הרקעים"
                    : "Pause backgrounds"
              }
            >
              {paused ? <Play size={15} /> : <Pause size={15} />}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
