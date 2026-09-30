"use client";

import { useEffect, useState } from "react";
import { Check, Plus, ShoppingCart } from "lucide-react";
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
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);
  const label = locale === "he" ? "הוספה לסל" : "Add to cart";
  const addedLabel = locale === "he" ? "נוסף לסל" : "Added to cart";

  useEffect(() => {
    if (!added) return;
    const timeout = window.setTimeout(() => setAdded(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [added]);

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
