"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/features/cart/cart-context";
import { withLocale, type Locale } from "@/lib/i18n";

export function HeaderCartLink({ locale }: { locale: Locale }) {
  const { itemCount, hydrated } = useCart();
  const label = locale === "he" ? "סל הקניות" : "Shopping cart";
  const count = hydrated ? itemCount : 0;

  return (
    <Link
      href={withLocale(locale, "cart")}
      className="premium-cart-link premium-icon-button"
      aria-label={`${label}: ${count}`}
      title={label}
    >
      <ShoppingCart size={20} aria-hidden="true" />
      {count > 0 ? (
        <span className="premium-cart-count" aria-hidden="true">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
