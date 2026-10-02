import { Children, isValidElement, type ReactNode } from "react";
import { ScrollRegion } from "./scroll-region";
import { TableSkeletonRows } from "./skeleton";

export type DataTableProps = {
  /** Header cells: a single <tr> containing <th> elements. */
  head: ReactNode;
  /** Body rows (<tr> elements). Ignored visually when isEmpty is true. */
  children: ReactNode;
  /** When true, renders `emptyState` under the header instead of the rows. */
  isEmpty?: boolean;
  /** Slot rendered in place of rows when isEmpty (use <EmptyState>). */
  emptyState?: ReactNode;
  /** Accessible <caption> for the table. */
  caption?: ReactNode;
  /** Sticky header while scrolling the page/container. Default true. */
  stickyHeader?: boolean;
  /** Minimum table width before the horizontal scroll container kicks in. */
  minWidth?: number | string;
  className?: string;
  tableClassName?: string;
  columnWidths?: readonly string[];
  loading?: boolean;
  loadingLabel?: string;
  skeletonRows?: number;
};

/**
 * Semantic table shell: scroll container + table + optional sticky header +
 * empty state slot. The container is keyboard-focusable when scrollable so
 * keyboard users can scroll it horizontally.
 */
export function DataTable({
  head,
  children,
  isEmpty = false,
  emptyState,
  caption,
  stickyHeader = true,
  minWidth = "40rem",
  className,
  tableClassName,
  columnWidths,
  loading = false,
  loadingLabel = "Loading data… / טוען נתונים…",
  skeletonRows = 5,
}: DataTableProps) {
  const headerColumns = isValidElement<{ children?: ReactNode }>(head)
    ? Children.toArray(head.props.children).length
    : 5;
  return (
    <div
      className={["mgmt-table", className].filter(Boolean).join(" ")}
      aria-busy={loading || undefined}
    >
      {loading ? (
        <span className="sr-only" role="status">
          {loadingLabel}
        </span>
      ) : null}
      <ScrollRegion
        className="mgmt-table__scroll"
        label={typeof caption === "string" ? caption : undefined}
      >
        <table
          className={["mgmt-table__table", tableClassName]
            .filter(Boolean)
            .join(" ")}
          style={{
            minWidth: typeof minWidth === "number" ? `${minWidth}px` : minWidth,
          }}
        >
          {caption ? (
            <caption className="mgmt-table__caption">{caption}</caption>
          ) : null}
          {columnWidths ? (
            <colgroup>
              {columnWidths.map((width, index) => (
                <col key={index} style={{ width }} />
              ))}
            </colgroup>
          ) : null}
          <thead
            className={
              stickyHeader
                ? "mgmt-table__head mgmt-table__head--sticky"
                : "mgmt-table__head"
            }
          >
            {head}
          </thead>
          <tbody
            key={loading ? "loading" : "content"}
            className={`mgmt-table__body${loading ? "" : " motion-content-reveal"}`}
          >
            {loading ? (
              <TableSkeletonRows
                columns={columnWidths?.length ?? headerColumns}
                rows={skeletonRows}
              />
            ) : isEmpty ? null : (
              children
            )}
          </tbody>
        </table>
      </ScrollRegion>
      {!loading && isEmpty ? (
        <div className="mgmt-table__empty motion-content-reveal">
          {emptyState}
        </div>
      ) : null}
    </div>
  );
}
