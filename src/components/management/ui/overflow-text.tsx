"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/** Keep identifiers intact; reveal only genuinely clipped text at reading speed. */
export function OverflowText({
  text,
  dir = "auto",
  className,
  focusable = true,
}: {
  text: string;
  dir?: "auto" | "ltr" | "rtl";
  className?: string;
  focusable?: boolean;
}) {
  const viewport = useRef<HTMLSpanElement>(null);
  const content = useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const [rtl, setRtl] = useState(false);
  useEffect(() => {
    const element = viewport.current;
    const inner = content.current;
    if (!element || !inner) return;
    const measure = () => {
      setDistance(Math.max(0, inner.scrollWidth - element.clientWidth));
      setTextWidth(inner.scrollWidth);
      setRtl(getComputedStyle(element).direction === "rtl");
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(inner);
    measure();
    return () => observer.disconnect();
  }, [text, dir]);
  const style = {
    "--text-travel": `${textWidth + 32}px`,
    "--text-end": `${(rtl ? 1 : -1) * (textWidth + 32)}px`,
    "--text-duration": `${Math.max(8, (textWidth + 32) / 28)}s`,
  } as CSSProperties;
  return (
    <span
      ref={viewport}
      dir={dir}
      title={text}
      className={["mgmt-overflow-text", className].filter(Boolean).join(" ")}
      data-overflow={distance > 1 || undefined}
      style={style}
      tabIndex={distance > 1 && focusable ? 0 : undefined}
    >
      <span className="mgmt-overflow-text__content">
        <span ref={content}>{text}</span>
        {distance > 1 ? (
          <span className="mgmt-overflow-text__copy" aria-hidden="true">
            {text}
          </span>
        ) : null}
      </span>
    </span>
  );
}
