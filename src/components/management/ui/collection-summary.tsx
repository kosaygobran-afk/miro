import { Boxes, CheckCircle2, Layers3, CircleDashed } from "lucide-react";
import type { ReactNode } from "react";
import { MetricCard } from "./metric-card";
import { OverflowText } from "./overflow-text";

/** Counts must declare their scope: a loaded collection is not the whole database. */
export function CollectionSummary({
  items,
  scope,
}: {
  items: { label: string; value: ReactNode }[];
  scope?: string;
}) {
  const icons = [Boxes, CheckCircle2, Layers3, CircleDashed];
  return (
    <div className="mgmt-page-summary">
      {items.map((item, index) => {
        const Icon = icons[index % icons.length];
        return (
          <MetricCard
            key={item.label}
            label={<OverflowText text={item.label} />}
            value={item.value}
            icon={<Icon size={19} />}
          />
        );
      })}
      {scope ? <p className="mgmt-page-summary__scope">{scope}</p> : null}
    </div>
  );
}
