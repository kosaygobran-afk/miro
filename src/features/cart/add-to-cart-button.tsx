"use client";

import { useEffect, useState } from "react";
import { Check, Minus, Plus, ShoppingCart } from "lucide-react";
import { useCart, type CartItem } from "@/features/cart/cart-context";

type AddToCartButtonProps = {
  item: Omit<CartItem, "quantity">;
  locale: "he" | "en";
  compact?: boolean;
  disabled?: boolean;
};

export function AddToCartButton({
  item,
  locale,
  compact = false,
  disabled = false,
}: AddToCartButtonProps) {
  const { addItem, items, updateQuantity } = useCart();
  const quantity =
    items.find(
      (entry) =>
        entry.productId === item.productId &&
        entry.variantId === item.variantId,
    )?.quantity ?? 0;
  const [added, setAdded] = useState(false);
  const label = locale === "he" ? "הוספה לסל" : "Add to cart";
  const addedLabel = locale === "he" ? "נוסף לסל" : "Added to cart";

  useEffect(() => {
    if (!added) return;
    const timeout = window.setTimeout(() => setAdded(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [added]);

  if (quantity > 0)
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
          disabled={disabled}
          aria-label={`${locale === "he" ? "הפחתת כמות" : "Decrease quantity"}: ${item.name}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            updateQuantity(item.productId, item.variantId, quantity - 1);
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
      className={`sf-add-cart-button ${compact ? "is-compact" : ""} ${added ? "is-added" : ""}`}
      aria-label={`${added ? addedLabel : label}: ${item.name}`}
      title={added ? addedLabel : label}
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        addItem(item);
        setAdded(true);
      }}
    >
      <span className="sf-cart-icon" aria-hidden="true">
        <ShoppingCart size={compact ? 19 : 20} />
        {added ? <Check size={11} /> : <Plus size={11} />}
      </span>
      {compact ? null : <span>{added ? addedLabel : label}</span>}
    </button>
  );
}
