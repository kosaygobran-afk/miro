"use client";

import { useState } from "react";

/** Bound the desktop table and mobile cards together without changing complete-collection counts. */
export function useCollectionPage<T>(items: readonly T[], filterKey = "") {
  const [page, setPage] = useState({ key: filterKey, offset: 0, limit: 25 });
  const requestedOffset = page.key === filterKey ? page.offset : 0;
  const offset = Math.min(
    requestedOffset,
    Math.max(0, Math.floor((items.length - 1) / page.limit) * page.limit),
  );
  return {
    visibleItems: items.slice(offset, offset + page.limit),
    pager: {
      totalCount: items.length,
      limit: page.limit,
      offset,
      onOffsetChange: (next: number) =>
        setPage({ key: filterKey, offset: next, limit: page.limit }),
      onLimitChange: (limit: number) =>
        setPage({ key: filterKey, offset: 0, limit }),
    },
  };
}
