"use client";

import { useEffect, useState } from "react";
import { Check, Minus, Plus, ShoppingCart } from "lucide-react";
import { useCart, type CartItem } from "@/features/cart/cart-context";
import { cartConfigurationKey, cartLineId } from "./cart-items";

type AddToCartButtonProps = {
  item: Omit<CartItem, "quantity">;
  locale: "he" | "en";
  compact?: boolean;
  /** Keep a single cart icon (with a count badge) in four-action card footers. */
  iconOnly?: boolean;
  descriptionId?: string;
  disabled?: boolean;
  tabIndex?: number;
};

export function AddToCartButton({
  item,
  locale,
  compact = false,
  iconOnly = false,
  descriptionId,
  disabled = false,
  tabIndex,
}: AddToCartButtonProps) {
  const { addItem, items, updateQuantity } = useCart();
  const existing = items.find(
    (entry) => cartConfigurationKey(entry) === cartConfigurationKey(item),
  );
  const quantity = existing?.quantity ?? 0;
  const [added, setAdded] = useState(false);
  const label = locale === "he" ? "הוספה לסל" : "Add to cart";
  const addedLabel = locale === "he" ? "נוסף לסל" : "Added to cart";
  const atLimit = iconOnly && quantity >= 99;
  const actionLabel = atLimit
    ? locale === "he"
      ? "הכמות המרבית בסל"
      : "Maximum cart quantity reached"
    : added
      ? addedLabel
      : label;
  const quantityLabel =
    iconOnly && quantity > 0
      ? ` (${quantity} ${locale === "he" ? "בסל" : "in cart"})`
      : "";

  useEffect(() => {
    if (!added) return;
    const timeout = window.setTimeout(() => setAdded(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [added]);

  if (quantity > 0 && !iconOnly)
    return (
      <div
        className={`sf-cart-quantity ${compact ? "is-compact" : ""}`}
        role="group"
        aria-label={`${locale === "he" ? "כמות בסל" : "Cart quantity"}: ${item.name}`}
      >
        <span className="sf-cart-quantity-icon" aria-hidden="true">
          <ShoppingCart size={17} />
        </span>
        <button
          type="button"
          tabIndex={tabIndex}
          disabled={disabled}
          aria-label={`${locale === "he" ? "הפחתת כמות" : "Decrease quantity"}: ${item.name}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            updateQuantity(
              item.productId,
              item.variantId,
              quantity - 1,
              existing ? cartLineId(existing) : undefined,
            );
          }}
        >
          <Minus size={15} />
        </button>
        <output
          aria-live="polite"
          aria-label={locale === "he" ? "כמות" : "Quantity"}
        >
          {quantity}
        </output>
        <button
          type="button"
          tabIndex={tabIndex}
          disabled={disabled || quantity >= 99}
          aria-label={`${locale === "he" ? "הגדלת כמות" : "Increase quantity"}: ${item.name}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            addItem(item);
          }}
        >
          <Plus size={15} />
        </button>
      </div>
    );

  return (
    <button
      type="button"
      tabIndex={tabIndex}
      className={`sf-add-cart-button ${compact || iconOnly ? "is-compact" : ""} ${iconOnly ? "is-icon-only" : ""} ${added ? "is-added" : ""}`}
      aria-label={`${actionLabel}: ${item.name}${quantityLabel}`}
      aria-describedby={descriptionId}
      aria-disabled={atLimit || undefined}
      title={iconOnly ? undefined : added ? addedLabel : label}
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (atLimit) return;
        addItem(item);
        setAdded(true);
      }}
    >
      <span className="sf-cart-icon" aria-hidden="true">
        <ShoppingCart size={iconOnly ? 18 : compact ? 19 : 20} />
        {!iconOnly && (added ? <Check size={11} /> : <Plus size={11} />)}
      </span>
      {iconOnly && quantity > 0 && (
        <span className="sf-card-cart-count" aria-hidden="true">
          {quantity}
        </span>
      )}
      {compact || iconOnly ? null : <span>{added ? addedLabel : label}</span>}
    </button>
  );
}
