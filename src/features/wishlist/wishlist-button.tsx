"use client";

import { Heart, HeartOff } from "lucide-react";
import { useCart } from "@/features/cart/cart-context";
import { storeCopy } from "@/features/catalog/store-copy";
import type { Locale } from "@/lib/i18n";

export function WishlistButton({
  productId,
  locale,
  initialSaved = false,
  iconOnly = false,
  legacyIcon = false,
  descriptionId,
  tabIndex,
  onRemove,
}: {
  productId: string;
  locale: Locale;
  initialSaved?: boolean;
  iconOnly?: boolean;
  legacyIcon?: boolean;
  descriptionId?: string;
  tabIndex?: number;
  onRemove?: () => void;
}) {
  const { hydrated, wishlist, setWishlisted } = useCart();
  const saved = hydrated ? wishlist.includes(productId) : initialSaved;
  const copy = storeCopy[locale];
  const label = saved ? copy.removeFromWishlist : copy.addToWishlist;
  const Icon = !saved && legacyIcon ? HeartOff : Heart;

  return (
    <button
      type="button"
      className={`miro-button miro-button-secondary${iconOnly ? " sf-save-button" : ""}`}
      aria-label={label}
      aria-pressed={saved}
      aria-describedby={descriptionId}
      disabled={!hydrated}
      tabIndex={tabIndex}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (saved) onRemove?.();
        setWishlisted(productId, !saved);
      }}
    >
      <Icon
        size={18}
        className={saved ? "text-accent-text" : undefined}
        aria-hidden="true"
      />
      {iconOnly ? null : <span>{label}</span>}
    </button>
  );
}
