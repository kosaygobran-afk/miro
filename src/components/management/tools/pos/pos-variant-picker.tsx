"use client";

import { cn } from "./pos-utils";
import {
  formatPrice,
  isTracked,
  getAvailableStock,
  getEffectivePrice,
  hasSellPrice,
} from "./pos-utils";
import { Dialog } from "@/components/management/ui/dialog";
import type { PosCatalogItem, PosVariant } from "./pos-types";
import type { Locale } from "@/lib/i18n";

interface PosVariantPickerProps {
  locale: Locale;
  product: PosCatalogItem;
  onPick: (variant: PosVariant) => void;
  onClose: () => void;
  open: boolean;
}

export function PosVariantPicker({
  locale,
  product,
  onPick,
  onClose,
  open,
}: PosVariantPickerProps) {
  const he = locale === "he";
  const t = (map: Record<"he" | "en", string>) => map[locale];

  if (!open) return null;

  const name = he ? product.name_he : product.name_en;
  const tracked = isTracked(product);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={name}
      description={
        product.variants.length > 1
          ? t({ he: "בחר גרסה", en: "Select variant" })
          : ""
      }
      size="sm"
      closeLabel={t({ he: "סגור", en: "Close" })}
      className="max-w-md"
    >
      <div className="space-y-2 max-h-[50vh] overflow-y-auto">
        {product.variants.map((variant) => {
          const inStock = tracked ? getAvailableStock(variant) > 0 : true;
          const stock = tracked ? getAvailableStock(variant) : null;
          const priced = hasSellPrice(product, variant);
          const price = priced
            ? formatPrice(getEffectivePrice(product, variant), locale)
            : t({ he: "נדרש מחיר", en: "Price needed" });
          const color = he
            ? (variant.color_he ?? variant.color_en)
            : (variant.color_en ?? variant.color_he);

          return (
            <button
              key={variant.id}
              type="button"
              onClick={() => {
                onPick(variant);
                onClose();
              }}
              disabled={!inStock || !priced}
              className={cn(
                "w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-border-subtle",
                "bg-surface hover:bg-surface-hover",
                (!inStock || !priced) && "opacity-50 cursor-not-allowed",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
              )}
            >
              <div className="flex-1 min-w-0 text-start">
                {color && (
                  <p className="text-sm font-medium truncate">{color}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span className="font-mono ltr">{variant.sku}</span>
                  {tracked && stock !== null && (
                    <span className="flex items-center gap-1">
                      {t({ he: "מלאי:", en: "Stock:" })} {stock}
                    </span>
                  )}
                  {tracked && stock === 0 && (
                    <span className="text-foreground">
                      {t({ he: "אזל מהמלאי", en: "Out of stock" })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={cn("font-bold tabular-nums text-foreground ltr")}
                >
                  {price}
                </span>
                {variant.is_default && (
                  <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-primary/10 text-primary">
                    {t({ he: "ברירת מחדל", en: "Default" })}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
