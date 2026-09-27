"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

export type NoticeTone = "info" | "success" | "warning" | "danger";

export type NoticeProps = {
  tone?: NoticeTone;
  title?: ReactNode;
  children: ReactNode;
  /** Optional trailing action slot. */
  action?: ReactNode;
  /** Dismiss handler; renders a close button when provided. */
  onDismiss?: () => void;
  /** Accessible label for the dismiss button. */
  dismissLabel?: string;
  className?: string;
};

const toneIcons: Record<NoticeTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

/**
 * Inline feedback message. "danger"/"warning" use role="alert" (assertive),
 * "info"/"success" use role="status" (polite).
 */
export function Notice({
  tone = "info",
  title,
  children,
  action,
  onDismiss,
  dismissLabel = "Dismiss",
  className,
}: NoticeProps) {
  const Icon = toneIcons[tone];
  const assertive = tone === "danger" || tone === "warning";
  return (
    <div
      className={["mgmt-notice", `mgmt-notice--${tone}`, className]
        .filter(Boolean)
        .join(" ")}
      role={assertive ? "alert" : "status"}
    >
      <span className="mgmt-notice__icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <div className="mgmt-notice__body">
        {title ? <p className="mgmt-notice__title">{title}</p> : null}
        <div className="mgmt-notice__content">{children}</div>
      </div>
      {action ? <div className="mgmt-notice__action">{action}</div> : null}
      {onDismiss ? (
        <button
          type="button"
          className="mgmt-notice__dismiss"
          onClick={onDismiss}
          aria-label={dismissLabel}
        >
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
