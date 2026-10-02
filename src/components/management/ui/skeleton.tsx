import type { CSSProperties } from "react";
import styles from "./skeleton.module.css";

export type SkeletonProps = {
  /** Width preset or an explicit CSS length. */
  width?: "sm" | "md" | "lg" | "full" | string;
  /** Explicit CSS height; defaults to a text-line height. */
  height?: string;
  /** Circular shape (avatars). */
  circle?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function Skeleton({
  width = "md",
  height,
  circle = false,
  className,
  style,
}: SkeletonProps) {
  const preset = ["sm", "md", "lg", "full"].includes(width);
  const widths: Record<string, string> = {
    sm: "30%",
    md: "55%",
    lg: "75%",
    full: "100%",
  };
  const mergedStyle: CSSProperties = {
    width: preset ? widths[width] : width,
    ...(height ? { height } : {}),
    ...(circle ? { borderRadius: "50%" } : {}),
    ...style,
  };
  return (
    <span
      aria-hidden="true"
      className={[
        styles.line,
        "motion-skeleton",
        "mgmt-skeleton",
        "mgmt-skeleton--text",
        preset ? `mgmt-skeleton--w-${width}` : null,
        circle ? "mgmt-skeleton--circle" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={mergedStyle}
    />
  );
}

export type ListSkeletonProps = {
  /** Number of placeholder rows. */
  rows?: number;
  /** Render a leading circle per row (avatar-style lists). */
  withAvatar?: boolean;
  className?: string;
};

export function ListSkeleton({
  rows = 5,
  withAvatar = false,
  className,
}: ListSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={["mgmt-list-skeleton", className].filter(Boolean).join(" ")}
    >
      {Array.from({ length: rows }, (_, index) => (
        <div className="mgmt-list-skeleton__row" key={index}>
          {withAvatar ? (
            <Skeleton circle width="2.5rem" height="2.5rem" />
          ) : null}
          <Skeleton width="full" />
        </div>
      ))}
    </div>
  );
}

export type TableSkeletonProps = {
  /** Actual visible column labels; placeholders are decorative when absent. */
  columns: number | readonly string[];
  rows?: number;
  columnWidths?: readonly string[];
  leadingImage?: boolean;
  minWidth?: string;
  label?: string;
  className?: string;
  /** Initial page fetches participate in navigation completion; background fetches do not. */
  routeLoading?: boolean;
  /** Match legacy lists whose actual mobile UI uses cards instead of a scrolling table. */
  mobileCards?: boolean;
};

export function TableSkeletonRows({
  columns,
  rows = 5,
  leadingImage = false,
}: Pick<TableSkeletonProps, "columns" | "rows" | "leadingImage">) {
  const columnCount = typeof columns === "number" ? columns : columns.length;
  return Array.from({ length: rows }, (_, row) => (
    <tr key={row} aria-hidden="true" className={styles.row}>
      {Array.from({ length: columnCount }, (_, column) => (
        <td key={column}>
          {column === 0 && leadingImage ? (
            <Skeleton width="3rem" height="3rem" />
          ) : (
            <Skeleton
              width={
                column === columnCount - 1 ? "3rem" : row % 2 ? "75%" : "85%"
              }
              height={column === columnCount - 1 ? "1.8rem" : undefined}
            />
          )}
        </td>
      ))}
    </tr>
  ));
}

/** Reserve the table's columns and row geometry, including its horizontal overflow. */
export function TableSkeleton({
  columns,
  rows = 5,
  columnWidths,
  leadingImage = false,
  minWidth = "60rem",
  label = "Loading data… / טוען נתונים…",
  className,
  routeLoading = true,
  mobileCards = false,
}: TableSkeletonProps) {
  const headers =
    typeof columns === "number"
      ? Array.from({ length: columns }, () => "")
      : columns;
  return (
    <div
      className={[styles.tableRegion, className].filter(Boolean).join(" ")}
      aria-busy="true"
      data-route-loading={routeLoading ? "true" : undefined}
    >
      <span className="sr-only" role="status">
        {label}
      </span>
      <div
        className={`${styles.tableScroll}${mobileCards ? ` ${styles.desktopTable}` : ""}`}
      >
        <table className={styles.table} style={{ minWidth }} aria-hidden="true">
          {columnWidths ? (
            <colgroup>
              {columnWidths.map((width, index) => (
                <col key={index} style={{ width }} />
              ))}
            </colgroup>
          ) : null}
          <thead>
            <tr>
              {headers.map((header, index) => (
                <th key={index} scope="col">
                  {header || <Skeleton width="75%" />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <TableSkeletonRows
              columns={columns}
              rows={rows}
              leadingImage={leadingImage}
            />
          </tbody>
        </table>
      </div>
      {mobileCards ? (
        <div className={styles.mobileCards} aria-hidden="true">
          {Array.from({ length: Math.min(rows, 3) }, (_, index) => (
            <div key={index} className={styles.mobileCard}>
              <Skeleton width="70%" height="1.3rem" />
              <Skeleton width="50%" />
              <div className={styles.mobileFields}>
                {Array.from(
                  { length: Math.min(headers.length - 1, 5) },
                  (_, field) => (
                    <div key={field}>
                      <Skeleton width="30%" />
                      <Skeleton width="40%" />
                    </div>
                  ),
                )}
              </div>
              <Skeleton width="full" height="2.75rem" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function FormSkeleton({
  fields = 6,
  label = "Loading form… / טוען טופס…",
}: {
  fields?: number;
  label?: string;
}) {
  return (
    <div className={styles.form} aria-busy="true" data-route-loading="true">
      <span className="sr-only" role="status">
        {label}
      </span>
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className={styles.field} aria-hidden="true">
          <Skeleton width="40%" />
          <Skeleton width="full" height="2.75rem" />
        </div>
      ))}
      <Skeleton width="8rem" height="2.75rem" />
    </div>
  );
}

export function DashboardSkeleton({
  metrics = 4,
  label = "Loading dashboard… / טוען לוח בקרה…",
}: {
  metrics?: number;
  label?: string;
}) {
  return (
    <div
      className={styles.dashboard}
      aria-busy="true"
      data-route-loading="true"
    >
      <span className="sr-only" role="status">
        {label}
      </span>
      <div className={styles.metrics} aria-hidden="true">
        {Array.from({ length: metrics }, (_, index) => (
          <div className={styles.metric} key={index}>
            <Skeleton width="70%" />
            <Skeleton width="50%" height="2rem" />
            <Skeleton width="85%" />
          </div>
        ))}
      </div>
      <div className={styles.chart} aria-hidden="true">
        <Skeleton width="40%" />
        <Skeleton width="full" height="15rem" />
      </div>
      <TableSkeleton columns={6} rows={4} routeLoading={false} />
    </div>
  );
}
