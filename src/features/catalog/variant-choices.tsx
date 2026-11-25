"use client";

import { useId } from "react";
import { PriceAmount } from "./price-amount";
import { stockCopy } from "./stock-indicator";
import type { ProductVariant } from "./product-data";
import {
  formatPrice,
  resolvePrice,
  type PricingInputs,
} from "@/lib/catalog/pricing";

export function VariantChoices({
  variants,
  selectedId,
  onSelect,
  locale,
  pricing,
  availabilityUnconfirmed = false,
  preview = false,
}: {
  variants: ProductVariant[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  locale: "he" | "en";
  pricing: PricingInputs;
  availabilityUnconfirmed?: boolean;
  preview?: boolean;
}) {
  const group = useId();
  if (!variants.length) return null;
  const copy = stockCopy[locale];
  return (
    <fieldset className="sf-variant-fieldset">
      <legend>
        {preview
          ? locale === "he"
            ? "אפשרויות המוצר"
            : "Product options"
          : locale === "he"
            ? "בחירת וריאנט"
            : "Choose variant"}
      </legend>
      <div className="sf-variant-chips">
        {variants.map((variant) => {
          const name =
            (locale === "he" ? variant.colorHe : variant.colorEn) ||
            variant.colorHe ||
            variant.colorEn ||
            variant.sku;
          const price = resolvePrice({
            ...pricing,
            selectedVariantId: variant.id,
          }).effectivePrice;
          const stock = availabilityUnconfirmed
            ? copy.availabilityOnRequest
            : variant.stockQty > 0
              ? `${variant.stockQty} ${copy.inStock}`
              : copy.outOfStock;
          return (
            <label key={variant.id} className="sf-variant-chip-label">
              <input
                type="radio"
                className="sr-only"
                name={group}
                value={variant.id}
                checked={selectedId === variant.id}
                onChange={() => onSelect(variant.id)}
                onFocus={(event) => {
                  // Scroll the visible choice, rather than its clipped radio,
                  // into a short preview's native details scroller.
                  event.currentTarget.parentElement?.scrollIntoView({
                    block: "nearest",
                    inline: "nearest",
                  });
                }}
              />
              <span className="sf-variant-chip">
                {variant.colorHex ? (
                  <span
                    className="sf-variant-swatch"
                    style={{ backgroundColor: variant.colorHex }}
                    aria-hidden="true"
                  />
                ) : null}
                <span className="sf-variant-name">
                  <bdi dir="auto">{name}</bdi>
                </span>
                <span className="sf-variant-stock">{stock}</span>
                <span className="sf-variant-price-diff" dir="auto">
                  {preview && price !== null ? (
                    <PriceAmount amount={price} locale={locale} />
                  ) : (
                    formatPrice(
                      price,
                      locale,
                      locale === "he" ? "מחיר לפי בירור" : "Price on request",
                    )
                  )}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
