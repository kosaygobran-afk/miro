"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type UseOverlayOptions = {
  /** Whether the overlay is currently open. */
  open: boolean;
  /** Called when the user requests dismissal (Escape). Omit to keep Escape inert. */
  onClose?: () => void;
  /** Ref to the overlay panel used as the focus-trap boundary. */
  panelRef: RefObject<HTMLElement | null>;
};

/**
 * Shared accessibility behavior for Drawer/Dialog: moves focus into the panel
 * on open, traps Tab cycling inside it, closes on Escape, locks body scroll
 * and returns focus to the previously focused element on close.
 */
export function useOverlayA11y({ open, onClose, panelRef }: UseOverlayOptions) {
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const panel = panelRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
          ).filter((element) => element.offsetParent !== null)
        : [];

    // Move focus into the panel on the next frame so the element settles.
    const raf = requestAnimationFrame(() => {
      const targets = focusables();
      if (targets.length > 0) {
        targets[0].focus();
      } else {
        panel?.focus();
      }
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose?.();
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const targets = focusables();
      if (targets.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = targets[0];
      const last = targets[targets.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !panel.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
  }, [open, onClose, panelRef]);
}
