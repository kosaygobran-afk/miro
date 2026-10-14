"use client";

import {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { Search, ScanLine, Package, CircleAlert } from "lucide-react";
import { usePosCatalog } from "./use-pos-catalog";
import { usePosBarcode, usePosBarcodeInput } from "./use-pos-barcode";
import { PosProductGrid } from "./pos-product-grid";
import { PosCategoryChips } from "./pos-category-chips";
import { PosEmptyState } from "./pos-empty-state";
import { PosSkeleton } from "./pos-skeleton";
import type { Locale } from "@/lib/i18n";
import type { PosCatalogItem, PosVariant } from "./pos-types";
import styles from "./pos-workspace.module.css";

interface PosCatalogProps {
  locale: Locale;
  onVariantPick: (product: PosCatalogItem, variant: PosVariant) => void;
  saving: boolean;
  refreshToken: number;
}
export function PosCatalog({
  locale,
  onVariantPick,
  saving,
  refreshToken,
}: PosCatalogProps) {
  const he = locale === "he";
  const scopeRef = useRef<HTMLDivElement>(null);
  const scanController = useRef<AbortController | null>(null);
  const scanState = useRef({ saving, onVariantPick });
  const lastRefresh = useRef(refreshToken);
  const [scanMessage, setScanMessage] = useState("");
  const [scanning, setScanning] = useState(false);
  const catalog = usePosCatalog({ locale });
  const {
    products,
    categories,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    loading,
    error,
    refresh,
    hasMore,
    loadMore,
  } = catalog;
  useLayoutEffect(() => {
    scanState.current = { saving, onVariantPick };
    if (saving) scanController.current?.abort();
  }, [saving, onVariantPick]);
  useEffect(() => () => scanController.current?.abort(), []);
  useEffect(() => {
    if (lastRefresh.current !== refreshToken) {
      lastRefresh.current = refreshToken;
      void refresh();
    }
  }, [refreshToken, refresh]);
  const scan = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!value || saving) return;
      scanController.current?.abort();
      const controller = new AbortController();
      scanController.current = controller;
      setScanning(true);
      setScanMessage("");
      try {
        // Exact scanning is independent of the visible category/page and stale cache.
        const response = await fetch(
          `/api/management/pos/catalog?q=${encodeURIComponent(value)}&limit=100&exact=1`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok)
          throw new Error(
            he
              ? "לא ניתן לבדוק את הברקוד. נסה שוב."
              : "Unable to check the barcode. Try again.",
          );
        const data = await response.json();
        if (controller.signal.aborted || scanState.current.saving) return;
        const found: Array<{ product: PosCatalogItem; variant: PosVariant }> =
          [];
        for (const product of (Array.isArray(data.products)
          ? data.products
          : []) as PosCatalogItem[]) {
          for (const variant of product.variants) {
            if (
              variant.sku.toLowerCase() === value.toLowerCase() ||
              variant.barcode === value
            )
              found.push({ product, variant });
          }
        }
        if (found.length !== 1) {
          setScanMessage(
            found.length > 1
              ? he
                ? "הקוד תואם לכמה גרסאות. בחר מוצר וגרסה."
                : "This code matches several variants. Choose a product and variant."
              : he
                ? "לא נמצאה התאמה מדויקת. בחר מוצר מתוצאות החיפוש."
                : "No exact match. Choose a product from the search results.",
          );
          setSearchQuery(value);
          return;
        }
        scanState.current.onVariantPick(found[0].product, found[0].variant);
        setSearchQuery("");
      } catch (cause) {
        if (!controller.signal.aborted)
          setScanMessage(
            cause instanceof Error
              ? cause.message
              : he
                ? "שגיאת חיבור"
                : "Connection error",
          );
      } finally {
        if (scanController.current === controller) setScanning(false);
      }
    },
    [he, saving, setSearchQuery],
  );
  const handleScan = useCallback((value: string) => void scan(value), [scan]);
  usePosBarcode({
    onMatch: handleScan,
    enabled: !saving,
    scopeRef,
  });
  const { onKeyDown } = usePosBarcodeInput({
    onMatch: handleScan,
    enabled: !saving,
  });
  return (
    <div className={styles.catalog} ref={scopeRef}>
      <div className={styles.searchToolbar}>
        <div className={styles.sectionLabel}>
          <h3>{he ? "בחירת מוצרים" : "Choose products"}</h3>
          <span>
            {products.length} {he ? "מוצגים" : "shown"}
          </span>
        </div>
        <form
          className={styles.search}
          role="search"
          onSubmit={(event) => event.preventDefault()}
        >
          <Search size={19} aria-hidden="true" />
          <span className={styles.scanIcon}>
            <ScanLine size={20} aria-hidden="true" />
          </span>
          <label className="sr-only" htmlFor="pos-product-search">
            {he ? "חיפוש שם, מק״ט או ברקוד" : "Search name, SKU or barcode"}
          </label>
          <input
            type="search"
            id="pos-product-search"
            autoComplete="off"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setScanMessage("");
            }}
            onKeyDown={onKeyDown}
            placeholder={
              he ? "שם מוצר, מק״ט או ברקוד…" : "Product name, SKU or barcode…"
            }
            disabled={saving}
            aria-describedby="pos-scan-hint"
          />
        </form>
        <p className={styles.hint} id="pos-scan-hint">
          {he
            ? "סריקת ברקוד או הקלדת מק״ט + Enter מוסיפות התאמה מדויקת."
            : "Scan a barcode or enter a SKU + Enter to add an exact match."}
        </p>
        <p className={styles.hint} role="status">
          {scanning ? (he ? "בודק ברקוד…" : "Checking barcode…") : scanMessage}
        </p>
      </div>
      <PosCategoryChips
        locale={locale}
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        disabled={saving}
      />
      <div className={styles.catalogScroll}>
        {loading && products.length === 0 ? (
          <PosSkeleton />
        ) : error ? (
          <PosEmptyState
            icon={CircleAlert}
            title={he ? "שגיאה בטעינת מוצרים" : "Failed to load products"}
            description={error}
            actionLabel={he ? "נסה שוב" : "Try again"}
            onAction={() => void refresh()}
          />
        ) : products.length === 0 ? (
          <PosEmptyState
            icon={Package}
            title={he ? "לא נמצאו מוצרים" : "No products found"}
            description={
              he
                ? "נסה חיפוש אחר או בחר קטגוריה אחרת."
                : "Try another search or category."
            }
          />
        ) : (
          <PosProductGrid
            locale={locale}
            products={products}
            onVariantPick={onVariantPick}
            loading={loading}
            hasMore={hasMore}
            onLoadMore={() => void loadMore()}
            saving={saving || loading}
          />
        )}
      </div>
    </div>
  );
}
