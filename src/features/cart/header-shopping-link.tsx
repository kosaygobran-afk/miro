"use client";

import Link from "@/components/motion/motion-link";
import { Heart, ShoppingCart } from "lucide-react";
import { useCart } from "@/features/cart/cart-context";
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
  const Icon = cart ? ShoppingCart : Heart;
  const label = cart
    ? locale === "he"
      ? "סל הקניות"
      : "Shopping cart"
    : locale === "he"
      ? "רשימת משאלות"
      : "Wishlist";
  const count = cart ? itemCount : wishlist.length;

  const icon = (
    <>
      <Icon size={inMenu ? 16 : 20} aria-hidden="true" />
      {hydrated && count > 0 && (
        <span
          key={count}
          className={
            cart
              ? "premium-shopping-count premium-cart-count"
              : "premium-shopping-count"
          }
          aria-hidden="true"
          dir="ltr"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
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
