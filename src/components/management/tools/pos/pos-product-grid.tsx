"use client";

import { PosProductCard } from "./pos-product-card";
import type { PosCatalogItem, PosVariant } from "./pos-types";
import type { Locale } from "@/lib/i18n";
import styles from "./pos-workspace.module.css";

interface PosProductGridProps {
  locale: Locale;
  products: PosCatalogItem[];
  onVariantPick: (product: PosCatalogItem, variant: PosVariant) => void;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  saving?: boolean;
}
export function PosProductGrid({
  locale,
  products,
  onVariantPick,
  loading,
  hasMore,
  onLoadMore,
  saving,
}: PosProductGridProps) {
  const he = locale === "he";
  return (
    <>
      <ul
        className={styles.productGrid}
        aria-label={he ? "מוצרים" : "Products"}
        aria-busy={loading}
      >
        {products.map((product) => (
          <li key={product.id}>
            <PosProductCard
              locale={locale}
              product={product}
              onPick={onVariantPick}
              saving={saving}
            />
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          type="button"
          className={styles.more}
          onClick={onLoadMore}
          disabled={loading || saving}
        >
          {loading
            ? he
              ? "טוען מוצרים…"
              : "Loading products…"
            : he
              ? "טעינת מוצרים נוספים"
              : "Load more products"}
        </button>
      )}
    </>
  );
}
