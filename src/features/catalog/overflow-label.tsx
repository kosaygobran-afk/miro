"use client";
import { useAnimationFeature } from "@/components/motion/animation-provider";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useReducedMotion } from "@/features/store-design/use-reduced-motion";
/** Display text only: never use around inputs, editable fields or textareas. */
export function OverflowLabel({ children }: { children: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [measurement, setMeasurement] = useState({ distance: 0, width: 0 });
  const reduced = useReducedMotion();
  useEffect(() => {
    const container = ref.current,
      label = textRef.current;
    if (!container || !label) return;
    const measure = () =>
      setMeasurement({
        distance: Math.max(0, label.scrollWidth - container.clientWidth),
        width: label.scrollWidth,
      });
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(label);
    const frame = requestAnimationFrame(measure);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [children]);
  const railsEnabled = useAnimationFeature("textRails");
  const moving = measurement.distance > 2 && !reduced && railsEnabled;
  const firstLetter = children.match(/[A-Za-z\u0590-\u08ff]/)?.[0] ?? "A";
  const direction = /[\u0590-\u08ff]/.test(firstLetter) ? "rtl" : "ltr";
  return (
    <span
      ref={ref}
      className="sf-overflow-label"
      data-overflow={moving || undefined}
      dir={direction}
      title={children}
      style={
        {
          "--sf-label-duration": `${Math.max(6, (measurement.width + 32) / 25)}s`,
        } as CSSProperties
      }
    >
      <span className="sf-label-track">
        <span className="sf-label-copy">
          <span ref={textRef}>{children}</span>
        </span>
        {moving ? (
          <span className="sf-label-copy" aria-hidden="true">
            {children}
          </span>
        ) : null}
      </span>
    </span>
  );
}
