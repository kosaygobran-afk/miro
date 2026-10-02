import type { ReactNode } from "react";
import Link from "@/components/motion/motion-link";
import { ArrowUpRight } from "lucide-react";

export function InsightCard({
  title,
  value,
  description,
  detail,
  icon,
  action,
  tone = "neutral",
}: {
  title: string;
  value: ReactNode;
  description: string;
  detail?: ReactNode;
  icon: ReactNode;
  action?: { href: string; label: string };
  tone?: "neutral" | "positive" | "attention";
}) {
  return (
    <article className="insight-card" data-tone={tone}>
      <div className="insight-card-heading">
        <span className="insight-icon" aria-hidden="true">
          {icon}
        </span>
        <h3>{title}</h3>
      </div>
      <div className="insight-card-value" dir="auto">
        {value}
      </div>
      <p>{description}</p>
      {detail ? <div className="insight-card-detail">{detail}</div> : null}
      {action ? (
        <Link href={action.href} className="insight-card-link">
          {action.label}
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      ) : null}
    </article>
  );
}

export function InsightSectionHeader({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="insight-section-heading">
      <div>
        <span className="insight-icon" aria-hidden="true">
          {icon}
        </span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}
