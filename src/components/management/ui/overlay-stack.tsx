"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
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
  // Keyboard handlers must see registration immediately, before React's next
  // state commit. A fast Escape after opening must still find the top overlay.
  const overlaysRef = useRef<OverlayRegistration[]>([]);
  const scrollLockCount = useRef(0);
  const originalBodyOverflow = useRef<string>("");

  const unregisterRef = useRef<((id: string) => void) | null>(null);

  const register = useCallback(
    (registration: OverlayRegistration): (() => void) => {
      const id = registration.id;
      if (!overlaysRef.current.some((overlay) => overlay.id === id)) {
        overlaysRef.current = [...overlaysRef.current, registration];
        setOverlays(overlaysRef.current);
      }
      return () => unregisterRef.current?.(id);
    },
    [],
  );

  const unregister = useCallback((id: string) => {
    overlaysRef.current = overlaysRef.current.filter(
      (overlay) => overlay.id !== id,
    );
    setOverlays(overlaysRef.current);
  }, []);

  // Initialize unregisterRef
  useEffect(() => {
    unregisterRef.current = unregister;
  }, [unregister]);

  // Compute topmost close handler without extra state
  const getTopmostClose = useCallback(() => {
    const topmost = overlaysRef.current[overlaysRef.current.length - 1];
    return topmost?.onClose ?? null;
  }, []);

  const isTopmost = useCallback(
    (id: string) =>
      overlaysRef.current[overlaysRef.current.length - 1]?.id === id,
    [],
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

  // Both drawers and dialogs are modal. Preserve pre-existing inert state and
  // suspend lower overlays while a nested dialog is open.
  useLayoutEffect(() => {
    if (overlays.length === 0) return;
    const suspended = new Map<Element, boolean>();
    const suspend = (element: Element | null) => {
      if (!element || suspended.has(element)) return;
      suspended.set(element, element.hasAttribute("inert"));
      element.setAttribute("inert", "");
    };
    suspend(document.getElementById("main-content"));
    suspend(document.querySelector(".miro-site-header"));
    suspend(document.querySelector(".mgmt-sidebar"));
    for (const overlay of overlays.slice(0, -1)) {
      suspend(overlay.panelRef.current?.parentElement ?? null);
    }
    return () => {
      for (const [element, wasInert] of suspended) {
        if (!wasInert) element.removeAttribute("inert");
      }
    };
  }, [overlays]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scrollLockCount.current > 0) {
        document.body.style.overflow = originalBodyOverflow.current;
        scrollLockCount.current = 0;
      }
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
  const restoreOnCloseRef = useRef(false);

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
  useLayoutEffect(() => {
    if (!open) return;

    // Capture the trigger before the parent applies modal background inert.
    if (!focusRestoredRef.current) {
      previouslyFocusedRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      focusRestoredRef.current = true;
    }

    const unregister = register({
      id,
      onClose: () => onCloseRef.current?.(),
      panelRef,
      type,
    });

    return () => {
      restoreOnCloseRef.current = isTopmost(id);
      const trigger = previouslyFocusedRef.current;
      unregister();
      // Runs after the provider releases inert, and also when the overlay
      // component itself unmounts rather than rendering open=false.
      if (restoreOnCloseRef.current && trigger) {
        requestAnimationFrame(() => {
          if (trigger.isConnected && !trigger.closest("[inert]"))
            trigger.focus();
        });
      }
    };
  }, [open, panelRef, register, id, type, isTopmost]);

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
      // Registration cleanup restores the trigger after inert is released.
      previouslyFocusedRef.current = null;
      focusRestoredRef.current = false;
      restoreOnCloseRef.current = false;
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
