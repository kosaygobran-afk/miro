"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAnimationSettings } from "./animation-provider";
import { MOTION_EASING } from "@/lib/motion";

/** Animate the routed region; never remount forms, the header or the management shell. */
export function PageReveal() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const route = `${pathname}?${searchParams.toString()}`;
  const previous = useRef(route);
  const settings = useAnimationSettings();
  useEffect(() => {
    if (previous.current === route) return;
    previous.current = route;
    if (
      !settings.enabled ||
      !settings.features.pageReveal ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const target =
      document.querySelector(".mgmt-shell__main") ??
      document.getElementById("main-content");
    const animation = target?.animate(
      [
        {
          opacity: 0.55,
          translate: settings.pageStyle === "lift" ? "0 6px" : "0 0",
        },
        { opacity: 1, translate: "0 0" },
      ],
      {
        duration: settings.durations.page,
        easing: MOTION_EASING[settings.easing],
      },
    );
    return () => animation?.cancel();
  }, [route, settings]);
  return null;
}
