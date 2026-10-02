"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import {
  DEFAULT_ANIMATION_SETTINGS,
  parseAnimationSettings,
  type AnimationSettings,
} from "@/lib/animation-settings";
import { motionAttributes, motionStyle } from "@/lib/motion";
import { useReducedMotion } from "@/features/store-design/use-reduced-motion";
import { finishThemeTransition } from "./theme-transition";

const AnimationContext = createContext(DEFAULT_ANIMATION_SETTINGS);

export function AnimationProvider({
  settings,
  children,
}: {
  settings: AnimationSettings;
  children: React.ReactNode;
}) {
  const [saved, setSaved] = useState<{
    base: AnimationSettings;
    value: AnimationSettings;
  } | null>(null);
  const current = saved?.base === settings ? saved.value : settings;
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const root = document.documentElement;
    Object.entries(motionAttributes(current)).forEach(([name, value]) =>
      root.setAttribute(name, String(value)),
    );
    Object.entries(motionStyle(current)).forEach(([name, value]) =>
      root.style.setProperty(name, String(value)),
    );
    if (reduced || !current.enabled || !current.features.themeReveal)
      finishThemeTransition();
    if (reduced || !current.enabled || !current.features.themeIcon) {
      document
        .querySelectorAll("[data-theme-option] svg")
        .forEach((icon) =>
          icon.getAnimations().forEach((animation) => animation.cancel()),
        );
    }
  }, [current, reduced]);

  useEffect(() => {
    const channel =
      typeof BroadcastChannel === "function"
        ? new BroadcastChannel("miro-animation-settings")
        : null;
    const onLocalChange = (event: Event) => {
      const next = parseAnimationSettings((event as CustomEvent).detail);
      setSaved({ base: settings, value: next });
      channel?.postMessage(next);
    };
    if (channel)
      channel.onmessage = (event) =>
        setSaved({ base: settings, value: parseAnimationSettings(event.data) });
    window.addEventListener("miro-animation-settings-change", onLocalChange);
    document.documentElement.dataset.motionReady = "true";
    return () => {
      window.removeEventListener(
        "miro-animation-settings-change",
        onLocalChange,
      );
      channel?.close();
      delete document.documentElement.dataset.motionReady;
    };
  }, [settings]);

  return (
    <AnimationContext.Provider value={current}>
      {children}
    </AnimationContext.Provider>
  );
}

export function useAnimationSettings() {
  return useContext(AnimationContext);
}
export function useAnimationFeature(
  feature: keyof AnimationSettings["features"],
) {
  const settings = useAnimationSettings();
  const reduced = useReducedMotion();
  return settings.enabled && settings.features[feature] && !reduced;
}
