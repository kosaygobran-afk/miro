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
    ["data-appearance-version", settings.appearanceVersion],
    ...Object.entries(settings.features).map(([name, enabled]) => [
      `data-motion-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
      String(settings.enabled && enabled),
    ]),
  ]);
}

export function motionStyle(settings: AnimationSettings): CSSProperties {
  return {
    ...Object.fromEntries(
      Object.entries(settings.durations).map(([name, duration]) => [
        `--motion-${name}-duration`,
        `${duration}ms`,
      ]),
    ),
    "--motion-easing": MOTION_EASING[settings.easing],
  } as CSSProperties;
}
