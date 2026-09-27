"use client";

import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export type ErrorStateProps = {
  title?: ReactNode;
  description?: ReactNode;
  /** Retry handler; renders a retry button when provided. */
  onRetry?: () => void;
  /** Localized label for the retry button (defaults provided below). */
  retryLabel?: ReactNode;
  className?: string;
};

/**
 * Inline error fallback with role="alert" so screen readers announce it.
 * Never pass raw server/database error text — provide sanitized copy.
 */
export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  retryLabel = "Try again",
  className,
}: ErrorStateProps) {
  return (
    <div
      className={["mgmt-error-state", className].filter(Boolean).join(" ")}
      role="alert"
    >
      <span className="mgmt-error-state__icon" aria-hidden="true">
        <AlertTriangle size={20} />
      </span>
      <p className="mgmt-error-state__title">{title}</p>
      {description ? (
        <p className="mgmt-error-state__description">{description}</p>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          className="mgmt-error-state__retry"
          onClick={onRetry}
        >
          <RefreshCw size={15} aria-hidden="true" />
          <span>{retryLabel}</span>
        </button>
      ) : null}
    </div>
  );
}
