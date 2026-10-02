"use client";
import { useSyncExternalStore } from "react";
const query = "(prefers-reduced-motion: reduce)";
function subscribe(cb: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", cb);
  return () => media.removeEventListener("change", cb);
}
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => true,
  );
}
