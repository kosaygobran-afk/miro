"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";
import { useAnimationSettings } from "@/components/motion/animation-provider";
import {
  transitionTheme,
  type ThemeMode,
} from "@/components/motion/theme-transition";
import type { Locale } from "@/lib/i18n";

function subscribe(callback: () => void) {
  window.addEventListener("miro-theme-change", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("miro-theme-change", callback);
    window.removeEventListener("storage", callback);
  };
}

function readTheme(): ThemeMode {
  const theme = document.documentElement.dataset.theme;
  return theme === "light" || theme === "medium" ? theme : "dark";
}

const serverTheme = (): ThemeMode => "dark";

/** One reading order and state contract across storefront and workspaces. */
export function NavigationThemeSelector({
  locale,
  label,
  management = false,
}: {
  locale: Locale;
  label: string;
  management?: boolean;
}) {
  const settings = useAnimationSettings();
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);
  const he = locale === "he";
  const modes = [
    {
      value: "dark",
      icon: Moon,
      label: he ? "מצב כהה — ניגודיות גבוהה" : "Dark theme — high contrast",
    },
    { value: "medium", icon: SunMoon, label: he ? "מצב ביניים" : "Mid theme" },
    { value: "light", icon: Sun, label: he ? "מצב בהיר" : "Light theme" },
  ] as const;

  return (
    <div
      className={
        management ? "mgmt-topbar__theme-selector" : "premium-theme-selector"
      }
      role="group"
      aria-label={label}
      dir="ltr"
      suppressHydrationWarning
    >
      {modes.map(({ value, icon: Icon, label: title }) => (
        <button
          key={value}
          type="button"
          className={management ? "mgmt-topbar__theme-btn" : undefined}
          data-theme-option={value}
          aria-label={title}
          title={title}
          aria-pressed={theme === value}
          onClick={(event) =>
            transitionTheme(value, event.currentTarget, settings)
          }
        >
          <Icon size={management ? 18 : 16} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
