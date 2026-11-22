"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Heart,
  RefreshCw,
} from "lucide-react";
import { useCart } from "@/features/cart/cart-context";
import {
  ShoppingEmptyState,
  ShoppingPageHeading,
} from "@/features/cart/shopping-page";
import { ProductCard } from "@/features/catalog/product-card";
import type { Product } from "@/features/catalog/product-data";
import type { Locale } from "@/lib/i18n";

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
  const storageNote = account
    ? he
      ? "הרשימה נשמרת בחשבון שלכם."
      : "Saved to your account."
    : syncIssue
      ? he
        ? "הרשימה נשמרת בדפדפן הזה."
        : "Saved in this browser."
      : he
        ? "הרשימה נשמרת בדפדפן ותעבור לחשבון כשתתחברו."
        : "Saved in this browser. Sign in to move your list to your account.";

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
      <div className="miro-container sf-shopping-container">
        <ShoppingPageHeading
          locale={locale}
          page="wishlist"
          title={title}
          description={hydrated ? storageNote : undefined}
          itemCount={hydrated ? wishlist.length : undefined}
          headingRef={heading}
        />

        {!hydrated ? (
          syncIssue ? null : (
            <p className="sf-wishlist-status" role="status">
              {he ? "טוענים את הרשימה…" : "Loading wishlist…"}
            </p>
          )
        ) : ids.length === 0 ? (
          <ShoppingEmptyState
            locale={locale}
            icon={<Heart size={34} />}
            title={he ? "רשימת המשאלות ריקה" : "Your wishlist is empty"}
          >
            {he
              ? "לחצו על סמל הלב בכרטיס מוצר כדי לשמור אותו כאן."
              : "Tap the heart on any product to save it here."}
          </ShoppingEmptyState>
        ) : products === null ? (
          <div className="sf-wishlist-status">
            <p role="status">
              <CircleAlert size={18} aria-hidden="true" />
              {he
                ? "לא ניתן לטעון את המוצרים כרגע."
                : "Your wishlist products could not load."}
            </p>
            <button
              type="button"
              className="miro-button miro-button-secondary"
              onClick={() => {
                heading.current?.focus();
                setAttempt(attempt + 1);
              }}
            >
              <RefreshCw size={16} aria-hidden="true" />
              {he ? "נסו שוב" : "Try again"}
            </button>
          </div>
        ) : products === undefined ? (
          <p className="sf-wishlist-status" role="status">
            {he ? "טוענים מוצרים…" : "Loading products…"}
          </p>
        ) : (
          <>
            {products.length < ids.length ? (
              <p className="sf-wishlist-status" role="status">
                <CircleAlert size={18} aria-hidden="true" />
                {products.length === 0
                  ? he
                    ? "הפריטים השמורים אינם זמינים כרגע."
                    : "Your saved items are currently unavailable."
                  : he
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
          <nav
            className="sf-wishlist-pagination"
            aria-label={he ? "דפי רשימת המשאלות" : "Wishlist pages"}
          >
            <button
              type="button"
              className="miro-button miro-button-secondary"
              disabled={currentPage === 0}
              onClick={() => {
                setPage(currentPage - 1);
                heading.current?.focus();
              }}
            >
              <ArrowLeft
                className="sf-shopping-arrow"
                size={16}
                aria-hidden="true"
              />
              {he ? "הקודם" : "Previous"}
            </button>
            <span dir="ltr">
              {currentPage + 1} / {pageCount}
            </span>
            <button
              type="button"
              className="miro-button miro-button-secondary"
              disabled={currentPage + 1 === pageCount}
              onClick={() => {
                setPage(currentPage + 1);
                heading.current?.focus();
              }}
            >
              {he ? "הבא" : "Next"}
              <ArrowRight
                className="sf-shopping-arrow"
                size={16}
                aria-hidden="true"
              />
            </button>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
