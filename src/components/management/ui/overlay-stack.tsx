"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useCallback,
  type RefObject,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Options for the useOverlayA11y hook. */
export type UseOverlayOptions = {
  /** Whether the overlay is currently open. */
  open: boolean;
  /** Called when the user requests dismissal (Escape). Omit to keep Escape inert. */
  onClose?: () => void;
  /** Ref to the overlay panel used as the focus-trap boundary. */
  panelRef: RefObject<HTMLElement | null>;
  /** Type of overlay for coordination. Default "dialog". */
  type?: "dialog" | "drawer";
};

/** Internal registration for an open overlay. */
type OverlayRegistration = {
  id: string;
  panelRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  type: "dialog" | "drawer";
};

/** Context for coordinating multiple overlays. */
type OverlayStackContextValue = {
  /** Register an overlay; returns an unregister function. */
  register: (registration: OverlayRegistration) => () => void;
  /** Check if an overlay is the topmost. */
  isTopmost: (id: string) => boolean;
  /** Get the topmost overlay's onClose handler. */
  getTopmostClose: () => (() => void) | null;
  /** Get the portal host element. */
  getPortalHost: () => HTMLElement | null;
};

const OverlayStackContext = createContext<OverlayStackContextValue | null>(
  null,
);

function useOverlayStack() {
  const context = useContext(OverlayStackContext);
  if (!context) {
    throw new Error(
      "useOverlayStack must be used within an OverlayStackProvider",
    );
  }
  return context;
}

/**
 * Portal host for overlays. Mounted at document.body to escape
 * stacking contexts while preserving theme variables via data attributes.
 */
function OverlayPortalHost() {
  const [hostElement, setHostElement] = useState<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const host = document.createElement("div");
    host.id = "mgmt-overlay-portal-host";
    // Mirror theme-related data attributes from documentElement so
    // portaled overlays inherit the same CSS variables.
    const theme = document.documentElement.dataset.theme;
    if (theme) host.dataset.theme = theme;
    const dir = document.documentElement.dir;
    if (dir) host.dir = dir;
    document.body.appendChild(host);

    const syncTheme = () => {
      if (!mounted) return;
      const t = document.documentElement.dataset.theme;
      if (t) host.dataset.theme = t;
      const d = document.documentElement.dir;
      if (d) host.dir = d;
    };
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "dir"],
    });

    // Use a timeout to avoid synchronous state update in effect
    const timer = setTimeout(() => {
      if (mounted) {
        setHostElement(host);
        setIsReady(true);
      }
    }, 0);

    return () => {
      mounted = false;
      observer.disconnect();
      host.remove();
      clearTimeout(timer);
    };
  }, []);

  if (!isReady || !hostElement) return null;

  return createPortal(null, hostElement);
}

/**
 * Provider that manages a stack of overlays (dialogs, drawers).
 * Only the topmost overlay handles Escape key and focus trapping.
 * Body scroll lock is reference-counted.
 */
