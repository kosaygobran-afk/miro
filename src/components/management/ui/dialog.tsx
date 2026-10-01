"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useOverlayA11y } from "./overlay-stack";
import { createPortal } from "react-dom";

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  /** Dialog title (aria-labelledby target). */
  title: ReactNode;
  /** Supporting text (aria-describedby target). */
  description?: ReactNode;
  children?: ReactNode;
  /** Footer slot, typically action buttons. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  closeLabel?: string;
  className?: string;
};

/**
 * Accessible modal dialog: role="dialog", aria-modal, labelledby/describedby,
 * focus trap, Escape to close and focus return on close.
 * Renders via portal to body-level host.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  closeLabel = "Close",
  className,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [hasOpened, setHasOpened] = useState(false);
  if (open && !hasOpened) {
    setHasOpened(true);
  }

  useOverlayA11y({ open, onClose, panelRef, type: "dialog" });

  if (!hasOpened) return null;

  const dialogContent = (
    <div
      className={["mgmt-dialog-root", open ? "mgmt-dialog-root--open" : null]
        .filter(Boolean)
        .join(" ")}
      hidden={!open}
    >
      <div
        className="mgmt-dialog-overlay"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={["mgmt-dialog", `mgmt-dialog--${size}`, className]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="mgmt-dialog__header">
          <h2 id={titleId} className="mgmt-dialog__title">
            {title}
          </h2>
          <button
            type="button"
            className="mgmt-dialog__close"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {description ? (
          <p id={descriptionId} className="mgmt-dialog__description">
            {description}
          </p>
        ) : null}
        {children ? <div className="mgmt-dialog__body">{children}</div> : null}
        {footer ? <div className="mgmt-dialog__footer">{footer}</div> : null}
      </div>
    </div>
  );

  const portalHost = document.getElementById("mgmt-overlay-portal-host");
  return portalHost ? createPortal(dialogContent, portalHost) : dialogContent;
}

export type ConfirmationDialogProps = {
  open: boolean;
  /** Called on confirm. */
  onConfirm: () => void;
  /** Called on cancel, overlay click and Escape. */
  onCancel: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel: ReactNode;
  /** Danger styling for destructive confirmations. */
  tone?: "default" | "danger";
  /** Disables both actions while an async confirm runs. */
  busy?: boolean;
  closeLabel?: string;
};

/**
 * Pre-composed destructive/confirmation dialog with primary action autofocus
 * behaviour: while busy, Escape and the cancel button stay inert-safe (the
 * buttons disable; Escape still closes only when not busy).
 */
export function ConfirmationDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "default",
  busy = false,
  closeLabel,
}: ConfirmationDialogProps) {
  const handleClose = () => {
    if (!busy) onCancel();
  };
  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={title}
      description={description}
      size="sm"
      closeLabel={closeLabel}
      footer={
        <div className="mgmt-dialog__actions">
          <button
            type="button"
            className="mgmt-button mgmt-button--ghost"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={[
              "mgmt-button",
              tone === "danger"
                ? "mgmt-button--danger"
                : "mgmt-button--primary",
            ].join(" ")}
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            {confirmLabel}
          </button>
        </div>
      }
    />
  );
}
