"use client";

import Image from "next/image";
import { useState } from "react";
import { Package, Plus, Layers } from "lucide-react";
import {
  formatPrice,
  getEffectivePrice,
  hasSellPrice,
  isInStock,
  isLowStock,
  isTracked,
} from "./pos-utils";
import { PosVariantPicker } from "./pos-variant-picker";
import type { PosCatalogItem, PosVariant } from "./pos-types";
import type { Locale } from "@/lib/i18n";
import styles from "./pos-workspace.module.css";

interface PosProductCardProps {
  locale: Locale;
  product: PosCatalogItem;
  onPick: (product: PosCatalogItem, variant: PosVariant) => void;
  saving?: boolean;
}
export function PosProductCard({
  locale,
  product,
  onPick,
  saving = false,
}: PosProductCardProps) {
  const he = locale === "he";
  const [pickerOpen, setPickerOpen] = useState(false);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const tracked = isTracked(product);
  const availableVariants = product.variants.filter((variant) =>
    isInStock(product, variant),
  );
  const inStock = availableVariants.length > 0;
  const pricedVariants = availableVariants.filter((value) =>
    hasSellPrice(product, value),
  );
  const hasPrice = pricedVariants.length > 0;
  const variant =
    pricedVariants.find((value) => value.is_default) ??
    pricedVariants[0] ??
    availableVariants[0] ??
    product.variants[0];
  const name =
    (he ? product.name_he : product.name_en) ||
    product.name_he ||
    product.name_en;
  const price =
    variant && hasSellPrice(product, variant)
      ? formatPrice(getEffectivePrice(product, variant), locale)
      : he
        ? "נדרש מחיר"
        : "Price needed";
  const choose = he ? "בחר גרסה" : "Choose variant";
  return (
    <>
      <button
        type="button"
        className={styles.productCard}
        onClick={() => {
          if (product.variants.length > 1) setPickerOpen(true);
          else if (variant) onPick(product, variant);
        }}
        disabled={!inStock || !hasPrice || saving}
        aria-label={`${name}, ${price}${product.variants.length > 1 ? `, ${choose}` : ""}${!inStock ? `, ${he ? "אזל מהמלאי" : "Out of stock"}` : ""}`}
      >
        <span className={styles.productImage}>
          {product.image_url && failedImage !== product.image_url ? (
            <Image
              src={product.image_url}
              alt=""
              fill
              sizes="(max-width: 740px) 45vw, 180px"
              unoptimized
              onError={() => setFailedImage(product.image_url)}
            />
          ) : (
            <Package size={40} strokeWidth={1.2} aria-hidden="true" />
          )}
          {tracked && (!inStock || (variant && isLowStock(variant))) && (
            <span className={styles.stockBadge}>
              {inStock
                ? he
                  ? "מלאי נמוך"
                  : "Low stock"
                : he
                  ? "אזל מהמלאי"
                  : "Out of stock"}
            </span>
          )}
        </span>
        <span className={styles.productInfo}>
          <span className={styles.productName}>{name}</span>
          <span className={styles.sku} dir="ltr">
            {variant?.sku || "—"}
          </span>
          {product.variants.length > 1 && (
            <span className={styles.sku}>
              {product.variants.length} {he ? "גרסאות" : "variants"}
            </span>
          )}
          <span className={styles.productPrice}>
            <span dir="ltr">{price}</span>
            <span className={styles.addIcon}>
              {product.variants.length > 1 ? (
                <Layers size={15} aria-hidden="true" />
              ) : (
                <Plus size={17} aria-hidden="true" />
              )}
            </span>
          </span>
        </span>
      </button>
      {pickerOpen && !saving && (
        <PosVariantPicker
          locale={locale}
          product={product}
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onPick={(selected) => onPick(product, selected)}
        />
      )}
    </>
  );
}
