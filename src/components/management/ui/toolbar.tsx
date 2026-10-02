"use client";

import type { ReactNode } from "react";
import { SearchField } from "./search-field";

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
          <SearchField
            className="mgmt-toolbar__search"
            value={searchValue ?? ""}
            onValueChange={onSearchChange}
            placeholder={searchPlaceholder}
            label={searchLabel}
            clearLabel={
              /[\u0590-\u05ff]/.test(searchLabel)
                ? "ניקוי חיפוש"
                : "Clear search"
            }
          />
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
