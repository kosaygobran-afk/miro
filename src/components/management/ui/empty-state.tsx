import type { ReactNode } from "react";

export type EmptyStateProps = {
  /** Optional icon node rendered above the title. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Call-to-action slot (button/link). */
  action?: ReactNode;
  /** Compact padding variant for embedding inside tables/cards. */
  compact?: boolean;
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={[
        "mgmt-empty-state",
        compact ? "mgmt-empty-state--compact" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon ? (
        <span className="mgmt-empty-state__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <p className="mgmt-empty-state__title">{title}</p>
      {description ? (
        <p className="mgmt-empty-state__description">{description}</p>
      ) : null}
      {action ? <div className="mgmt-empty-state__action">{action}</div> : null}
    </div>
  );
}
