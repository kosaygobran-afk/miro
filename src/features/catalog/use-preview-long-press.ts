"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";

const HOLD_MS = 500;
const MOVE_TOLERANCE = 10;

type Gesture = {
  id: number;
  x: number;
  y: number;
  fired: boolean;
};

/** Add a touch/pen preview gesture without replacing taps, scroll or pinch. */
export function usePreviewLongPress(
  sourceRef: RefObject<HTMLElement | null>,
  onOpen: () => void,
) {
  const [isPressing, setIsPressing] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const guardCleanupRef = useRef<(() => void) | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const openRef = useRef(onOpen);
  useEffect(() => {
    openRef.current = onOpen;
  }, [onOpen]);

  const cancel = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    gestureRef.current = null;
    setIsPressing(false);
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const source = sourceRef.current;
      if (
        !source?.contains(event.target as Node) ||
        !["touch", "pen"].includes(event.pointerType) ||
        event.button !== 0 ||
        !event.isPrimary ||
        (event.target instanceof Element &&
          event.target.closest(
            "button, input, select, textarea, [role=button]",
          ))
      )
        return;
      cancel();
      guardCleanupRef.current?.();
      const gesture: Gesture = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        fired: false,
      };
      gestureRef.current = gesture;
      setIsPressing(true);
      let guardTimer: ReturnType<typeof setTimeout> | null = null;
      const clearGuard = () => {
        if (guardTimer) clearTimeout(guardTimer);
        document.removeEventListener("click", blockReleaseClick, true);
        document.removeEventListener("contextmenu", blockHeldContextMenu, true);
        document.removeEventListener("pointerup", endReleaseGuard);
        document.removeEventListener("pointercancel", endReleaseGuard);
        document.removeEventListener("pointerdown", clearGuardOnNewPress, true);
        if (guardCleanupRef.current === clearGuard)
          guardCleanupRef.current = null;
      };
      const clearGuardOnNewPress = (next: PointerEvent) => {
        if (next.pointerId !== gesture.id || gestureRef.current !== gesture)
          clearGuard();
      };
      const blockReleaseClick = (click: MouseEvent) => {
        // Keyboard activation and a later independent button tap stay normal.
        if (click.detail === 0) return;
        const target = click.target;
        if (
          target instanceof Element &&
          (source.contains(target) || target.closest(".sf-hover-preview")) &&
          Math.hypot(click.clientX - gesture.x, click.clientY - gesture.y) <=
            MOVE_TOLERANCE
        ) {
          click.preventDefault();
          click.stopImmediatePropagation();
          clearGuard();
        }
      };
      const blockHeldContextMenu = (menu: MouseEvent) => {
        if (
          menu.target instanceof Element &&
          (source.contains(menu.target) ||
            menu.target.closest(".sf-hover-preview"))
        ) {
          menu.preventDefault();
        }
      };
      document.addEventListener("contextmenu", blockHeldContextMenu, true);
      const endReleaseGuard = (next: PointerEvent) => {
        if (next.pointerId !== gesture.id) return;
        gesture.x = next.clientX;
        gesture.y = next.clientY;
        if (next.type === "pointercancel") {
          clearGuard();
        } else {
          if (guardTimer) clearTimeout(guardTimer);
          guardTimer = setTimeout(clearGuard, 800);
        }
      };
      const timer = window.setTimeout(() => {
        if (gestureRef.current !== gesture) return;
        gesture.fired = true;
        guardCleanupRef.current = clearGuard;
        document.addEventListener("click", blockReleaseClick, true);
        document.addEventListener("pointerdown", clearGuardOnNewPress, true);
        document.addEventListener("pointerup", endReleaseGuard);
        document.addEventListener("pointercancel", endReleaseGuard);
        openRef.current();
      }, HOLD_MS);
      const finish = (next: PointerEvent) => {
        if (next.pointerId !== gesture.id) return;
        gesture.x = next.clientX;
        gesture.y = next.clientY;
        if (!gesture.fired) {
          clearGuard();
        }
        cancel();
      };
      const move = (next: PointerEvent) => {
        if (next.pointerId !== gesture.id || gesture.fired) return;
        const box = source.getBoundingClientRect();
        if (
          Math.hypot(next.clientX - gesture.x, next.clientY - gesture.y) >
            MOVE_TOLERANCE ||
          next.clientX < box.left ||
          next.clientX > box.right ||
          next.clientY < box.top ||
          next.clientY > box.bottom
        )
          cancel();
      };
      const secondPointer = (next: PointerEvent) => {
        if (next.pointerId !== gesture.id) {
          clearGuard();
          cancel();
        }
      };
      const interrupt = () => {
        clearGuard();
        cancel();
      };
      const visibility = () => {
        if (document.visibilityState !== "visible") interrupt();
      };
      document.addEventListener("pointermove", move, { passive: true });
      document.addEventListener("pointerup", finish);
      document.addEventListener("pointercancel", finish);
      document.addEventListener("pointerdown", secondPointer);
      window.addEventListener("scroll", interrupt, true);
      window.addEventListener("blur", interrupt);
      document.addEventListener("visibilitychange", visibility);
      cleanupRef.current = () => {
        window.clearTimeout(timer);
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", finish);
        document.removeEventListener("pointercancel", finish);
        document.removeEventListener("pointerdown", secondPointer);
        window.removeEventListener("scroll", interrupt, true);
        window.removeEventListener("blur", interrupt);
        document.removeEventListener("visibilitychange", visibility);
        if (!gesture.fired) clearGuard();
      };
    },
    [cancel, sourceRef],
  );

  const onContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (gestureRef.current || guardCleanupRef.current) event.preventDefault();
  }, []);

  useEffect(
    () => () => {
      cleanupRef.current?.();
      guardCleanupRef.current?.();
    },
    [],
  );

  return { isPressing, cancel, onPointerDown, onContextMenu };
}
