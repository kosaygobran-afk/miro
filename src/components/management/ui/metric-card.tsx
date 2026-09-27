import type { ReactNode } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

export type MetricCardTone =
  "default" | "accent" | "success" | "warning" | "danger";

export type MetricCardProps = {
  /** Metric label, e.g. "Revenue today". */
  label: ReactNode;
  /** Metric value. Keep it pre-formatted (locale currency etc.). */
  value: ReactNode;
  /** Delta content, e.g. "+12%". Rendered with a direction icon. */
  delta?: ReactNode;
  /** Direction of the delta; picks the icon. Defaults to "flat". */
  deltaDirection?: "up" | "down" | "flat";
  /** Semantic tone for the delta (independent of direction). */
  deltaTone?: "success" | "danger" | "neutral";
  /** Emphasis tone for the whole card. */
  tone?: MetricCardTone;
  /** Optional leading icon node (typically a lucide icon). */
  icon?: ReactNode;
  /** Loading state swaps value/delta for skeleton lines. */
  loading?: boolean;
  /** Optional footer slot (hint text, link). */
  footer?: ReactNode;
  className?: string;
};

const deltaIcons = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
} as const;

export function MetricCard({
  label,
  value,
  delta,
  deltaDirection = "flat",
  deltaTone = "neutral",
  tone = "default",
  icon,
  loading = false,
  footer,
  className,
}: MetricCardProps) {
  const DeltaIcon = deltaIcons[deltaDirection];
  return (
    <article
      className={["mgmt-metric-card", `mgmt-metric-card--${tone}`, className]
        .filter(Boolean)
        .join(" ")}
      aria-busy={loading || undefined}
    >
      <div className="mgmt-metric-card__top">
        <span className="mgmt-metric-card__label">{label}</span>
        {icon ? (
          <span className="mgmt-metric-card__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </div>
      {loading ? (
        <div className="mgmt-metric-card__loading" aria-hidden="true">
          <span className="mgmt-skeleton mgmt-skeleton--text mgmt-metric-card__skeleton-value" />
          <span className="mgmt-skeleton mgmt-skeleton--text mgmt-metric-card__skeleton-delta" />
        </div>
      ) : (
        <>
          <div className="mgmt-metric-card__value">{value}</div>
          {delta ? (
            <div
              className={`mgmt-metric-card__delta mgmt-metric-card__delta--${deltaTone}`}
            >
              <DeltaIcon size={14} aria-hidden="true" />
              <span>{delta}</span>
            </div>
          ) : null}
        </>
      )}
      {footer ? <div className="mgmt-metric-card__footer">{footer}</div> : null}
    </article>
  );
}
