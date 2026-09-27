"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useOverlayA11y } from "./use-overlay-a11y";

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  /** Visible (and accessible) drawer title. */
  title: ReactNode;
  /**
   * Logical side the drawer slides in from. "start" follows the inline-start
   * edge (left in LTR, right in RTL). Default "start".
   */
  side?: "start" | "end";
  children: ReactNode;
  /** Accessible label for the built-in close button. */
  closeLabel?: string;
  className?: string;
};

/**
 * RTL-aware side drawer. Focus moves inside on open and returns to the
 * trigger on close; Escape closes; background scroll is locked while open.
 * Mounting is deferred on first-open to avoid SSR/CSR markup drift.
 */
export function Drawer({
  open,
  onClose,
  title,
  side = "start",
  children,
  closeLabel = "Close",
  className,
}: DrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [hasOpened, setHasOpened] = useState(false);
  if (open && !hasOpened) {
    setHasOpened(true);
  }

  useOverlayA11y({ open, onClose, panelRef });

  if (!hasOpened) return null;

  return (
    <div
      className={["mgmt-drawer-root", open ? "mgmt-drawer-root--open" : null]
        .filter(Boolean)
        .join(" ")}
      hidden={!open}
    >
      <div
        className="mgmt-drawer-overlay"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={["mgmt-drawer", `mgmt-drawer--${side}`, className]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="mgmt-drawer__header">
          <h2 id={titleId} className="mgmt-drawer__title">
            {title}
          </h2>
          <button
            type="button"
            className="mgmt-drawer__close"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="mgmt-drawer__body">{children}</div>
      </div>
    </div>
  );
}
