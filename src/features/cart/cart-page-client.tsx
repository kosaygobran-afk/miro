"use client";

import { useRef } from "react";
import { RevealImage as Image } from "@/components/ui/reveal-image";
import { CartSkeleton } from "./cart-skeleton";
import Link from "@/components/motion/motion-link";
import {
  ArrowRight,
  Minus,
  Plus,
  ReceiptText,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { useCart } from "@/features/cart/cart-context";
import { cartCopy } from "@/features/cart/cart-copy";
import { withLocale } from "@/lib/i18n";
import { ShoppingEmptyState, ShoppingPageHeading } from "./shopping-page";
import {
  cartLineId,
  cartUnitTotal,
  checkoutCartLines,
  MAX_CHECKOUT_LINES,
  formatCartPrice as formatPrice,
} from "./cart-items";

export function CartPageClient({ locale }: { locale: "he" | "en" }) {
  const {
    items,
    itemCount,
    subtotal,
    hydrated,
    syncIssue,
    updateQuantity,
    removeItem,
  } = useCart();
  const copy = cartCopy[locale];
  const heading = useRef<HTMLHeadingElement>(null);
  const lineLimitExceeded =
    checkoutCartLines(items).length > MAX_CHECKOUT_LINES;

  if (!hydrated) {
    return syncIssue ? null : <CartSkeleton locale={locale} />;
  }

  return (
    <div className="sf-cart-page">
      <div className="miro-container sf-shopping-container">
        <ShoppingPageHeading
          locale={locale}
          page="cart"
          title={copy.cartTitle}
          itemCount={itemCount}
          headingRef={heading}
        />

        {items.length === 0 ? (
          <ShoppingEmptyState
            locale={locale}
            icon={<ShoppingBag size={34} />}
            title={copy.emptyTitle}
          >
            {copy.emptyText}
          </ShoppingEmptyState>
        ) : (
          <div className="sf-cart-layout">
            <section className="sf-cart-items" aria-label={copy.cartTitle}>
              {items.map((item) => {
                const key = cartLineId(item);
                const productHref = withLocale(
                  locale,
                  `store/${item.category}/${item.slug}`,
                );
                const removeLine = () => {
                  removeItem(item.productId, item.variantId, key);
                  heading.current?.focus();
                };
                return (
                  <article className="sf-cart-item" key={key}>
                    <Link
                      href={productHref}
                      className="sf-cart-item-media"
                      aria-label={`${locale === "he" ? "פרטי מוצר" : "Product details"}: ${item.name}`}
                    >
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt=""
                          fill
                          sizes="(max-width: 520px) 72px, 104px"
                          className="sf-cart-item-image"
                          unoptimized={item.imageUrl
                            .toLowerCase()
                            .includes(".svg")}
                        />
                      ) : (
                        <ShoppingBag size={28} aria-hidden="true" />
                      )}
                    </Link>
                    <div className="sf-cart-item-copy">
                      <h2>
                        <Link href={productHref}>
                          <bdi>{item.name}</bdi>
                        </Link>
                      </h2>
                      <p className="sf-cart-unit-price">
                        <bdi>{formatPrice(item.unitPrice, locale, "—")}</bdi>
                        <span>{copy.unitPrice}</span>
                      </p>
                      {!!item.optionalOffers?.length && (
                        <ul className="sf-cart-optional-offers">
                          {item.optionalOffers.map((offer) => (
                            <li key={offer.id}>
                              <Link
                                href={withLocale(
                                  locale,
                                  `store/${offer.category}/${offer.slug}`,
                                )}
                              >
                                <bdi>{offer.label || offer.name}</bdi>
                              </Link>
                              <span dir="ltr">
                                <bdi>
                                  {formatPrice(offer.unitPrice, locale, "—")}
                                </bdi>
                                {" × "}
                                {item.quantity}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="sf-cart-item-footer">
                      <div className="sf-cart-item-controls">
                        <div
                          className="sf-cart-stepper"
                          role="group"
                          aria-label={copy.quantity}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (item.quantity === 1) {
                                removeLine();
                                return;
                              }
                              updateQuantity(
                                item.productId,
                                item.variantId,
                                item.quantity - 1,
                                key,
                              );
                            }}
                            aria-label={copy.decreaseQuantity}
                          >
                            <Minus size={16} aria-hidden="true" />
                          </button>
                          <output aria-live="polite">{item.quantity}</output>
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(
                                item.productId,
                                item.variantId,
                                item.quantity + 1,
                                key,
                              )
                            }
                            aria-label={copy.increaseQuantity}
                          >
                            <Plus size={16} aria-hidden="true" />
                          </button>
                        </div>
                        <button
                          type="button"
                          className="sf-cart-remove"
                          onClick={removeLine}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                          {copy.remove}
                        </button>
                      </div>
                      <div className="sf-cart-item-total">
                        <span>{copy.lineTotal}</span>
                        <strong className="sf-cart-line-total">
                          <bdi>
                            {formatPrice(
                              cartUnitTotal(item) * item.quantity,
                              locale,
                              "—",
                            )}
                          </bdi>
                        </strong>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>

            <aside className="sf-cart-summary">
              <h2>
                <ReceiptText size={20} aria-hidden="true" />
                {copy.summary}
              </h2>
              <div>
                <span>{copy.subtotal}</span>
                <strong>
                  <bdi>{formatPrice(subtotal, locale, "—")}</bdi>
                </strong>
              </div>
              <p>{copy.estimateNote}</p>
              {lineLimitExceeded ? (
                <>
                  <p className="sf-cart-limit-note" role="status">
                    {copy.tooManyLines}
                  </p>
                  <button
                    type="button"
                    className="miro-button miro-button-primary"
                    disabled
                  >
                    {copy.checkout}
                  </button>
                </>
              ) : (
                <Link
                  href={withLocale(locale, "checkout")}
                  className="miro-button miro-button-primary"
                >
                  {copy.checkout}
                  <ArrowRight
                    className="sf-shopping-arrow"
                    size={18}
                    aria-hidden="true"
                  />
                </Link>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
