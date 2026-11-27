"use client";

import { playButtonFeedback } from "@/components/motion/button-feedback";
import { useLayoutEffect, useRef } from "react";
import { useCart } from "@/features/cart/cart-context";
import { storeCopy } from "@/features/catalog/store-copy";
import type { Locale } from "@/lib/i18n";
import { WishlistHeart } from "./wishlist-heart";

export function WishlistButton({
  productId,
  locale,
  initialSaved = false,
  iconOnly = false,
  descriptionId,
  tabIndex,
  onRemove,
}: {
  productId: string;
  locale: Locale;
  initialSaved?: boolean;
  iconOnly?: boolean;
  descriptionId?: string;
  tabIndex?: number;
  onRemove?: () => void;
}) {
  const { hydrated, wishlist, setWishlisted } = useCart();
  const saved = hydrated ? wishlist.includes(productId) : initialSaved;
  const copy = storeCopy[locale];
  const label = saved ? copy.removeFromWishlist : copy.addToWishlist;
  const heart = useRef<SVGSVGElement>(null);
  const pendingFeedback = useRef<boolean | null>(null);

  useLayoutEffect(() => {
    if (pendingFeedback.current !== saved) return;
    pendingFeedback.current = null;
    // Start in the same paint as the navbar reacts to the saved count.
    playButtonFeedback(heart.current, saved ? "save" : "unsave");
  }, [saved]);

  return (
    <button
      type="button"
      className={`sf-wishlist-button miro-button miro-button-secondary${iconOnly ? " sf-save-button" : ""}`}
      aria-label={label}
      aria-pressed={saved}
      aria-describedby={descriptionId}
      disabled={!hydrated}
      tabIndex={tabIndex}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        pendingFeedback.current = !saved;
        if (saved) onRemove?.();
        setWishlisted(productId, !saved);
      }}
    >
      <WishlistHeart ref={heart} filled={saved} size={18} />
      {iconOnly ? null : <span>{label}</span>}
    </button>
  );
}
