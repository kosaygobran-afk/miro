"use client";

/** Call before imperative push/replace; ordinary internal links are detected centrally. */
export function beginNavigation(href?: string) {
  window.dispatchEvent(
    new CustomEvent("miro-navigation-start", { detail: { href } }),
  );
}
export function endNavigation() {
  window.dispatchEvent(new Event("miro-navigation-end"));
}
