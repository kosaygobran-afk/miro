"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useCart } from "@/features/cart/cart-context";
import { cartCopy } from "@/features/cart/cart-copy";
import { formatPrice } from "@/lib/catalog/pricing";
import { withLocale } from "@/lib/i18n";

export function CartPageClient({ locale }: { locale: "he" | "en" }) {
  const { items, subtotal, hydrated, updateQuantity, removeItem } = useCart();
  const copy = cartCopy[locale];

  if (!hydrated) {
    return <div className="sf-cart-loading" aria-busy="true" />;
  }

  return (
    <div className="sf-cart-page">
      <div className="miro-container">
        <header className="sf-cart-heading">
          <span className="sf-cart-heading-icon" aria-hidden="true">
            <ShoppingBag size={24} />
          </span>
          <div>
            <h1>{copy.cartTitle}</h1>
            <p>{copy.cartIntro}</p>
          </div>
        </header>

        {items.length === 0 ? (
          <section className="sf-cart-empty" aria-labelledby="empty-cart-title">
            <ShoppingBag size={38} aria-hidden="true" />
            <h2 id="empty-cart-title">{copy.emptyTitle}</h2>
            <p>{copy.emptyText}</p>
            <Link
              href={withLocale(locale, "store")}
              className="miro-button miro-button-primary"
            >
              {copy.browse}
            </Link>
          </section>
        ) : (
          <div className="sf-cart-layout">
            <section className="sf-cart-items" aria-label={copy.cartTitle}>
              {items.map((item) => {
                const key = `${item.productId}:${item.variantId ?? "default"}`;
                const productHref = withLocale(
                  locale,
                  `store/${item.category}/${item.slug}`,
                );
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
                          sizes="96px"
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
                        <Link href={productHref}>{item.name}</Link>
                      </h2>
                      <strong>
                        {formatPrice(item.unitPrice, locale, "—")}
                      </strong>
                      <div className="sf-cart-item-controls">
                        <span>{copy.quantity}</span>
                        <div className="sf-cart-stepper">
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(
                                item.productId,
                                item.variantId,
                                item.quantity - 1,
                              )
                            }
                            aria-label={`${copy.quantity}: ${item.quantity - 1}`}
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
                              )
                            }
                            aria-label={`${copy.quantity}: ${item.quantity + 1}`}
                          >
                            <Plus size={16} aria-hidden="true" />
                          </button>
                        </div>
                        <button
                          type="button"
                          className="sf-cart-remove"
                          onClick={() =>
                            removeItem(item.productId, item.variantId)
                          }
                        >
                          <Trash2 size={16} aria-hidden="true" />
                          {copy.remove}
                        </button>
                      </div>
                    </div>
                    <strong className="sf-cart-line-total">
                      {formatPrice(item.unitPrice * item.quantity, locale, "—")}
                    </strong>
                  </article>
                );
              })}
            </section>

            <aside className="sf-cart-summary">
              <h2>{copy.summary}</h2>
              <div>
                <span>{copy.subtotal}</span>
                <strong>{formatPrice(subtotal, locale, "—")}</strong>
              </div>
              <p>{copy.estimateNote}</p>
              <Link
                href={withLocale(locale, "checkout")}
                className="miro-button miro-button-primary"
              >
                {copy.checkout}
              </Link>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
