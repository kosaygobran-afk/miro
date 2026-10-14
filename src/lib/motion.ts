import type { CSSProperties } from "react";
import type { AnimationSettings } from "./animation-settings";

export const MOTION_EASING = {
  standard: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  snappy: "cubic-bezier(0.16, 1, 0.3, 1)",
  soft: "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

export function motionAttributes(settings: AnimationSettings) {
  return Object.fromEntries([
    ["data-motion-enabled", String(settings.enabled)],
    ["data-motion-page-style", settings.pageStyle],
    ["data-product-preview-style", settings.productPreviewStyle],
    ["data-appearance-version", settings.appearanceVersion],
    ...Object.entries(settings.features).map(([name, enabled]) => [
      `data-motion-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
      String(settings.enabled && enabled),
    ]),
  ]);
}

/** Preview timing follows the saved controls, with a calmer entrance and brisk exit. */
export function productPreviewTiming(settings: AnimationSettings) {
  if (settings.productPreviewStyle === "3d-pop-up-smooth") {
    return {
      enter: Math.min(
        380,
        Math.max(260, Math.round(settings.durations.dialog * 1.6)),
      ),
      exit: Math.min(
        240,
        Math.max(180, Math.round(settings.durations.content * 1.25)),
      ),
    };
  }
  const soft = settings.productPreviewStyle === "soft-reveal";
  return {
    enter: Math.round(settings.durations.dialog * (soft ? 1.5 : 1)),
    exit: Math.round(settings.durations.content * (soft ? 1.25 : 1)),
  };
}

export function productPreviewHoverDelay(
  settings: AnimationSettings,
  savedDelay: number,
) {
  return settings.productPreviewStyle === "3d-pop-up-smooth"
    ? Math.min(280, Math.max(160, savedDelay))
    : savedDelay;
}

export function motionStyle(settings: AnimationSettings): CSSProperties {
  return {
    ...Object.fromEntries(
      Object.entries(settings.durations).map(([name, duration]) => [
        `--motion-${name}-duration`,
        `${duration}ms`,
      ]),
    ),
    "--motion-preview-enter-duration": `${productPreviewTiming(settings).enter}ms`,
    "--motion-preview-exit-duration": `${productPreviewTiming(settings).exit}ms`,
    "--motion-easing": MOTION_EASING[settings.easing],
  } as CSSProperties;
}
