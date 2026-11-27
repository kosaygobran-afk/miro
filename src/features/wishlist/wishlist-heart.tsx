"use client";

import { Heart } from "lucide-react";
import { useId, type CSSProperties, type Ref } from "react";

export function WishlistHeart({
  filled,
  size,
  ref,
}: {
  filled: boolean;
  size: number;
  ref?: Ref<SVGSVGElement>;
}) {
  const gradientId = useId();

  return (
    <Heart
      ref={ref}
      data-wishlist-heart
      data-wishlist-filled={filled || undefined}
      size={size}
      style={
        {
          "--wishlist-heart-gradient": `url("#${gradientId}")`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {filled ? (
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop className="sf-wishlist-heart-red" offset="0%" />
            <stop className="sf-wishlist-heart-pink" offset="100%" />
          </linearGradient>
        </defs>
      ) : null}
    </Heart>
  );
}
