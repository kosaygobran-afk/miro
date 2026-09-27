import type { ReactNode } from "react";

export type StatusBadgeTone =
  "neutral" | "accent" | "success" | "warning" | "danger" | "info";

/**
 * Business statuses used across the management console. The badge maps each
 * one to a tone; pass `tone` explicitly to override the mapping.
 */
export type MgmtStatus =
  // Catalog/product lifecycle
  | "draft"
  | "active"
  | "hidden"
  | "archived"
  // Request pipeline
  | "new"
  | "in_progress"
  | "waiting_customer"
  | "closed"
  | "spam"
  // Stock levels
  | "low_stock"
  | "out_of_stock"
  | "in_stock";

export const STATUS_TONE_MAP: Record<MgmtStatus, StatusBadgeTone> = {
  draft: "neutral",
  active: "success",
  hidden: "warning",
  archived: "neutral",
  new: "info",
  in_progress: "accent",
  waiting_customer: "warning",
  closed: "neutral",
  spam: "danger",
  low_stock: "warning",
  out_of_stock: "danger",
  in_stock: "success",
};

export type StatusBadgeProps = {
  /** Business status key; resolves a tone via STATUS_TONE_MAP. */
  status?: MgmtStatus | (string & {});
  /** Explicit tone override (wins over the status mapping). */
  tone?: StatusBadgeTone;
  /** Visible label — always pass localized text. */
  children: ReactNode;
  size?: "sm" | "md";
  /** Small dot indicator before the label. Default true. */
  withDot?: boolean;
  className?: string;
};

function isMgmtStatus(status: string): status is MgmtStatus {
  return status in STATUS_TONE_MAP;
}

export function StatusBadge({
  status,
  tone,
  children,
  size = "md",
  withDot = true,
  className,
}: StatusBadgeProps) {
  const resolvedTone: StatusBadgeTone =
    tone ??
    (status && isMgmtStatus(status) ? STATUS_TONE_MAP[status] : "neutral");
  return (
    <span
      className={[
        "mgmt-status-badge",
        `mgmt-status-badge--${resolvedTone}`,
        size === "sm" ? "mgmt-status-badge--sm" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-status={status}
    >
      {withDot ? (
        <span className="mgmt-status-badge__dot" aria-hidden="true" />
      ) : null}
      <span>{children}</span>
    </span>
  );
}
