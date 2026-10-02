"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAnimationSettings } from "./animation-provider";

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const route = `${pathname}?${searchParams.toString()}`;
  const currentRoute = useRef(route);
  const beamRef = useRef<HTMLDivElement>(null);
  const control = useRef<{
    finish: () => void;
    start: (href?: string) => void;
  } | null>(null);
  const settings = useAnimationSettings();
  const enabled = settings.enabled && settings.features.navigationProgress;
  const duration = settings.durations.navigation;

  useEffect(() => {
    const beam = beamRef.current;
    if (!beam) return;
    let active = false;
    let committed = false;
    let progress = 0;
    let generation = 0;
    let tick: ReturnType<typeof setInterval> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let hide: ReturnType<typeof setTimeout> | undefined;
    let checkFrame = 0;
    const clear = () => {
      clearInterval(tick);
      clearTimeout(timeout);
      clearTimeout(hide);
    };
    const finish = () => {
      if (!active) return;
      active = false;
      clear();
      beam.dataset.state = "complete";
      beam.style.setProperty("--motion-progress", "1");
      hide = setTimeout(() => {
        beam.dataset.state = "idle";
      }, duration);
    };
    const check = () => {
      if (!active || !committed) return;
      cancelAnimationFrame(checkFrame);
      checkFrame = requestAnimationFrame(() => {
        const content = document.getElementById("main-content");
        if (
          active &&
          committed &&
          // A streamed route can commit its URL before even its fallback mounts.
          // Wait for actual routed elements, then for their pending regions to settle.
          (!content || content.childElementCount > 0) &&
          !document.querySelector('[data-route-loading="true"]')
        )
          finish();
      });
    };
    const start = (href?: string) => {
      if (!enabled) return;
      if (href) {
        const url = new URL(href, location.href);
        if (
          `${url.pathname}?${url.searchParams.toString()}` ===
          currentRoute.current
        ) {
          // Returning to the current route cancels any superseded pending destination.
          active = false;
          generation++;
          clear();
          beam.dataset.state = "idle";
          return;
        }
      }
      clear();
      generation++;
      active = true;
      committed = false;
      progress = 0.12;
      const light = beam.firstElementChild as HTMLElement | null;
      // Reset the previous completed streak before showing it; a new trip must not shrink from 100%.
      if (light) light.style.transition = "none";
      beam.style.setProperty("--motion-progress", String(progress));
      light?.getBoundingClientRect();
      light?.style.removeProperty("transition");
      beam.dataset.state = "loading";
      tick = setInterval(() => {
        progress += (0.92 - progress) * 0.16;
        beam.style.setProperty("--motion-progress", String(progress));
      }, 240);
      // This is a UI cancellation guard, never a claim that a failed/stalled request succeeded.
      const started = generation;
      timeout = setTimeout(() => {
        if (started !== generation) return;
        active = false;
        clear();
        beam.dataset.state = "idle";
      }, 20000);
    };
    control.current = {
      start,
      finish: () => {
        committed = true;
        check();
      },
    };
    const click = (event: MouseEvent) => {
      if (
        event.button ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(target instanceof HTMLAnchorElement) ||
        target.download ||
        (target.target && target.target !== "_self") ||
        target.getAttribute("aria-disabled") === "true"
      )
        return;
      if (target.dataset.motionLink) return;
      const url = new URL(target.href, location.href);
      if (
        url.origin === location.origin &&
        /^\/(he|en)(\/|$)/.test(url.pathname)
      ) {
        queueMicrotask(() => {
          if (!event.defaultPrevented) start(url.href);
        });
      }
    };
    const onStart = (event: Event) =>
      start((event as CustomEvent<{ href?: string }>).detail?.href);
    const onPop = () => {
      start(location.href);
    };
    const onSubmit = (event: SubmitEvent) => {
      if (
        event.target instanceof HTMLFormElement &&
        event.target.method.toLowerCase() === "get"
      ) {
        const form = event.target;
        const url = new URL(form.action, location.href);
        const fields = new URLSearchParams();
        new FormData(form, event.submitter).forEach((value, key) => {
          if (typeof value === "string") fields.append(key, value);
        });
        url.search = fields.toString();
        queueMicrotask(() => {
          if (!event.defaultPrevented && url.origin === location.origin)
            start(url.href);
        });
      }
    };
    const observer = new MutationObserver(check);
    observer.observe(document.getElementById("main-content") ?? document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-route-loading"],
    });
    document.addEventListener("click", click, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("popstate", onPop, true);
    window.addEventListener("miro-navigation-start", onStart);
    window.addEventListener("miro-navigation-end", finish);
    window.addEventListener("pagehide", finish);
    beam.dataset.ready = "true";
    return () => {
      clear();
      cancelAnimationFrame(checkFrame);
      observer.disconnect();
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("popstate", onPop, true);
      window.removeEventListener("miro-navigation-start", onStart);
      window.removeEventListener("miro-navigation-end", finish);
      window.removeEventListener("pagehide", finish);
      beam.dataset.state = "idle";
      delete beam.dataset.ready;
      control.current = null;
    };
    // New server payloads can contain an equivalent settings object. Only changes to
    // the beam controls should replace its listeners and cancel an in-flight trip.
  }, [enabled, duration]);

  useEffect(() => {
    if (currentRoute.current === route) return;
    currentRoute.current = route;
    control.current?.finish();
  }, [route]);

  return (
    <div
      ref={beamRef}
      className="motion-navigation-progress"
      data-state="idle"
      aria-hidden="true"
    >
      <span />
    </div>
  );
}
