"use client";

import { useLayoutEffect } from "react";
import { useServerInsertedHTML } from "next/navigation";
import {
  restoreTheme,
  THEME_MODES,
  THEME_STORAGE_KEY,
} from "@/components/motion/theme-transition";

const themeBootstrapScript = `
  (() => {
    try {
      const saved = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
      const modes = ${JSON.stringify(THEME_MODES)};
      const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
      const prefersLight = matchMedia("(prefers-color-scheme: light)").matches;
      document.documentElement.dataset.theme = modes.includes(saved)
        ? saved
        : prefersDark ? "dark" : prefersLight ? "light" : "medium";
    } catch {
      document.documentElement.dataset.theme = "dark";
    }
  })();
`;

export function ThemeBootstrap({ nonce }: { nonce?: string }) {
  // Next can replace the root element's attributes during a locale change
  // while staying in the same document, where the initial script won't run.
  useLayoutEffect(restoreTheme, []);

  useServerInsertedHTML(() => (
    <script
      id="miro-theme-bootstrap"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
    />
  ));

  return null;
}
