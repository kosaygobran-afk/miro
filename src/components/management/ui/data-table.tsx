import type { ReactNode } from "react";
import { ScrollRegion } from "./scroll-region";

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
}: DataTableProps) {
  return (
    <div className={["mgmt-table", className].filter(Boolean).join(" ")}>
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
          <tbody className="mgmt-table__body">
            {isEmpty ? null : children}
          </tbody>
        </table>
      </ScrollRegion>
      {isEmpty ? <div className="mgmt-table__empty">{emptyState}</div> : null}
    </div>
  );
}
