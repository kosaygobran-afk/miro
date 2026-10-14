"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useAnimationSettings } from "./animation-provider";
import { useReducedMotion } from "@/features/store-design/use-reduced-motion";
import { parseCountableNumber } from "@/lib/number-counting";

/** A brief display effect; the exact result is present for assistive technology throughout. */
export function AnimatedNumber({ value }: { value: number | string }) {
  const text = String(value);
  const display = useRef<HTMLSpanElement>(null);
  const root = useRef<HTMLSpanElement>(null);
  const pathname = usePathname();
  const settings = useAnimationSettings();
  const reduced = useReducedMotion();
  const enabled =
    settings.enabled && settings.features.contentReveal && !reduced;
  const duration = Math.min(400, settings.durations.content * 2);

  useEffect(() => {
    const element = display.current;
    const wrapper = root.current;
    if (!element || !wrapper) return;
    element.textContent = text;
    element.style.removeProperty("min-width");
    wrapper.dataset.counting = "settled";
    const count = parseCountableNumber(text);
    if (!enabled || !count || count.value === 0) return;

    // Reserve the final value's width so counting does not move the surrounding label.
    element.style.minWidth = `${element.getBoundingClientRect().width}px`;
    element.textContent = count.format(0);
    wrapper.dataset.counting = "running";
    const started = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - started) / duration));
      element.textContent = count.format(progress);
      if (progress < 1) frame = requestAnimationFrame(step);
      else wrapper.dataset.counting = "settled";
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      element.textContent = text;
      wrapper.dataset.counting = "settled";
    };
  }, [text, pathname, enabled, duration]);

  return (
    <span
      ref={root}
      data-count-target={text}
      data-counting="settled"
      style={{ position: "relative", fontVariantNumeric: "tabular-nums" }}
    >
      <span
        ref={display}
        data-count-display="true"
        aria-hidden="true"
        style={{ display: "inline-block", fontSize: "inherit", opacity: 1 }}
      >
        {text}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

/** Retain a caller's direction/formatting wrapper; composite values stay unchanged. */
export function AnimatedMetricValue({
  value,
}: {
  value: ReactNode;
}): ReactNode {
  if (typeof value === "number" || typeof value === "string")
    return parseCountableNumber(String(value)) ? (
      <AnimatedNumber value={value} />
    ) : (
      value
    );
  if (
    isValidElement<{ children?: ReactNode }>(value) &&
    typeof value.type === "string" &&
    ["span", "strong", "b", "em", "small"].includes(value.type)
  ) {
    const child = value.props.children;
    if (typeof child === "number" || typeof child === "string")
      return cloneElement(value, {
        children: <AnimatedMetricValue value={child} />,
      });
  }
  return value;
}
