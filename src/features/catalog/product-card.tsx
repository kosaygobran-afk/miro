"use client";

import { useId, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Plus, X } from "lucide-react";
import { ProductVisual } from "@/components/products/ProductVisual";
import { getProductVisualKind } from "@/features/catalog/product-visual-kind";
import { storeCopy } from "@/features/catalog/store-copy";
import type { Product } from "@/features/catalog/product-data";

export type { Product } from "@/features/catalog/product-data";

export function ProductCard({
  product,
  locale = "en",
  actionLabel,
}: {
  product: Product;
  index?: number;
  actionLabel?: string;
  locale?: "he" | "en";
}) {
  const copy = storeCopy[locale];
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const kind = getProductVisualKind(product);
  const Arrow = locale === "he" ? ArrowLeft : ArrowRight;
  const price =
    product.priceIls > 0
      ? new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
          style: "currency",
          currency: "ILS",
          maximumFractionDigits: 0,
        }).format(product.priceIls)
      : copy.quotePrice;
  const quoteHref = `/${locale}/contact?product=${encodeURIComponent(product.name)}`;

  return (
    <article
      className="sf-product-card"
      data-product-name={product.name}
      data-product-price={product.priceIls}
    >
      <button
        type="button"
        className="sf-product-media"
        onClick={() => dialog.current?.showModal()}
        aria-label={`${copy.details}: ${product.name}`}
      >
        {product.badge && (
          <span className="sf-product-badge">{product.badge}</span>
        )}
        <ProductVisual kind={kind} />
        <span className="sf-product-expand">
          <Plus size={17} aria-hidden="true" />
        </span>
      </button>
      <div className="sf-product-body">
        <p className="sf-product-category">
          {product.categoryLabel ?? product.category}
        </p>
        <h3 dir="auto">{product.name}</h3>
        <p className="sf-product-description" dir="auto">
          {product.description}
        </p>
        <div className="sf-product-price">
          <strong dir="auto">{price}</strong>
          <span>{copy.demoPrice}</span>
        </div>
        <button
          className="sf-product-action"
          type="button"
          onClick={() => dialog.current?.showModal()}
        >
          {actionLabel ?? copy.details}
          <Arrow size={16} aria-hidden="true" />
        </button>
      </div>
      <dialog
        ref={dialog}
        className="sf-product-dialog"
        aria-labelledby={titleId}
        dir={locale === "he" ? "rtl" : "ltr"}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="sf-product-dialog-inner">
          <button
            type="button"
            className="sf-dialog-close"
            aria-label={copy.close}
            onClick={() => dialog.current?.close()}
            autoFocus
          >
            <X size={21} aria-hidden="true" />
          </button>
          <div className="sf-dialog-visual">
            <ProductVisual kind={kind} />
            <p>{copy.illustration}</p>
          </div>
          <div className="sf-dialog-copy">
            <p className="sf-eyebrow">
              {product.categoryLabel ?? product.category}
            </p>
            <h2 id={titleId} dir="auto">
              {product.name}
            </h2>
            <p dir="auto">{product.description}</p>
            <div className="sf-product-price">
              <strong dir="auto">{price}</strong>
              <span>{copy.demoPrice}</span>
            </div>
            <Link
              href={quoteHref}
              className="miro-button miro-button-primary"
              onClick={() => dialog.current?.close()}
            >
              {copy.quote}
              <Arrow size={17} aria-hidden="true" />
            </Link>
            <p className="sf-dialog-note">{copy.demo}</p>
          </div>
        </div>
      </dialog>
    </article>
  );
}
