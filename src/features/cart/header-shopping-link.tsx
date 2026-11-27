"use client";

import Link from "@/components/motion/motion-link";
import { playButtonFeedback } from "@/components/motion/button-feedback";
import { ShoppingCart } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { ShoppingCount } from "./shopping-count";
import { useCart } from "@/features/cart/cart-context";
import { WishlistHeart } from "@/features/wishlist/wishlist-heart";
import { withLocale, type Locale } from "@/lib/i18n";

export function HeaderShoppingLink({
  locale,
  current,
  destination,
  inMenu = false,
  onNavigate,
}: {
  locale: Locale;
  current: boolean;
  destination: "cart" | "wishlist";
  inMenu?: boolean;
  onNavigate?: () => void;
}) {
  const { itemCount, wishlist, hydrated } = useCart();
  const cart = destination === "cart";
  const label = cart
    ? locale === "he"
      ? "סל הקניות"
      : "Shopping cart"
    : locale === "he"
      ? "רשימת משאלות"
      : "Wishlist";
  const count = cart ? itemCount : wishlist.length;
  const heart = useRef<SVGSVGElement>(null);
  const previousCount = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!hydrated || cart) return;
    const previous = previousCount.current;
    previousCount.current = count;
    if (previous !== null && previous !== count) {
      playButtonFeedback(heart.current, count > previous ? "save" : "unsave");
    }
  }, [cart, count, hydrated]);

  const icon = (
    <>
      {cart ? (
        <ShoppingCart size={inMenu ? 16 : 20} aria-hidden="true" />
      ) : (
        <WishlistHeart
          ref={heart}
          filled={hydrated && count > 0}
          size={inMenu ? 16 : 20}
        />
      )}
      <ShoppingCount
        value={hydrated ? count : null}
        badge
        cap={99}
        className={
          cart
            ? "premium-shopping-count premium-cart-count"
            : "premium-shopping-count"
        }
      />
    </>
  );

  return (
    <Link
      href={withLocale(locale, destination)}
      onClick={onNavigate}
      className={
        inMenu
          ? "miro-centered-control"
          : `premium-${destination}-link premium-icon-button`
      }
      aria-label={hydrated ? `${label}: ${count}` : label}
      aria-current={current ? "page" : undefined}
      title={label}
    >
      {inMenu && <span className="miro-control-label">{label}</span>}
      {inMenu ? (
        <span className="miro-control-end premium-shopping-shortcut-icon">
          {icon}
        </span>
      ) : (
        icon
      )}
    </Link>
  );
}
