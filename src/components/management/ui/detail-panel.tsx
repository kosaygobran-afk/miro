import type { ReactNode } from "react";

export type DetailRow = {
  label: ReactNode;
  value: ReactNode;
};

export type DetailPanelProps = {
  /** Optional panel heading. */
  title?: ReactNode;
  /** Key/value rows rendered as a description list. */
  rows: DetailRow[];
  /** Optional footer slot (notes, actions). */
  footer?: ReactNode;
  className?: string;
};

/**
 * Read-only detail panel: title plus key/value rows using <dl>/<dt>/<dd>
 * for correct semantics.
 */
export function DetailPanel({
  title,
  rows,
  footer,
  className,
}: DetailPanelProps) {
  return (
    <section
      className={["mgmt-detail-panel", className].filter(Boolean).join(" ")}
    >
      {title ? <h2 className="mgmt-detail-panel__title">{title}</h2> : null}
      <dl className="mgmt-detail-panel__list">
        {rows.map((row, index) => (
          <div className="mgmt-detail-panel__row" key={index}>
            <dt className="mgmt-detail-panel__label">{row.label}</dt>
            <dd className="mgmt-detail-panel__value">{row.value}</dd>
          </div>
        ))}
      </dl>
      {footer ? (
        <div className="mgmt-detail-panel__footer">{footer}</div>
      ) : null}
    </section>
  );
}
