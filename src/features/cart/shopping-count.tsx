"use client";

import { useLayoutEffect, useRef } from "react";
import { playButtonFeedback } from "@/components/motion/button-feedback";

export function ShoppingCount({
  value,
  className,
  badge = false,
  cap,
}: {
  value: number | null;
  className?: string;
  badge?: boolean;
  cap?: number;
}) {
  const span = useRef<HTMLSpanElement>(null);
  const previous = useRef(value);
  useLayoutEffect(() => {
    if (previous.current !== null && previous.current !== value) {
      playButtonFeedback(span.current, "count");
    }
    previous.current = value;
  }, [value]);

  if (value === null || (badge && value === 0)) return null;
  return (
    <span
      ref={span}
      className={className}
      aria-hidden={badge || undefined}
      dir="ltr"
    >
      {cap !== undefined && value > cap ? `${cap}+` : value}
    </span>
  );
}
