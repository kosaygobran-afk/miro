"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import styles from "./floating-workspace-window.module.css";
import { PosViewportContext } from "./pos-viewport-context";
import { getFrontmostWorkspaceWindow } from "./workspace-window-utils";

export interface FloatingWorkspaceWindowLabels {
  minimize: string;
  restore: string;
  maximize: string;
  close: string;
  drag: string;
  resize: string;
  enterFullscreen?: string;
  exitFullscreen?: string;
  fullscreenFallback?: string;
  fullscreenError?: string;
}

interface FloatingWorkspaceWindowProps {
  title: string;
  open: boolean;
  minimized: boolean;
  mode: "floating" | "maximized";
  /** null = anchored at the CSS default corner */
  position: { x: number | null; y: number | null };
  size: { width: number; height: number };
  restoreBounds: { x: number; y: number; width: number; height: number } | null;
  zIndex: number;
  labels: FloatingWorkspaceWindowLabels;
  onMinimize: () => void;
  onRestore: () => void;
  onMaximize: () => void;
  onClose: () => void;
  onPositionChange: (position: { x: number; y: number }) => void;
  onSizeChange: (size: { width: number; height: number }) => void;
  onModeChange: (mode: "floating" | "maximized") => void;
  onRestoreBoundsChange: (
    bounds: { x: number; y: number; width: number; height: number } | null,
  ) => void;
  onActivate: () => void;
  /** Explicit opt-in for POS viewport/native fullscreen controls. */
  viewportModeEnabled?: boolean;
  /** Presentation mode: "utility" for small tools (Calculator), "workspace" for app-like tools (POS). */
  presentation?: "utility" | "workspace";
  children: ReactNode;
}

const SHEET_MEDIA_QUERY = "(max-width: 767px)";
const VIEWPORT_MARGIN = 8;
const MIN_VISIBLE = 96;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 240;

type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

/**
 * Non-modal floating workspace window for management tools.
 * Supports dragging from title bar, resizing from edges/corners,
 * minimize, maximize/restore, and close.
 * Positions are clamped so the header always stays reachable,
 * and re-clamped on viewport resize.
 * Below 768px the window docks as a full-width bottom sheet
 * with dragging disabled.
 */
