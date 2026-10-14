"use client";

import { LayoutGrid, Tag } from "lucide-react";
import type { PosCategory } from "./pos-types";
import type { Locale } from "@/lib/i18n";
import styles from "./pos-workspace.module.css";

interface PosCategoryChipsProps {
  locale: Locale;
  categories: PosCategory[];
  selectedCategory: PosCategory | null;
  onSelectCategory: (category: PosCategory | null) => void;
  disabled?: boolean;
}
export function PosCategoryChips({
  locale,
  categories,
  selectedCategory,
  onSelectCategory,
  disabled,
}: PosCategoryChipsProps) {
  const he = locale === "he";
  return (
    <nav
      className={styles.categories}
      aria-label={he ? "סינון לפי קטגוריה" : "Filter by category"}
    >
      <button
        type="button"
        className={styles.category}
        aria-pressed={selectedCategory === null}
        onClick={() => onSelectCategory(null)}
        disabled={disabled}
      >
        <LayoutGrid size={16} aria-hidden="true" />
        {he ? "הכל" : "All"}
      </button>
      {categories.map((category) => (
        <button
          type="button"
          key={category.id}
          className={styles.category}
          aria-pressed={selectedCategory?.id === category.id}
          onClick={() => onSelectCategory(category)}
          disabled={disabled}
        >
          <Tag size={15} aria-hidden="true" />
          {(he ? category.name_he : category.name_en) || category.name_he}
        </button>
      ))}
    </nav>
  );
}
