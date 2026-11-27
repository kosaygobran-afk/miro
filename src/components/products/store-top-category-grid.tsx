"use client";

import { useId, useState, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import styles from "./store-top-category-nav.module.css";

export function StoreTopCategoryGrid({
  children,
  locale,
}: {
  children: ReactNode;
  locale: Locale;
}) {
  const gridId = useId();
  const [expanded, setExpanded] = useState(false);
  const he = locale === "he";
  const label = expanded
    ? he
      ? "פחות קטגוריות"
      : "Fewer categories"
    : he
      ? "עוד קטגוריות"
      : "More categories";

  return (
    <>
      <div
        id={gridId}
        className={`miro-container ${styles.grid}`}
        data-expanded={expanded}
      >
        {children}
      </div>
      <button
        type="button"
        className={styles.disclosure}
        aria-expanded={expanded}
        aria-controls={gridId}
        onClick={() => setExpanded((current) => !current)}
      >
        <svg viewBox="0 0 20 22" width="18" height="20" aria-hidden="true">
          <path
            d="m5 3 5 4 5-4M5 9l5 4 5-4M5 15l5 4 5-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {label}
      </button>
    </>
  );
}