export function FloatingWorkspaceWindow({
  title,
  open,
  minimized,
  mode,
  position,
  size,
  zIndex,
  labels,
  onMinimize,
  onRestore,
  onMaximize,
  onClose,
  onPositionChange,
  onSizeChange,
  onActivate,
  viewportModeEnabled = false,
  presentation = "utility",
  children,
}: FloatingWorkspaceWindowProps) {
  const windowRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const resizeRef = useRef<{
    pointerId: number;
    handle: ResizeHandle;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    lastWidth: number;
    lastHeight: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const [isSheet, setIsSheet] = useState(false);
  const [viewportMode, setViewportMode] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState(false);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const fullscreenFocusRef = useRef<HTMLElement | null>(null);
  const rootOverflowRef = useRef("");
  const suspendedBodyChildrenRef = useRef(new Map<HTMLElement, boolean>());
  const localeIsHebrew = /[\u0590-\u05ff]/.test(title);

  const labelsForLocale = {
    enter:
      labels.enterFullscreen ??
      (localeIsHebrew ? "מעבר למסך מלא" : "Enter fullscreen"),
    exit:
      labels.exitFullscreen ??
      (localeIsHebrew ? "יציאה ממסך מלא" : "Exit fullscreen"),
    fallback:
      labels.fullscreenFallback ??
      (localeIsHebrew ? "מצב תצוגת חלון מלא בדפדפן" : "Browser viewport mode"),
    error:
      labels.fullscreenError ??
      (localeIsHebrew
        ? "הדפדפן לא אפשר מסך מלא. הופעל מצב חלון מלא."
        : "Fullscreen was unavailable. Viewport mode is active."),
  };

  const restoreViewportPresentation = useCallback(() => {
    document.documentElement.removeAttribute("data-pos-viewport-mode");
    document.documentElement.style.overflow = rootOverflowRef.current;
    for (const [element, wasInert] of suspendedBodyChildrenRef.current) {
      if (!wasInert) element.removeAttribute("inert");
    }
    suspendedBodyChildrenRef.current.clear();
    setViewportMode(false);
    setNativeFullscreen(false);
    const focusTarget = fullscreenFocusRef.current;
    fullscreenFocusRef.current = null;
    requestAnimationFrame(() => {
      if (focusTarget?.isConnected && !focusTarget.closest("[inert]"))
        focusTarget.focus();
    });
  }, []);

  const activateViewportPresentation = useCallback(
    (native: boolean) => {
      if (!viewportMode) {
        fullscreenFocusRef.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        rootOverflowRef.current = document.documentElement.style.overflow;
        for (const child of Array.from(document.body.children)) {
          if (
            child instanceof HTMLElement &&
            child.id !== "mgmt-overlay-portal-host"
          ) {
            suspendedBodyChildrenRef.current.set(
              child,
              child.hasAttribute("inert"),
            );
            child.setAttribute("inert", "");
          }
        }
        document.documentElement.style.overflow = "hidden";
        setViewportMode(true);
      }
      document.documentElement.dataset.posViewportMode = native
        ? "native"
        : "fallback";
      setNativeFullscreen(native);
    },
    [viewportMode],
  );

  const enterViewportMode = useCallback(async () => {
    if (document.fullscreenElement === document.documentElement) {
      activateViewportPresentation(true);
      return;
    }
    const request = document.documentElement.requestFullscreen;
    if (!request) {
      activateViewportPresentation(false);
      return;
    }
    try {
      await request.call(document.documentElement);
      activateViewportPresentation(
        document.fullscreenElement === document.documentElement,
      );
    } catch {
      setFullscreenError(true);
      activateViewportPresentation(false);
    }
  }, [activateViewportPresentation]);

  const exitViewportMode = useCallback(async () => {
    if (
      document.fullscreenElement === document.documentElement &&
      document.exitFullscreen
    ) {
      try {
        await document.exitFullscreen();
      } catch {
        restoreViewportPresentation();
      }
    } else {
      restoreViewportPresentation();
    }
  }, [restoreViewportPresentation]);

  const minimizeFromActiveWindow = useCallback(() => {
    if (viewportMode) void exitViewportMode();
    onMinimize();
  }, [viewportMode, exitViewportMode, onMinimize]);

  useEffect(() => {
    if (!viewportMode) return undefined;
    const viewport = window.visualViewport;
    const element = windowRef.current;
    const syncViewport = () => {
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      element?.style.setProperty("--pos-viewport-height", `${height}px`);
      element?.style.setProperty("--pos-viewport-top", `${top}px`);
    };
    syncViewport();
    viewport?.addEventListener("resize", syncViewport);
    viewport?.addEventListener("scroll", syncViewport);
    window.addEventListener("resize", syncViewport);
    window.addEventListener("orientationchange", syncViewport);
    return () => {
      viewport?.removeEventListener("resize", syncViewport);
      viewport?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
      window.removeEventListener("orientationchange", syncViewport);
      element?.style.removeProperty("--pos-viewport-height");
      element?.style.removeProperty("--pos-viewport-top");
    };
  }, [viewportMode]);

  useEffect(() => {
    if (!viewportMode) return undefined;
    const onTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const panel = windowRef.current;
      if (!panel) return;
      const activeModal = Array.from(
        document.querySelectorAll<HTMLElement>('[aria-modal="true"]'),
      ).some((element) => element !== panel && !panel.contains(element));
      if (activeModal) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        panel.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first ||
          !panel.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !panel.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onTab, true);
    return () => document.removeEventListener("keydown", onTab, true);
  }, [viewportMode]);

  useEffect(() => {
    if (!viewportModeEnabled || !open) return undefined;
    const syncFullscreen = () => {
      if (document.fullscreenElement === document.documentElement) {
        activateViewportPresentation(true);
      } else if (viewportMode && nativeFullscreen) {
        restoreViewportPresentation();
      }
    };
    const onFullscreenError = () => {
      setFullscreenError(true);
      activateViewportPresentation(false);
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("fullscreenerror", onFullscreenError);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("fullscreenerror", onFullscreenError);
    };
  }, [
    viewportModeEnabled,
    open,
    viewportMode,
    nativeFullscreen,
    activateViewportPresentation,
    restoreViewportPresentation,
  ]);

  useEffect(() => {
    if (!open || !viewportMode) return undefined;
    return () => {
      if (
        document.fullscreenElement === document.documentElement &&
        document.exitFullscreen
      ) {
        void document.exitFullscreen().catch(() => undefined);
      }
      restoreViewportPresentation();
    };
  }, [open, viewportMode, restoreViewportPresentation]);

  // Track the mobile sheet breakpoint.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia(SHEET_MEDIA_QUERY);
    const onChange = () => setIsSheet(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const clampPosition = (
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxX = viewportWidth - Math.min(width, MIN_VISIBLE) - VIEWPORT_MARGIN;
    const minX = Math.min(VIEWPORT_MARGIN, viewportWidth - MIN_VISIBLE - width);
    const maxY = viewportHeight - Math.min(height, 56) - VIEWPORT_MARGIN;
    return {
      x: Math.min(
        Math.max(x, Math.min(minX, VIEWPORT_MARGIN)),
        Math.max(maxX, VIEWPORT_MARGIN),
      ),
      y: Math.min(Math.max(y, VIEWPORT_MARGIN), maxY),
    };
  };

  // Re-clamp a persisted position when the window (re)opens or the viewport shrinks.
  useEffect(() => {
    if (isSheet || mode === "maximized") return undefined;
    const reclamp = () => {
      if (position.x === null || position.y === null) return;
      const next = clampPosition(
        position.x,
        position.y,
        size.width,
        size.height,
      );
      if (next.x !== position.x || next.y !== position.y) {
        onPositionChange(next);
      }
    };
    reclamp();
    window.addEventListener("resize", reclamp);
    return () => window.removeEventListener("resize", reclamp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position.x, position.y, size.width, size.height, isSheet, open, mode]);

  // Focus management: focus heading/close button on open, restore focus on close
  useEffect(() => {
    if (!open) {
      // Restore focus to the previously focused element when closing
      if (previouslyFocusedRef.current) {
        previouslyFocusedRef.current.focus();
        previouslyFocusedRef.current = null;
      }
      return;
    }

    // Save the currently focused element (the toggle button that opened this window)
    previouslyFocusedRef.current = document.activeElement as HTMLElement;

    // Focus on the close button (or heading if close button is not available)
    const focusableElement = windowRef.current?.querySelector(
      "button[aria-label], .title",
    ) as HTMLElement | null;
    if (focusableElement) {
      focusableElement.focus();
    }
  }, [open]);

  const isFrontmostWindow = useCallback(() => {
    const host = document.getElementById("mgmt-overlay-portal-host");
    const windows = host
      ? Array.from(
          host.querySelectorAll<HTMLElement>(
            '[data-workspace-window-z][data-workspace-window-minimized="false"]',
          ),
        )
      : [];
    const frontId = getFrontmostWorkspaceWindow(
      windows.map((element) => ({
        id: element.dataset.workspaceWindowId ?? "",
        zIndex: Number(element.dataset.workspaceWindowZ) || 0,
      })),
    );
    return frontId === title;
  }, [title]);

  // OverlayStack gets first refusal in capture phase. Only the front window
  // may minimize, so restored tools never cascade on one Escape press.
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        isFrontmostWindow()
      ) {
        if (
          viewportMode &&
          document.fullscreenElement !== document.documentElement
        ) {
          event.preventDefault();
          event.stopPropagation();
          void exitViewportMode();
          return;
        }
        if (document.fullscreenElement === document.documentElement) return;
        event.preventDefault();
        event.stopPropagation();
        minimizeFromActiveWindow();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    open,
    minimizeFromActiveWindow,
    isFrontmostWindow,
    viewportMode,
    exitViewportMode,
  ]);

  const onDragPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (isSheet || event.button !== 0 || mode === "maximized") return;
    const target = event.target as HTMLElement;
    if (
      target.closest(
        "button, a, input, textarea, select, [data-no-drag], .resize-handle",
      )
    ) {
      return;
    }
    const el = windowRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: rect.left,
      startY: rect.top,
      lastX: rect.left,
      lastY: rect.top,
    };
    onActivate();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onDragPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const el = windowRef.current;
    if (!el) return;
    const next = clampPosition(
      drag.startX + event.clientX - drag.startClientX,
      drag.startY + event.clientY - drag.startClientY,
      size.width,
      size.height,
    );
    drag.lastX = next.x;
    drag.lastY = next.y;
    el.style.left = `${next.x}px`;
    el.style.top = `${next.y}px`;
    el.style.insetInlineStart = "auto";
    el.style.insetBlockEnd = "auto";
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.lastX !== drag.startX || drag.lastY !== drag.startY) {
      onPositionChange({ x: drag.lastX, y: drag.lastY });
    }
  };

  // Resize handlers
  const getResizeHandle = (target: HTMLElement): ResizeHandle | null => {
    const handle = target.closest(".resize-handle");
    if (!handle) return null;
    return handle.getAttribute("data-handle") as ResizeHandle | null;
  };

  const onResizePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (isSheet || event.button !== 0 || mode === "maximized") return;
    const handle = getResizeHandle(event.target as HTMLElement);
    if (!handle) return;
    const el = windowRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    resizeRef.current = {
      pointerId: event.pointerId,
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: rect.left,
      startY: rect.top,
      startWidth: rect.width,
      startHeight: rect.height,
      lastWidth: rect.width,
      lastHeight: rect.height,
      lastX: rect.left,
      lastY: rect.top,
    };
    onActivate();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  const onResizePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const el = windowRef.current;
    if (!el) return;

    const dx = event.clientX - resize.startClientX;
    const dy = event.clientY - resize.startClientY;

    let newX = resize.startX;
    let newY = resize.startY;
    let newWidth = resize.startWidth;
    let newHeight = resize.startHeight;

    // Apply resize based on handle
    if (resize.handle.includes("e")) {
      newWidth = Math.max(MIN_WIDTH, resize.startWidth + dx);
    }
    if (resize.handle.includes("w")) {
      const proposedWidth = Math.max(MIN_WIDTH, resize.startWidth - dx);
      const diff = resize.startWidth - proposedWidth;
      newWidth = proposedWidth;
      newX = resize.startX + diff;
    }
    if (resize.handle.includes("s")) {
      newHeight = Math.max(MIN_HEIGHT, resize.startHeight + dy);
    }
    if (resize.handle.includes("n")) {
      const proposedHeight = Math.max(MIN_HEIGHT, resize.startHeight - dy);
      const diff = resize.startHeight - proposedHeight;
      newHeight = proposedHeight;
      newY = resize.startY + diff;
    }

    // Clamp position to viewport
    const clamped = clampPosition(newX, newY, newWidth, newHeight);
    newX = clamped.x;
    newY = clamped.y;

    resize.lastX = newX;
    resize.lastY = newY;
    resize.lastWidth = newWidth;
    resize.lastHeight = newHeight;

    el.style.left = `${newX}px`;
    el.style.top = `${newY}px`;
    el.style.width = `${newWidth}px`;
    el.style.height = `${newHeight}px`;
    el.style.insetInlineStart = "auto";
    el.style.insetBlockEnd = "auto";
  };

  const endResize = (event: ReactPointerEvent<HTMLElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    if (
      resize.lastWidth !== resize.startWidth ||
      resize.lastHeight !== resize.startHeight
    ) {
      onSizeChange({ width: resize.lastWidth, height: resize.lastHeight });
      onPositionChange({ x: resize.lastX, y: resize.lastY });
    }
  };

  if (!open) return null;

  const inlineStyle: React.CSSProperties = isSheet
    ? { zIndex }
    : mode === "maximized"
      ? {
          zIndex,
          inset: "1rem",
          width: "auto",
          height: "auto",
        }
      : presentation === "workspace"
        ? {
            zIndex,
            left: position.x !== null ? position.x : undefined,
            top: position.y !== null ? position.y : undefined,
            width: size.width,
            height: size.height,
            // Workspace mode: no max-width/max-height constraints, allow full viewport usage
            maxWidth: "none",
            maxHeight: "none",
          }
        : {
            zIndex,
            left: position.x !== null ? position.x : undefined,
            top: position.y !== null ? position.y : undefined,
            width: size.width,
            height: size.height,
          };

  const windowContent = (
    <div
      ref={windowRef}
      className={`${styles.window}${isSheet ? ` ${styles.sheet}` : ""}${minimized ? ` ${styles.minimized}` : ""}${mode === "maximized" ? ` ${styles.maximized}` : ""}${viewportMode ? ` ${styles.viewportMode}` : ""}`}
      data-workspace-window-z={zIndex}
      data-workspace-window-id={title}
      data-workspace-presentation={presentation}
      data-workspace-window-minimized={minimized ? "true" : "false"}
      data-pos-viewport={viewportMode ? "true" : undefined}
      role="dialog"
      aria-modal={viewportMode ? "true" : "false"}
      aria-label={title}
      tabIndex={-1}
      style={inlineStyle}
      onPointerDown={onActivate}
      onPointerMove={onDragPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <header
        className={styles.titleBar}
        aria-label={labels.drag}
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className={styles.title} dir="auto">
          {title}
        </span>
        <div className={styles.windowControls}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={minimized ? labels.restore : labels.minimize}
            onClick={minimized ? onRestore : minimizeFromActiveWindow}
          >
            {minimized ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M5 5h14v14H5z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M5 12h14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={mode === "maximized" ? labels.restore : labels.maximize}
            onClick={mode === "maximized" ? onRestore : onMaximize}
          >
            {mode === "maximized" ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M9 9H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M15 15h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M5 9h14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M9 5h4a2 2 0 0 1 2 2v4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M15 15H9"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M9 19H5a2 2 0 0 1-2-2v-4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
          {viewportModeEnabled ? (
            <button
              type="button"
              className={styles.iconButton}
              aria-label={
                viewportMode ? labelsForLocale.exit : labelsForLocale.enter
              }
              title={
                viewportMode && !nativeFullscreen
                  ? labelsForLocale.fallback
                  : undefined
              }
              onClick={() => {
                setFullscreenError(false);
                if (viewportMode) void exitViewportMode();
                else void enterViewportMode();
              }}
            >
              <span aria-hidden="true">{viewportMode ? "⤢" : "⛶"}</span>
            </button>
          ) : null}
          <button
            type="button"
            className={styles.iconButton}
            aria-label={labels.close}
            onClick={onClose}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </header>
      {viewportMode && !nativeFullscreen ? (
        <span className={styles.viewportStatus} role="status">
          {labelsForLocale.fallback}
        </span>
      ) : null}
      {fullscreenError ? (
        <span className={styles.viewportStatus} role="status">
          {labelsForLocale.error}
        </span>
      ) : null}
      {!minimized && (
        <div className={styles.content}>
          <PosViewportContext.Provider
            value={{
              enabled: viewportModeEnabled,
              isActive: viewportMode,
              isNativeFullscreen: nativeFullscreen,
              fullscreenError,
              enterFullscreen: enterViewportMode,
              exitFullscreen: exitViewportMode,
            }}
          >
            {children}
          </PosViewportContext.Provider>
        </div>
      )}
      {!minimized && mode !== "maximized" && !isSheet && (
        <>
          <div
            className={`${styles.resizeHandle} ${styles.resizeN}`}
            data-handle="n"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            aria-label={labels.resize}
          />
          <div
            className={`${styles.resizeHandle} ${styles.resizeNE}`}
            data-handle="ne"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            aria-label={labels.resize}
          />
          <div
            className={`${styles.resizeHandle} ${styles.resizeE}`}
            data-handle="e"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            aria-label={labels.resize}
          />
          <div
            className={`${styles.resizeHandle} ${styles.resizeSE}`}
            data-handle="se"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            aria-label={labels.resize}
          />
          <div
            className={`${styles.resizeHandle} ${styles.resizeS}`}
            data-handle="s"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            aria-label={labels.resize}
          />
          <div
            className={`${styles.resizeHandle} ${styles.resizeSW}`}
            data-handle="sw"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            aria-label={labels.resize}
          />
          <div
            className={`${styles.resizeHandle} ${styles.resizeW}`}
            data-handle="w"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            aria-label={labels.resize}
          />
          <div
            className={`${styles.resizeHandle} ${styles.resizeNW}`}
            data-handle="nw"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            aria-label={labels.resize}
          />
        </>
      )}
    </div>
  );

  if (typeof document === "undefined") return null;
  const host =
    document.getElementById("mgmt-overlay-portal-host") ?? document.body;
  return createPortal(windowContent, host);
}