export function OverlayStackProvider({ children }: { children: ReactNode }) {
  const [overlays, setOverlays] = useState<OverlayRegistration[]>([]);
  const scrollLockCount = useRef(0);
  const originalBodyOverflow = useRef<string>("");

  const unregisterRef = useRef<((id: string) => void) | null>(null);

  const register = useCallback(
    (registration: OverlayRegistration): (() => void) => {
      const id = registration.id;
      setOverlays((prev) => {
        const exists = prev.some((o) => o.id === id);
        if (exists) return prev;
        return [...prev, registration];
      });
      return () => unregisterRef.current?.(id);
    },
    [],
  );

  const unregister = useCallback((id: string) => {
    setOverlays((prev) => prev.filter((o) => o.id !== id));
  }, []);

  // Initialize unregisterRef
  useEffect(() => {
    unregisterRef.current = unregister;
  }, [unregister]);

  // Compute topmost close handler without extra state
  const getTopmostClose = useCallback(() => {
    const topmost = overlays[overlays.length - 1];
    return topmost?.onClose ?? null;
  }, [overlays]);

  const isTopmost = useCallback(
    (id: string) => overlays[overlays.length - 1]?.id === id,
    [overlays],
  );

  // Manage body scroll lock with reference counting
  useEffect(() => {
    if (overlays.length > 0 && scrollLockCount.current === 0) {
      // First overlay opened - capture original overflow
      originalBodyOverflow.current = document.body.style.overflow || "";
      document.body.style.overflow = "hidden";
      scrollLockCount.current = 1;
    } else if (overlays.length > 0) {
      scrollLockCount.current += 1;
    } else if (overlays.length === 0 && scrollLockCount.current > 0) {
      // Last overlay closed
      scrollLockCount.current = 0;
      document.body.style.overflow = originalBodyOverflow.current;
    }
  }, [overlays.length]);

  // Make background content inert when modal dialog is open
  useEffect(() => {
    const hasModalDialog = overlays.some((o) => o.type === "dialog");
    const mainContent = document.getElementById("main-content");
    const header = document.querySelector("header");
    const sidebar = document.querySelector(".mgmt-sidebar");

    if (hasModalDialog) {
      mainContent?.setAttribute("inert", "");
      header?.setAttribute("inert", "");
      sidebar?.setAttribute("inert", "");
    } else {
      mainContent?.removeAttribute("inert");
      header?.removeAttribute("inert");
      sidebar?.removeAttribute("inert");
    }
  }, [overlays]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scrollLockCount.current > 0) {
        document.body.style.overflow = originalBodyOverflow.current;
        scrollLockCount.current = 0;
      }
      // Remove inert from all
      document
        .querySelectorAll("[inert]")
        .forEach((el) => el.removeAttribute("inert"));
    };
  }, []);

  return (
    <OverlayStackContext.Provider
      value={{
        register,
        getTopmostClose,
        isTopmost,
        getPortalHost: () =>
          document.getElementById("mgmt-overlay-portal-host"),
      }}
    >
      <OverlayPortalHost />
      {children}
    </OverlayStackContext.Provider>
  );
}

/**
 * Hook for individual overlays (Dialog, Drawer) to register themselves
 * and get coordinated Escape/Tab handling.
 */
export function useOverlayA11y({
  open,
  onClose,
  panelRef,
  type = "dialog",
}: {
  open: boolean;
  onClose?: () => void;
  panelRef: RefObject<HTMLElement | null>;
  type?: "dialog" | "drawer";
}) {
  const { register, getTopmostClose, isTopmost } = useOverlayStack();
  const id = useId();
  const onCloseRef = useRef(onClose);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const focusRestoredRef = useRef(false);

  // Keep onCloseRef current
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Helper to get focusable elements within the panel
  const getFocusables = useCallback(() => {
    const panel = panelRef.current;
    return panel
      ? Array.from(
          panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter((element) => element.offsetParent !== null)
      : [];
  }, [panelRef]);

  // Register/unregister with the stack
  useEffect(() => {
    if (!open) return;

    const unregister = register({
      id,
      onClose: () => onCloseRef.current?.(),
      panelRef,
      type,
    });

    return () => {
      unregister();
    };
  }, [open, panelRef, register, id, type]);

  // Handle Escape and Tab only for the topmost overlay
  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;

    const onKeyDown = (event: KeyboardEvent) => {
      // Only the topmost overlay handles keyboard
      if (!isTopmost(id)) return;

      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const targets = getFocusables();
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
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, panelRef, getTopmostClose, getFocusables, isTopmost, id]);

  // Focus management on open/close
  useEffect(() => {
    if (!open) {
      // Restore focus when this overlay closes (only if topmost)
      if (previouslyFocusedRef.current && isTopmost(id)) {
        const el = previouslyFocusedRef.current;
        if (el.isConnected) {
          el.focus();
        } else {
          // Fallback to a predictable focusable element
          const fallback = document.querySelector<HTMLElement>(
            'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
          );
          fallback?.focus();
        }
      }
      previouslyFocusedRef.current = null;
      focusRestoredRef.current = false;
      return;
    }

    // Save the element that had focus before the overlay opened
    // Only capture if we haven't already (prevents reset on parent re-render)
    if (!focusRestoredRef.current) {
      previouslyFocusedRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      focusRestoredRef.current = true;
    }

    const panel = panelRef.current;
    if (!panel) return;

    // Move focus into the panel on the next frame
    const raf = requestAnimationFrame(() => {
      const targets = getFocusables();
      if (targets.length > 0) {
        targets[0].focus();
      } else {
        panel.focus();
      }
    });

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [open, panelRef, getFocusables, isTopmost, id]);
}
