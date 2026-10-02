"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Native content scrolling plus a visible, keyboard-operable top control. */
export function ScrollRegion({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLInputElement>(null);
  const [scrollMax, setScrollMax] = useState(0);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => {
      const overflow = content.scrollWidth - content.clientWidth;
      setScrollMax(overflow > 1 ? overflow : 0);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    if (content.firstElementChild) observer.observe(content.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, [children]);

  // Preserve the position when columns resize or the upper control reappears.
  useEffect(() => {
    if (railRef.current && contentRef.current) {
      railRef.current.value = String(Math.abs(contentRef.current.scrollLeft));
    }
  }, [scrollMax]);

  return (
    <div
      className={["mgmt-scroll-region", className].filter(Boolean).join(" ")}
    >
      {scrollMax > 0 ? (
        <div className="mgmt-scroll-region__rail">
          <input
            ref={railRef}
            className="mgmt-scroll-region__slider"
            type="range"
            min={0}
            max={scrollMax}
            defaultValue={0}
            aria-label={label ?? "Horizontal scroll"}
            onChange={(event) => {
              const content = contentRef.current;
              if (content) {
                const direction =
                  getComputedStyle(content).direction === "rtl" ? -1 : 1;
                content.scrollLeft =
                  direction * Number(event.currentTarget.value);
              }
            }}
          />
        </div>
      ) : null}
      <div
        ref={contentRef}
        className="mgmt-scroll-region__content"
        role="region"
        tabIndex={0}
        aria-label={label}
        onScroll={(event) => {
          if (railRef.current) {
            railRef.current.value = String(
              Math.abs(event.currentTarget.scrollLeft),
            );
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
