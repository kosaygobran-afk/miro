"use client";

import { useServerInsertedHTML } from "next/navigation";

const themeBootstrapScript =
  "(()=>{try{const k='miro-theme';const themes=['dark','medium','light'];const saved=localStorage.getItem(k);const prefersDark=matchMedia('(prefers-color-scheme: dark)').matches;const prefersLight=matchMedia('(prefers-color-scheme: light)').matches;const preferred=saved&&themes.includes(saved)?saved:(prefersDark?'dark':(prefersLight?'light':'medium'));document.documentElement.dataset.theme=preferred;}catch{document.documentElement.dataset.theme='dark';}})();";

export function ThemeBootstrap() {
  useServerInsertedHTML(() => (
    <script
      id="miro-theme-bootstrap"
      dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
    />
  ));

  return null;
}
