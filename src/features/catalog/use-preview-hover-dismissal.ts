"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

// A wide portal can cover another card. Removing it must not interpret the
// stationary cursor exposed underneath as new intent on that neighboring card.
let stationaryDismissalPoint: { x: number; y: number } | null | undefined;
let stationaryDismissalOwner: RefObject<HTMLElement | null> | null = null;

function releaseStationaryDismissal(event: PointerEvent) {
  if (
    stationaryDismissalPoint &&
    stationaryDismissalPoint.x === event.clientX &&
    stationaryDismissalPoint.y === event.clientY
  )
    return;
  stationaryDismissalPoint = undefined;
  stationaryDismissalOwner = null;
  document.removeEventListener("pointermove", releaseStationaryDismissal, true);
}

/** Suppress only an explicit dismissal until the pointer leaves the source. */
export function usePreviewHoverDismissal(
  triggerRef: RefObject<HTMLElement | null>,
) {
  const dismissedRef = useRef(false);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const trackPointer = useCallback((event: ReactPointerEvent) => {
    pointerRef.current = { x: event.clientX, y: event.clientY };
  }, []);
  const checkPointer = useCallback(
    function checkPointer(event: PointerEvent) {
      const box = triggerRef.current?.getBoundingClientRect();
      if (
        box &&
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom
      )
        return;
      dismissedRef.current = false;
      document.removeEventListener("pointermove", checkPointer);
    },
    [triggerRef],
  );
  const clearDismissal = useCallback(() => {
    dismissedRef.current = false;
    document.removeEventListener("pointermove", checkPointer);
  }, [checkPointer]);
  const dismissHover = useCallback(
    (explicit: boolean) => {
      clearDismissal();
      if (!explicit) return;
      const point = pointerRef.current;
      stationaryDismissalPoint = point;
      stationaryDismissalOwner = triggerRef;
      // Observe movement outside every card too, so returning to the exact
      // dismissal pixel is still a fresh interaction after leaving it.
      document.addEventListener("pointermove", releaseStationaryDismissal, {
        passive: true,
        capture: true,
      });
      const box = triggerRef.current?.getBoundingClientRect();
      if (
        point &&
        box &&
        (point.x < box.left ||
          point.x > box.right ||
          point.y < box.top ||
          point.y > box.bottom)
      )
        return;
      dismissedRef.current = true;
      // Portal events do not necessarily leave the source in React's tree.
      // Real pointer coordinates release the guard even while it owns hover.
      document.addEventListener("pointermove", checkPointer, { passive: true });
    },
    [checkPointer, clearDismissal, triggerRef],
  );

  useEffect(
    () => () => {
      clearDismissal();
      if (stationaryDismissalOwner === triggerRef) {
        stationaryDismissalPoint = undefined;
        stationaryDismissalOwner = null;
        document.removeEventListener(
          "pointermove",
          releaseStationaryDismissal,
          true,
        );
      }
    },
    [clearDismissal, triggerRef],
  );

  // Only a real pointermove releases global suppression. Mouse compatibility
  // events round coordinates and portal removal can emit mouseover by itself.
  const canHover = useCallback(
    () => stationaryDismissalPoint === undefined && !dismissedRef.current,
    [],
  );

  return { canHover, dismissHover, clearDismissal, trackPointer };
}
