"use client";

import { cn } from "./pos-utils";
import { useId } from "react";
import { Minus, Plus, Trash2, AlertCircle, Tag } from "lucide-react";
import {
  formatPrice,
  isTracked,
  getAvailableStock,
  computeLineTotals,
} from "./pos-utils";
import type { PosCartLine } from "./pos-types";
import type { Locale } from "@/lib/i18n";

interface PosCartLineProps {
  locale: Locale;
  line: PosCartLine;
  onChange: (key: string, patch: Partial<PosCartLine>) => void;
  onRemove: (key: string) => void;
  saving: boolean;
}

export function PosCartLine({
  locale,
  line,
  onChange,
  onRemove,
  saving,
}: PosCartLineProps) {
  const he = locale === "he";
  const stockErrorId = useId();
  const t = (map: Record<"he" | "en", string>) => map[locale];

  const isManual = line.isManual || line.variantId?.startsWith("manual-");
  const isService = line.isService || line.variantId?.startsWith("service-");
  const tracked = !isManual && line.product ? isTracked(line.product) : false;
  const availableStock = line.variant ? getAvailableStock(line.variant) : 0;
  const stockExceeded = tracked && line.quantity > availableStock;
  const lowStock =
    tracked && availableStock > 0 && line.quantity >= availableStock;

  const name = line.product
    ? he
      ? line.product.name_he
      : line.product.name_en
    : isManual
      ? line.manualName || t({ he: "פריט ידני", en: "Manual Item" })
      : "—";

  const variantLabel =
    line.variant &&
    (line.variant.color_he || line.variant.color_en) &&
    !isManual
      ? ` · ${he ? line.variant.color_he : line.variant.color_en}`
      : "";

  const sku = line.variant?.sku ?? "—";
  const unitPrice = formatPrice(line.unitPrice, locale);
  let netLineTotal = 0;
  try {
    netLineTotal = computeLineTotals(
      line.quantity,
      line.unitPrice,
      line.discountPerUnit,
      0,
    ).gross;
  } catch {
    /* Invalid restored line is rejected at review. */
  }
  const lineTotal = formatPrice(netLineTotal, locale);

  return (
    <div
      className={cn(
        "relative flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface p-3 transition-colors",
        stockExceeded && "border-red-500/50",
      )}
    >
      {/* Main line content */}
      <div className={cn("flex items-start gap-3", he ? "rtl" : "ltr")}>
        {/* Product info */}
        <div className={cn("flex-1 min-w-0")}>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className={cn(
                "font-medium truncate",
                he ? "text-right" : "text-left",
              )}
            >
              {name}
            </span>
            {variantLabel && (
              <span className="text-sm text-muted-foreground">
                {variantLabel}
              </span>
            )}
            {isService && (
              <span
                className={cn(
                  "px-1.5 py-0.5 text-xs font-medium rounded-full",
                  "bg-primary/10 text-primary",
                )}
              >
                {t({ he: "שירות", en: "Service" })}
              </span>
            )}
            {isManual && !isService && (
              <span
                className={cn(
                  "px-1.5 py-0.5 text-xs font-medium rounded-full",
                  "bg-amber-100/10 text-amber-400 dark:bg-amber-900/20",
                )}
              >
                {t({ he: "ידני", en: "Manual" })}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span
              className={cn("font-mono ltr", he ? "text-right" : "text-left")}
            >
              {sku}
            </span>
            {tracked && line.variant && (
              <span
                className={cn(
                  "flex items-center gap-1",
                  lowStock ? "text-amber-400" : "text-muted-foreground",
                )}
              >
                <span>{t({ he: "מלאי:", en: "Stock:" })}</span>
                <span className="font-mono font-medium">{availableStock}</span>
              </span>
            )}
            {isManual && line.product && (
              <span className="text-muted-foreground">
                {t({ he: "הערה:", en: "Note:" })}{" "}
                {he ? line.product.name_he : line.product.name_en}
              </span>
            )}
          </div>
          {stockExceeded && line.variant && (
            <p
              id={stockErrorId}
              className="mt-1 flex items-center gap-1 text-xs text-foreground"
              role="alert"
            >
              <AlertCircle
                className="h-3 w-3 flex-shrink-0"
                aria-hidden="true"
              />
              {t({
                he: "הכמות גבוהה מהמלאי הזמין ({available})",
                en: "Quantity exceeds available stock ({available})",
              }).replace("{available}", String(availableStock))}
            </p>
          )}
        </div>

        {/* Controls */}
        <div
          className={cn(
            "flex items-center gap-2 shrink-0",
            "lg:flex-col lg:items-end",
          )}
        >
          {/* Quantity Stepper */}
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-lg border border-border-control bg-surface-muted p-1",
            )}
          >
            <button
              type="button"
              onClick={() =>
                onChange(line.key, { quantity: Math.max(1, line.quantity - 1) })
              }
              disabled={saving || line.quantity <= 1}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-surface",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                "disabled:opacity-30 disabled:cursor-not-allowed",
              )}
              aria-label={`${t({ he: "הקטן כמות", en: "Decrease quantity" })}: ${name}`}
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <input
              type="number"
              min="1"
              step="1"
              max={tracked ? Math.min(10000, availableStock) : 10000}
              inputMode="numeric"
              dir="ltr"
              value={line.quantity}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (Number.isSafeInteger(val) && val > 0 && val <= 10000)
                  onChange(line.key, { quantity: val });
              }}
              className={cn(
                "w-14 text-center text-sm font-mono bg-transparent border-0",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                "text-foreground",
                he ? "text-right" : "text-left",
              )}
              disabled={saving}
              aria-label={`${t({ he: "כמות", en: "Quantity" })}: ${name}`}
              aria-invalid={stockExceeded || undefined}
              aria-describedby={stockExceeded ? stockErrorId : undefined}
            />
            <button
              type="button"
              onClick={() => {
                const nextQty = line.quantity + 1;
                if (!tracked || nextQty <= availableStock) {
                  onChange(line.key, { quantity: nextQty });
                }
              }}
              disabled={
                saving ||
                line.quantity >= 10000 ||
                (tracked && line.quantity >= availableStock)
              }
              className={cn(
                "p-1.5 rounded-md transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-surface",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                "disabled:opacity-30 disabled:cursor-not-allowed",
              )}
              aria-label={`${t({ he: "הגדל כמות", en: "Increase quantity" })}: ${name}`}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Unit Price (display only, not editable by default) */}
          <div className={cn("text-sm font-mono text-foreground ltr")}>
            {unitPrice}
          </div>

          {/* Discount indicator */}
          {line.discountPerUnit > 0 && (
            <div
              className={cn(
                "px-2 py-0.5 text-xs font-medium rounded-full",
                "bg-amber-100/10 text-amber-400 dark:bg-amber-900/20",
              )}
            >
              <Tag className="inline h-3 w-3 mr-1" aria-hidden="true" />
              {formatPrice(line.discountPerUnit, locale)}{" "}
              {t({ he: "ליחידה", en: "/unit" })}
            </div>
          )}

          {/* Line Total */}
          <div
            className={cn("text-lg font-bold tabular-nums text-foreground ltr")}
          >
            {lineTotal}
          </div>

          {/* Remove Button */}
          <button
            type="button"
            onClick={() => onRemove(line.key)}
            disabled={saving}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              "text-muted-foreground hover:text-red-400 hover:bg-red-500/10",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
              "disabled:opacity-30 disabled:cursor-not-allowed",
            )}
            aria-label={`${t({ he: "הסר פריט", en: "Remove item" })}: ${name}`}
          >
            <Trash2 className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
