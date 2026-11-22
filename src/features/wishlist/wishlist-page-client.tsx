"use client";

import { useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";
import Link from "@/components/motion/motion-link";
import { useCart } from "@/features/cart/cart-context";
import { ProductCard } from "@/features/catalog/product-card";
import type { Product } from "@/features/catalog/product-data";
import { withLocale, type Locale } from "@/lib/i18n";

const PAGE_SIZE = 24;

export function WishlistPageClient({ locale }: { locale: Locale }) {
  const { wishlist, hydrated, syncIssue, account } = useCart();
  const he = locale === "he";
  const title = he ? "רשימת משאלות" : "Wishlist";
  const heading = useRef<HTMLHeadingElement>(null);
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    products: Product[] | null;
  }>();
  const pageCount = Math.ceil(wishlist.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  const ids = wishlist.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const payload = JSON.stringify({ locale, ids });
  const key = `${account?.id ?? "guest"}:${attempt}:${payload}`;
  const products =
    hydrated && result?.key === key ? result.products : undefined;

  useEffect(() => {
    if (!hydrated || !ids.length) return;
    const controller = new AbortController();
    void fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Wishlist could not load");
        const { products } = (await response.json()) as { products: Product[] };
        if (!controller.signal.aborted) setResult({ key, products });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, products: null });
      });
    return () => controller.abort();
  }, [hydrated, ids.length, key, payload]);

  return (
    <div className="sf-cart-page">
      <div className="miro-container">
        <header className="sf-cart-heading">
          <span className="sf-cart-heading-icon" aria-hidden="true">
            <Heart size={24} />
          </span>
          <div>
            <h1 tabIndex={-1} ref={heading}>
              {title}
            </h1>
            <p>
              {account
                ? he
                  ? "הרשימה נשמרת בחשבון שלכם."
                  : "This wishlist is saved to your account."
                : syncIssue
                  ? he
                    ? "הרשימה נשמרת בדפדפן הזה."
                    : "This wishlist is saved in this browser."
                  : he
                    ? "הרשימה נשמרת בדפדפן ותעבור לחשבון לאחר ההתחברות."
                    : "This wishlist is saved in your browser and moves to your account when you sign in."}
            </p>
          </div>
        </header>

        {!hydrated ? (
          syncIssue ? null : (
            <p role="status">
              {he ? "טוענים את הרשימה…" : "Loading wishlist…"}
            </p>
          )
        ) : ids.length === 0 ? (
          <section className="sf-cart-empty">
            <Heart size={38} aria-hidden="true" />
            <h2>{he ? "רשימת המשאלות ריקה" : "Your wishlist is empty"}</h2>
            <p>
              {he
                ? "לחצו על סמל הלב לצד מוצר כדי לשמור אותו."
                : "Select the heart on a product to save it here."}
            </p>
            <Link
              href={withLocale(locale)}
              className="miro-button miro-button-primary"
            >
              {he ? "לכל המוצרים" : "Browse products"}
            </Link>
          </section>
        ) : products === null ? (
          <div role="status">
            <p>
              {he
                ? "לא ניתן לטעון את המוצרים כרגע."
                : "Your wishlist products could not load."}
            </p>
            <button
              type="button"
              className="miro-button miro-button-secondary"
              onClick={() => setAttempt(attempt + 1)}
            >
              {he ? "נסו שוב" : "Try again"}
            </button>
          </div>
        ) : products === undefined ? (
          <p role="status">{he ? "טוענים מוצרים…" : "Loading products…"}</p>
        ) : (
          <>
            {products.length < ids.length ? (
              <p role="status">
                {he
                  ? "חלק מהפריטים השמורים אינם זמינים כרגע."
                  : "Some saved items are currently unavailable."}
              </p>
            ) : null}
            <div className="sf-catalog-grid">
              {ids.map((id) => {
                const product = products.find((item) => item.id === id);
                return product ? (
                  <ProductCard
                    key={id}
                    product={product}
                    locale={locale}
                    isSaved
                    onWishlistRemove={() => heading.current?.focus()}
                  />
                ) : null;
              })}
            </div>
          </>
        )}

        {pageCount > 1 ? (
          <nav className="account-saved-actions mt-4" aria-label={title}>
            <button
              type="button"
              className="miro-button miro-button-secondary"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              {he ? "הקודם" : "Previous"}
            </button>
            <span dir="ltr">
              {currentPage + 1} / {pageCount}
            </span>
            <button
              type="button"
              className="miro-button miro-button-secondary"
              disabled={currentPage + 1 === pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              {he ? "הבא" : "Next"}
            </button>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
