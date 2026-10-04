"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import styles from "./floating-workspace-window.module.css";

export interface FloatingWorkspaceWindowLabels {
  minimize: string;
  restore: string;
  close: string;
  drag: string;
}

interface FloatingWorkspaceWindowProps {
  title: string;
  open: boolean;
  minimized: boolean;
  /** null = anchored at the CSS default corner */
  position: { x: number | null; y: number | null };
  zIndex: number;
  labels: FloatingWorkspaceWindowLabels;
  onMinimize: () => void;
  onRestore: () => void;
  onClose: () => void;
  onPositionChange: (position: { x: number; y: number }) => void;
  onActivate: () => void;
  children: ReactNode;
}

const SHEET_MEDIA_QUERY = "(max-width: 767px)";
const VIEWPORT_MARGIN = 8;
const MIN_VISIBLE = 96;

/**
 * Non-modal floating workspace window for management tools.
 * Dragging starts only from the title bar (buttons/inputs inside it are
 * excluded). Positions are clamped so the header always stays reachable, and
 * re-clamped on viewport resize. Below 768px the window docks as a full-width
 * bottom sheet with dragging disabled.
 */
export function FloatingWorkspaceWindow({
  title,
  open,
  minimized,
  position,
  zIndex,
  labels,
  onMinimize,
  onRestore,
  onClose,
  onPositionChange,
  onActivate,
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
  const [isSheet, setIsSheet] = useState(false);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Track the mobile sheet breakpoint.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia(SHEET_MEDIA_QUERY);
    const onChange = () => setIsSheet(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const clampPosition = (x: number, y: number) => {
    const el = windowRef.current;
    const width = el?.offsetWidth ?? 320;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxX = viewportWidth - Math.min(width, MIN_VISIBLE) - VIEWPORT_MARGIN;
    const minX = Math.min(
      VIEWPORT_MARGIN,
      viewportWidth - MIN_VISIBLE - width,
    );
    return {
      x: Math.min(Math.max(x, Math.min(minX, VIEWPORT_MARGIN)), Math.max(maxX, VIEWPORT_MARGIN)),
      y: Math.min(Math.max(y, VIEWPORT_MARGIN), viewportHeight - 56),
    };
  };

  // Re-clamp a persisted position when the window (re)opens or the viewport shrinks.
  useEffect(() => {
    if (isSheet) return undefined;
    const reclamp = () => {
      if (position.x === null || position.y === null) return;
      const next = clampPosition(position.x, position.y);
      if (next.x !== position.x || next.y !== position.y) {
        onPositionChange(next);
      }
    };
    reclamp();
    window.addEventListener("resize", reclamp);
    return () => window.removeEventListener("resize", reclamp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position.x, position.y, isSheet, open]);

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
      'button[aria-label], .title'
    ) as HTMLElement | null;
    if (focusableElement) {
      focusableElement.focus();
    }
  }, [open]);

  // Handle Escape key to minimize the window (non-modal)
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onMinimize();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onMinimize]);

  const onDragPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (isSheet || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, [data-no-drag]")) {
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

  if (!open) return null;

  const inlineStyle: React.CSSProperties = isSheet
    ? { zIndex }
    : {
        zIndex,
        ...(position.x !== null && position.y !== null
          ? { left: position.x, top: position.y }
          : {}),
      };

  const windowContent = (
    <div
      ref={windowRef}
      className={`${styles.window}${isSheet ? ` ${styles.sheet}` : ""}${minimized ? ` ${styles.minimized}` : ""}`}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      style={inlineStyle}
      onPointerDown={onActivate}
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
        <button
          type="button"
          className={styles.iconButton}
          aria-label={minimized ? labels.restore : labels.minimize}
          onClick={minimized ? onRestore : onMinimize}
        >
          {minimized ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 5h14v14H5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={labels.close}
          onClick={onClose}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      {!minimized && <div className={styles.content}>{children}</div>}
    </div>
  );

  if (typeof document === "undefined") return null;
  const host =
    document.getElementById("mgmt-overlay-portal-host") ?? document.body;
  return createPortal(windowContent, host);
}
