"use client";

import { Package, AlertTriangle, RefreshCw } from "lucide-react";

type ProductVariant = {
  id: string;
  sku: string;
  color_he: string | null;
  color_en: string | null;
  color_hex: string | null;
  stock_qty: number;
  low_stock_threshold: number;
  reorder_point: number | null;
  reorder_qty: number | null;
  is_active: boolean;
  is_default: boolean;
};

export function InventoryDisplay({
  locale,
  variants,
  onNavigateToInventory,
}: {
  locale: "he" | "en";
  variants: ProductVariant[];
  onNavigateToInventory?: () => void;
}) {
  const he = locale === "he";
  const activeVariants = variants.filter((v) => v.is_active);
  const totalStock = activeVariants.reduce((sum, v) => sum + v.stock_qty, 0);
  const lowStockVariants = activeVariants.filter(
    (v) => v.low_stock_threshold > 0 && v.stock_qty <= v.low_stock_threshold,
  );
  const outOfStockVariants = activeVariants.filter((v) => v.stock_qty === 0);

  const getColorIndicator = (variant: ProductVariant) => {
    if (!variant.is_active)
      return {
        label: he ? "לא פעיל" : "Inactive",
        className: "status-badge status-badge--suspended",
      };
    if (variant.stock_qty === 0)
      return {
        label: he ? "אזל מהמלאי" : "Out of stock",
        className: "status-badge status-badge--blocked",
      };
    if (
      variant.low_stock_threshold > 0 &&
      variant.stock_qty <= variant.low_stock_threshold
    )
      return {
        label: he ? "מלאי נמוך" : "Low stock",
        className: "status-badge status-badge--suspended",
      };
    return {
      label: he ? "במלאי" : "In stock",
      className: "status-badge status-badge--active",
    };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium">
          {he ? "מצב מלאי" : "Inventory Status"}
        </label>
        {onNavigateToInventory && (
          <button
            type="button"
            className="miro-button miro-button-secondary text-sm"
            onClick={onNavigateToInventory}
          >
            <RefreshCw className="mr-1 h-4 w-4" />
            {he ? "ניהול מלאי מלא" : "Full inventory management"}
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="miro-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg users-management__message--success flex items-center justify-center">
              <Package className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-black tabular-nums">{totalStock}</p>
              <p className="text-sm text-muted-foreground">
                {he ? "סה״כ במלאי" : "Total in stock"}
              </p>
            </div>
          </div>
        </div>
        <div className="miro-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg users-management__message--error flex items-center justify-center">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-black tabular-nums text-error-text">
                {lowStockVariants.length}
              </p>
              <p className="text-sm text-muted-foreground">
                {he ? "מלאי נמוך" : "Low stock"}
              </p>
            </div>
          </div>
        </div>
        <div className="miro-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg users-management__message--error flex items-center justify-center">
              <Package className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-black tabular-nums text-error-text">
                {outOfStockVariants.length}
              </p>
              <p className="text-sm text-muted-foreground">
                {he ? "אזל מהמלאי" : "Out of stock"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Variants Detail */}
      {variants.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            {he ? "פירוט לפי וריאנט" : "Per variant details"}
          </h4>
          <div
            className="space-y-2"
            role="list"
            aria-label={
              he ? "פירוט מלאי וריאנטים" : "Variant inventory details"
            }
          >
            {variants.map((variant) => {
              const status = getColorIndicator(variant);
              return (
                <article
                  key={variant.id}
                  className="miro-card p-3"
                  role="listitem"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {variant.color_hex && (
                        <div
                          className="h-8 w-8 rounded border border-border-subtle flex-shrink-0"
                          style={{ backgroundColor: variant.color_hex }}
                          aria-hidden="true"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">
                            {he
                              ? (variant.color_he ?? "—")
                              : (variant.color_en ?? "—")}
                          </p>
                          <span className="font-mono text-xs text-muted-foreground">
                            {variant.sku}
                          </span>
                          {variant.is_default && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 whitespace-nowrap">
                              {he ? "ברירת מחדל" : "Default"}
                            </span>
                          )}
                          {!variant.is_active && (
                            <span className="status-badge status-badge--suspended whitespace-nowrap">
                              {he ? "לא פעיל" : "Inactive"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap text-right">
                      <div className="text-right">
                        <p className="text-2xl font-black tabular-nums">
                          {variant.stock_qty}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {he ? "יחידות" : "units"}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={status.className}>{status.label}</span>
                      </div>
                      {variant.low_stock_threshold > 0 && (
                        <div className="text-right text-xs text-muted-foreground">
                          <p>
                            {he ? "סף נמוך" : "Low threshold"}:{" "}
                            {variant.low_stock_threshold}
                          </p>
                          {variant.reorder_point && (
                            <p>
                              {he ? "נקודת הזמנה" : "Reorder point"}:{" "}
                              {variant.reorder_point}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {variants.length === 0 && (
        <div className="miro-card p-8 text-center border-dashed border-border-subtle">
          <Package
            className="mx-auto h-12 w-12 text-muted-foreground mb-4"
            aria-hidden="true"
          />
          <p className="text-muted-foreground">
            {he
              ? "אין וריאנטים למוצר זה. הוסף וריאנטים כדי לנהל מלאי."
              : "No variants for this product. Add variants to manage inventory."}
          </p>
        </div>
      )}
    </div>
  );
}
