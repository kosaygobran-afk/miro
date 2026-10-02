"use client";

import type { AnimationSettings } from "@/lib/animation-settings";
import { MOTION_EASING } from "@/lib/motion";

export type ThemeMode = "dark" | "medium" | "light";
let requestId = 0;
let activeTransition: ViewTransition | undefined;
let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

export function finishThemeTransition() {
  activeTransition?.skipTransition();
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("miro-theme", theme);
  } catch {
    /* Storage is optional. */
  }
  window.dispatchEvent(new Event("miro-theme-change"));
}

/** The button's current viewport rectangle works for keyboard, mobile and portaled controls. */
export function transitionTheme(
  theme: ThemeMode,
  button: HTMLElement,
  settings: AnimationSettings,
) {
  const id = ++requestId;
  activeTransition?.skipTransition();
  clearTimeout(fallbackTimer);
  const root = document.documentElement;
  delete root.dataset.motionThemeFallback;
  delete root.dataset.motionThemeTransition;
  if (root.dataset.theme === theme) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (settings.enabled && settings.features.themeIcon && !reduced) {
    button.querySelector("svg")?.animate(
      [
        { transform: "rotate(-18deg) scale(0.9)", opacity: 0.65 },
        { transform: "rotate(0deg) scale(1)", opacity: 1 },
      ],
      {
        duration: settings.durations.icon,
        easing: MOTION_EASING[settings.easing],
      },
    );
  }
  if (!settings.enabled || !settings.features.themeReveal || reduced) {
    applyTheme(theme);
    return;
  }
  if (typeof document.startViewTransition !== "function") {
    root.dataset.motionThemeFallback = "true";
    applyTheme(theme);
    fallbackTimer = setTimeout(
      () => delete root.dataset.motionThemeFallback,
      160,
    );
    return;
  }
  const rect = button.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  // The furthest corner determines a radius that covers every pixel, even at viewport edges.
  const radius = Math.hypot(
    Math.max(x, innerWidth - x),
    Math.max(y, innerHeight - y),
  );
  root.dataset.motionThemeTransition = "true";
  root.style.setProperty("--motion-theme-origin-x", `${x}px`);
  root.style.setProperty("--motion-theme-origin-y", `${y}px`);
  let transition: ViewTransition;
  try {
    transition = document.startViewTransition(() => {
      // A skipped transition still calls its update: only the latest click may change the theme.
      if (id === requestId) applyTheme(theme);
    });
  } catch {
    applyTheme(theme);
    delete root.dataset.motionThemeTransition;
    return;
  }
  activeTransition = transition;
  void transition.ready
    .then(() => {
      if (id !== requestId) return;
      const frames =
        settings.themeStyle === "radial"
          ? [
              { clipPath: `circle(0px at ${x}px ${y}px)` },
              { clipPath: `circle(${radius}px at ${x}px ${y}px)` },
            ]
          : [{ opacity: 0 }, { opacity: 1 }];
      root.animate(frames, {
        duration: settings.durations.theme,
        easing: MOTION_EASING[settings.easing],
        pseudoElement: "::view-transition-new(root)",
        fill: "both",
      });
    })
    .catch(() => {
      transition.skipTransition();
    });
  void transition.finished
    .catch(() => {})
    .finally(() => {
      if (id === requestId) {
        delete root.dataset.motionThemeTransition;
        activeTransition = undefined;
      }
    });
}
