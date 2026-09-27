"use client";

import type { ReactNode } from "react";
import { Search } from "lucide-react";

export type ToolbarProps = {
  /** Controlled search value. Omit search props to render filters only. */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Accessible label for the search input (visually hidden). */
  searchLabel?: string;
  /** Filters row slot (selects, chips, toggle buttons). */
  children?: ReactNode;
  /** Trailing actions slot (e.g. primary "Add" button). */
  actions?: ReactNode;
  className?: string;
};

export function Toolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchLabel = "Search",
  children,
  actions,
  className,
}: ToolbarProps) {
  const hasSearch = onSearchChange !== undefined;
  return (
    <div className={["mgmt-toolbar", className].filter(Boolean).join(" ")}>
      <div className="mgmt-toolbar__row">
        {hasSearch ? (
          <div className="mgmt-toolbar__search">
            <Search
              size={16}
              aria-hidden="true"
              className="mgmt-toolbar__search-icon"
            />
            <input
              type="search"
              className="mgmt-toolbar__search-input"
              value={searchValue ?? ""}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchLabel}
            />
          </div>
        ) : null}
        {children ? (
          <div className="mgmt-toolbar__filters">{children}</div>
        ) : null}
        {actions ? (
          <div className="mgmt-toolbar__actions">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
