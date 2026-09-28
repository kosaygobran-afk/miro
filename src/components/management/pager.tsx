"use client";

import { useId } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./list-controls.module.css";

type PagerLocale = "he" | "en";

const pagerCopy = {
  rowsPerPage: { he: "שורות בעמוד", en: "Rows per page" },
  previous: { he: "הקודם", en: "Previous" },
  next: { he: "הבא", en: "Next" },
  // {from}, {to} and {total} are filled in at render time.
  showing: {
    he: "מוצגים {from}–{to} מתוך {total}",
    en: "Showing {from}–{to} of {total}",
  },
  showingEmpty: { he: "אין תוצאות", en: "No results" },
} as const satisfies Record<string, Record<PagerLocale, string>>;

export const PAGER_PAGE_SIZES = [25, 50, 100] as const;

export type PagerProps = {
  totalCount: number;
  limit: number;
  offset: number;
  onOffsetChange: (offset: number) => void;
  onLimitChange: (limit: number) => void;
  locale: PagerLocale;
  busy?: boolean;
};

function formatShowing(
  template: string,
  from: number,
  to: number,
  total: number,
): string {
  return template
    .replace("{from}", String(from))
    .replace("{to}", String(to))
    .replace("{total}", String(total));
}

/** Offset/limit pager with page-size select, Previous/Next and total count. */
export function Pager({
  totalCount,
  limit,
  offset,
  onOffsetChange,
  onLimitChange,
  locale,
  busy = false,
}: PagerProps) {
  const selectId = useId();
  const from = totalCount === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, totalCount);
  const info =
    totalCount === 0
      ? pagerCopy.showingEmpty[locale]
      : formatShowing(pagerCopy.showing[locale], from, to, totalCount);

  return (
    <div className={styles.pager}>
      <p className={styles.pagerInfo} role="status">
        {info}
      </p>
      <div className={styles.pagerControls}>
        <label className={styles.selectField} htmlFor={selectId}>
          <span>{pagerCopy.rowsPerPage[locale]}</span>
          <select
            id={selectId}
            className={styles.select}
            value={limit}
            disabled={busy}
            onChange={(event) => {
              const nextLimit = Number(event.target.value);
              if (PAGER_PAGE_SIZES.includes(nextLimit as 25 | 50 | 100)) {
                onLimitChange(nextLimit);
              }
            }}
          >
            {PAGER_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={styles.pagerButton}
          disabled={busy || offset <= 0}
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
        >
          <ChevronLeft
            size={15}
            aria-hidden="true"
            className={styles.pagerIcon}
          />
          <span>{pagerCopy.previous[locale]}</span>
        </button>
        <button
          type="button"
          className={styles.pagerButton}
          disabled={busy || offset + limit >= totalCount}
          onClick={() => onOffsetChange(offset + limit)}
        >
          <span>{pagerCopy.next[locale]}</span>
          <ChevronRight
            size={15}
            aria-hidden="true"
            className={styles.pagerIcon}
          />
        </button>
      </div>
    </div>
  );
}
