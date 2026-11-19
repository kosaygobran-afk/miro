"use client";

import Link from "@/components/motion/motion-link";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/features/cart/cart-context";
import { withLocale, type Locale } from "@/lib/i18n";

export function HeaderCartLink({
  locale,
  current,
}: {
  locale: Locale;
  current: boolean;
}) {
  const { itemCount, hydrated } = useCart();
  const label = locale === "he" ? "סל הקניות" : "Shopping cart";
  const count = hydrated ? itemCount : 0;

  return (
    <Link
      href={withLocale(locale, "cart")}
      className="premium-cart-link premium-icon-button"
      aria-label={`${label}: ${count}`}
      aria-current={current ? "page" : undefined}
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
