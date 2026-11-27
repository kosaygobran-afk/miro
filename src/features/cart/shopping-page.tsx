import type { ReactNode, Ref } from "react";
import { ArrowRight, Heart, ShoppingBag, Store } from "lucide-react";
import Link from "@/components/motion/motion-link";
import { withLocale, type Locale } from "@/lib/i18n";
import { cartCopy } from "./cart-copy";

export function ShoppingPageHeading({
  locale,
  page,
  title,
  description,
  itemCount,
  headingRef,
}: {
  locale: Locale;
  page: "cart" | "wishlist";
  title: string;
  description?: string;
  itemCount?: number;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const he = locale === "he";
  const Icon = page === "cart" ? ShoppingBag : Heart;
  const RelatedIcon = page === "cart" ? Heart : ShoppingBag;
  const relatedLabel =
    page === "cart"
      ? he
        ? "לרשימת המשאלות"
        : "View wishlist"
      : he
        ? "לסל הקניות"
        : "View cart";
  const countLabel =
    itemCount === 1
      ? he
        ? "פריט אחד"
        : "1 item"
      : he
        ? `${itemCount} פריטים`
        : `${itemCount} items`;

  return (
    <header className="sf-cart-heading sf-shopping-heading" data-headline-group>
      <div className="sf-shopping-heading-main">
        <span
          className="sf-cart-heading-icon"
          aria-hidden="true"
          data-headline-icon
        >
          <Icon size={26} />
        </span>
        <div className="sf-shopping-heading-copy">
          <h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined}>
            {title}
          </h1>
          {itemCount ? (
            <span className="sf-shopping-count">{countLabel}</span>
          ) : null}
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      <div className="sf-shopping-links">
        <Link
          href={withLocale(locale, page === "cart" ? "wishlist" : "cart")}
          className="miro-button miro-button-secondary"
        >
          <RelatedIcon size={17} aria-hidden="true" />
          {relatedLabel}
        </Link>
        {itemCount ? (
          <Link
            href={withLocale(locale, "store")}
            className="sf-shopping-store-link"
          >
            <Store size={17} aria-hidden="true" />
            {he ? "המשך קניות" : "Keep shopping"}
          </Link>
        ) : null}
      </div>
    </header>
  );
}

export function ShoppingEmptyState({
  locale,
  icon,
  title,
  children,
}: {
  locale: Locale;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      className="sf-cart-empty sf-shopping-empty"
      aria-labelledby="shopping-empty-title"
      data-headline-group
    >
      <span
        className="sf-shopping-empty-icon"
        aria-hidden="true"
        data-headline-icon
      >
        {icon}
      </span>
      <h2 id="shopping-empty-title">{title}</h2>
      <p>{children}</p>
      <Link
        href={withLocale(locale, "store")}
        className="miro-button miro-button-primary"
      >
        {cartCopy[locale].browse}
        <ArrowRight
          className="sf-shopping-arrow"
          size={17}
          aria-hidden="true"
        />
      </Link>
    </section>
  );
}
